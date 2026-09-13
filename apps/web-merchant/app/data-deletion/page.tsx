import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

/**
 * Where Meta sends someone after a data-deletion request, and where anyone can
 * find out how to have their information removed. Meta accepts either a
 * callback or a public instructions URL; this repo provides both, because the
 * callback only covers merchants who connected through Facebook and says
 * nothing to a shop's customer who simply wants to be forgotten.
 */

export const metadata: Metadata = {
  title: "Deleting your information — Custva",
  description: "How to have your information removed from Custva."
};

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="legal-todo">{children}</span>
);

export default function DataDeletionPage({
  searchParams
}: {
  searchParams: { code?: string };
}) {
  return (
    <main className="legal-page">
      <Link href="/" className="legal-back">← Custva</Link>
      <h1>Deleting your information</h1>
      <p className="legal-updated">Last updated 13 September 2026</p>

      {searchParams.code && (
        <>
          <h2>Your request</h2>
          <p>
            Reference <strong>{searchParams.code}</strong>. The WhatsApp access Custva held for
            your Meta account has been removed and sending has stopped.
          </p>
          <p>
            That does not delete a shop&apos;s customer records, which belong to the shop rather
            than to Custva. To have those removed, use the section below.
          </p>
        </>
      )}

      <h2>If a shop has your details</h2>
      <p>
        You gave your number to a shop, and the shop decides what is kept about you. You can ask
        either the shop or us:
      </p>
      <ul>
        <li>
          <strong>Ask the shop.</strong> They can delete you from Custva themselves, immediately.
        </li>
        <li>
          <strong>Write to <TODO>[GRIEVANCE CONTACT EMAIL]</TODO></strong> with your mobile number
          and the shop&apos;s name. We confirm with the shop and delete within 30 days.
        </li>
      </ul>

      <h3>Just want the messages to stop?</h3>
      <p>
        Reply <strong>STOP</strong> to any message. That takes effect within seconds and keeps your
        visit history with the shop intact — you simply stop being messaged. It is usually what
        people actually want, and it is instant.
      </p>

      <h3>What is deleted</h3>
      <ul>
        <li>Your name, mobile number and any age, birthday or pincode recorded.</li>
        <li>Your visit history and spend with that shop.</li>
        <li>The record of messages sent to you.</li>
      </ul>

      <h3>What is kept, and why</h3>
      <p>
        The record that you agreed to be messaged, and any later request to stop. Deleting that
        would destroy the evidence that messaging you was permitted — which is the record that
        protects you if it is ever disputed. It is kept for 7 years and used for nothing else.
      </p>

      <h2>If you are a shop using Custva</h2>
      <p>
        Close your account from your profile page, or write to{" "}
        <TODO>[CONTACT EMAIL]</TODO>. Your customer records are deleted within 90 days, and you can
        export them beforehand.
      </p>
      <p>
        Removing Custva from your Facebook account also works: Meta notifies us, we destroy the
        WhatsApp credential you gave us and stop sending. Your customer records in Custva are not
        affected by that — ask us directly if you want those gone too.
      </p>

      <h2>Contact</h2>
      <p>
        <TODO>[GRIEVANCE OFFICER NAME]</TODO>, Grievance Officer<br />
        <TODO>[GRIEVANCE CONTACT EMAIL]</TODO>
      </p>
    </main>
  );
}
