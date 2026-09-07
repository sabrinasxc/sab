import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/tenant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateApprovalGmailDraft } from "@/agent/gmail-review-draft";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireUser();
  const { id } = await context.params;
  const { data: approval } = await supabase.from("approvals").select("id,agent_run_id,proposed_draft,status").eq("id", id).single();
  if (!approval) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (approval.status !== "PENDING" && approval.status !== "EDITED") return NextResponse.json({ error: "approval is not editable" }, { status: 409 });
  const form = await request.formData();
  const bodyText = String(form.get("bodyText") ?? "").trim();
  if (!bodyText) return NextResponse.json({ error: "bodyText required" }, { status: 400 });
  const draft = { ...((approval.proposed_draft as any) ?? {}), bodyText };
  const db = createSupabaseAdminClient();
  await db.from("approvals").update({ status: "EDITED", proposed_draft: draft, reviewed_by: user.id }).eq("id", id);
  await db.from("agent_runs").update({ draft }).eq("id", approval.agent_run_id);
  await updateApprovalGmailDraft(id);
  return NextResponse.redirect(new URL("/", request.url), 303);
}
