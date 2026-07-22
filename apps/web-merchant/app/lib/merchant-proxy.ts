import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { merchantAuthHeaders } from "./auth-headers";
import { SESSION_COOKIES } from "./session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function merchantProxy(path: string, init: RequestInit = {}) {
  const token = cookies().get(SESSION_COOKIES.access)?.value;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...merchantAuthHeaders(token),
    ...(init.headers as Record<string, string>)
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  const json = (await response.json()) as {
    success: boolean;
    data?: unknown;
    meta?: unknown;
    error?: { message?: string; details?: Array<{ field: string; issue: string }> };
  };

  if (!response.ok) {
    return NextResponse.json(
      {
        success: false,
        message: json.error?.message ?? "Request failed.",
        details: json.error?.details ?? []
      },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true, data: json.data, meta: json.meta });
}
