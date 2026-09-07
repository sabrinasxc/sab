import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function writeAudit(input: {
  organizationId: string;
  businessId: string;
  mailboxId?: string | null;
  agentRunId?: string | null;
  eventType: string;
  actorType: "AI" | "USER" | "SYSTEM" | "WEBHOOK";
  actorId?: string | null;
  details?: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("audit_events").insert({
    organization_id: input.organizationId,
    business_id: input.businessId,
    mailbox_id: input.mailboxId ?? null,
    agent_run_id: input.agentRunId ?? null,
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    details: input.details ?? {},
    idempotency_key: input.idempotencyKey ?? null,
  });
  if (error && error.code !== "23505") throw error;
}
