import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

/**
 * Meta requires a reachable privacy policy URL before it will review the
 * `whatsapp_business_management` and `whatsapp_business_messaging` permissions,
 * and those permissions are what Embedded Signup runs on. So this page is a
 * hard prerequisite for Tech Provider status, not a formality.
 *
 * Written from what the system actually does rather than from a template —
 * every field named below is a real column, and every retention claim matches
 * real behaviour. The placeholders are marked so they cannot ship unnoticed.
 *
 * This is not legal advice and has not been reviewed by a lawyer. The DPDP
 * Act's requirements around a Data Protection Officer, cross-border transfer
 * and consent notices in local languages need someone qualified to sign off.
 */

export const metadata: Metadata = {
  title: "Privacy Policy — Custva",
  description:
    "How Custva collects, uses and protects customer information on behalf of the businesses that use it.",
  /* Temporary. These pages are live with placeholders still in them — legal
     entity, registered address, grievance officer — and a search engine's cache
     outlives the fix. Indexed now, a version of the privacy policy with blanks in
     it stays findable long after the real one is published.
     
     Remove this once the placeholders are filled. Meta reads the URL directly
     and is unaffected by it either way. */
  robots: { index: false, follow: false }
};

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="legal-todo">{children}</span>
);

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="legal-back">← Custva</Link>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated 13 September 2026</p>

      <p>
        Custva is a customer-retention tool for offline businesses. Shops record walk-in visits,
        and Custva works out when each customer normally returns so the shop can follow up on
        WhatsApp when someone is overdue.
      </p>

      <h2>Who is responsible for your information</h2>
      <p>
        If you are a <strong>customer of a shop</strong> that uses Custva, the shop decides what
        information is collected about you and why. Under India&apos;s Digital Personal Data
        Protection Act, 2023, the shop is the <em>Data Fiduciary</em>. Custva processes that
        information on the shop&apos;s instructions as a <em>Data Processor</em>, and does not use
        it for its own purposes.
      </p>
      <p>
        If you are a <strong>shop using Custva</strong>, we are the Data Fiduciary for your account
        details and billing information.
      </p>
      <p>
        Custva is operated by <TODO>[LEGAL ENTITY NAME]</TODO>, <TODO>[REGISTERED ADDRESS]</TODO>.
      </p>

      <h2>What is collected about a shop&apos;s customers</h2>
      <p>Only what the shop enters at the counter, plus what follows from their visits:</p>
      <table>
        <thead>
          <tr><th>Information</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td>Name and mobile number</td><td>To recognise a returning customer and to send WhatsApp messages</td></tr>
          <tr><td>Visit dates and bill amounts</td><td>To work out how often someone normally visits and when they are overdue</td></tr>
          <tr><td>Pincode, age or date of birth (optional)</td><td>Only if the shop chooses to record them; used for grouping and birthday offers</td></tr>
          <tr><td>Consent record</td><td>What the customer was told, when, by what means, and any later request to stop</td></tr>
          <tr><td>Message delivery status</td><td>Whether a message was delivered and read, so the shop is not charged for messages that did not arrive</td></tr>
        </tbody>
      </table>
      <p>
        Custva does not collect location, contacts, payment card details, or the contents of any
        conversation between a shop and its customers.
      </p>

      <h2>WhatsApp messages</h2>
      <p>
        Messages are sent through the WhatsApp Business Platform, operated by Meta. To send a
        message, the customer&apos;s phone number and the message content are passed to Meta, whose
        own terms and privacy policy then apply to that delivery.
      </p>
      <p>
        A message is only sent to someone with a recorded consent. If no consent has been recorded,
        no message is sent — an absent record is treated as a no, not as permission.
      </p>

      <h2>Stopping messages</h2>
      <p>
        Reply <strong>STOP</strong> to any message and Custva records the withdrawal and stops
        sending, usually within seconds. You can also ask the shop directly and they can record it
        for you. Reply <strong>START</strong> to begin receiving messages again.
      </p>
      <p>
        A withdrawal is never deleted or overwritten — it is kept alongside the original consent so
        both remain provable.
      </p>

      <h2>Your rights</h2>
      <p>Under the DPDP Act you may ask the shop, or Custva on its behalf, to:</p>
      <ul>
        <li>tell you what information is held about you;</li>
        <li>correct anything inaccurate or incomplete;</li>
        <li>erase your information where it is no longer needed;</li>
        <li>withdraw consent at any time, as easily as it was given;</li>
        <li>nominate someone to exercise these rights if you are unable to.</li>
      </ul>
      <p>
        To make a request, see <Link href="/data-deletion">Deleting your information</Link>, or
        write to <TODO>[GRIEVANCE CONTACT EMAIL]</TODO>. We respond within 30 days.
      </p>

      <h2>How long information is kept</h2>
      <ul>
        <li>Customer records and visit history: for as long as the shop uses Custva, and deleted within 90 days of the shop closing its account.</li>
        <li>Consent records: kept for 7 years after the account closes, because they are the evidence that a message was permitted. This is the one thing not deleted on request, and the reason is that deleting it would destroy the proof that protects both you and the shop.</li>
        <li>Message delivery records: 24 months.</li>
      </ul>

      <h2>Who else sees it</h2>
      <p>
        Custva does not sell information and does not share it for advertising. It is shared only
        with providers who make the service work:
      </p>
      <ul>
        <li><strong>Meta Platforms</strong> — to deliver WhatsApp messages.</li>
        <li><strong><TODO>[HOSTING PROVIDER]</TODO></strong> — to run the service and store data.</li>
        <li>A regulator or court, where the law requires it.</li>
      </ul>
      <p>
        Data is stored in <TODO>[REGION]</TODO>.
      </p>

      <h2>How it is protected</h2>
      <p>
        Access is restricted to the shop that owns the record; every database query is scoped to a
        single shop so one shop cannot see another&apos;s customers. Credentials held on a
        shop&apos;s behalf are encrypted at rest. Traffic is encrypted in transit.
      </p>

      <h2>Children</h2>
      <p>
        Custva is not intended for anyone under 18, and shops should not record information about
        children. If you believe a child&apos;s information has been recorded, contact us and it
        will be deleted.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, shops are notified in the product and the date above is
        updated. Consent already given was given to the wording in force at the time, and that
        wording is stored with each consent record.
      </p>

      <h2>Contact</h2>
      <p>
        <TODO>[GRIEVANCE OFFICER NAME]</TODO>, Grievance Officer<br />
        <TODO>[GRIEVANCE CONTACT EMAIL]</TODO><br />
        <TODO>[REGISTERED ADDRESS]</TODO>
      </p>
    </main>
  );
}
