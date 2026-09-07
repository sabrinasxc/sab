import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createGmailDraft, sendGmailRaw, updateGmailDraft } from "./client";

export function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function headerSafe(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function buildThreadReplyRaw(input: { mailboxId: string; to: string; subject: string; bodyText: string; inReplyTo?: string | null; references?: string | null }) {
  const db = createSupabaseAdminClient();
  const { data: mailbox } = await db.from("mailboxes").select("email_address,business_id").eq("id", input.mailboxId).single();
  if (!mailbox) throw new Error("MAILBOX_NOT_FOUND");
  const headers = [
    `From: ${headerSafe(mailbox.email_address)}`,
    `To: ${headerSafe(input.to)}`,
    `Subject: ${headerSafe(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${headerSafe(input.inReplyTo)}`);
  if (input.references) headers.push(`References: ${headerSafe(input.references)}`);
  return encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${input.bodyText}`);
}

export async function sendThreadReply(input: { mailboxId: string; threadId: string; to: string; subject: string; bodyText: string; inReplyTo?: string | null; references?: string | null }) {
  const raw = await buildThreadReplyRaw(input);
  return sendGmailRaw(input.mailboxId, raw, input.threadId);
}

export async function createThreadReplyDraft(input: { mailboxId: string; threadId: string; to: string; subject: string; bodyText: string; inReplyTo?: string | null; references?: string | null }) {
  const raw = await buildThreadReplyRaw(input);
  return createGmailDraft(input.mailboxId, raw, input.threadId);
}

export async function updateThreadReplyDraft(input: { mailboxId: string; draftId: string; threadId: string; to: string; subject: string; bodyText: string; inReplyTo?: string | null; references?: string | null }) {
  const raw = await buildThreadReplyRaw(input);
  return updateGmailDraft(input.mailboxId, input.draftId, raw, input.threadId);
}
