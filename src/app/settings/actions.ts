"use server";
import { revalidatePath } from "next/cache";
import { requireBusinessAccess } from "@/lib/auth/tenant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function checked(form: FormData, key: string) { return form.get(key) === "on"; }

export async function updateBusinessControls(form: FormData) {
  const businessId = String(form.get("businessId") ?? "");
  await requireBusinessAccess(businessId);
  const autonomyLevel = Math.max(0, Math.min(3, Number(form.get("autonomyLevel") ?? 0)));
  const db = createSupabaseAdminClient();
  await db.from("businesses").update({ ai_active: checked(form, "aiActive"), auto_send_active: checked(form, "autoSendActive"), autonomy_level: autonomyLevel }).eq("id", businessId);
  revalidatePath("/"); revalidatePath("/settings");
}

export async function updateMailboxControls(form: FormData) {
  const businessId = String(form.get("businessId") ?? "");
  const mailboxId = String(form.get("mailboxId") ?? "");
  await requireBusinessAccess(businessId);
  const db = createSupabaseAdminClient();
  await db.from("mailboxes").update({ ai_active: checked(form, "aiActive"), auto_send_active: checked(form, "autoSendActive") }).eq("id", mailboxId).eq("business_id", businessId);
  revalidatePath("/"); revalidatePath("/settings");
}

export async function createRule(form: FormData) {
  const businessId = String(form.get("businessId") ?? "");
  await requireBusinessAccess(businessId);
  const category = String(form.get("category") ?? "").trim();
  const risk = String(form.get("risk") ?? "").trim();
  const action = String(form.get("action") ?? "").trim();
  const name = String(form.get("name") ?? `${category || risk} ${action}`).trim();
  if (!action) throw new Error("Rule action is required");
  const conditions: Record<string, unknown> = {};
  if (category) conditions.category = category;
  if (risk) conditions.risk = risk;
  const db = createSupabaseAdminClient();
  await db.from("business_rules").insert({ business_id: businessId, name, priority: 100, enabled: true, conditions, actions: [action] });
  revalidatePath("/settings");
}

export async function addKnowledge(form: FormData) {
  const businessId = String(form.get("businessId") ?? "");
  await requireBusinessAccess(businessId);
  const title = String(form.get("title") ?? "").trim();
  const content = String(form.get("content") ?? "").trim();
  if (!title || !content) throw new Error("Knowledge title and content are required");
  const db = createSupabaseAdminClient();
  const { data: doc, error } = await db.from("knowledge_documents").insert({ business_id: businessId, source_type: "MANUAL", source_id: crypto.randomUUID(), title }).select("id").single();
  if (error || !doc) throw error ?? new Error("knowledge document create failed");
  const chunks = content.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean).reduce<string[]>((acc, paragraph) => {
    if (paragraph.length <= 1800) acc.push(paragraph); else for (let i = 0; i < paragraph.length; i += 1800) acc.push(paragraph.slice(i, i + 1800));
    return acc;
  }, []);
  await db.from("knowledge_chunks").insert(chunks.map((chunk, index) => ({ business_id: businessId, document_id: doc.id, chunk_index: index, content: chunk })));
  revalidatePath("/settings");
}
