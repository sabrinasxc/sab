export type OutreachStatus =
  | "READY_TO_SEND"
  | "SENT"
  | "FOLLOWUP_DUE"
  | "REPLIED"
  | "INTERESTED"
  | "BOOKED"
  | "NOT_INTERESTED"
  | "CLOSED";

export type FollowupDecisionInput = {
  status: OutreachStatus;
  followupCount: number;
  maxFollowups: number;
  lastSentAt: string | null;
  lastReplyAt: string | null;
  now?: Date;
  delayDays?: number;
};

export function shouldCancelOutreachFollowup(input: FollowupDecisionInput) {
  if (input.lastReplyAt) return { cancel: true, reason: "recipient_replied" };
  if (["REPLIED", "INTERESTED", "BOOKED", "NOT_INTERESTED", "CLOSED"].includes(input.status)) {
    return { cancel: true, reason: `terminal_status:${input.status}` };
  }
  if (input.followupCount >= input.maxFollowups) return { cancel: true, reason: "max_followups_reached" };
  return { cancel: false, reason: null };
}

export function nextOutreachFollowupAt(lastSentAt: string, delayDays = 4) {
  const date = new Date(lastSentAt);
  date.setUTCDate(date.getUTCDate() + delayDays);
  return date.toISOString();
}

export function isOutreachFollowupDue(input: FollowupDecisionInput) {
  const cancelled = shouldCancelOutreachFollowup(input);
  if (cancelled.cancel || !input.lastSentAt) return false;
  const now = input.now ?? new Date();
  return new Date(nextOutreachFollowupAt(input.lastSentAt, input.delayDays ?? 4)).getTime() <= now.getTime();
}

export function assertVaReviewMode(mode: "VA_REVIEW" | "AUTOPILOT") {
  if (mode !== "VA_REVIEW") throw new Error("OUTREACH_AUTOPILOT_NOT_AUTHORIZED");
}
