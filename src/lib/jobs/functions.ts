import { inngest } from "./client";
import { ingestGmailHistory } from "@/integrations/gmail/ingest";
import { runEmailAgent } from "@/agent/run";
import { runScheduledFollowup } from "@/followups/engine";

export const ingestGmailHistoryJob = inngest.createFunction({ id: "ingest-gmail-history", retries: 5 }, { event: "gmail/history.received" }, async ({ event, step }) => step.run("ingest-history", () => ingestGmailHistory(event.data.mailboxId, event.data.historyId)));
export const processIncomingEmailJob = inngest.createFunction({ id: "process-incoming-email", retries: 3 }, { event: "email/inbound.stored" }, async ({ event, step }) => step.run("run-agent", () => runEmailAgent(event.data.messageId)));
export const followupJob = inngest.createFunction({ id: "scheduled-followup", retries: 3 }, { event: "followup/scheduled" }, async ({ event, step }) => { await step.sleepUntil("wait-until-run", event.data.runAt); return step.run("recheck-followup", () => runScheduledFollowup(event.data.scheduledActionId)); });
export const functions = [ingestGmailHistoryJob, processIncomingEmailJob, followupJob];
