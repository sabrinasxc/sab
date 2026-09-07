import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lookupGhlContactByEmail } from "./client";

export function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export async function hydrateGhlContact(businessId: string, fromAddress: string) {
  const email = extractEmailAddress(fromAddress);
  try {
    const result = await lookupGhlContactByEmail(businessId, email);
    const contact = result.contacts?.[0];
    if (!contact?.id) return { email, contact: null };
    const db = createSupabaseAdminClient();
    const { data } = await db.from("contacts").upsert({ business_id: businessId, ghl_contact_id: contact.id, email: contact.email ?? email, first_name: contact.firstName ?? null, last_name: contact.lastName ?? null, crm_snapshot: contact, last_synced_at: new Date().toISOString() }, { onConflict: "business_id,ghl_contact_id" }).select("*").single();
    return { email, contact: data ?? contact };
  } catch (error) {
    if (error instanceof Error && error.message === "GHL_NOT_CONNECTED") return { email, contact: null };
    throw error;
  }
}

export type OrganizationGhlMatch = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  contact: Record<string, any>;
};

export async function lookupOrganizationGhlContacts(organizationId: string, fromAddress: string) {
  const email = extractEmailAddress(fromAddress);
  const db = createSupabaseAdminClient();
  const { data: businesses, error } = await db
    .from("businesses")
    .select("id,name,slug,ghl_connections(id)")
    .eq("organization_id", organizationId);

  if (error) throw error;

  const connected = (businesses ?? []).filter((business: any) => Array.isArray(business.ghl_connections) && business.ghl_connections.length > 0);
  const settled = await Promise.allSettled(
    connected.map(async (business: any): Promise<OrganizationGhlMatch[]> => {
      const result = await lookupGhlContactByEmail(business.id, email);
      return (result.contacts ?? []).map((contact) => ({
        businessId: business.id,
        businessName: business.name,
        businessSlug: business.slug,
        contact,
      }));
    }),
  );

  const matches = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failures = settled.flatMap((result, index) => result.status === "rejected" ? [{ businessId: connected[index].id, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }] : []);

  return { email, matches, failures, searchedBusinessIds: connected.map((business: any) => business.id) };
}
