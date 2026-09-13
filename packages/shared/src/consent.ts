/**
 * Consent — defect 7, and a hard gate on any real send.
 *
 * Before this, consent was `whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE`,
 * hardcoded TRUE on insert. That is not consent; it is an assumption stored in
 * a column. Meta requires explicit opt-in before a template reaches anyone, and
 * the DPDP Act requires it recorded — what was said, when, by what means — and
 * revocable. A boolean cannot answer "prove she agreed", and it cannot answer
 * it *after* she complains, which is the only time anyone asks.
 *
 * Two things follow from that, and they shape everything below.
 *
 * **Absent is not the same as no.** A boolean has two states and consent has
 * three: granted, withdrawn, and *not known*. Every customer created before
 * this existed is in the third state. Recording them as granted would be
 * fabricating evidence — the exact failure this module exists to prevent — so
 * they stay `unknown` and the gap is made visible instead of papered over.
 *
 * **The ledger is append-only.** Consent state is a projection of it, never the
 * other way round. An UPDATE to a boolean destroys the history that is the
 * whole point; a withdrawal has to remain legible years later, alongside the
 * grant it revoked.
 */

export type ConsentState = "granted" | "withdrawn" | "unknown";

export type ConsentAction = "granted" | "withdrawn";

/**
 * How the consent was obtained or revoked. Recorded because "she agreed" and
 * "she ticked a box on a form" are different evidentiary weights, and because
 * a regulator asks *how*, not just whether.
 */
export type ConsentMethod =
  /** Staff asked at the counter and recorded the answer. */
  | "counter_verbal"
  /** The customer filled or signed something. */
  | "counter_form"
  /** The customer messaged the business first, or replied STOP/START. */
  | "whatsapp_reply"
  /** Supplied in a bulk import by the merchant, who asserts they hold it. */
  | "merchant_import"
  /** A correction made by Custva staff, which must name a reason. */
  | "admin_correction";

export type ConsentSource = "merchant_staff" | "customer" | "system";

export const CONSENT = {
  /**
   * Withdrawn is absolute — no campaign, no lifecycle message, no exception,
   * and no way for a manual include to override it.
   */
  neverMessage: ["withdrawn"] as const,
  /**
   * Whether a customer with no recorded consent may still be messaged.
   *
   * True today, and this is a deliberate, temporary bridge rather than an
   * oversight. Every customer predating the ledger is `unknown`; flipping this
   * to false would silently mute an entire book overnight and the merchant
   * would discover it as "Custva stopped working". Instead the count of
   * unrecorded customers is surfaced in the product so the gap is visible and
   * can be closed at the counter.
   *
   * **This must be false before any real Meta credentials are live.** At that
   * point a send to an `unknown` customer is a message to someone who never
   * agreed, and Meta's opt-in policy makes it the merchant's number that pays.
   */
  allowUnknown: true,
} as const;

/** May a template be sent to someone in this state, under current policy? */
export function canMessage(state: ConsentState): boolean {
  if (state === "withdrawn") return false;
  if (state === "unknown") return CONSENT.allowUnknown;
  return true;
}

/** The state a customer holds after this action. */
export function stateAfter(action: ConsentAction): ConsentState {
  return action === "granted" ? "granted" : "withdrawn";
}

/**
 * What an inbound WhatsApp message asks for, if anything.
 *
 * Matched against the **whole** normalised message, never as a substring. "Do
 * not stop making these brownies" contains "stop" and is emphatically not an
 * opt-out; treating it as one would silently delete a real customer's consent
 * on the strength of a compliment. Meta's own guidance is the same: exact
 * keyword, not contains.
 */
export function classifyInbound(raw: string | null | undefined): ConsentAction | null {
  const text = normalise(raw);
  if (!text) return null;
  if (WITHDRAW_KEYWORDS.has(text)) return "withdrawn";
  if (RESUME_KEYWORDS.has(text)) return "granted";
  return null;
}

/**
 * Lowercase, strip accents, drop everything that is not a letter, digit or
 * single space. Real replies arrive as "STOP.", "stop 🙏", "Stop!!" — all the
 * same instruction, and a customer who asks to be left alone must not stay
 * subscribed because they used a full stop.
 */
function normalise(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKD")
    /* Strip combining marks left by NFKD, so "STOP" typed with a stray accent
       still matches. */
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    /* Keep Latin letters, digits, spaces, and the Devanagari (0900-097F) and
       Tamil (0B80-0BFF) blocks. Everything else — punctuation, emoji, ZWJ —
       becomes a space. */
    .replace(/[^a-z0-9\u0900-\u097f\u0b80-\u0bff ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Meta's standard set, plus the phrasings people actually send. Devanagari and
   Tamil are included because the merchants this is being built for are in
   Tamil Nadu and their customers do not all reply in English. */
const WITHDRAW_KEYWORDS = new Set([
  "stop",
  "stopall",
  "stop all",
  "unsubscribe",
  "unsub",
  "cancel",
  "end",
  "quit",
  "optout",
  "opt out",
  "remove me",
  "dont message me",
  "do not message me",
  "no more messages",
  "வேண்டாம்",
  "நிறுத்து",
  "बंद करो",
  "बंद",
  "रोको"
]);

const RESUME_KEYWORDS = new Set([
  "start",
  "unstop",
  "resume",
  "subscribe",
  "yes",
  "optin",
  "opt in",
  "தொடங்கு",
  "शुरू करो",
  "शुरू"
]);

/** Plain language for the merchant-facing UI. No jargon, no state names. */
export function describeConsent(
  state: ConsentState,
  occurredAt?: Date | string | null
): string {
  const when = occurredAt ? ` on ${formatDay(occurredAt)}` : "";
  switch (state) {
    case "granted":
      return `Agreed to WhatsApp messages${when}`;
    case "withdrawn":
      return `Asked to stop${when}`;
    default:
      return "No consent recorded";
  }
}

function formatDay(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "an unknown date";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
