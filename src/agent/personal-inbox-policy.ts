export const PERSONAL_MASTER_INBOX = "sabrina@sabrinarunbeck.com";

export const PRIORITY_LABELS = {
  actionNeeded: "~ ACTION NEEDED",
  forReview: "~ FOR REVIEW",
  pendingResponse: "~ PENDING RESPONSE",
  followup4d: "~ FOLLOWUP-4D",
  doNotContact: "~ DO NOT CONTACT",
  ambiguous: "~ FOR REVIEW/Ambiguous",
  filterMiss: "~ FOR REVIEW/Filter-Miss",
  blueprintPending: "~ FOR REVIEW/Blueprint-Pending",
  thinEnrichment: "~ FOR REVIEW/Thin-Enrichment",
  partnerSizeCheck: "~ FOR REVIEW/Partner-Size-Check",
} as const;

export const BUSINESS_LABELS = [
  "PPP-Client", "PPP-Prospect", "PPP-Partner",
  "HBA-Proximity-Fellow", "HBA-Catalyst-Fellow", "HBA-Core-Fellow", "HBA-Circle-Fellow", "HBA-Board-Member",
  "HBA-Pathfinder", "HBA-Leadership-Maximizer", "HBA-Capital-Engine", "HBA-Execution-Risk-Filter", "HBA-Audience-Engine", "HBA-Scriptura-Marketplace",
  "HBA-Founder", "HBA-Investor", "HBA-VC-PE-FO", "HBA-Health-System", "HBA-Medical-School", "HBA-Association", "HBA-Partner",
  "Visibility-Engine", "Podcast-Engine", "Amplify-Engine", "Gold-Tier", "Audience-Engine", "Publication-Engine", "Connection-Engine", "Podcast-Pitch", "Provider's-Edge",
  "HealthTech360", "90-Day-Front-Door", "Scriptura-Prospect", "Scriptura-Demo", "Scriptura-Marketplace",
  "ExecutionDNA-Report", "ExecutionDNA-Team", "ExecutionDNA-Leadership", "ExecutionDNA-Audit", "ExecutionDNA-Scale", "ExecutionDNA-Capital", "ExecutionDNA-Alignment", "ExecutionDNA-Governance", "ExecutionDNA-Allocation", "ECAS", "ExecutionDNA-Horizons",
  "Healthcare-Amplified", "Sequence-Labs", "NexusCore",
] as const;

export const UTILITY_LABELS = {
  receipts: "Receipts 2026",
  notifications: "Notifications",
  junk: "Auto-Sortable-Junk",
  amazonKeep: "Amazon-Keep",
} as const;

export const DO_NOT_REDRAFT = [
  "stax labs",
  "dr tabatha russell",
  "tabatha russell",
  "murielle",
  "george tritton-price",
  "meghan athey",
  "brijraj",
] as const;

export const DO_NOT_CONTACT = ["robbie horwitz"] as const;

const FILTER_MISS_PATTERNS = [
  /docsend/i,
  /luma-mail\.com/i,
  /(?:^|@)luma\.com/i,
  /etsy/i,
  /doordash/i,
  /tiktok/i,
  /read assistant/i,
  /read\.ai/i,
];

const AMAZON_PATTERN = /amazon/i;
const AMAZON_KEEP_PATTERNS = [
  /pickup/i,
  /whole foods/i,
  /subscribe\s*&\s*save/i,
  /action required/i,
  /delivery issue/i,
];

const RECEIPT_PATTERNS = [
  /stripe/i, /paypal/i, /chase/i, /american express|\bamex\b/i, /invoice/i, /receipt/i, /renewal/i, /\btax\b/i,
];

const NOTIFICATION_PATTERNS = [
  /asana/i, /heygen/i, /facebook/i, /linkedin/i, /zoom recording/i, /gohighlevel|highlevel|\bghl\b/i, /google docs?/i, /docs\.google\.com/i,
];

const GOOGLE_DOC_MENTION_PATTERNS = [
  /@mention/i,
  /mentioned you/i,
  /mentioned sabrina/i,
  /sabrina (?:runbeck )?was mentioned/i,
  /you were mentioned/i,
];

