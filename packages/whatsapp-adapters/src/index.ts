export interface SendWhatsAppMessageInput {
  to: string;
  templateName: string;
  variables?: Record<string, string>;
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.accessToken}`
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: "en" }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`WhatsApp Cloud API error: ${response.status}`);
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
