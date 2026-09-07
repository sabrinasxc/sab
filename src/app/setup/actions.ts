"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/tenant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function bootstrapBusiness(formData: FormData) {
  const { user } = await requireUser();
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const businessName = String(formData.get("businessName") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!organizationName || !businessName || !slug) throw new Error("Organization, business, and slug are required");
  const db = createSupabaseAdminClient();
  const { data: existing } = await db.from("organization_users").select("organization_id").eq("user_id", user.id).limit(1).maybeSingle();
  let organizationId = existing?.organization_id;
  if (!organizationId) {
    const { data: org, error } = await db.from("organizations").insert({ name: organizationName }).select("id").single();
    if (error || !org) throw error ?? new Error("organization create failed");
    organizationId = org.id;
    await db.from("organization_users").insert({ organization_id: organizationId, user_id: user.id, role: "OWNER" });
  }
  const { data: business, error: businessError } = await db.from("businesses").insert({ organization_id: organizationId, name: businessName, slug, ai_active: false, auto_send_active: false, autonomy_level: 0 }).select("id").single();
  if (businessError || !business) throw businessError ?? new Error("business create failed");
  redirect(`/?business=${business.id}`);
}
