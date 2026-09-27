/* Drives the real merchant app and records what the video needs:
   screenshots at 2x, plus the on-page rectangle of every element an arrow or
   zoom points at, so annotations land on real UI rather than guessed pixels. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "shots");
fs.mkdirSync(OUT, { recursive: true });
/* A merchant access token for the demo shop (see README). Never committed. */
const token = (process.env.CUSTVA_DEMO_TOKEN ?? fs.readFileSync(path.join(ROOT, ".token"), "utf8")).trim();
const BASE = "http://localhost:3100";
const W = 1440, H = 900;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "custva_merchant_access_token", value: token, url: BASE }]);
const p = await ctx.newPage();
const manifest = {};

async function rectsOf(map, { page = true } = {}) {
  const out = {};
  for (const [key, sel] of Object.entries(map)) {
    const loc = typeof sel === "string" ? p.locator(sel).first() : sel;
    if (!(await loc.count())) { console.warn("missing", key); continue; }
    const r = await loc.evaluate((el, page) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + (page ? window.scrollX : 0), y: b.y + (page ? window.scrollY : 0), w: b.width, h: b.height };
    }, page);
    out[key] = r;
  }
  return out;
}

async function full(name, url, map, prep) {
  await p.goto(BASE + url, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  if (prep) await prep();
  await p.evaluate(() => window.scrollTo(0, 0));
  const rects = await rectsOf(map);
  const size = await p.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  const file = `${name}.png`;
  await p.screenshot({ path: path.join(OUT, file), fullPage: true });
  manifest[name] = { file, w: size.w, h: size.h, rects };
  console.log("captured", name, size.h);
}

/* One frame of a typing sequence: a 1440x900 window clipped out of the full
   page, anchored 110px above the form panel. Clipping (rather than scrolling)
   keeps sticky chrome out of the way and keeps the form steady even though
   the dashboard hides its lists once a number is being typed. Rects are
   relative to the clip. */
async function frame(seq, map) {
  const i = manifest[seq].frames.length;
  const file = `${seq}_${String(i).padStart(2, "0")}.png`;
  await p.evaluate(() => window.scrollTo(0, 0));
  const rects = await rectsOf(map);
  const top = Math.max(0, rects.panel.y - 110);
  await p.screenshot({ path: path.join(OUT, file), fullPage: true, clip: { x: 0, y: top, width: W, height: H } });
  for (const r of Object.values(rects)) r.y -= top;
  manifest[seq].frames.push({ file, rects });
}

/* ── 1. Dashboard ─────────────────────────────────────────────────────── */
await full("dashboard", "/dashboard", {
  hero: ".merchant-hero",
  headline: ".merchant-hero-headline",
  heroSub: ".merchant-hero-sub",
  proof: ".merchant-hero-proof",
  overdue: ".merchant-overdue",
  row1: ".merchant-overdue-row >> nth=0",
  row1when: ".merchant-overdue-row >> nth=0 >> .merchant-overdue-when",
  row1pill: ".merchant-overdue-row >> nth=0 >> .seg-pill",
  messageThem: "text=Message them",
  consentGap: ".merchant-consent-gap",
  today: ".merchant-today",
  entry: "form.merchant-quick-entry"
});

/* The numbers on screen at the moment the dashboard was captured — the
   dashboard captions quote these, never later ones. */
const apiGet = async (u) => (await (await p.request.get(BASE + "/api" + u)).json()).data;
manifest.dashboardNumbers = await apiGet("/analytics/dashboard");

/* ── Anjali's profile BEFORE she walks in: overdue, reminder read ────── */
/* The simulation's scripted weekly regular; her id changes on every reseed. */
const anjaliSearch = await (await p.request.get(BASE + "/api/customers?q=Anjali%20Pillai&limit=1")).json();
const anjali = anjaliSearch.data.items[0].id;
await full("profile", `/customers/${anjali}`, {
  header: ".merchant-page-header",
  status: ".customer-summary-status",
  facts: ".customer-summary-facts",
  nextExpected: ".customer-summary-facts > div >> nth=3",
  next: ".customer-next",
  nextWhen: ".customer-next-when",
  quote: ".customer-next-message blockquote",
  brought: ".customer-brought-back",
  consent: "section:has-text('Agreed to WhatsApp messages') >> nth=0",
  messages: "section:has(h2:text('WhatsApp messages sent'))",
  visits: "section:has(h2:text('Visits'))",
  visit1: "section:has(h2:text('Visits')) tbody tr >> nth=0",
  chip1: "section:has(h2:text('Visits')) .seg-brought-back >> nth=0",
  msg1: "section:has(h2:text('WhatsApp messages sent')) tbody tr >> nth=0"
});

/* ── 2. Counter: returning customer, keystroke by keystroke ───────────── */
const FORM = {
  panel: "section.merchant-panel:has(form.merchant-quick-entry)",
  phone: 'input[name="custva-phone"]',
  name: 'input[name="custva-name"]',
  bill: 'input[name="custva-billing"]',
  card: ".merchant-returning-card",
  consent: ".merchant-consent-check, .merchant-consent-state",
  save: 'form.merchant-quick-entry button[type="submit"]',
  saved: ".merchant-entry-saved",
  typeahead: ".merchant-typeahead, [class*='typeahead']"
};
async function pinForm() {
  return;
  /* The dashboard hides its lists once a number is being typed, which moves
     the form. Re-pin it to the same place every frame so the video is steady. */
  await p.evaluate(() => {
    const el = document.querySelector("section.merchant-panel:has(form.merchant-quick-entry)");
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - 96));
  });
  await p.waitForTimeout(60);
}
async function typeSeq(seq, steps) {
  manifest[seq] = { frames: [], w: W, h: H };
  await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  await pinForm();
  await frame(seq, FORM);
  for (const step of steps) {
    await step();
    await pinForm();
    await frame(seq, FORM);
  }
}
const typeInto = (sel, text, settle = 0) =>
  [...text].map((ch, i) => async () => {
    await p.locator(sel).focus();
    await p.keyboard.type(ch);
    await p.waitForTimeout(i === text.length - 1 ? settle || 120 : 120);
  });

