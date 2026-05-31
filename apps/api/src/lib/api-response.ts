import type { ApiError, ApiErrorCode } from "@custva/shared";
import type { Request, Response } from "express";

export function sendSuccess<T>(
  req: Request,
  res: Response,
  data: T,
  statusCode = 200
) {
  const requestId = String(res.locals.requestId ?? "n/a");
  return res.status(statusCode).json({
    success: true,
    data,
    meta: { requestId }
  });
}

export function sendError(
  req: Request,
  res: Response,
  code: ApiErrorCode,
  message: string,
  statusCode = 400,
  details?: Array<Record<string, unknown>>
) {
  const requestId = String(res.locals.requestId ?? "n/a");
  const payload: ApiError = {
    success: false,
    error: { code, message, details },
    meta: { requestId }
  };

  return res.status(statusCode).json(payload);
}