const PROMO_PATTERNS = [
  /@e\./i, /@mkt\./i, /@promo\./i, /@newsletter\./i, /unsubscribe/i, /% off/i, /sale ends/i, /limited time/i, /deal alert/i,
];

const PODCAST_PITCH_PATTERNS = [
  /podcast guest/i,
  /guest (?:submission|pitch|appearance)/i,
  /book (?:my|our|this) client/i,
  /media booking/i,
  /be on (?:the )?provider['’]?s edge/i,
  /provider['’]?s edge.*guest/i,
  /pitch(?:ing)? .* (?:for|to) (?:your )?podcast/i,
];

const PODCAST_EXTRA_ASK_PATTERNS = [
  /sponsor(?:ship|ed)?/i,
  /partnership/i,
  /cross[- ]promotion/i,
  /affiliate/i,
  /co[- ]host/i,
  /media partnership/i,
];

const SEQUENCE_LABS_PATTERNS = [
  /semaglutide/i, /tirzepatide/i, /retatrutide/i, /\bhgh\b/i, /bpc-157/i, /tb-500/i, /nad\+/i,
  /igf-1 lr3/i, /ghk-cu/i, /ipamorelin/i, /tesamorelin/i, /mots-c/i, /thymosin alpha-1/i, /pt-141/i,
  /cjc-1295/i, /sermorelin/i, /\bhcg\b/i, /\bcoa\b/i, /\bhplc\b/i, /research peptide/i, /peptide supply/i,
  /wholesale peptide/i, /vanguard laboratory/i, /sequencelabs\.health/i,
];

export type DeterministicPersonalAction =
  | "DO_NOT_CONTACT"
  | "DO_NOT_REDRAFT"
  | "FILTER_MISS_REVIEW"
  | "ACTION_NEEDED_NOTIFICATION"
  | "ARCHIVE_RECEIPT"
  | "ARCHIVE_NOTIFICATION"
  | "ARCHIVE_JUNK"
  | "PODCAST_PITCH_CANDIDATE"
  | "SEQUENCE_LABS_CONTEXT";

export type DeterministicPersonalResult = {
  action: DeterministicPersonalAction;
  labels: string[];
  reason: string;
  requiresHumanReview: boolean;
};

export type PersonalPolicyInput = {
  mailboxEmail: string;
  from: string;
  subject?: string | null;
  body?: string | null;
};

function normalized(input: PersonalPolicyInput) {
  return `${input.from}\n${input.subject ?? ""}\n${input.body ?? ""}`.toLowerCase();
}

export function deterministicPersonalInboxRule(input: PersonalPolicyInput): DeterministicPersonalResult | null {
  if (input.mailboxEmail.toLowerCase() !== PERSONAL_MASTER_INBOX) return null;
  const text = normalized(input);

  if (DO_NOT_CONTACT.some((name) => text.includes(name))) {
    return { action: "DO_NOT_CONTACT", labels: [PRIORITY_LABELS.doNotContact], reason: "§8 do-not-contact sender", requiresHumanReview: false };
  }

  if (DO_NOT_REDRAFT.some((name) => text.includes(name))) {
    return { action: "DO_NOT_REDRAFT", labels: [], reason: "§8 do-not-redraft sender", requiresHumanReview: false };
  }

  if (AMAZON_PATTERN.test(text) && AMAZON_KEEP_PATTERNS.some((pattern) => pattern.test(text))) {
    return null;
  }

  if (FILTER_MISS_PATTERNS.some((pattern) => pattern.test(text)) || AMAZON_PATTERN.test(text)) {
    return { action: "FILTER_MISS_REVIEW", labels: [PRIORITY_LABELS.filterMiss], reason: "§4.1 native Gmail filter miss", requiresHumanReview: true };
  }

  if ((/google docs?/i.test(text) || /docs\.google\.com/i.test(text)) && GOOGLE_DOC_MENTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return { action: "ACTION_NEEDED_NOTIFICATION", labels: [PRIORITY_LABELS.actionNeeded], reason: "§4.2 Google Docs @mention escalation", requiresHumanReview: true };
  }

  if (RECEIPT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { action: "ARCHIVE_RECEIPT", labels: [UTILITY_LABELS.receipts], reason: "§4.2 receipt/finance/renewal", requiresHumanReview: false };
  }

  if (NOTIFICATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return { action: "ARCHIVE_NOTIFICATION", labels: [UTILITY_LABELS.notifications], reason: "§4.2 notification", requiresHumanReview: false };
  }

  if (PROMO_PATTERNS.some((pattern) => pattern.test(text))) {
    return { action: "ARCHIVE_JUNK", labels: [UTILITY_LABELS.junk], reason: "§4.1b fallback promotional junk", requiresHumanReview: false };
  }

  if (PODCAST_PITCH_PATTERNS.some((pattern) => pattern.test(text))) {
    return { action: "PODCAST_PITCH_CANDIDATE", labels: ["Podcast-Pitch"], reason: "§5 podcast pitch candidate; auto-send still requires exception checks", requiresHumanReview: false };
  }

  if (SEQUENCE_LABS_PATTERNS.some((pattern) => pattern.test(text))) {
    return { action: "SEQUENCE_LABS_CONTEXT", labels: ["Sequence-Labs"], reason: "§2c Sequence Labs deterministic trigger", requiresHumanReview: true };
  }

  return null;
}

export function hasPodcastPitchExtraAsk(subject: string | null | undefined, body: string | null | undefined) {
  const text = `${subject ?? ""}\n${body ?? ""}`;
  return PODCAST_EXTRA_ASK_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasKnownPartnerTag(tags: unknown) {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => typeof tag === "string" && /(?:partner|advisor|fellow|investor|ppp[-_ ]?client|hba[-_ ]?.*fellow)/i.test(tag));
}

export const SEQUENCE_LABS_REQUIRED_FRAME =
  "For research use only. Not for human consumption. Not intended to diagnose, treat, cure, or prevent any disease. Not evaluated by the FDA.";

export function validateSequenceLabsDraft(draft: string) {
  const violations: string[] = [];
  if (!draft.includes(SEQUENCE_LABS_REQUIRED_FRAME)) violations.push("missing_research_use_frame");
  const contentOutsideMandatoryFrame = draft.replace(SEQUENCE_LABS_REQUIRED_FRAME, "");
  if (/\b(dose|dosage|inject|administer|treat|cure|therapy|therapeutic outcome|patient protocol)\b/i.test(contentOutsideMandatoryFrame)) violations.push("clinical_or_dosing_language");
  return { valid: violations.length === 0, violations };
}

export function canonicalEmmaPodcastPitch(firstName: string) {
  const name = firstName.trim() || "there";
  return `Hi ${name},\n\nThank you for considering The Provider's Edge as a platform for your client. We manage 3 shows.\n\nProvider's Edge podcast ranks in the top 2.5% globally by Listen Notes and is a Top 100 Entrepreneurship podcast on Apple Podcasts in both the US and UK.\n\nWith ~40k monthly downloads and over 4k+ newsletter subscribers, our interviews are syndicated across 20+ platforms.\n\nBeyond the podcast, our founder, Sabrina Runbeck, reaches a LinkedIn community of over 18k+ health innovators and decision-makers, including C-suite executives and investors.\n\nWe also host masterminds with clinicians, investors, and founders.\n\nWe run the Health Board Advisors ecosystem, and qualified advisor fellows also get featured on its podcast and YouTube platforms.\n\nIf there is a strong strategic fit, guest speakers may be invited to participate in these exclusive events.\n\nWe accept speaker who are clinicians, established health, dental, and wellness executives, operators, and founders leading companies who are generating $1M revenue or above series A funding.\n\nTo start, you can book an appointment here: https://pulsepointpath.com/providers-edge-recording.\n\nDuring this call, we will identify the format that best aligns with your client's expertise and business goals and potentially have time to record as well.\n\nI look forward to connecting.\n\nBest regards,\n\nEmma\nPodcast Manager`;
}