await typeSeq("returning", [
  ...typeInto(FORM.phone, "9840112300", 1500),
  ...typeInto(FORM.bill, "340", 200),
  async () => {
    await p.locator(FORM.save).click();
    await p.waitForSelector(FORM.saved, { timeout: 8000 });
    await p.waitForTimeout(400);
  }
]);
console.log("captured returning", manifest.returning.frames.length);

/* ── 3. Counter: brand-new customer who agrees to messages ────────────── */
await typeSeq("newcust", [
  ...typeInto(FORM.phone, "9840155551", 900),
  ...typeInto(FORM.name, "Karthik S", 100),
  ...typeInto(FORM.bill, "260", 150),
  async () => { await p.locator(".merchant-consent-check input").check(); await p.waitForTimeout(150); },
  async () => {
    await p.locator(FORM.save).click();
    await p.waitForSelector(FORM.saved, { timeout: 8000 });
    await p.waitForTimeout(400);
  }
]);
console.log("captured newcust", manifest.newcust.frames.length);

/* ── 5. Customers list, filtered to who needs attention ───────────────── */
await full("customers", "/customers?segment=at_risk,dormant", {
  filters: ".merchant-panel >> nth=0",
  statusFilter: "select >> nth=2",
  table: ".merchant-table",
  statusCol: ".merchant-table tbody tr >> nth=0 >> td >> nth=2",
  dueCol: ".merchant-table tbody tr >> nth=0 >> td >> nth=3",
  consentCol: ".merchant-table tbody tr >> nth=0 >> td >> nth=4"
});

/* ── 6. Messages (templates) ──────────────────────────────────────────── */
await full("templates", "/templates", {
  header: ".merchant-page-header",
  first: ".merchant-lifecycle-group >> nth=0",
  firstCards: ".merchant-lifecycle-group >> nth=0 >> .merchant-lifecycle-milestones",
  second: ".merchant-lifecycle-group >> nth=1",
  secondHint: ".merchant-lifecycle-group >> nth=1 >> .merchant-lifecycle-hint",
  lateCard: ".merchant-lifecycle-group >> nth=1 >> .merchant-lifecycle-card >> nth=2",
  unused: ".merchant-lifecycle-group >> nth=1 >> .merchant-lifecycle-card >> nth=1",
  chip: ".merchant-lifecycle-group >> nth=0 >> .tpl-chip >> nth=0",
  custom: ".merchant-custom-templates",
  pending: ".tpl-chip--wait >> nth=0",
  var: ".tpl-var >> nth=0"
});

/* ── 7. Campaigns: choose who, see the live count, then "did it work?" ── */
await full("campaigns", "/campaigns", {
  pick: ".merchant-audience-pick",
  choices: ".merchant-segment-choices",
  summary: ".merchant-audience-summary",
  held: ".merchant-audience-summary small",
  list: ".merchant-campaign-list",
  brunch: ".merchant-campaign-card:has(h3:text('New weekend brunch'))",
  lift: ".merchant-lift",
  liftArms: ".merchant-lift-arms",
  verdict: ".merchant-lift-verdict"
}, async () => {
  await p.locator(".merchant-segment-choice", { hasText: "Overdue" }).locator("input").check();
  await p.locator(".merchant-segment-choice", { hasText: "Long gone" }).locator("input").check();
  await p.waitForTimeout(1200);
  await p.locator(".merchant-campaign-card", { hasText: "New weekend brunch" }).getByRole("button", { name: "Did it work?" }).click();
  await p.waitForSelector(".merchant-lift", { timeout: 8000 });
  await p.waitForTimeout(500);
});

/* ── 8. Analytics ─────────────────────────────────────────────────────── */
await full("analytics", "/analytics", {
  kpis: ".merchant-kpi-grid",
  kpiBack: ".merchant-kpi--custva",
  kpiRet: ".merchant-kpi >> nth=1",
  takings: ".merchant-chart-panel >> nth=0",
  legend: ".merchant-chart-panel >> nth=0 >> .recharts-legend-wrapper",
  visits: ".merchant-chart-panel >> nth=1",
  best: ".merchant-chart-panel:has(h2:text('Your best customers'))"
});

/* ── 9. Billing ───────────────────────────────────────────────────────── */
await full("billing", "/billing", {
  basis: ".merchant-commission-basis",
  totals: ".merchant-kpi-grid, .merchant-commission-totals, .merchant-today",
  table: ".merchant-table",
  row1: ".merchant-table tbody tr >> nth=0",
  because: ".merchant-table tbody tr >> nth=0 >> td >> nth=3",
  charge: ".merchant-table tbody tr >> nth=0 >> td >> nth=5"
});

/* ── Numbers for the closing card, straight from the API ──────────────── */
/* Taken after analytics and billing were captured, with no visits in
   between, so these match those screens and the closing card. */
manifest.numbers = {
  dashboard: await apiGet("/analytics/dashboard"),
  commission: (await apiGet("/analytics/commission?limit=1")).byStatus
};

fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 1));
await b.close();
console.log("done");
