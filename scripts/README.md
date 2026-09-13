# scripts

Automation scripts for local development, CI support tasks, and production operations.

## `seed-pilot-test.mjs`

Builds a self-contained test shop for verifying WhatsApp end to end — send,
delivery receipt, return visit, attribution, commission row. Nothing short of
real delivery proves that loop, because every interesting failure (template not
approved, name not registered at Meta, consent gate, rate limit) happens at
Meta rather than here.

```
CUSTVA_TEST_NUMBERS=9876543210,9812345678 node scripts/seed-pilot-test.mjs
```

Numbers come from the environment and are never committed: a phone number in a
repo is somebody's phone number forever. Use numbers you or the team hold and
have agreed to receive test messages on — a Meta sandbox WABA caps you at five
verified recipients anyway.

The test shop is its own merchant (`...00ff`). Test traffic in a pilot shop's
book would land in their commission ledger, their lift figures and their
analytics, and those are the numbers the product is asking to be trusted on.

Consent is written through the ledger with the wording given, exactly as the
counter form does. Setting `consent_state = 'granted'` directly would be the
fabrication migration 0023 exists to prevent, and would mean the consent gate
was never actually tested.

Each number gets a different visit rhythm so one send exercises every segment.
Verified against the shared rules: the profiles classify as labelled
(`at_risk` at 13d on a 7d gap, `dormant` at 40d, `loyal` at 3d, `first_time`).
