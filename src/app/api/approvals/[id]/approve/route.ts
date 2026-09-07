import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/tenant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendDraftForAgentRun } from "@/agent/send";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireUser();
  const { id } = await context.params;
  const { data: approval } = await supabase.from("approvals").select("id,agent_run_id,status").eq("id", id).single();
  if (!approval) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (approval.status !== "PENDING" && approval.status !== "EDITED") return NextResponse.json({ error: "approval is not pending" }, { status: 409 });
  const db = createSupabaseAdminClient();
  const { data: claimed } = await db.from("approvals").update({ status: "APPROVED", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", id).in("status", ["PENDING", "EDITED"]).select("id").single();
  if (!claimed) return NextResponse.json({ error: "approval already handled" }, { status: 409 });
  try {
    const result = await sendDraftForAgentRun(approval.agent_run_id, { actorType: "USER", actorId: user.id, approvalSatisfied: true });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await db.from("approvals").update({ status: "PENDING", reviewed_by: null, reviewed_at: null }).eq("id", id);
    throw error;
  }
}
