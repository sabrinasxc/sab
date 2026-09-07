import { describe, expect, it } from "vitest";
import {
  PERSONAL_MASTER_INBOX,
  PRIORITY_LABELS,
  UTILITY_LABELS,
  canonicalEmmaPodcastPitch,
  deterministicPersonalInboxRule,
  validateSequenceLabsDraft,
  SEQUENCE_LABS_REQUIRED_FRAME,
} from "./personal-inbox-policy";

const base = { mailboxEmail: PERSONAL_MASTER_INBOX, from: "sender@example.com", subject: "", body: "" };

describe("deterministicPersonalInboxRule", () => {
  it("does not apply personal inbox rules to another mailbox", () => {
    expect(deterministicPersonalInboxRule({ ...base, mailboxEmail: "hello@pulsepointpath.com", subject: "Podcast guest pitch" })).toBeNull();
  });

  it("blocks do-not-contact before all other classifications", () => {
    const result = deterministicPersonalInboxRule({ ...base, from: "Robbie Horwitz <robbie@example.com>", subject: "Podcast guest pitch" });
    expect(result?.action).toBe("DO_NOT_CONTACT");
    expect(result?.labels).toContain(PRIORITY_LABELS.doNotContact);
  });

  it("keeps do-not-redraft senders out of drafting", () => {
    const result = deterministicPersonalInboxRule({ ...base, from: "Dr Tabatha Russell <tabatha@example.com>" });
    expect(result?.action).toBe("DO_NOT_REDRAFT");
  });

  it("treats native filter patterns seen in inbox as filter misses", () => {
    const result = deterministicPersonalInboxRule({ ...base, from: "updates@docsend.com" });
    expect(result?.action).toBe("FILTER_MISS_REVIEW");
    expect(result?.labels).toContain(PRIORITY_LABELS.filterMiss);
  });

  it("escalates Google Docs mentions rather than archiving silently", () => {
    const result = deterministicPersonalInboxRule({ ...base, from: "comments-noreply@docs.google.com", subject: "Sabrina was mentioned in a Google Docs file" });
    expect(result?.labels).toEqual([PRIORITY_LABELS.actionNeeded]);
    expect(result?.requiresHumanReview).toBe(true);
  });

  it("archives receipts deterministically", () => {
    const result = deterministicPersonalInboxRule({ ...base, from: "receipts@stripe.com", subject: "Your receipt" });
    expect(result?.action).toBe("ARCHIVE_RECEIPT");
    expect(result?.labels).toEqual([UTILITY_LABELS.receipts]);
  });

  it("marks podcast pitches as candidates but not as unconditional auto-send", () => {
    const result = deterministicPersonalInboxRule({ ...base, subject: "Podcast guest pitch for your show" });
    expect(result?.action).toBe("PODCAST_PITCH_CANDIDATE");
    expect(result?.reason).toContain("exception checks");
  });

  it("detects Sequence Labs context deterministically", () => {
    const result = deterministicPersonalInboxRule({ ...base, subject: "Wholesale peptide COA question" });
    expect(result?.action).toBe("SEQUENCE_LABS_CONTEXT");
    expect(result?.labels).toContain("Sequence-Labs");
  });
});

describe("Sequence Labs compliance", () => {
  it("requires the research-use frame", () => {
    expect(validateSequenceLabsDraft("We can provide a lot-specific COA.").valid).toBe(false);
  });

  it("rejects dosing or patient-administration language", () => {
    const result = validateSequenceLabsDraft(`${SEQUENCE_LABS_REQUIRED_FRAME}\nRecommended dosage is 1 mg.`);
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("clinical_or_dosing_language");
  });

  it("accepts compliant research-supply language", () => {
    const result = validateSequenceLabsDraft(`${SEQUENCE_LABS_REQUIRED_FRAME}\nWe can provide a lot-specific COA with HPLC and MS results.`);
    expect(result.valid).toBe(true);
  });
});

describe("canonical Emma template", () => {
  it("uses the required Hi opening and recording link", () => {
    const draft = canonicalEmmaPodcastPitch("Jane");
    expect(draft.startsWith("Hi Jane,")).toBe(true);
    expect(draft).toContain("https://pulsepointpath.com/providers-edge-recording");
    expect(draft.endsWith("Emma\nPodcast Manager")).toBe(true);
  });

  it("falls back to there when the first name is unavailable", () => {
    expect(canonicalEmmaPodcastPitch(" ").startsWith("Hi there,")).toBe(true);
  });
});
