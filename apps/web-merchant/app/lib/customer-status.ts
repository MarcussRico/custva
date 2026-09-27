/**
 * How a customer's status is worded, everywhere it appears.
 *
 * The dashboard, the customers list and the customer page used to word this
 * separately, and they drifted into contradictions a counter would notice:
 * "10 days late" printed beside an "On schedule" pill. That pairing happens
 * legitimately — Loyal runs to 1.25x a customer's usual gap, so a regular can
 * be a day or two past their day and still be Loyal — and the fix is to say
 * what is actually true of them ("Due now"), not to hide either fact.
 */

export type Segment = "first_time" | "loyal" | "at_risk" | "dormant";

/** Whole days since the date they were expected back. Negative = not yet due. */
export function daysPastDue(expectedRevisitAt: string | null): number | null {
  if (!expectedRevisitAt) return null;
  return Math.round((Date.now() - new Date(expectedRevisitAt).getTime()) / 86_400_000);
}

export function statusFor(
  segment: Segment | null,
  expectedRevisitAt: string | null
): { key: string; label: string } | null {
  if (!segment) return null;
  if (segment === "loyal") {
    const late = daysPastDue(expectedRevisitAt);
    return late != null && late > 0
      ? { key: "due-now", label: "Due now" }
      : { key: "loyal", label: "On schedule" };
  }
  return {
    first_time: { key: "first_time", label: "First visit" },
    at_risk: { key: "at_risk", label: "Overdue" },
    dormant: { key: "dormant", label: "Long gone" }
  }[segment];
}

/** "3 days late" / "Due today" / "Due in 2 days". */
export function dueLine(expectedRevisitAt: string | null): string {
  const days = daysPastDue(expectedRevisitAt);
  if (days == null) return "—";
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} late`;
  if (days === 0) return "Due today";
  const ahead = Math.abs(days);
  return `Due in ${ahead} day${ahead === 1 ? "" : "s"}`;
}

/**
 * "usually every 7d" is only true once we have seen their habit. Below three
 * visits the gap is the shop's typical one, and saying "usually" about
 * someone who has been in once is making it up.
 */
export function rhythmLine(
  expectedGapDays: string | number | null,
  totalVisits: number
): string | null {
  if (expectedGapDays == null) return null;
  const gap = Math.round(Number(expectedGapDays));
  return totalVisits >= 3 ? `usually every ${gap}d` : `most return within ${gap}d`;
}

/** "+919840112300" → "98401 12300", the way a number is read out at a counter. */
export function formatMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return ten.length === 10 ? `${ten.slice(0, 5)} ${ten.slice(5)}` : mobile;
}
