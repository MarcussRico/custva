import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIES } from "../../../lib/session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: Request) {
  const token = cookies().get(SESSION_COOKIES.access)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const body = await request.json();

  const response = await fetch(`${API_BASE}/admin/merchants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const json = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: { message?: string; details?: Array<{ field: string; issue: string }> };
  };

  if (!response.ok) {
    return NextResponse.json(
      {
        success: false,
        message: json.error?.message ?? "Failed to onboard merchant.",
        details: json.error?.details ?? []
      },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true, data: json.data });
}
