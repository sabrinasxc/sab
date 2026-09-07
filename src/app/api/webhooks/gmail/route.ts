import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/jobs/client";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (request.nextUrl.searchParams.get("token") !== env.GOOGLE_PUBSUB_VERIFICATION_TOKEN) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const envelope = await request.json() as { message?: { data?: string; messageId?: string } };
  if (!envelope.message?.data) return NextResponse.json({ ok: true });
  const event = JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")) as { emailAddress: string; historyId: string };
  const db = createSupabaseAdminClient();
  const { data: mailbox } = await db.from("mailboxes").select("id").ilike("email_address", event.emailAddress).eq("provider", "GMAIL").single();
  if (mailbox) await inngest.send({ name: "gmail/history.received", data: { mailboxId: mailbox.id, historyId: event.historyId, pubsubMessageId: envelope.message.messageId ?? null } });
  return NextResponse.json({ ok: true });
}
