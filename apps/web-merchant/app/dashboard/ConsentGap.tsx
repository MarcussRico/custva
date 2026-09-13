import Link from "next/link";

/**
 * The consent gap, stated plainly — defect 7.
 *
 * Every customer added before the consent ledger existed has no record of
 * agreeing to anything. That is not a data-quality nag: Meta will not deliver
 * a template to someone who never opted in, and the DPDP Act treats messaging
 * them as processing without consent. A merchant who does not know this is one
 * campaign away from finding out the expensive way.
 *
 * Shown as a fact with a next step, not as a warning banner with an exclamation
 * mark. It disappears the moment the gap is closed.
 */
export function ConsentGap({
  consent
}: {
  consent?: { granted: number; withdrawn: number; unknown: number };
}) {
  if (!consent || consent.unknown === 0) return null;

  const total = consent.granted + consent.withdrawn + consent.unknown;
  const people = consent.unknown === 1 ? "customer has" : "customers have";

  return (
    <section className="merchant-consent-gap">
      <div>
        <strong>
          {consent.unknown.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} {people} no
          recorded consent
        </strong>
        <p>
          They were added before Custva started keeping consent records, so there is nothing
          proving they agreed to WhatsApp messages. Tick the consent box next time they come in
          and the gap closes itself.
        </p>
      </div>
      <Link href="/customers?consent=unknown" className="merchant-link">
        See who →
      </Link>
    </section>
  );
}
