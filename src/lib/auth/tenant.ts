import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("UNAUTHENTICATED");
  return { supabase, user };
}

export async function requireBusinessAccess(businessId: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, organization_id, name, ai_active, auto_send_active, autonomy_level")
    .eq("id", businessId)
    .single();
  if (error || !data) throw new Error("FORBIDDEN");
  return { supabase, user, business: data };
}
