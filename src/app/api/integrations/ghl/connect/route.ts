import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/auth/tenant";
import { getServerEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  await requireBusinessAccess(businessId);
  const env = getServerEnv();
  if (!env.GHL_INSTALL_URL) return NextResponse.json({ error: "GHL_INSTALL_URL not configured" }, { status: 503 });
  const state = randomBytes(24).toString("base64url");
  const install = new URL(env.GHL_INSTALL_URL);
  install.searchParams.set("state", state);
  const response = NextResponse.redirect(install);
  response.cookies.set("ghl_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 });
  response.cookies.set("ghl_oauth_business", businessId, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 });
  return response;
}
