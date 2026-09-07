import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKillSwitches } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { hydrateGhlContact, extractEmailAddress, lookupOrganizationGhlContacts } from "@/integrations/ghl/context";
import { retrieveKnowledge, retrieveOrganizationKnowledge } from "@/knowledge/retrieve";
import { applyGmailThreadLabelsByName } from "@/integrations/gmail/client";
import { triageEmail, decideEmail, draftEmail } from "./openai";
import { evaluateBusinessRules } from "./business-rules";
import { maxRisk, promptInjectionSuspected, riskFloorForContent, isFinanciallyProhibited } from "./policy";
import { authorizeExecution } from "@/domain/execution-guard";
import { executeAgentRun } from "./execute";
import {
  PERSONAL_MASTER_INBOX,
  PRIORITY_LABELS,
  canonicalEmmaPodcastPitch,
  deterministicPersonalInboxRule,
  validateSequenceLabsDraft,
} from "./personal-inbox-policy";
import {
  PERSONAL_INBOX_HARD_POLICY,
  SEQUENCE_LABS_HARD_POLICY,
  evaluateCanonicalPodcastAutoSend,
  extractSenderFirstName,
} from "./personal-inbox-autonomy";

const EARLY_ARCHIVE_ACTIONS = new Set(["ARCHIVE_RECEIPT", "ARCHIVE_NOTIFICATION", "ARCHIVE_JUNK"]);
const EARLY_REVIEW_ACTIONS = new Set(["FILTER_MISS_REVIEW", "ACTION_NEEDED_NOTIFICATION"]);

