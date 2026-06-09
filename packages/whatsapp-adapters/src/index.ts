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

export interface WhatsAppAdapter {
  sendTemplateMessage(
    input: SendWhatsAppMessageInput
  ): Promise<SendWhatsAppMessageOutput>;
}

export class WhatsAppCloudApiAdapter implements WhatsAppAdapter {
  constructor(
    private readonly config: {
      phoneNumberId: string;
      accessToken: string;
      graphVersion?: string;
    }
  ) {}

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
