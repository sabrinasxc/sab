import { describe, expect, it } from "vitest";
import { evaluateCanonicalPodcastAutoSend, extractSenderFirstName } from "./personal-inbox-autonomy";

const eligibleBase = {
  isPodcastCandidate: true,
  subject: "Podcast guest pitch",
  body: "I'd like to pitch my client as a guest.",
  crmMatches: [],
  crmSearchFailures: 0,
  crmLocationsSearched: 4,
  triageConfidence: 0.99,
  triageRisk: "LOW" as const,
  globalAutoSendActive: true,
  businessAutoSendActive: true,
  mailboxAutoSendActive: true,
};

describe("canonical podcast auto-send eligibility", () => {
  it("allows only a fully cleared low-risk podcast pitch", () => {
    expect(evaluateCanonicalPodcastAutoSend(eligibleBase)).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks sponsorship or partnership asks", () => {
    const result = evaluateCanonicalPodcastAutoSend({ ...eligibleBase, body: "Podcast guest pitch plus a sponsorship partnership." });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("additional_ask_requires_sabrina");
  });

  it("blocks when fewer than four GHL locations were checked", () => {
    const result = evaluateCanonicalPodcastAutoSend({ ...eligibleBase, crmLocationsSearched: 3 });
    expect(result.reasons).toContain("incomplete_four_location_crm_check");
  });

  it("blocks an existing CRM relationship", () => {
    const result = evaluateCanonicalPodcastAutoSend({ ...eligibleBase, crmMatches: [{ contact: { id: "1", tags: [] } }] });
    expect(result.reasons).toContain("existing_crm_relationship_requires_personal_review");
  });

  it("blocks any risk above LOW", () => {
    const result = evaluateCanonicalPodcastAutoSend({ ...eligibleBase, triageRisk: "MEDIUM" });
    expect(result.reasons).toContain("risk_above_low");
  });

  it("blocks when a kill switch is off", () => {
    const result = evaluateCanonicalPodcastAutoSend({ ...eligibleBase, mailboxAutoSendActive: false });
    expect(result.reasons).toContain("mailbox_auto_send_disabled");
  });
});

describe("sender name extraction", () => {
  it("uses the display-name first token", () => {
    expect(extractSenderFirstName('"Jane Doe" <jane@example.com>')).toBe("Jane");
  });

  it("falls back to there for email-only From headers", () => {
    expect(extractSenderFirstName("jane@example.com")).toBe("there");
  });
});
