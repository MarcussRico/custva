/**
 * The demo book — a shop with enough history that every screen has something
 * true to show.
 *
 * This existed only as ad-hoc rows in one laptop's Postgres, so a teammate
 * cloning the repo got a working product with nothing in it: empty dashboard,
 * empty segments, empty commission ledger, and no way to see what any of it
 * does. Committed so the demo is reproducible.
 *
 * Distinct from `seed-pilot-test.mjs`, and the difference matters. That script
 * takes numbers you actually hold, for sending real WhatsApp messages. This one
 * is fiction: the numbers are fabricated, nothing here should ever be sent to,
 * and pointing live Meta credentials at this merchant would message whoever
 * really owns these numbers.
 */
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
if (process.env.NODE_ENV !== "production") dotenv.config({ path: ".env.example" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed demo data in production.");
}

const MERCHANT_ID = "00000000-0000-0000-0000-000000000010";
const NOTICE = "Customer agreed to receive offers and reminders from this shop on WhatsApp.";

/* Chosen so every segment, every consent state and both ends of the overdue
   scale are represented — a demo where everything is healthy demonstrates
   nothing. `gap` is the rhythm; `since` is days since their last visit, and the
   ratio between them is what decides the segment. */
const PEOPLE = [
  { name: "Rahul Iyer",     mobile: "9840112255", visits: 4, gap: 14, since: 32, spend: 561, consent: "withdrawn" },
  { name: "Anjali Pillai",  mobile: "9840112300", visits: 3, gap: 7,  since: 18, spend: 559, consent: "granted" },
  { name: "Priya Nair",     mobile: "9840112244", visits: 5, gap: 7,  since: 13, spend: 343, consent: "granted" },
  { name: "Meera Krishnan", mobile: "9840112288", visits: 7, gap: 5,  since: 9,  spend: 213, consent: "granted" },
  { name: "Karthik S",      mobile: "9840112277", visits: 8, gap: 10, since: 6,  spend: 286, consent: "granted" },
  { name: "Vikram Rao",     mobile: "9840112299", visits: 4, gap: 30, since: 21, spend: 564, consent: "granted" },
  { name: "Arjun Menon",    mobile: "9840112233", visits: 6, gap: 7,  since: 3,  spend: 187, consent: "granted" },
  { name: "Divya Raman",    mobile: "9840112266", visits: 1, gap: 14, since: 13, spend: 510, consent: "unknown" }
];

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");

  await client.query(
    `INSERT INTO merchants (id, name, business_name, email, status, item_categories,
                            commission_rate, holdout_percent)
     VALUES ($1, 'Filter Room', 'Filter Room', 'demo@filterroom.in', 'active',
             '["cafe"]'::jsonb, 0.05, 10.0)
     ON CONFLICT (id) DO UPDATE SET status = 'active', commission_rate = 0.05`,
    [MERCHANT_ID]
  );

  /* Idempotent and scoped to this merchant, so re-running refreshes the demo
     without ever touching a real book. */
  await client.query(`DELETE FROM customers WHERE merchant_id = $1`, [MERCHANT_ID]);

  for (const p of PEOPLE) {
    const { rows } = await client.query(
      `INSERT INTO customers (merchant_id, name, mobile, total_spend, total_visits, last_visit,
                              whatsapp_opt_in, consent_state)
       VALUES ($1,$2,$3,$4,$5, NOW() - ($6 * INTERVAL '1 day'), TRUE, 'unknown')
       RETURNING id`,
      [MERCHANT_ID, p.name, p.mobile, p.spend * p.visits, p.visits, p.since]
    );
    const id = rows[0].id;

    /* Evenly spaced back from the last visit, so the rhythm is derived from
       real history rather than falling back to the 14-day default. */
    for (let v = 0; v < p.visits; v++) {
      await client.query(
        `INSERT INTO customer_visits (merchant_id, customer_id, billing_amount, visit_at, is_repeat_visit)
         VALUES ($1,$2,$3, NOW() - ($4 * INTERVAL '1 day'), $5)`,
        [MERCHANT_ID, id, p.spend, p.since + v * p.gap, v < p.visits - 1]
      );
    }

    /* Through the ledger, exactly as the counter form and the STOP handler do.
       Writing consent_state directly would leave the demo unable to show the
       one screen consent exists for — the evidence trail on a customer. */
    if (p.consent === "granted") {
      await client.query(
        `INSERT INTO consents (merchant_id, customer_id, action, method, source,
                               notice_text, notice_version, evidence)
         VALUES ($1,$2,'granted','counter_verbal','merchant_staff',$3,'counter-v1',
                 jsonb_build_object('seededBy','seed-demo-shop.mjs'))`,
        [MERCHANT_ID, id, NOTICE]
      );
    } else if (p.consent === "withdrawn") {
      await client.query(
        `INSERT INTO consents (merchant_id, customer_id, action, method, source,
                               notice_text, notice_version, evidence)
         VALUES ($1,$2,'granted','counter_verbal','merchant_staff',$3,'counter-v1',
                 jsonb_build_object('seededBy','seed-demo-shop.mjs')),
                ($1,$2,'withdrawn','whatsapp_reply','customer',NULL,NULL,
                 jsonb_build_object('seededBy','seed-demo-shop.mjs','body','STOP'))`,
        [MERCHANT_ID, id, NOTICE]
      );
    }

    if (p.consent !== "unknown") {
      await client.query(
        `UPDATE customers
            SET consent_state = $2, consent_updated_at = NOW(), whatsapp_opt_in = $3
          WHERE id = $1`,
        [id, p.consent, p.consent === "granted"]
      );
    }
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
}

const { rows } = await client.query(
  `SELECT consent_state, COUNT(*)::int AS n FROM customers WHERE merchant_id=$1 GROUP BY 1 ORDER BY 1`,
  [MERCHANT_ID]
);
console.log(`Seeded ${PEOPLE.length} demo customers for Filter Room (${MERCHANT_ID}).`);
console.log("  consent:", rows.map((r) => `${r.n} ${r.consent_state}`).join(", "));
console.log(`
Segments are computed, not stored by this script. Run the worker once (it
sweeps on startup) or record a visit, and the dashboard fills in.

These numbers are fabricated. Never point live Meta credentials at this
merchant — use scripts/seed-pilot-test.mjs with numbers you actually hold.
`);

await client.end();
