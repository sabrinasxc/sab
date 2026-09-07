import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/auth/tenant";
import { encryptSecret } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const businessId = request.cookies.get("ghl_oauth_business")?.value;
  const expected = request.cookies.get("ghl_oauth_state")?.value;
  if (!code || !businessId || (expected && state !== expected)) return NextResponse.json({ error: "invalid oauth callback" }, { status: 400 });
  await requireBusinessAccess(businessId);
  const env = getServerEnv();
  const response = await fetch("https://services.leadconnectorhq.com/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", Version: "v3" }, body: new URLSearchParams({ client_id: env.GHL_CLIENT_ID, client_secret: env.GHL_CLIENT_SECRET, grant_type: "authorization_code", code, user_type: "Location", redirect_uri: env.GHL_REDIRECT_URI }) });
  if (!response.ok) return NextResponse.json({ error: "GHL token exchange failed" }, { status: 502 });
  const token = await response.json() as { access_token: string; refresh_token: string; expires_in: number; locationId?: string };
  const locationId = token.locationId ?? request.nextUrl.searchParams.get("locationId");
  if (!locationId) return NextResponse.json({ error: "GHL locationId missing from authorization response" }, { status: 422 });
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ghl_connections").upsert({ business_id: businessId, location_id: locationId, encrypted_access_token: encryptSecret(token.access_token), encrypted_refresh_token: encryptSecret(token.refresh_token), token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "business_id" });
  if (error) return NextResponse.json({ error: "GHL connection save failed" }, { status: 500 });
  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/?connected=ghl`);
}
