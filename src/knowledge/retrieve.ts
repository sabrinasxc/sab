import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function retrieveKnowledge(businessId: string, query: string, limit = 8) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("search_knowledge", { target_business_id: businessId, search_query: query.slice(0, 2000), result_limit: limit });
  if (error) return [];
  return data ?? [];
}

export async function retrieveOrganizationKnowledge(organizationId: string, query: string, options?: { perBusinessLimit?: number; totalLimit?: number }) {
  const db = createSupabaseAdminClient();
  const perBusinessLimit = options?.perBusinessLimit ?? 3;
  const totalLimit = options?.totalLimit ?? 12;
  const { data: businesses, error } = await db.from("businesses").select("id,name,slug").eq("organization_id", organizationId);
  if (error || !businesses?.length) return [];

  const settled = await Promise.allSettled(
    businesses.map(async (business) => {
      const results = await retrieveKnowledge(business.id, query, perBusinessLimit);
      return results.map((result: any) => ({ ...result, sourceBusinessId: business.id, sourceBusinessName: business.name, sourceBusinessSlug: business.slug }));
    }),
  );

  return settled
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((a: any, b: any) => Number(b.rank ?? b.score ?? 0) - Number(a.rank ?? a.score ?? 0))
    .slice(0, totalLimit);
}
