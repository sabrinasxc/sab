import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { startGmailWatch } from "./client";

export async function renewExpiringGmailWatches() {
  const db = createSupabaseAdminClient();
  const threshold = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data: mailboxes, error } = await db.from("mailboxes").select("id,watch_expires_at").eq("provider", "GMAIL").or(`watch_expires_at.is.null,watch_expires_at.lte.${threshold}`);
  if (error) throw error;
  const results: Array<{ mailboxId: string; ok: boolean; error?: string }> = [];
  for (const mailbox of mailboxes ?? []) {
    try {
      const watch = await startGmailWatch(mailbox.id);
      await db.from("mailboxes").update({ watch_expires_at: new Date(Number(watch.expiration)).toISOString(), last_history_id: watch.historyId }).eq("id", mailbox.id);
      results.push({ mailboxId: mailbox.id, ok: true });
    } catch (error) {
      results.push({ mailboxId: mailbox.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
