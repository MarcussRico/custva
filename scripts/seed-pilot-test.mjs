/**
 * Seeds a self-contained test shop for end-to-end WhatsApp verification.
 *
 * The point of this script is to get real messages to real handsets and watch
 * the whole loop close: send → delivery receipt → the customer walks back in →
 * the visit is attributed → a commission row appears. Nothing short of real
 * delivery proves that, because every interesting failure (template not
 * approved, name not registered, consent gate, rate limit) happens at Meta.
 *
 * Three deliberate constraints.
 *
 * 1. **Numbers come from the environment, never from this file.** A phone
 *    number committed to a repo is somebody's phone number forever. Set
 *    CUSTVA_TEST_NUMBERS to numbers you or the team actually hold and have
 *    agreed to receive test messages on — Meta caps a sandbox WABA at five
 *    verified recipients anyway.
 *
 * 2. **Its own merchant.** Test traffic in the pilot shop's book would land in
 *    their commission ledger, their lift figures and their analytics, and
 *    those are the numbers the whole product is asking to be trusted on.
 *
 * 3. **Real consent rows, not a flipped boolean.** These people did agree, so
 *    the ledger records that with the wording they were given. Writing
 *    `consent_state = 'granted'` directly would be the exact fabrication
 *    migration 0023 exists to prevent, and it would mean the consent gate was
 *    never actually tested.
 *
 * Usage:
 *   CUSTVA_TEST_NUMBERS=9876543210,9812345678 pnpm tsx scripts/seed-pilot-test.mjs
 */
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.example" });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

/* Fabricated visit history is fine. Fabricated *recipients* are not: a wrong
   digit means a stranger gets a marketing message from a shop they have never
   visited, and it is the shop's number that pays for it. */
if (process.env.NODE_ENV === "production" && !process.env.CUSTVA_ALLOW_TEST_SEED) {
  throw new Error(
    "Refusing to seed test data in production. Set CUSTVA_ALLOW_TEST_SEED=1 if this is genuinely intended."
  );
}

const raw = (process.env.CUSTVA_TEST_NUMBERS ?? "").trim();
if (!raw) {
  throw new Error(
    "Set CUSTVA_TEST_NUMBERS to a comma-separated list of numbers you control, e.g.\n" +
      "  CUSTVA_TEST_NUMBERS=9876543210,9812345678\n" +
      "These must be numbers you or your team hold and have agreed to receive test messages on.\n" +
      "On a Meta sandbox WABA they also have to be added as verified recipients first."
  );
}

const numbers = raw
  .split(",")
  .map((n) => n.replace(/\D/g, ""))
  .filter(Boolean)
  .map((n) => n.slice(-10));

for (const n of numbers) {
  if (n.length !== 10) throw new Error(`"${n}" is not a 10-digit Indian mobile.`);
}
if (numbers.length > 5) {
  console.warn(
    `${numbers.length} numbers given. A Meta sandbox WABA accepts at most 5 verified recipients; the rest will fail to deliver.`
  );
}

const MERCHANT_ID = "00000000-0000-0000-0000-0000000000ff";
const NOTICE =
  "Test recipient agreed to receive Custva test messages on WhatsApp.";

/* One profile per number, cycling. Each produces a different segment, so a
   single send exercises every branch of the intervention policy rather than
   only the easy one. */
const PROFILES = [
  { label: "at_risk",    gapDays: 7,  visits: 5, lastVisitDaysAgo: 13, spend: 320 },
  { label: "dormant",    gapDays: 7,  visits: 4, lastVisitDaysAgo: 40, spend: 280 },
  { label: "loyal",      gapDays: 7,  visits: 6, lastVisitDaysAgo: 3,  spend: 410 },
  { label: "first_time", gapDays: null, visits: 1, lastVisitDaysAgo: 1, spend: 150 },
  { label: "at_risk",    gapDays: 14, visits: 3, lastVisitDaysAgo: 26, spend: 500 }
];

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");

  await client.query(
    `INSERT INTO merchants (id, name, business_name, email, status, item_categories, commission_rate)
     VALUES ($1, 'Custva Test Shop', 'Custva Test Shop', 'test-shop@custva.local', 'active', '["cafe"]'::jsonb, 0.05)
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [MERCHANT_ID]
  );

  /* Idempotent: re-running replaces the test book rather than doubling it.
     Scoped to this merchant only, so it can never touch a real one. */
  await client.query(`DELETE FROM customers WHERE merchant_id = $1`, [MERCHANT_ID]);

  for (const [i, mobile] of numbers.entries()) {
    const p = PROFILES[i % PROFILES.length];

    const inserted = await client.query(
      `INSERT INTO customers (merchant_id, name, mobile, total_spend, total_visits, last_visit,
                              whatsapp_opt_in, consent_state)
       VALUES ($1, $2, $3, $4, $5, NOW() - ($6 * INTERVAL '1 day'), TRUE, 'unknown')
       RETURNING id`,
      [MERCHANT_ID, `Test ${p.label} ${i + 1}`, mobile, p.spend * p.visits, p.visits, p.lastVisitDaysAgo]
    );
    const customerId = inserted.rows[0].id;

    /* Evenly spaced visits back from the last one, so computeExpectedGapDays
       derives the rhythm from real history instead of the 14-day fallback. */
    for (let v = 0; v < p.visits; v++) {
      const daysAgo = p.lastVisitDaysAgo + v * (p.gapDays ?? 14);
      await client.query(
        `INSERT INTO customer_visits (merchant_id, customer_id, billing_amount, visit_at, is_repeat_visit)
         VALUES ($1, $2, $3, NOW() - ($4 * INTERVAL '1 day'), $5)`,
        [MERCHANT_ID, customerId, p.spend, daysAgo, v < p.visits - 1]
      );
    }

    /* Through the ledger, with the wording, exactly as the counter form does. */
    await client.query(
      `INSERT INTO consents (merchant_id, customer_id, action, method, source,
                             notice_text, notice_version, evidence)
       VALUES ($1, $2, 'granted', 'counter_verbal', 'merchant_staff', $3, 'test-v1',
               jsonb_build_object('seededBy', 'seed-pilot-test.mjs'))`,
      [MERCHANT_ID, customerId, NOTICE]
    );
    await client.query(
      `UPDATE customers SET consent_state = 'granted', consent_updated_at = NOW(),
              whatsapp_opt_in = TRUE WHERE id = $1`,
      [customerId]
    );

    console.log(`  ${mobile} → ${p.label}, ${p.visits} visits, last ${p.lastVisitDaysAgo}d ago`);
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
}

console.log(`
Seeded ${numbers.length} test customer(s) under merchant ${MERCHANT_ID}.

Segments are NOT set yet — they are computed by the nightly job or on the next
visit write, so run the segmentation pass (or record a visit) before expecting
"overdue" to be populated.

Then, to actually send:
  1. Submit a template from the admin templates screen and wait for APPROVED.
     Nothing sends before that, whatever approval_status says locally.
  2. Add each number as a verified recipient in Meta Business Manager if you
     are on a sandbox WABA.
  3. Build a campaign against this merchant and send it.
`);

await client.end();
