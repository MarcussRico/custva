import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { sendError } from "../lib/api-response.js";

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    return sendError(req, res, "VALIDATION_ERROR", "Input validation failed", 422, [
      ...error.issues.map((issue) => ({
        field: issue.path.join("."),
        issue: issue.message
      }))
    ]);
  }

  console.error(error);
  return sendError(req, res, "INTERNAL_ERROR", "Unexpected server error", 500);
}
