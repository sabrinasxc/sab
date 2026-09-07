import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/tenant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireUser();
  const { id } = await context.params;
  const { data: approval } = await supabase.from("approvals").select("id,agent_run_id").eq("id", id).single();
  if (!approval) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = createSupabaseAdminClient();
  await db.from("approvals").update({ status: "REJECTED", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", id);
  await db.from("agent_runs").update({ status: "REJECTED", completed_at: new Date().toISOString() }).eq("id", approval.agent_run_id);
  return NextResponse.json({ ok: true });
}
