import { describe, expect, it } from "vitest";
import { assertVaReviewMode, isOutreachFollowupDue, nextOutreachFollowupAt, shouldCancelOutreachFollowup } from "./policy";

describe("speaker outreach policy", () => {
  it("schedules the next follow-up four days later", () => {
    expect(nextOutreachFollowupAt("2026-09-01T12:00:00.000Z")).toBe("2026-09-05T12:00:00.000Z");
  });

  it("cancels immediately after a reply", () => {
    expect(shouldCancelOutreachFollowup({ status: "SENT", followupCount: 0, maxFollowups: 2, lastSentAt: "2026-09-01T12:00:00.000Z", lastReplyAt: "2026-09-02T12:00:00.000Z" })).toEqual({ cancel: true, reason: "recipient_replied" });
  });

  it("stops after the maximum follow-ups", () => {
    expect(shouldCancelOutreachFollowup({ status: "SENT", followupCount: 2, maxFollowups: 2, lastSentAt: "2026-09-05T12:00:00.000Z", lastReplyAt: null }).cancel).toBe(true);
  });

  it("marks a follow-up due after the delay", () => {
    expect(isOutreachFollowupDue({ status: "SENT", followupCount: 0, maxFollowups: 2, lastSentAt: "2026-09-01T12:00:00.000Z", lastReplyAt: null, now: new Date("2026-09-06T12:00:00.000Z") })).toBe(true);
  });

  it("does not allow autopilot in the initial outreach mode", () => {
    expect(() => assertVaReviewMode("AUTOPILOT")).toThrow("OUTREACH_AUTOPILOT_NOT_AUTHORIZED");
  });
});
