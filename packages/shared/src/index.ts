export type UserRole = "merchant_admin" | "merchant_staff" | "platform_admin";

export type ApiErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "PROVIDER_ERROR";

export interface ApiMeta {
  requestId?: string;
  page?: number;
  limit?: number;
  total?: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Array<Record<string, unknown>>;
  };
  meta?: ApiMeta;
}

export interface CustomerDto {
  id: string;
  merchantId: string;
  name: string;
  mobile: string;
  location?: string;
  totalSpend: number;
  totalVisits: number;
  lastVisit?: string;
  createdAt: string;
  updatedAt: string;
}

/** BullMQ custom job IDs cannot contain `:`. */
export function lifecycleBullJobId(scheduleId: string): string {
  return `lifecycle-${scheduleId}`;
}

export function campaignBatchBullJobId(campaignId: string, batchIndex: number): string {
  return `campaign-${campaignId}-batch-${batchIndex}`;
}

export const BRAND_TOKENS = {
  fontFamily: "Poppins",
  colors: {
    darkBlue: "#0B1F3A",
    yellow: "#FFD400",
    white: "#FFFFFF",
    black: "#000000"
  }
} as const;
export * from "./segmentation.js";
export * from "./attribution.js";
export * from "./meta-templates.js";
export * from "./holdout.js";
