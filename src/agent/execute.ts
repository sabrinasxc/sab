import { authorizeExecution } from "@/domain/execution-guard";
import { getKillSwitches } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { createGhlTask } from "@/integrations/ghl/client";
import { sendDraftForAgentRun } from "./send";

export async function executeAgentRun(agentRunId: string, actor: { actorType: "AI" | "USER"; actorId: string | null; approvalSatisfied: boolean; autoActionAllowed?: boolean; autoEmailAllowed?: boolean }) {
  const db = createSupabaseAdminClient();
  const { data: run } = await db.from("agent_runs").select("*, businesses!inner(*), mailboxes!inner(*), email_threads!inner(*)").eq("id", agentRunId).single();
  if (!run?.decision) throw new Error("AGENT_DECISION_NOT_FOUND");
  const business = run.businesses as any;
  const mailbox = run.mailboxes as any;
  const switches = getKillSwitches();
  const results: Record<string, unknown> = {};

  if (run.draft) results.email = await sendDraftForAgentRun(agentRunId, { actorType: actor.actorType, actorId: actor.actorId, approvalSatisfied: actor.approvalSatisfied, autoEmailAllowed: actor.autoEmailAllowed });

  const proposed = Array.isArray(run.decision.proposedToolActions) ? run.decision.proposedToolActions : [];
  for (let index = 0; index < proposed.length; index += 1) {
    const action = proposed[index];
    if (action?.tool !== "ghl" || action?.operation !== "create_task") continue;
    const auditKey = `ghl-task:${agentRunId}:${index}`;
    const { data: already } = await db.from("audit_events").select("id").eq("business_id", run.business_id).eq("idempotency_key", auditKey).maybeSingle();
    const guard = authorizeExecution({ organizationId: business.organization_id, businessId: run.business_id, mailboxId: run.mailbox_id, action: "CREATE_GHL_TASK", risk: run.risk, confidence: Number(run.confidence ?? 0), autonomyLevel: business.autonomy_level, globalAiActive: switches.aiActive, globalAutoSendActive: switches.autoSendActive, businessAiActive: business.ai_active, businessAutoSendActive: business.auto_send_active, mailboxAiActive: mailbox.ai_active, mailboxAutoSendActive: mailbox.auto_send_active, actionAllowedByBusinessRule: actor.approvalSatisfied || Boolean(actor.autoActionAllowed), recipientAuthorized: true, duplicateDetected: Boolean(already), prohibitedCategory: run.risk === "CRITICAL" && !actor.approvalSatisfied, attachmentPermissionSatisfied: true, approvalSatisfied: actor.approvalSatisfied });
    if (!guard.allowed) {
      results[`tool_${index}`] = { skipped: true, reason: guard.reason };
      continue;
    }
    const { data: thread } = await db.from("email_threads").select("contact_id").eq("id", run.thread_id).single();
    const { data: contact } = thread?.contact_id ? await db.from("contacts").select("ghl_contact_id").eq("id", thread.contact_id).single() : { data: null } as any;
    if (!contact?.ghl_contact_id) {
      results[`tool_${index}`] = { skipped: true, reason: "GHL_CONTACT_NOT_MATCHED" };
      continue;
    }
    const args = action.arguments ?? {};
    const title = typeof args.title === "string" ? args.title : "Email follow-up";
    const dueDate = typeof args.dueDate === "string" ? args.dueDate : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const task = await createGhlTask(run.business_id, contact.ghl_contact_id, { title, body: typeof args.body === "string" ? args.body : undefined, dueDate, assignedTo: typeof args.assignedTo === "string" ? args.assignedTo : undefined });
    await writeAudit({ organizationId: business.organization_id, businessId: run.business_id, mailboxId: run.mailbox_id, agentRunId, eventType: "GHL_TASK_CREATED", actorType: actor.actorType, actorId: actor.actorId, idempotencyKey: auditKey, details: { task } });
    results[`tool_${index}`] = task;
  }
  await db.from("agent_runs").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", agentRunId);
  return results;
}
