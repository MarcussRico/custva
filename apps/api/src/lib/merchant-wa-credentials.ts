import { decryptCredential, encryptCredential } from "@custva/shared";
import { env } from "../config.js";
import { query } from "./db.js";

/**
 * Per-merchant WhatsApp credentials — storage, and resolving which number a
 * given merchant actually sends from.
 *
 * A long-lived WhatsApp access token can send messages and spend money on the
 * merchant's behalf. Storing it in a plain column means a database dump, a
 * backup on someone's laptop, or one careless `SELECT *` in a log hands that
 * over. So it is encrypted at rest with a key the database does not hold.
 *
 * The fallback matters as much as the encryption: a merchant with no
 * credentials of their own uses the platform number. That is what lets a
 * three-shop pilot run on one shared number today, and individual merchants
 * move onto their own numbers later, without either case being a special code
 * path.
 */

export interface WaSender {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId?: string;
  appId?: string;
  displayName: string | null;
  /** False when this merchant is borrowing the platform number. */
  isOwnNumber: boolean;
}

/**
 * Which number this merchant sends from.
 *
 * Their own if connected, otherwise the platform's. Null when neither exists,
 * which callers must treat as "cannot send" rather than "send from somewhere".
 */
export async function resolveSender(merchantId: string): Promise<WaSender | null> {
  const row = await query<{
    wa_phone_number_id: string | null;
    wa_business_account_id: string | null;
    wa_access_token_encrypted: string | null;
    wa_display_name: string | null;
    wa_onboarding_status: string;
  }>(
    `SELECT wa_phone_number_id, wa_business_account_id, wa_access_token_encrypted,
            wa_display_name, wa_onboarding_status
       FROM merchants WHERE id = $1`,
    [merchantId]
  );

  const m = row.rows[0];
  if (m?.wa_onboarding_status === "connected" && m.wa_phone_number_id) {
    const token = decryptCredential(m.wa_access_token_encrypted);
    /* Connected but the token will not decrypt — a rotated key, or a bad
       write. Falling through to the platform number would send from the wrong
       shop under the wrong name, which is worse than not sending. */
    if (!token) {
      console.error(
        `Merchant ${merchantId} is marked connected but its token cannot be decrypted. Not falling back.`
      );
      return null;
    }
    return {
      phoneNumberId: m.wa_phone_number_id,
      accessToken: token,
      businessAccountId: m.wa_business_account_id ?? undefined,
      appId: env.WA_APP_ID ?? undefined,
      displayName: m.wa_display_name,
      isOwnNumber: true
    };
  }

  if (!env.WA_PHONE_NUMBER_ID || !env.WA_ACCESS_TOKEN) return null;

  return {
    phoneNumberId: env.WA_PHONE_NUMBER_ID,
    accessToken: env.WA_ACCESS_TOKEN,
    businessAccountId: env.WA_BUSINESS_ACCOUNT_ID ?? undefined,
    appId: env.WA_APP_ID ?? undefined,
    displayName: null,
    isOwnNumber: false
  };
}

/** The merchant that owns an inbound webhook's phone number id, if any. */
export async function merchantForPhoneNumberId(
  phoneNumberId: string | null | undefined
): Promise<string | null> {
  if (!phoneNumberId) return null;
  const row = await query<{ id: string }>(
    `SELECT id FROM merchants WHERE wa_phone_number_id = $1 AND wa_onboarding_status = 'connected'`,
    [phoneNumberId]
  );
  return row.rows[0]?.id ?? null;
}

export interface ConnectInput {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  displayName?: string | null;
}

export async function connectMerchantSender(
  merchantId: string,
  input: ConnectInput
): Promise<void> {
  await query(
    `UPDATE merchants
        SET wa_phone_number_id = $2,
            wa_business_account_id = $3,
            wa_access_token_encrypted = $4,
            wa_display_name = $5,
            wa_onboarding_status = 'connected',
            wa_connected_at = NOW(),
            wa_last_error = NULL,
            updated_at = NOW()
      WHERE id = $1`,
    [
      merchantId,
      input.phoneNumberId,
      input.businessAccountId,
      encryptCredential(input.accessToken),
      input.displayName ?? null
    ]
  );
}

export async function disconnectMerchantSender(
  merchantId: string,
  reason?: string
): Promise<void> {
  /* The token is cleared, not merely marked disconnected. A credential that is
     no longer used should not still be sitting in the database. */
  await query(
    `UPDATE merchants
        SET wa_access_token_encrypted = NULL,
            wa_onboarding_status = 'not_started',
            wa_connected_at = NULL,
            wa_last_error = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [merchantId, reason ?? null]
  );
}
