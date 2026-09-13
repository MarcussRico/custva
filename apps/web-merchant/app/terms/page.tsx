import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

/**
 * The second URL Meta requires before App Review. Kept short and specific to
 * what Custva actually does — a generic SaaS boilerplate would say nothing
 * about the two things that matter here, which are who is responsible for
 * consent and what exactly commission is charged on.
 *
 * Not legal advice and not reviewed by a lawyer.
 */

export const metadata: Metadata = {
  title: "Terms of Service — Custva",
  description: "The terms on which businesses use Custva."
};

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="legal-todo">{children}</span>
);

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="legal-back">← Custva</Link>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated 13 September 2026</p>

      <p>
        These terms are between <TODO>[LEGAL ENTITY NAME]</TODO> (&ldquo;Custva&rdquo;) and the
        business using it (&ldquo;you&rdquo;). Using Custva means agreeing to them.
      </p>

      <h2>What Custva does</h2>
      <p>
        Custva records your customers&apos; visits, works out how often each one normally returns,
        and sends WhatsApp follow-ups to those who are overdue. It does not guarantee that any
        customer will return.
      </p>

      <h2>Your customers&apos; consent is your responsibility</h2>
      <p>
        You decide who is entered into Custva and you are responsible for having asked them. Custva
        will not send to anyone without a recorded consent, but recording a consent that was never
        given is a misuse of the service and remains your liability.
      </p>
      <p>
        Meta&apos;s WhatsApp Business Messaging Policy applies to every message sent. Repeated
        complaints can cause Meta to restrict or ban the sending number, which is a consequence
        Custva cannot reverse.
      </p>

      <h2>What you are charged for</h2>
      <p>
        Commission is charged only on a visit where all of the following are true: the customer was
        overdue by their own visit pattern, a Custva message reached them, and they returned within
        7 days of that message.
      </p>
      <p>
        Customers who were already visiting on schedule are excluded automatically and never
        generate a charge. Every charge is itemised in the product with the customer, the visit,
        the amount spent and the message it is attributed to.
      </p>
      <p>
        The rate is <TODO>[RATE]</TODO> of the amount those customers spent. The rate in force when
        a charge was made is stored with it, so a later change never alters an earlier charge.
      </p>
      <p>
        Attribution is last-touch: it records that a message reached someone before they returned.
        Where a holdout group is large enough, Custva also reports measured lift, and will state
        plainly when a sample is too small to support a claim.
      </p>

      <h2>Your data</h2>
      <p>
        Your customer records are yours. You can export them at any time, and they are deleted
        within 90 days of closing your account, except consent records, which are kept as evidence
        that messages were permitted. See the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Availability</h2>
      <p>
        Custva is provided as-is. We aim to keep it running but do not promise uninterrupted
        service, and message delivery ultimately depends on Meta.
      </p>

      <h2>Ending it</h2>
      <p>
        You can stop using Custva at any time. Commission already earned remains payable. We may
        suspend an account that violates Meta&apos;s messaging policy or these terms, and will tell
        you why.
      </p>

      <h2>Liability</h2>
      <p>
        Custva&apos;s total liability is limited to the fees you paid in the three months before
        the claim. We are not liable for lost profits or for action taken by Meta against your
        WhatsApp number.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of India, with courts at <TODO>[CITY]</TODO> having
        exclusive jurisdiction.
      </p>

      <h2>Contact</h2>
      <p><TODO>[CONTACT EMAIL]</TODO></p>
    </main>
  );
}
