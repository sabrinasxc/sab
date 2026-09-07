import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKillSwitches } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { hydrateGhlContact, extractEmailAddress } from "@/integrations/ghl/context";
import { triageEmail, decideEmail, draftEmail } from "./openai";
import { evaluateBusinessRules } from "./business-rules";
import { maxRisk, promptInjectionSuspected, riskFloorForContent, isFinanciallyProhibited } from "./policy";
import { authorizeExecution } from "@/domain/execution-guard";
import { sendDraftForAgentRun } from "./send";

export async function runEmailAgent(messageId: string) {
  const db = createSupabaseAdminClient();
  const { data: message } = await db.from("email_messages").select("*, email_threads!inner(*), mailboxes!inner(*), businesses!inner(*)").eq("id", messageId).single();
  if (!message || message.direction !== "INBOUND") return { status: "ignored" };
  if (message.processing_status === "COMPLETED" || message.processing_status === "PROCESSING") return { status: "duplicate" };
  await db.from("email_messages").update({ processing_status: "PROCESSING" }).eq("id", messageId).eq("processing_status", "PENDING");

  const business = message.businesses as any;
  const mailbox = message.mailboxes as any;
  const thread = message.email_threads as any;
  const switches = getKillSwitches();
  const { data: existingRun } = await db.from("agent_runs").select("id").eq("message_id", messageId).maybeSingle();
  if (existingRun) return { status: "duplicate_run" };
  const { data: run, error: runError } = await db.from("agent_runs").insert({ business_id: message.business_id, mailbox_id: message.mailbox_id, thread_id: message.thread_id, message_id: messageId, status: "STARTED" }).select("id").single();
  if (runError || !run) throw runError ?? new Error("AGENT_RUN_CREATE_FAILED");

  const { data: org } = await db.from("businesses").select("organization_id,name").eq("id", message.business_id).single();
  if (!org) throw new Error("BUSINESS_NOT_FOUND");
  try {
    await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "AGENT_RUN_STARTED", actorType: "AI", details: { messageId } });
    if (!switches.aiActive || !business.ai_active || !mailbox.ai_active) {
      await db.from("agent_runs").update({ status: "DISABLED", completed_at: new Date().toISOString() }).eq("id", run.id);
      await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
      return { status: "ai_disabled" };
    }

    const { data: threadMessages } = await db.from("email_messages").select("direction,from_address,to_addresses,subject,body_text,created_at").eq("thread_id", message.thread_id).order("created_at", { ascending: true }).limit(50);
    const threadText = (threadMessages ?? []).map((m: any) => `[${m.direction}] ${m.from_address}\n${m.body_text ?? ""}`).join("\n\n");
    const crm = await hydrateGhlContact(message.business_id, message.from_address);
    if (crm.contact?.id) await db.from("email_threads").update({ contact_id: crm.contact.id }).eq("id", message.thread_id);

    let triage = await triageEmail({ businessName: org.name, email: `${message.subject ?? ""}\n${message.body_text ?? ""}` });
    const deterministicRisk = riskFloorForContent(`${message.subject ?? ""}\n${message.body_text ?? ""}`);
    triage = { ...triage, risk: maxRisk(triage.risk, deterministicRisk), promptInjectionSuspected: triage.promptInjectionSuspected || promptInjectionSuspected(message.body_text ?? "") };
    const rules = await evaluateBusinessRules(message.business_id, { category: triage.category, subcategory: triage.subcategory, risk: triage.risk, senderEmail: extractEmailAddress(message.from_address), confidence: triage.confidence });
    let decision = await decideEmail({ businessName: org.name, thread: threadText, triage, crm: crm.contact?.crm_snapshot ?? crm.contact, rules });
    decision = { ...decision, risk: maxRisk(decision.risk, triage.risk) };
    if (triage.promptInjectionSuspected || isFinanciallyProhibited(message.body_text ?? "")) decision = { ...decision, risk: "CRITICAL", requiresApproval: true, action: "ESCALATE" };
    const draft = decision.requiresResponse ? await draftEmail({ businessName: org.name, thread: threadText, triage, decision, crm: crm.contact?.crm_snapshot ?? crm.contact }) : null;

    await db.from("agent_runs").update({ triage, decision, draft, confidence: decision.confidence, risk: decision.risk, model: process.env.OPENAI_MODEL, prompt_version: "v1", status: "DECIDED" }).eq("id", run.id);
    await db.from("email_threads").update({ risk: decision.risk, status: decision.action === "ESCALATE" ? "ESCALATED" : thread.status }).eq("id", message.thread_id);

    if (!draft) {
      await db.from("agent_runs").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", run.id);
      await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
      return { status: "no_response", runId: run.id };
    }

    const autoIntent = authorizeExecution({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, action: "SEND_EMAIL", risk: decision.risk, confidence: Math.min(decision.confidence, draft.confidence), autonomyLevel: business.autonomy_level, globalAiActive: switches.aiActive, globalAutoSendActive: switches.autoSendActive, businessAiActive: business.ai_active, businessAutoSendActive: business.auto_send_active, mailboxAiActive: mailbox.ai_active, mailboxAutoSendActive: mailbox.auto_send_active, actionAllowedByBusinessRule: rules.explicitlyAllowsAutoReply, recipientAuthorized: true, duplicateDetected: false, prohibitedCategory: decision.risk === "CRITICAL" || isFinanciallyProhibited(message.body_text ?? ""), attachmentPermissionSatisfied: true, approvalSatisfied: false });
    if (autoIntent.allowed && !rules.requiresApproval && !decision.requiresApproval) {
      await sendDraftForAgentRun(run.id, { actorType: "AI", actorId: null, approvalSatisfied: false });
      return { status: "auto_sent", runId: run.id };
    }

    const { data: approval } = await db.from("approvals").insert({ business_id: message.business_id, agent_run_id: run.id, status: "PENDING", risk: decision.risk, proposed_action: decision, proposed_draft: draft }).select("id").single();
    await db.from("agent_runs").update({ status: "AWAITING_APPROVAL" }).eq("id", run.id);
    await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
    await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "APPROVAL_CREATED", actorType: "AI", details: { approvalId: approval?.id, autoSendDeniedReason: autoIntent.allowed ? null : autoIntent.reason, ruleIds: rules.matchingRuleIds } });
    return { status: "approval_required", runId: run.id, approvalId: approval?.id };
  } catch (error) {
    await db.from("agent_runs").update({ status: "FAILED", error: { message: error instanceof Error ? error.message : String(error) }, completed_at: new Date().toISOString() }).eq("id", run.id);
    await db.from("email_messages").update({ processing_status: "FAILED" }).eq("id", messageId);
    throw error;
  }
}
