/** Auth headers for admin BFF → API. Dev header only when not production. */
export function adminAuthHeaders(accessToken?: string): Record<string, string> {
  if (accessToken) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  const isProd = process.env.NODE_ENV === "production";
  const devMerchantId = process.env.CUSTVA_DEV_MERCHANT_ID;
  if (!isProd && devMerchantId) {
    return {
      "x-dev-merchant-id": devMerchantId,
      "x-dev-role": "platform_admin"
    };
  }

  return {};
}

export function requireOtpSecret(envName: string, devFallback: string): string {
  const value = process.env[envName]?.trim();
  if (value) return value;

  // next build sets NODE_ENV=production while collecting page data; secrets are
  // only required at runtime, not during CI/compile.
  const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isNextBuild) {
    throw new Error(`${envName} is required in production`);
  }
  return devFallback;
}
