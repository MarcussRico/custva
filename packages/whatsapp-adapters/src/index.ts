export interface TemplateButtonParam {
  type: "url";
  index: number;
  urlParameter: string;
}

export interface TemplateHeaderParam {
  type: "text" | "image";
  text?: string;
  imageUrl?: string;
}

export interface SendWhatsAppMessageInput {
  to: string;
  templateName: string;
  languageCode?: string;
  variables?: Record<string, string>;
  header?: TemplateHeaderParam;
  bodyVariables?: string[];
  buttons?: TemplateButtonParam[];
  mediaUrl?: string;
}

export interface SendWhatsAppMessageOutput {
  provider: string;
  providerMessageId: string;
  accepted: boolean;
}

export interface CreateTemplateInput {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  languageCode: string;
  components: Array<Record<string, unknown>>;
}

export interface CreateTemplateOutput {
  metaTemplateId: string;
  status: string;
  category?: string;
}

export interface TemplateStatusOutput {
  metaTemplateId: string;
  name: string;
  status: string;
  category?: string;
  rejectedReason?: string;
}

export interface WhatsAppAdapter {
  sendTemplateMessage(
    input: SendWhatsAppMessageInput
  ): Promise<SendWhatsAppMessageOutput>;
}

/**
 * Template management lives on the WhatsApp Business Account, not the phone
 * number, so it needs a different id from the one used to send.
 */
export interface WhatsAppTemplateAdmin {
  createTemplate(input: CreateTemplateInput): Promise<CreateTemplateOutput>;
  fetchTemplateStatus(name: string): Promise<TemplateStatusOutput | null>;
  /**
   * Meta will not take a URL for a template header at registration time. It
   * wants a handle from its resumable upload API, which is a different endpoint
   * on a different id (the App, not the WABA or the phone number).
   */
  uploadHeaderImage(input: {
    bytes: Uint8Array;
    mimeType: string;
    fileName?: string;
  }): Promise<{ handle: string }>;
}

