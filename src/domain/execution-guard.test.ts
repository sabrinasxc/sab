import { describe, expect, it } from "vitest";
import { authorizeExecution, type ExecutionIntent } from "./execution-guard";

const baseIntent: ExecutionIntent = {
  organizationId: "org-a",
  businessId: "business-a",
  mailboxId: "mailbox-a",
  action: "SEND_EMAIL",
  risk: "LOW",
  confidence: 0.98,
  autonomyLevel: 2,
  globalAiActive: true,
  globalAutoSendActive: true,
  businessAiActive: true,
  businessAutoSendActive: true,
  mailboxAiActive: true,
  mailboxAutoSendActive: true,
  actionAllowedByBusinessRule: true,
  recipientAuthorized: true,
  duplicateDetected: false,
  prohibitedCategory: false,
  attachmentPermissionSatisfied: true,
  approvalSatisfied: false,
};

describe("authorizeExecution", () => {
  it("allows explicitly authorized low-risk guarded-autopilot sends", () => {
    expect(authorizeExecution(baseIntent)).toEqual({
      allowed: true,
      reason: "AUTHORIZED",
    });
  });

  it("blocks critical-risk auto-send", () => {
    const result = authorizeExecution({ ...baseIntent, risk: "CRITICAL" });
    expect(result.allowed).toBe(false);
  });

  it("blocks duplicate sends", () => {
    const result = authorizeExecution({ ...baseIntent, duplicateDetected: true });
    expect(result).toEqual({ allowed: false, reason: "DUPLICATE_ACTION" });
  });

  it("blocks sends when any auto-send kill switch is off", () => {
    const result = authorizeExecution({ ...baseIntent, mailboxAutoSendActive: false });
    expect(result).toEqual({ allowed: false, reason: "MAILBOX_AUTO_SEND_DISABLED" });
  });

  it("blocks low-risk auto-send below the initial confidence threshold", () => {
    const result = authorizeExecution({ ...baseIntent, confidence: 0.94 });
    expect(result).toEqual({ allowed: false, reason: "LOW_RISK_CONFIDENCE_TOO_LOW" });
  });

  it("requires approval for high-risk actions", () => {
    const result = authorizeExecution({ ...baseIntent, risk: "HIGH" });
    expect(result).toEqual({ allowed: false, reason: "HIGH_RISK_REQUIRES_APPROVAL" });
  });
});
