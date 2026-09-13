/**
 * Who the customer sees the message from.
 *
 * A merchant will assume messages go out under their shop's name, because that
 * is the obvious reading of a product that sends on their behalf. On the shared
 * platform number they do not: WhatsApp shows the sender name attached to the
 * phone number, and that name cannot vary per message.
 *
 * Left unsaid, the merchant finds out when a customer asks who Custva is. So
 * it is stated on their own settings page, in the words the customer will
 * actually see.
 */
export function SenderIdentity({
  waStatus,
  waDisplayName,
  shopName
}: {
  waStatus?: string | null;
  waDisplayName?: string | null;
  shopName: string;
}) {
  const own = waStatus === "connected";
  const shown = own ? (waDisplayName ?? shopName) : "Custva";

  return (
    <section className="merchant-panel">
      <h2>How your messages appear</h2>
      <p className="merchant-sender-preview">
        <span>Your customers see this as the sender</span>
        <strong>{shown}</strong>
      </p>
      {own ? (
        <p className="merchant-muted merchant-sender-note">
          You are sending from your own WhatsApp number, so your customers see your shop&apos;s
          name.
        </p>
      ) : (
        <p className="merchant-muted merchant-sender-note">
          You are currently sending from the shared Custva number, so your customers see
          &ldquo;Custva&rdquo; rather than {shopName}. Your shop&apos;s name still appears in every
          message, but the sender does not. To send under your own name you need a WhatsApp number
          of your own connected to Custva — ask us and we will set it up.
        </p>
      )}
    </section>
  );
}
