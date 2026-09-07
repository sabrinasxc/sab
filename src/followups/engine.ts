import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/jobs/client";

export async function scheduleFollowup(input: { businessId: string; mailboxId: string; threadId: string; runAt: string; reason: string }) {
  const db = createSupabaseAdminClient();
  const idempotencyKey = `followup:${input.threadId}:${input.runAt}`;
  const { data, error } = await db.from("scheduled_actions").upsert({ business_id: input.businessId, mailbox_id: input.mailboxId, thread_id: input.threadId, action_type: "FOLLOWUP", payload: { reason: input.reason }, run_at: input.runAt, cancel_condition: "NEW_INBOUND_MESSAGE", status: "SCHEDULED", idempotency_key: idempotencyKey }, { onConflict: "idempotency_key" }).select("id").single();
  if (error || !data) throw error ?? new Error("FOLLOWUP_SCHEDULE_FAILED");
  await inngest.send({ name: "followup/scheduled", data: { scheduledActionId: data.id, runAt: input.runAt } });
  return data;
}

export async function runScheduledFollowup(scheduledActionId: string) {
  const db = createSupabaseAdminClient();
  const { data: action } = await db.from("scheduled_actions").select("*").eq("id", scheduledActionId).single();
  if (!action || action.status !== "SCHEDULED") return { status: "not_scheduled" };
  const { data: latestInbound } = await db.from("email_messages").select("created_at").eq("thread_id", action.thread_id).eq("direction", "INBOUND").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latestInbound && new Date(latestInbound.created_at).getTime() > new Date(action.created_at).getTime()) {
    await db.from("scheduled_actions").update({ status: "CANCELLED" }).eq("id", action.id);
    return { status: "cancelled_new_inbound" };
  }
  await db.from("scheduled_actions").update({ status: "READY_FOR_REVIEW" }).eq("id", action.id);
  return { status: "ready_for_review" };
}
