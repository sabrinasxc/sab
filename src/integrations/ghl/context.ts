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