async function completeRun(db: any, runId: string, messageId: string, runStatus = "COMPLETED") {
  const completedAt = new Date().toISOString();
  await db.from("agent_runs").update({ status: runStatus, completed_at: completedAt }).eq("id", runId);
  await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: completedAt }).eq("id", messageId);
}

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
      await completeRun(db, run.id, messageId, "DISABLED");
      return { status: "ai_disabled" };
    }

    const { data: threadMessages } = await db.from("email_messages").select("direction,from_address,to_addresses,subject,body_text,created_at").eq("thread_id", message.thread_id).order("created_at", { ascending: true }).limit(50);
    const threadText = (threadMessages ?? []).map((m: any) => `[${m.direction}] ${m.from_address}\n${m.body_text ?? ""}`).join("\n\n");
    const isPersonalMailbox = String(mailbox.email_address ?? "").toLowerCase() === PERSONAL_MASTER_INBOX;
    const personalRule = isPersonalMailbox ? deterministicPersonalInboxRule({ mailboxEmail: mailbox.email_address, from: message.from_address, subject: message.subject, body: message.body_text }) : null;

    if (personalRule) {
      await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "DETERMINISTIC_PERSONAL_RULE_MATCHED", actorType: "SYSTEM", details: personalRule });
    }

    if (personalRule?.action === "DO_NOT_CONTACT") {
      await applyGmailThreadLabelsByName(message.mailbox_id, thread.provider_thread_id, personalRule.labels);
      await db.from("email_threads").update({ status: "RESOLVED" }).eq("id", message.thread_id);
      await completeRun(db, run.id, messageId);
      return { status: "do_not_contact", runId: run.id };
    }

    if (personalRule?.action === "DO_NOT_REDRAFT") {
      await completeRun(db, run.id, messageId);
      return { status: "do_not_redraft", runId: run.id };
    }

    if (personalRule && EARLY_REVIEW_ACTIONS.has(personalRule.action)) {
      await applyGmailThreadLabelsByName(message.mailbox_id, thread.provider_thread_id, personalRule.labels);
      await db.from("email_threads").update({ status: "WAITING_ON_TEAM" }).eq("id", message.thread_id);
      await completeRun(db, run.id, messageId);
      return { status: "deterministic_review", rule: personalRule.action, runId: run.id };
    }

    if (personalRule && EARLY_ARCHIVE_ACTIONS.has(personalRule.action)) {
      await applyGmailThreadLabelsByName(message.mailbox_id, thread.provider_thread_id, personalRule.labels, { archive: true });
      await db.from("email_threads").update({ status: "RESOLVED" }).eq("id", message.thread_id);
      await completeRun(db, run.id, messageId);
      return { status: "deterministic_archived", rule: personalRule.action, runId: run.id };
    }

    let crmContext: unknown = null;
    let organizationCrm = { matches: [] as Array<{ contact?: Record<string, any> }>, failures: [] as Array<unknown>, searchedBusinessIds: [] as string[] };

    if (isPersonalMailbox) {
      organizationCrm = await lookupOrganizationGhlContacts(org.organization_id, message.from_address);
      crmContext = organizationCrm;
    } else {
      const crm = await hydrateGhlContact(message.business_id, message.from_address);
      crmContext = crm.contact?.crm_snapshot ?? crm.contact;
      if (crm.contact?.id) await db.from("email_threads").update({ contact_id: crm.contact.id }).eq("id", message.thread_id);
    }

    const knowledgeQuery = `${message.subject ?? ""} ${message.body_text ?? ""}`.slice(0, 2000);
    const knowledge = isPersonalMailbox
      ? await retrieveOrganizationKnowledge(org.organization_id, knowledgeQuery)
      : await retrieveKnowledge(message.business_id, knowledgeQuery);

    const hardPolicy = personalRule?.action === "SEQUENCE_LABS_CONTEXT"
      ? SEQUENCE_LABS_HARD_POLICY
      : isPersonalMailbox
        ? PERSONAL_INBOX_HARD_POLICY
        : undefined;

    let triage = await triageEmail({ businessName: org.name, email: `${message.subject ?? ""}\n${message.body_text ?? ""}`, hardPolicy });
    triage = {
      ...triage,
      risk: maxRisk(triage.risk, riskFloorForContent(`${message.subject ?? ""}\n${message.body_text ?? ""}`)),
      promptInjectionSuspected: triage.promptInjectionSuspected || promptInjectionSuspected(message.body_text ?? ""),
    };

    if (personalRule?.action === "PODCAST_PITCH_CANDIDATE") {
      const eligibility = evaluateCanonicalPodcastAutoSend({
        isPodcastCandidate: true,
        subject: message.subject,
        body: message.body_text,
        crmMatches: organizationCrm.matches,
        crmSearchFailures: organizationCrm.failures.length,
        crmLocationsSearched: organizationCrm.searchedBusinessIds.length,
        triageConfidence: triage.confidence,
        triageRisk: triage.risk,
        globalAutoSendActive: switches.autoSendActive,
        businessAutoSendActive: Boolean(business.auto_send_active),
        mailboxAutoSendActive: Boolean(mailbox.auto_send_active),
      });

      const firstName = extractSenderFirstName(message.from_address);
      const canonicalDraft = {
        subject: `RE: ${message.subject ?? ""}`,
        bodyText: canonicalEmmaPodcastPitch(firstName),
        bodyHtml: null,
        confidence: 1,
        citations: ["§5 canonical Emma podcast-pitch template"],
      };
      const canonicalDecision = {
        action: "RESPOND",
        confidence: triage.confidence,
        risk: triage.risk,
        reasoningSummary: "Deterministic §5 canonical Emma podcast-pitch path.",
        requiresResponse: true,
        requiresApproval: !eligibility.allowed,
        proposedToolActions: [],
      };

      await db.from("agent_runs").update({ triage, decision: canonicalDecision, draft: canonicalDraft, confidence: Math.min(triage.confidence, 1), risk: triage.risk, model: process.env.OPENAI_MODEL, prompt_version: "personal-v1-canonical", status: eligibility.allowed ? "DECIDED" : "AWAITING_APPROVAL" }).eq("id", run.id);
      await applyGmailThreadLabelsByName(message.mailbox_id, thread.provider_thread_id, ["Podcast-Pitch", eligibility.allowed ? PRIORITY_LABELS.pendingResponse : PRIORITY_LABELS.forReview]);

      if (eligibility.allowed) {
        await executeAgentRun(run.id, { actorType: "AI", actorId: null, approvalSatisfied: false, autoEmailAllowed: true });
        await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
        await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "CANONICAL_PODCAST_AUTO_SENT", actorType: "AI", details: { eligibility } });
        return { status: "canonical_podcast_auto_sent", runId: run.id };
      }

      const { data: approval } = await db.from("approvals").insert({ business_id: message.business_id, agent_run_id: run.id, status: "PENDING", risk: triage.risk, proposed_action: canonicalDecision, proposed_draft: canonicalDraft }).select("id").single();
      await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
      await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "APPROVAL_CREATED", actorType: "AI", details: { approvalId: approval?.id, canonicalPodcastEligibilityDeniedReasons: eligibility.reasons } });
      return { status: "canonical_podcast_review", runId: run.id, approvalId: approval?.id, reasons: eligibility.reasons };
    }

    const rules = await evaluateBusinessRules(message.business_id, { category: triage.category, subcategory: triage.subcategory, risk: triage.risk, senderEmail: extractEmailAddress(message.from_address), confidence: triage.confidence });
    let decision = await decideEmail({ businessName: org.name, thread: threadText, triage, crm: crmContext, rules, knowledge, hardPolicy });
    decision = { ...decision, risk: maxRisk(decision.risk, triage.risk) };

    if (triage.promptInjectionSuspected || isFinanciallyProhibited(message.body_text ?? "")) {
      decision = { ...decision, risk: "CRITICAL", requiresApproval: true, action: "ESCALATE" };
    }

    if (isPersonalMailbox) {
      decision = { ...decision, requiresApproval: true };
    }

    let draft = decision.requiresResponse ? await draftEmail({ businessName: org.name, thread: threadText, triage, decision, crm: crmContext, knowledge, hardPolicy }) : null;

    if (personalRule?.action === "SEQUENCE_LABS_CONTEXT" && draft) {
      const compliance = validateSequenceLabsDraft(draft.bodyText);
      if (!compliance.valid) {
        await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "SEQUENCE_LABS_DRAFT_BLOCKED", actorType: "SYSTEM", details: compliance });
        decision = { ...decision, action: "ESCALATE", risk: "CRITICAL", requiresApproval: true, requiresResponse: false, reasoningSummary: `${decision.reasoningSummary} Draft blocked by deterministic Sequence Labs compliance validator.` };
        draft = null;
        await applyGmailThreadLabelsByName(message.mailbox_id, thread.provider_thread_id, ["Sequence-Labs", PRIORITY_LABELS.actionNeeded]);
      } else {
        await applyGmailThreadLabelsByName(message.mailbox_id, thread.provider_thread_id, ["Sequence-Labs", PRIORITY_LABELS.forReview]);
      }
    } else if (isPersonalMailbox && draft) {
      await applyGmailThreadLabelsByName(message.mailbox_id, thread.provider_thread_id, [PRIORITY_LABELS.forReview]);
    }

    await db.from("agent_runs").update({ triage, decision, draft, confidence: decision.confidence, risk: decision.risk, model: process.env.OPENAI_MODEL, prompt_version: isPersonalMailbox ? "personal-v1" : "v1", status: "DECIDED" }).eq("id", run.id);
    await db.from("email_threads").update({ risk: decision.risk, status: decision.action === "ESCALATE" ? "ESCALATED" : thread.status }).eq("id", message.thread_id);

    const toolActions = Array.isArray(decision.proposedToolActions) ? decision.proposedToolActions : [];
    if (!draft && toolActions.length === 0 && decision.action !== "ESCALATE") {
      await completeRun(db, run.id, messageId);
      return { status: "no_action", runId: run.id };
    }

    const autoRuleAllowsTools = !isPersonalMailbox && (rules.actions.includes("CREATE_TASK") || rules.actions.includes("UPDATE_CRM"));
    const autoEmailAllowed = !isPersonalMailbox && rules.explicitlyAllowsAutoReply;
    const autoIntent = authorizeExecution({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, action: draft ? "SEND_EMAIL" : "CREATE_GHL_TASK", risk: decision.risk, confidence: draft ? Math.min(decision.confidence, draft.confidence) : decision.confidence, autonomyLevel: business.autonomy_level, globalAiActive: switches.aiActive, globalAutoSendActive: switches.autoSendActive, businessAiActive: business.ai_active, businessAutoSendActive: business.auto_send_active, mailboxAiActive: mailbox.ai_active, mailboxAutoSendActive: mailbox.auto_send_active, actionAllowedByBusinessRule: draft ? autoEmailAllowed : autoRuleAllowsTools, recipientAuthorized: true, duplicateDetected: false, prohibitedCategory: decision.risk === "CRITICAL" || isFinanciallyProhibited(message.body_text ?? ""), attachmentPermissionSatisfied: true, approvalSatisfied: false });

    if (autoIntent.allowed && !rules.requiresApproval && !decision.requiresApproval) {
      await executeAgentRun(run.id, { actorType: "AI", actorId: null, approvalSatisfied: false, autoActionAllowed: autoRuleAllowsTools, autoEmailAllowed });
      await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
      return { status: "auto_executed", runId: run.id };
    }

    const { data: approval } = await db.from("approvals").insert({ business_id: message.business_id, agent_run_id: run.id, status: "PENDING", risk: decision.risk, proposed_action: decision, proposed_draft: draft }).select("id").single();
    await db.from("agent_runs").update({ status: "AWAITING_APPROVAL" }).eq("id", run.id);
    await db.from("email_messages").update({ processing_status: "COMPLETED", processed_at: new Date().toISOString() }).eq("id", messageId);
    await writeAudit({ organizationId: org.organization_id, businessId: message.business_id, mailboxId: message.mailbox_id, agentRunId: run.id, eventType: "APPROVAL_CREATED", actorType: "AI", details: { approvalId: approval?.id, autoExecuteDeniedReason: autoIntent.allowed ? null : autoIntent.reason, ruleIds: rules.matchingRuleIds, personalMailboxDraftOnly: isPersonalMailbox } });
    return { status: "approval_required", runId: run.id, approvalId: approval?.id };
  } catch (error) {
    await db.from("agent_runs").update({ status: "FAILED", error: { message: error instanceof Error ? error.message : String(error) }, completed_at: new Date().toISOString() }).eq("id", run.id);
    await db.from("email_messages").update({ processing_status: "FAILED" }).eq("id", messageId);
    throw error;
  }
}
