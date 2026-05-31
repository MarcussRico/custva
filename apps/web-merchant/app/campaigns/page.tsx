import { merchantApi } from "../lib/api";
import { revalidatePath } from "next/cache";

interface CampaignsData {
  items: Array<{
    id: string;
    campaignName: string;
    status: string;
    targetCount: number;
  }>;
}

export default async function CampaignsPage() {
  let campaigns: CampaignsData["items"] = [];
  try {
    const data = await merchantApi<CampaignsData>("/campaigns");
    campaigns = data.items;
  } catch {
    campaigns = [];
  }
  async function createCampaign(formData: FormData) {
    "use server";
    const payload = {
      campaignName: String(formData.get("campaignName") ?? ""),
      templateId: String(formData.get("templateId") ?? "template-default"),
      audienceRules: {},
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    };
    const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";
    await fetch(`${API_BASE}/campaigns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dev-merchant-id":
          process.env.CUSTVA_DEV_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000010"
      },
      body: JSON.stringify(payload)
    });
    revalidatePath("/campaigns");
  }

  async function sendCampaign(formData: FormData) {
    "use server";
    const campaignId = String(formData.get("campaignId") ?? "");
    const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";
    await fetch(`${API_BASE}/campaigns/${campaignId}/send`, {
      method: "POST",
      headers: {
        "x-dev-merchant-id":
          process.env.CUSTVA_DEV_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000010"
      }
    });
    revalidatePath("/campaigns");
  }

  return (
    <main className="merchant-shell">
      <header className="merchant-header">
        <h1>Campaigns</h1>
        <span className="badge">BullMQ Ready</span>
      </header>
      <section className="merchant-kpis">
        <article className="kpi-card">
          <h3>Create Campaign</h3>
          <form action={createCampaign}>
            <input name="campaignName" placeholder="Campaign Name" required />{" "}
            <input name="templateId" placeholder="Template ID" required />{" "}
            <button type="submit">Create</button>
          </form>
        </article>
        {campaigns.map((c) => (
          <article className="kpi-card" key={c.id}>
            <h3>{c.campaignName}</h3>
            <p>Status: {c.status}</p>
            <p>Audience: {c.targetCount}</p>
            <form action={sendCampaign}>
              <input type="hidden" name="campaignId" value={c.id} />
              <button type="submit">Send</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
