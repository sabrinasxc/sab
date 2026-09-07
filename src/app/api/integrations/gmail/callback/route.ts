import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { requireBusinessAccess } from "@/lib/auth/tenant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { startGmailWatch } from "@/integrations/gmail/client";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("gmail_oauth_state")?.value;
  const businessId = request.cookies.get("gmail_oauth_business")?.value;
  if (!code || !state || state !== expected || !businessId) return NextResponse.json({ error: "invalid oauth state" }, { status: 400 });
  await requireBusinessAccess(businessId);
  const env = getServerEnv();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }) });
  if (!tokenResponse.ok) return NextResponse.json({ error: "google token exchange failed" }, { status: 502 });
  const token = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!profileResponse.ok) return NextResponse.json({ error: "gmail profile failed" }, { status: 502 });
  const profile = await profileResponse.json() as { emailAddress: string; historyId: string };
  const db = createSupabaseAdminClient();
  const { data: mailbox, error } = await db.from("mailboxes").upsert({ business_id: businessId, provider: "GMAIL", email_address: profile.emailAddress, provider_account_id: profile.emailAddress, last_history_id: profile.historyId }, { onConflict: "business_id,email_address" }).select("id").single();
  if (error || !mailbox) return NextResponse.json({ error: "mailbox save failed" }, { status: 500 });
  await db.from("oauth_connections").upsert({ business_id: businessId, mailbox_id: mailbox.id, provider: "GOOGLE", encrypted_access_token: encryptSecret(token.access_token), encrypted_refresh_token: token.refresh_token ? encryptSecret(token.refresh_token) : null, token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), scopes: ["openid", "email", "gmail.modify"], updated_at: new Date().toISOString() }, { onConflict: "mailbox_id,provider" });
  const watch = await startGmailWatch(mailbox.id);
  await db.from("mailboxes").update({ watch_expires_at: new Date(Number(watch.expiration)).toISOString(), last_history_id: watch.historyId }).eq("id", mailbox.id);
  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/?connected=gmail`);
}
