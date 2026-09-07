import {
  PERSONAL_MASTER_INBOX,
  SEQUENCE_LABS_REQUIRED_FRAME,
  hasKnownPartnerTag,
  hasPodcastPitchExtraAsk,
} from "./personal-inbox-policy";
import type { RiskLevel } from "@/domain/agent";

export const PERSONAL_INBOX_HARD_POLICY = `Authoritative personal master-inbox policy:
- Scope: ${PERSONAL_MASTER_INBOX} only.
- All reply openings must use "Hi [firstname],". Never use Dear or Hello.
- Model-written replies are draft/review only. Do not auto-send them.
- The only email auto-send exception is the canonical Emma Provider's Edge podcast-pitch template after deterministic eligibility checks.
- Do not make calendar changes, financial commitments, legal commitments, refunds, payment changes, or security-sensitive actions.
- Unknown persona booking fallback: connection.healthboardadvisors.com/Call-Sabrina.
- Startup growth/funding booking link: pulsepointpath.com/Sabrina.
- Never invent booking links, pricing, offers, or business facts.`;

export const SEQUENCE_LABS_HARD_POLICY = `${PERSONAL_INBOX_HARD_POLICY}
Sequence Labs compliance is absolute:
- Mandatory exact frame: "${SEQUENCE_LABS_REQUIRED_FRAME}"
- Research/supply language only. Never provide dosing guidance, treatment protocols, therapeutic outcomes, patient administration language, or medical claims.
- Never discuss 503A/503B specifics beyond referring to site Research Guides.
- If the sender appears to be a consumer/patient rather than a licensed professional or researcher, do not provide product-specific pricing; redirect to sequencelabs.health for age gate and eligibility.`;

export function extractSenderFirstName(fromHeader: string) {
  const display = fromHeader.includes("<") ? fromHeader.slice(0, fromHeader.indexOf("<")) : "";
  const cleaned = display.replace(/["']/g, "").trim();
  if (!cleaned) return "there";
  const first = cleaned.split(/\s+/)[0]?.trim();
  return first || "there";
}

export type PodcastAutoSendEligibilityInput = {
  isPodcastCandidate: boolean;
  subject?: string | null;
  body?: string | null;
  crmMatches: Array<{ contact?: Record<string, any> }>;
  crmSearchFailures: number;
  crmLocationsSearched: number;
  triageConfidence: number;
  triageRisk: RiskLevel;
  globalAutoSendActive: boolean;
  businessAutoSendActive: boolean;
  mailboxAutoSendActive: boolean;
};

export function evaluateCanonicalPodcastAutoSend(input: PodcastAutoSendEligibilityInput) {
  const reasons: string[] = [];
  if (!input.isPodcastCandidate) reasons.push("not_podcast_candidate");
  if (hasPodcastPitchExtraAsk(input.subject, input.body)) reasons.push("additional_ask_requires_sabrina");
  if (input.crmLocationsSearched < 4) reasons.push("incomplete_four_location_crm_check");
  if (input.crmSearchFailures > 0) reasons.push("crm_lookup_failure");
  if (input.crmMatches.length > 0) reasons.push("existing_crm_relationship_requires_personal_review");
  if (input.crmMatches.some((match) => hasKnownPartnerTag(match.contact?.tags))) reasons.push("known_partner_requires_personal_reply");
  if (input.triageRisk !== "LOW") reasons.push("risk_above_low");
  if (input.triageConfidence < 0.95) reasons.push("classification_confidence_below_auto_send_threshold");
  if (!input.globalAutoSendActive) reasons.push("global_auto_send_disabled");
  if (!input.businessAutoSendActive) reasons.push("business_auto_send_disabled");
  if (!input.mailboxAutoSendActive) reasons.push("mailbox_auto_send_disabled");
  return { allowed: reasons.length === 0, reasons };
}
