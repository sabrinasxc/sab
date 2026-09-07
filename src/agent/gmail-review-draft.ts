import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteGmailDraft } from "@/integrations/gmail/client";
import { createThreadReplyDraft, updateThreadReplyDraft } from "@/integrations/gmail/send";
import { extractEmailAddress } from "@/integrations/ghl/context";

async function getApprovalDraftContext(approvalId: string) {
  const db = createSupabaseAdminClient();
  const { data: approval, error } = await db
    .from("approvals")
    .select("id,agent_run_id,proposed_draft,provider_draft_id,agent_runs!inner(mailbox_id,thread_id,message_id,email_threads!inner(provider_thread_id),email_messages!inner(from_address,subject,raw_headers))")
    .eq("id", approvalId)
    .single();
  if (error || !approval) throw error ?? new Error("APPROVAL_NOT_FOUND");
  const run = approval.agent_runs as any;
  const original = run.email_messages as any;
  const thread = run.email_threads as any;
  const draft = approval.proposed_draft as any;
  if (!draft?.bodyText) throw new Error("APPROVAL_DRAFT_MISSING");
  return { db, approval, run, original, thread, draft };
}

export async function createApprovalGmailDraft(approvalId: string) {
  const { db, approval, run, original, thread, draft } = await getApprovalDraftContext(approvalId);
  if (approval.provider_draft_id) return { id: approval.provider_draft_id, existing: true };
  const headers = original.raw_headers ?? {};
  const created = await createThreadReplyDraft({
    mailboxId: run.mailbox_id,
    threadId: thread.provider_thread_id,
    to: extractEmailAddress(original.from_address),
    subject: String(draft.subject ?? original.subject ?? "Re:"),
    bodyText: String(draft.bodyText),
    inReplyTo: headers.messageId ?? null,
    references: [headers.references, headers.messageId].filter(Boolean).join(" ") || null,
  });
  await db.from("approvals").update({ provider_draft_id: created.id, provider_draft_message_id: created.message?.id ?? null }).eq("id", approvalId);
  return { ...created, existing: false };
}

export async function updateApprovalGmailDraft(approvalId: string) {
  const { db, approval, run, original, thread, draft } = await getApprovalDraftContext(approvalId);
  if (!approval.provider_draft_id) return createApprovalGmailDraft(approvalId);
  const headers = original.raw_headers ?? {};
  const updated = await updateThreadReplyDraft({
    mailboxId: run.mailbox_id,
    draftId: approval.provider_draft_id,
    threadId: thread.provider_thread_id,
    to: extractEmailAddress(original.from_address),
    subject: String(draft.subject ?? original.subject ?? "Re:"),
    bodyText: String(draft.bodyText),
    inReplyTo: headers.messageId ?? null,
    references: [headers.references, headers.messageId].filter(Boolean).join(" ") || null,
  });
  await db.from("approvals").update({ provider_draft_message_id: updated.message?.id ?? null }).eq("id", approvalId);
  return updated;
}

export async function removeApprovalGmailDraft(approvalId: string) {
  const db = createSupabaseAdminClient();
  const { data: approval } = await db.from("approvals").select("provider_draft_id,agent_runs!inner(mailbox_id)").eq("id", approvalId).single();
  if (!approval?.provider_draft_id) return { removed: false };
  const run = approval.agent_runs as any;
  try {
    await deleteGmailDraft(run.mailbox_id, approval.provider_draft_id);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("GMAIL_API_ERROR:404")) throw error;
  }
  await db.from("approvals").update({ provider_draft_id: null, provider_draft_message_id: null }).eq("id", approvalId);
  return { removed: true };
}
