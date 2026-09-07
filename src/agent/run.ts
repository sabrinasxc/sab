import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKillSwitches } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { hydrateGhlContact, extractEmailAddress } from "@/integrations/ghl/context";
import { retrieveKnowledge } from "@/knowledge/retrieve";
import { triageEmail, decideEmail, draftEmail } from "./openai";
import { evaluateBusinessRules } from "./business-rules";
import { maxRisk, promptInjectionSuspected, riskFloorForContent, isFinanciallyProhibited } from "./policy";
import { authorizeExecution } from "@/domain/execution-guard";
import { executeAgentRun } from "./execute";

export async function runEmailAgent(messageId: string) {
  const db = createSupabaseAdminClient();
  const { data: message } = await db.from("email_messages").select("*, email_threads!inner(*), mailboxes!inner(*), businesses!inner(*)").eq("id", messageId).single();
  if (!message || message.direction !== "INBOUND") return { status: "ignored" };
  if (message.processing_status === "COMPLETED" || message.processing_status === "PROCESSING") return { status: "duplicate" };
  const { data: claimed } = await db.from("email_messages").update({ processing_status: "PROCESSING" }).eq("id", messageId).eq("processing_status", "PENDING").select("id").maybeSingle();
  if (!claimed) return { status: "duplicate_claim" };

  const business = message.businesses as any;
  const mailbox = message.mailboxes as any;
  const thread = message.email_threads as any;
  const switches = getKillSwitches();
  const { data: org } = await db.from("businesses").select("organization_id,name").eq("id", message.business_id).single();
  if (!org) throw new Error("BUSINESS_NOT_FOUND");
  const { data: run, error: runError } = await db.from("agent_runs").insert({ business_id: message.business_id, mailbox_id: message.mailbox_id, thread_id: message.thread_id, message_id: messageId, status: "STARTED" }).select("id").single();
  if (runError || !run) {
    if ((runError as any)?.code === "23505") return { status: "duplicate_run" };
    throw runError ?? new Error("AGENT_RUN_CREATE_FAILED");
  }

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
    const knowledgeQuery = `${message.subject ?? ""} ${message.body_text ?? ""}`.slice(0, 2000);
    const knowledge = await retrieveKnowledge(message.business_id, knowledgeQuery);

    let triage = await triageEmail({ businessName: org.name, email: `${message.subject ?? ""}\n${message.body_text ?? ""}` });
    triage = { ...triage, risk: maxRisk(triage.risk, riskFloorForContent(`${message.subject ?? ""}\n${message.body_text ?? ""}`)), promptInjectionSuspected: triage.promptInjectionSuspected || promptInjectionSuspected(message.body_text ?? "") };
    const rules = await evaluateBusinessRules(message.business_id, { category: triage.category, subcategory: triage.subcategory, risk: triage.risk, senderEmail: extractEmailAddress(message.from_address), confidence: triage.confidence });
    let decision = await decideEmail({ businessName: org.name, thread: threadText, triage, crm: crm.contact?.crm_snapshot ?? crm.contact, rules, knowledge });
    decision = { ...decision, risk: maxRisk(decision.risk, triage.risk) };
    if (triage.promptInjectionSuspected || isFinanciallyProhibited(message.body_text ?? "")) decision = { ...decision, risk: "CRITICAL", requiresApproval: true, action: "ESCALATE" };
    const draft = decision.requiresResponse ? await draftEmail({ businessName: org.name, thread: threadText, triage, decision, crm: crm.contact?.crm_snapshot ?? crm.contact, knowledge }) : null;

    await db.from("agent_runs").update({ triage, decision, draft, confidence: decision.confidence, risk: decision.risk, model: process.env.OPENAI_MODEL, prompt_version: "v1", status: "DECIDED" }).eq("id", run.id);
    await db.from("email_threads").update({ risk: decision.risk, status: decision.action === "ESCALATE" ? "ESCALATED" : thread.status }).eq("id", message.thread_id);

    const toolActions = Array.isArray(decision.proposedToolActions) ? decision.proposedToolActions : [];
    if (!draft && toolActions.length === 0) {
      await db.from("agent_runs").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", run.id);
      await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
      return { status: "no_action", runId: run.id };
    }

    const autoRuleAllowsTools = rules.actions.includes("CREATE_TASK") || rules.actions.includes("UPDATE_CRM");
    const autoIntent = authorizeExecution({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, action: draft ? "SEND_EMAIL" : "CREATE_GHL_TASK", risk: decision.risk, confidence: draft ? Math.min(decision.confidence, draft.confidence) : decision.confidence, autonomyLevel: business.autonomy_level, globalAiActive: switches.aiActive, globalAutoSendActive: switches.autoSendActive, businessAiActive: business.ai_active, businessAutoSendActive: business.auto_send_active, mailboxAiActive: mailbox.ai_active, mailboxAutoSendActive: mailbox.auto_send_active, actionAllowedByBusinessRule: draft ? rules.explicitlyAllowsAutoReply : autoRuleAllowsTools, recipientAuthorized: true, duplicateDetected: false, prohibitedCategory: decision.risk === "CRITICAL" || isFinanciallyProhibited(message.body_text ?? ""), attachmentPermissionSatisfied: true, approvalSatisfied: false });

    if (autoIntent.allowed && !rules.requiresApproval && !decision.requiresApproval) {
      await executeAgentRun(run.id, { actorType: "AI", actorId: null, approvalSatisfied: false, autoActionAllowed: autoRuleAllowsTools });
      await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
      return { status: "auto_executed", runId: run.id };
    }

    const { data: approval } = await db.from("approvals").insert({ business_id: message.business_id, agent_run_id: run.id, status: "PENDING", risk: decision.risk, proposed_action: decision, proposed_draft: draft }).select("id").single();
    await db.from("agent_runs").update({ status: "AWAITING_APPROVAL" }).eq("id", run.id);
    await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
    await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "APPROVAL_CREATED", actorType: "AI", details: { approvalId: approval?.id, autoExecuteDeniedReason: autoIntent.allowed ? null : autoIntent.reason, ruleIds: rules.matchingRuleIds } });
    return { status: "approval_required", runId: run.id, approvalId: approval?.id };
  } catch (error) {
    await db.from("agent_runs").update({ status: "FAILED", error: { message: error instanceof Error ? error.message : String(error) }, completed_at: new Date().toISOString() }).eq("id", run.id);
    await db.from("email_messages").update({ processing_status: "FAILED" }).eq("id", messageId);
    throw error;
  }
}
