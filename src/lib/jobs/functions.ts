import { inngest } from "./client";
import { ingestGmailHistory } from "@/integrations/gmail/ingest";
import { runEmailAgent } from "@/agent/run";

export const ingestGmailHistoryJob = inngest.createFunction({ id: "ingest-gmail-history", retries: 5 }, { event: "gmail/history.received" }, async ({ event, step }) => {
  return step.run("ingest-history", () => ingestGmailHistory(event.data.mailboxId, event.data.historyId));
});

export const processIncomingEmailJob = inngest.createFunction({ id: "process-incoming-email", retries: 3 }, { event: "email/inbound.stored" }, async ({ event, step }) => {
  return step.run("run-agent", () => runEmailAgent(event.data.messageId));
});

export const functions = [ingestGmailHistoryJob, processIncomingEmailJob];
