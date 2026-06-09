import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";
const DEV_MERCHANT_ID =
  process.env.CUSTVA_DEV_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000010";

async function merchantProxy(path: string, init: RequestInit = {}) {
  const token = cookies().get("custva_merchant_access_token")?.value;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : { "x-dev-merchant-id": DEV_MERCHANT_ID }),
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
    error?: { message?: string };
  };

  if (!response.ok) {
    return NextResponse.json(
      { success: false, message: json.error?.message ?? "Request failed." },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true, data: json.data });
}

export async function PUT(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  return merchantProxy(`/templates/${context.params.id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  return merchantProxy(`/templates/${context.params.id}`, { method: "DELETE" });
}
