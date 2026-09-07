import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/jobs/client";
import { getGmailMessage, listGmailHistory } from "./client";
import { parseGmailMessage } from "./message";

export async function ingestGmailHistory(mailboxId: string, announcedHistoryId: string) {
  const db = createSupabaseAdminClient();
  const { data: mailbox, error } = await db.from("mailboxes").select("id, business_id, last_history_id").eq("id", mailboxId).single();
  if (error || !mailbox) throw new Error("MAILBOX_NOT_FOUND");
  const start = mailbox.last_history_id;
  if (!start) {
    await db.from("mailboxes").update({ last_history_id: announcedHistoryId }).eq("id", mailboxId);
    return { inserted: 0, initialized: true };
  }
  let pageToken: string | undefined;
  let latestHistoryId = announcedHistoryId;
  const messageIds = new Set<string>();
  do {
    const page = await listGmailHistory(mailboxId, start, pageToken);
    for (const history of page.history ?? []) for (const added of history.messagesAdded ?? []) messageIds.add(added.message.id);
    pageToken = page.nextPageToken;
    latestHistoryId = page.historyId ?? latestHistoryId;
  } while (pageToken);

  let inserted = 0;
  for (const messageId of messageIds) {
    const raw = await getGmailMessage(mailboxId, messageId);
    const parsed = parseGmailMessage(raw);
    const isInbound = parsed.labelIds.includes("INBOX");
    const { data: thread } = await db.from("email_threads").upsert({ business_id: mailbox.business_id, mailbox_id: mailboxId, provider_thread_id: parsed.providerThreadId, subject: parsed.subject, last_activity_at: parsed.internalDate }, { onConflict: "mailbox_id,provider_thread_id" }).select("id").single();
    if (!thread) continue;
    const { data: saved, error: insertError } = await db.from("email_messages").insert({ business_id: mailbox.business_id, mailbox_id: mailboxId, thread_id: thread.id, provider_message_id: parsed.providerMessageId, direction: isInbound ? "INBOUND" : "OUTBOUND", from_address: parsed.from, to_addresses: parsed.to, cc_addresses: parsed.cc, subject: parsed.subject, body_text: parsed.bodyText, body_html: parsed.bodyHtml, received_at: isInbound ? parsed.internalDate : null, sent_at: isInbound ? null : parsed.internalDate, raw_headers: { messageId: parsed.messageIdHeader, references: parsed.references } }).select("id").single();
    if (!insertError && saved) {
      inserted += 1;
      if (isInbound) await inngest.send({ name: "email/inbound.stored", data: { messageId: saved.id, businessId: mailbox.business_id, mailboxId, threadId: thread.id } });
    }
  }
  await db.from("mailboxes").update({ last_history_id: latestHistoryId }).eq("id", mailboxId);
  return { inserted, initialized: false };
}
