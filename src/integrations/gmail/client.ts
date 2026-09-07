import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function refreshGmailAccessToken(connectionId: string) {
  const db = createSupabaseAdminClient();
  const { data: connection, error } = await db.from("oauth_connections").select("*").eq("id", connectionId).single();
  if (error || !connection?.encrypted_refresh_token) throw new Error("GMAIL_REFRESH_TOKEN_MISSING");
  const env = getServerEnv();
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: decryptSecret(connection.encrypted_refresh_token),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`GMAIL_TOKEN_REFRESH_FAILED:${response.status}`);
  const token = await response.json() as { access_token: string; expires_in: number };
  await db.from("oauth_connections").update({ encrypted_access_token: encryptSecret(token.access_token), token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", connectionId);
  return token.access_token;
}

export async function getGmailAccessToken(mailboxId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("oauth_connections").select("id, encrypted_access_token, token_expires_at").eq("mailbox_id", mailboxId).eq("provider", "GOOGLE").single();
  if (error || !data?.encrypted_access_token) throw new Error("GMAIL_CONNECTION_NOT_FOUND");
  if (!data.token_expires_at || new Date(data.token_expires_at).getTime() < Date.now() + 60_000) return refreshGmailAccessToken(data.id);
  return decryptSecret(data.encrypted_access_token);
}

async function gmailFetch<T>(mailboxId: string, path: string, init?: RequestInit): Promise<T> {
  let accessToken = await getGmailAccessToken(mailboxId);
  let response = await fetch(`${GMAIL}${path}`, { ...init, headers: { ...init?.headers, authorization: `Bearer ${accessToken}` } });
  if (response.status === 401) {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("oauth_connections").select("id").eq("mailbox_id", mailboxId).eq("provider", "GOOGLE").single();
    if (!data) throw new Error("GMAIL_CONNECTION_NOT_FOUND");
    accessToken = await refreshGmailAccessToken(data.id);
    response = await fetch(`${GMAIL}${path}`, { ...init, headers: { ...init?.headers, authorization: `Bearer ${accessToken}` } });
  }
  if (!response.ok) throw new Error(`GMAIL_API_ERROR:${response.status}:${await response.text()}`);
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export function getGmailProfile(mailboxId: string) {
  return gmailFetch<{ emailAddress: string; historyId: string }>(mailboxId, "/profile");
}

export function listGmailHistory(mailboxId: string, startHistoryId: string, pageToken?: string) {
  const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
  if (pageToken) params.set("pageToken", pageToken);
  return gmailFetch<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string; threadId: string } }> }>; nextPageToken?: string; historyId?: string }>(mailboxId, `/history?${params}`);
}

export function getGmailMessage(mailboxId: string, messageId: string) {
  return gmailFetch<any>(mailboxId, `/messages/${encodeURIComponent(messageId)}?format=full`);
}

export function startGmailWatch(mailboxId: string) {
  const env = getServerEnv();
  return gmailFetch<{ historyId: string; expiration: string }>(mailboxId, "/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topicName: env.GOOGLE_PUBSUB_TOPIC, labelIds: ["INBOX"] }) });
}

export function sendGmailRaw(mailboxId: string, raw: string, threadId?: string) {
  return gmailFetch<{ id: string; threadId: string }>(mailboxId, "/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
}
