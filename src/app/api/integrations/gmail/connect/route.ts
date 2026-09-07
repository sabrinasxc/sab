import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/auth/tenant";
import { getServerEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  await requireBusinessAccess(businessId);
  const env = getServerEnv();
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.compose",
    ].join(" "),
    state,
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("gmail_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 });
  response.cookies.set("gmail_oauth_business", businessId, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 });
  return response;
}
