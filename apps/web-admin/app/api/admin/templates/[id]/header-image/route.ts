import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIES } from "../../../../../lib/session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

/**
 * Raw image bytes, so this cannot go through `adminProxy` — that helper sets
 * Content-Type: application/json and reads the body as JSON, which would
 * corrupt a JPEG on the way through.
 */
export async function POST(request: Request, context: { params: { id: string } }) {
  const token = cookies().get(SESSION_COOKIES.access)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const body = await request.arrayBuffer();

  const response = await fetch(
    `${API_BASE}/admin/templates/${context.params.id}/header-image`,
    {
      method: "POST",
      headers: { "Content-Type": contentType, Authorization: `Bearer ${token}` },
      body,
      cache: "no-store"
    }
  );

  const json = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: { message?: string; details?: unknown[] };
  };

  if (!response.ok) {
    return NextResponse.json(
      { success: false, message: json.error?.message ?? "Upload failed.", details: json.error?.details ?? [] },
      { status: response.status }
    );
  }
  return NextResponse.json({ success: true, data: json.data });
}
