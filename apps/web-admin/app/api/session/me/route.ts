import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIES } from "../../../lib/session";

export async function GET() {
  const access = cookies().get(SESSION_COOKIES.access)?.value;
  const refresh = cookies().get(SESSION_COOKIES.refresh)?.value;

  if (!access && !refresh) {
    return NextResponse.json(
      { success: false, authenticated: false },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  if (!access) {
    return NextResponse.json(
      { success: false, authenticated: false, needsRefresh: true },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  return NextResponse.json(
    { success: true, authenticated: true },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
