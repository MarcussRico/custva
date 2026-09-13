import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encryption for credentials we hold on someone else's behalf.
 *
 * A merchant's WhatsApp access token can send messages and spend money as
 * them. Storing it in a plain column means a database dump, a backup on
 * someone's laptop, or one careless `SELECT *` in a log hands that over.
 *
 * Lives in shared because both the API (which writes tokens during onboarding)
 * and the worker (which reads them to send) need it, and a second copy of
 * crypto code is a second chance to get it subtly wrong.
 */

const ALGORITHM = "aes-256-gcm";

/**
 * Derived from CUSTVA_CREDENTIAL_KEY rather than used raw, so a short or
 * low-entropy value still produces a full-length key. scrypt is deliberate —
 * it makes a brute force against a leaked ciphertext expensive rather than
 * instant.
 */
let cachedKey: Buffer | null = null;
function credentialKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.CUSTVA_CREDENTIAL_KEY?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CUSTVA_CREDENTIAL_KEY is required in production. Merchant WhatsApp tokens are encrypted with it, and without it they cannot be stored or read."
      );
    }
    /* Development only, and fixed so a restart can still read what it wrote.
       Never reachable in production because of the throw above. */
    cachedKey = scryptSync("custva-dev-insecure-key", "custva-credential-salt", 32);
    return cachedKey;
  }
  cachedKey = scryptSync(secret, "custva-credential-salt", 32);
  return cachedKey;
}

/** `iv:tag:ciphertext`, all hex. */
export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, credentialKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

/**
 * Returns null rather than throwing on anything malformed or tampered with.
 * A rotated key makes every stored token undecryptable, and the right
 * behaviour then is "this merchant is not connected" — not an exception that
 * takes down every send in the queue.
 */
export function decryptCredential(stored: string | null): string | null {
  if (!stored) return null;
  const parts = stored.split(":");
  if (parts.length !== 3) return null;
  try {
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = createDecipheriv(ALGORITHM, credentialKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}

