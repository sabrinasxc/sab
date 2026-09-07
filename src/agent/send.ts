import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKillSwitches } from "@/lib/env";
import { authorizeExecution } from "@/domain/execution-guard";
import { sendThreadReply } from "@/integrations/gmail/send";
import { writeAudit } from "@/lib/audit";
import { extractEmailAddress } from "@/integrations/ghl/context";

export async function sendDraftForAgentRun(agentRunId: string, actor: { actorType: "AI" | "USER"; actorId: string | null; approvalSatisfied: boolean }) {
  const db = createSupabaseAdminClient();
  const { data: run } = await db.from("agent_runs").select("*, businesses!inner(*), mailboxes!inner(*), email_threads!inner(*)").eq("id", agentRunId).single();
  if (!run?.draft || !run?.decision) throw new Error("DRAFT_NOT_FOUND");
  const business = run.businesses as any;
  const mailbox = run.mailboxes as any;
  const thread = run.email_threads as any;
  const { data: original } = await db.from("email_messages").select("*").eq("id", run.message_id).single();
  if (!original) throw new Error("ORIGINAL_MESSAGE_NOT_FOUND");
  const { data: alreadySent } = await db.from("audit_events").select("id").eq("agent_run_id", agentRunId).eq("event_type", "EMAIL_SENT").maybeSingle();
  const switches = getKillSwitches();
  const guard = authorizeExecution({ organizationId: business.organization_id, businessId: run.business_id, mailboxId: run.mailbox_id, action: "SEND_EMAIL", risk: run.risk, confidence: Number(run.confidence ?? 0), autonomyLevel: business.autonomy_level, globalAiActive: switches.aiActive, globalAutoSendActive: actor.approvalSatisfied ? true : switches.autoSendActive, businessAiActive: business.ai_active, businessAutoSendActive: actor.approvalSatisfied ? true : business.auto_send_active, mailboxAiActive: mailbox.ai_active, mailboxAutoSendActive: actor.approvalSatisfied ? true : mailbox.auto_send_active, actionAllowedByBusinessRule: actor.approvalSatisfied, recipientAuthorized: true, duplicateDetected: Boolean(alreadySent), prohibitedCategory: run.risk === "CRITICAL" && !actor.approvalSatisfied, attachmentPermissionSatisfied: true, approvalSatisfied: actor.approvalSatisfied });
  if (!guard.allowed) throw new Error(`EXECUTION_GUARD_DENIED:${guard.reason}`);
  const headers = original.raw_headers ?? {};
  const subject = String(run.draft.subject ?? original.subject ?? "Re:");
  const send = await sendThreadReply({ mailboxId: run.mailbox_id, threadId: thread.provider_thread_id, to: extractEmailAddress(original.from_address), subject, bodyText: String(run.draft.bodyText), inReplyTo: headers.messageId ?? null, references: [headers.references, headers.messageId].filter(Boolean).join(" ") || null });
  await db.from("email_messages").insert({ business_id: run.business_id, mailbox_id: run.mailbox_id, thread_id: run.thread_id, provider_message_id: send.id, direction: "OUTBOUND", from_address: mailbox.email_address, to_addresses: [extractEmailAddress(original.from_address)], cc_addresses: [], subject, body_text: String(run.draft.bodyText), body_html: run.draft.bodyHtml ?? null, sent_at: new Date().toISOString(), raw_headers: {} });
  await db.from("agent_runs").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", agentRunId);
  await writeAudit({ organizationId: business.organization_id, businessId: run.business_id, mailboxId: run.mailbox_id, agentRunId, eventType: "EMAIL_SENT", actorType: actor.actorType, actorId: actor.actorId, idempotencyKey: `send:${agentRunId}`, details: { providerMessageId: send.id, providerThreadId: send.threadId } });
  return send;
}
