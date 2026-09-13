import type { Pool } from "pg";
import { decryptCredential } from "@custva/shared";

/**
 * Which number a given merchant sends from.
 *
 * The API has its own copy of this against its own pool — deliberately, rather
 * than the worker importing across the app boundary. These are two
 * independently deployable services and the worker should not depend on the
 * API's source tree. The crypto itself lives in @custva/shared, which is the
 * part that must not be duplicated.
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

export async function resolveSender(
  db: Pool,
  merchantId: string
): Promise<WaSender | null> {
  const row = await db.query(
    `SELECT wa_phone_number_id, wa_business_account_id, wa_access_token_encrypted,
            wa_display_name, wa_onboarding_status
       FROM merchants WHERE id = $1`,
    [merchantId]
  );
  const m = row.rows[0] as
    | {
        wa_phone_number_id: string | null;
        wa_business_account_id: string | null;
        wa_access_token_encrypted: string | null;
        wa_display_name: string | null;
        wa_onboarding_status: string;
      }
    | undefined;

  if (m?.wa_onboarding_status === "connected" && m.wa_phone_number_id) {
    const token = decryptCredential(m.wa_access_token_encrypted);
    /* Connected but the token will not decrypt — a rotated key, or a bad
       write. Falling back to the platform number here would send from the
       wrong shop under the wrong name, which is worse than not sending. */
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
      appId: process.env.WA_APP_ID,
      displayName: m.wa_display_name,
      isOwnNumber: true
    };
  }

  if (!process.env.WA_PHONE_NUMBER_ID || !process.env.WA_ACCESS_TOKEN) return null;

  return {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
    accessToken: process.env.WA_ACCESS_TOKEN,
    businessAccountId: process.env.WA_BUSINESS_ACCOUNT_ID,
    appId: process.env.WA_APP_ID,
    displayName: null,
    isOwnNumber: false
  };
}
