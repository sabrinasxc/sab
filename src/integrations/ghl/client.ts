import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BASE = "https://services.leadconnectorhq.com";

async function refreshGhlToken(connectionId: string) {
  const db = createSupabaseAdminClient();
  const { data: connection } = await db.from("ghl_connections").select("*").eq("id", connectionId).single();
  if (!connection?.encrypted_refresh_token) throw new Error("GHL_REFRESH_TOKEN_MISSING");
  const env = getServerEnv();
  const response = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", Version: "v3" }, body: new URLSearchParams({ client_id: env.GHL_CLIENT_ID, client_secret: env.GHL_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: decryptSecret(connection.encrypted_refresh_token), user_type: "Location" }) });
  if (!response.ok) throw new Error(`GHL_REFRESH_FAILED:${response.status}`);
  const token = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  await db.from("ghl_connections").update({ encrypted_access_token: encryptSecret(token.access_token), encrypted_refresh_token: encryptSecret(token.refresh_token), token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", connectionId);
  return token.access_token;
}

async function getToken(businessId: string) {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("ghl_connections").select("*").eq("business_id", businessId).single();
  if (!data?.encrypted_access_token) throw new Error("GHL_NOT_CONNECTED");
  const accessToken = !data.token_expires_at || new Date(data.token_expires_at).getTime() < Date.now() + 60_000 ? await refreshGhlToken(data.id) : decryptSecret(data.encrypted_access_token);
  return { accessToken, locationId: data.location_id };
}

async function ghlFetch<T>(businessId: string, path: string, init?: RequestInit): Promise<T> {
  const { accessToken } = await getToken(businessId);
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { Accept: "application/json", Version: "v3", authorization: `Bearer ${accessToken}`, ...init?.headers } });
  if (!response.ok) throw new Error(`GHL_API_ERROR:${response.status}:${await response.text()}`);
  return response.json() as Promise<T>;
}

export async function lookupGhlContactByEmail(businessId: string, email: string) {
  const { locationId } = await getToken(businessId);
  const params = new URLSearchParams({ locationId, email, limit: "20" });
  return ghlFetch<{ contacts: Array<Record<string, any>>; nextCursor?: string }>(businessId, `/contacts/lookup?${params}`);
}

export async function createGhlTask(businessId: string, contactId: string, body: { title: string; body?: string; dueDate?: string; assignedTo?: string }) {
  return ghlFetch<Record<string, any>>(businessId, `/contacts/${encodeURIComponent(contactId)}/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
