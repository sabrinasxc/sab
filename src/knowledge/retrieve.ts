import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function retrieveKnowledge(businessId: string, query: string, limit = 8) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("search_knowledge", { target_business_id: businessId, search_query: query.slice(0, 2000), result_limit: limit });
  if (error) return [];
  return data ?? [];
}