export class WhatsAppCloudApiAdapter
  implements WhatsAppAdapter, WhatsAppTemplateAdmin
{
  constructor(
    private readonly config: {
      phoneNumberId: string;
      accessToken: string;
      /** Required for template management; sending does not need it. */
      businessAccountId?: string;
      /** Meta App id. Required only for uploading header images. */
      appId?: string;
      graphVersion?: string;
    }
  ) {}

  private get version() {
    return this.config.graphVersion ?? "v20.0";
  }

  private requireWaba(): string {
    if (!this.config.businessAccountId) {
      throw new Error(
        "WA_BUSINESS_ACCOUNT_ID is required to manage templates. Sending works without it; creating or checking templates does not."
      );
    }
    return this.config.businessAccountId;
  }

  /**
   * Submit a template for Meta review. Approval is asynchronous — this returns
   * as soon as Meta accepts the submission, typically with status PENDING.
   */
  async createTemplate(input: CreateTemplateInput): Promise<CreateTemplateOutput> {
    const waba = this.requireWaba();
    const response = await fetch(
      `https://graph.facebook.com/${this.version}/${waba}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: input.name,
          category: input.category,
          language: input.languageCode,
          components: input.components
        })
      }
    );

    const payload = (await response.json()) as {
      id?: string;
      status?: string;
      category?: string;
      error?: { message?: string; error_user_msg?: string };
    };

    if (!response.ok) {
      /* Meta's error_user_msg is the readable one; message is the developer
         string. Prefer whichever exists so the merchant sees something
         actionable rather than a code. */
      const detail =
        payload.error?.error_user_msg ??
        payload.error?.message ??
        `HTTP ${response.status}`;
      throw new Error(`Meta rejected the template submission: ${detail}`);
    }

    return {
      metaTemplateId: payload.id ?? "",
      status: payload.status ?? "PENDING",
      category: payload.category
    };
  }

  /**
   * Two-step resumable upload. Step one opens a session against the App id;
   * step two sends the bytes and returns the handle.
   *
   * Step two uses `Authorization: OAuth <token>` rather than the `Bearer`
   * scheme every other Graph call takes. That is Meta's documented behaviour
   * for this endpoint, not a mistake — sending Bearer here fails with an
   * unhelpful error.
   */
  async uploadHeaderImage(input: {
    bytes: Uint8Array;
    mimeType: string;
    fileName?: string;
  }): Promise<{ handle: string }> {
    if (!this.config.appId) {
      throw new Error(
        "WA_APP_ID is required to upload header images. It is the Meta App id, which is not the same as the WhatsApp Business Account id or the phone number id."
      );
    }

    const sessionUrl = new URL(
      `https://graph.facebook.com/${this.version}/${this.config.appId}/uploads`
    );
    sessionUrl.searchParams.set("file_length", String(input.bytes.length));
    sessionUrl.searchParams.set("file_type", input.mimeType);
    if (input.fileName) sessionUrl.searchParams.set("file_name", input.fileName);

    const sessionResponse = await fetch(sessionUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}` }
    });
    const session = (await sessionResponse.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (!sessionResponse.ok || !session.id) {
      throw new Error(
        `Could not start the upload with Meta: ${session.error?.message ?? sessionResponse.status}`
      );
    }

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${this.version}/${session.id}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${this.config.accessToken}`,
          file_offset: "0",
          "Content-Type": "application/octet-stream"
        },
        body: input.bytes as unknown as BodyInit
      }
    );
    const uploaded = (await uploadResponse.json()) as {
      h?: string;
      error?: { message?: string };
    };
    if (!uploadResponse.ok || !uploaded.h) {
      throw new Error(
        `Meta accepted the upload session but not the file: ${uploaded.error?.message ?? uploadResponse.status}`
      );
    }

    return { handle: uploaded.h };
  }

  /** Poll the current review state for one template name. */
  async fetchTemplateStatus(name: string): Promise<TemplateStatusOutput | null> {
    const waba = this.requireWaba();
    const url = new URL(
      `https://graph.facebook.com/${this.version}/${waba}/message_templates`
    );
    url.searchParams.set("name", name);
    url.searchParams.set(
      "fields",
      "id,name,status,category,rejected_reason"
    );

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` }
    });
    const payload = (await response.json()) as {
      data?: Array<{
        id: string;
        name: string;
        status: string;
        category?: string;
        rejected_reason?: string;
      }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(
        `Could not read template status from Meta: ${payload.error?.message ?? response.status}`
      );
    }

    /* The name filter is a prefix match on Meta's side, so confirm the exact
       name rather than trusting the first row. */
    const match = payload.data?.find((t) => t.name === name);
    if (!match) return null;

    return {
      metaTemplateId: match.id,
      name: match.name,
      status: match.status,
      category: match.category,
      rejectedReason: match.rejected_reason
    };
  }

  async sendTemplateMessage(
    input: SendWhatsAppMessageInput
  ): Promise<SendWhatsAppMessageOutput> {
    const graphVersion = this.config.graphVersion ?? "v20.0";
    const endpoint = `https://graph.facebook.com/${graphVersion}/${this.config.phoneNumberId}/messages`;

    const to = input.to.replace(/\D/g, "");

    const components: Array<Record<string, unknown>> = [];

    if (input.header) {
      if (input.header.type === "image" && input.header.imageUrl) {
        components.push({
          type: "header",
          parameters: [{ type: "image", image: { link: input.header.imageUrl } }]
        });
      } else if (input.header.type === "text" && input.header.text) {
        components.push({
          type: "header",
          parameters: [{ type: "text", text: input.header.text }]
        });
      }
    }

    const bodyVars =
      input.bodyVariables ??
      (input.variables ? Object.values(input.variables) : []);
    if (bodyVars.length > 0) {
      components.push({
        type: "body",
        parameters: bodyVars.map((text) => ({ type: "text", text }))
      });
    }

    if (input.buttons?.length) {
      for (const button of input.buttons) {
        components.push({
          type: "button",
          sub_type: "url",
          index: String(button.index),
          parameters: [{ type: "text", text: button.urlParameter }]
        });
      }
    }

    const template: Record<string, unknown> = {
      name: input.templateName,
      language: { code: input.languageCode ?? "en" }
    };
    if (components.length) {
      template.components = components;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.accessToken}`
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`WhatsApp Cloud API error (${response.status}): ${errText}`);
    }

    const payload = (await response.json()) as {
      messages?: Array<{ id: string }>;
    };

    return {
      provider: "cloud_api",
      providerMessageId: payload.messages?.[0]?.id ?? "unknown",
      accepted: true
    };
  }
}
