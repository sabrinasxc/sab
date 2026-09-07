import type { RiskLevel } from "@/domain/agent";

const CRITICAL_PATTERNS = [
  /\bwire\b/i,
  /\bach\b/i,
  /bank (?:account|routing|details|information)/i,
  /change (?:my |the )?(?:bank|payment) (?:account|details|destination)/i,
  /\bchargeback\b/i,
  /\bfraud\b/i,
  /\battorney\b/i,
  /\blawsuit\b/i,
  /\blegal action\b/i,
  /\bsettlement\b/i,
  /\btermination\b/i,
  /\bregulator(?:y|)/i,
];

const HIGH_PATTERNS = [
  /\brefund\b/i,
  /\bcancel(?:lation| my| the)?\b/i,
  /\bcontract (?:change|modification|amend)/i,
  /\bcomplaint\b/i,
  /\bupset\b/i,
];

const INJECTION_PATTERNS = [
  /ignore (?:all |any )?(?:previous|prior|system) instructions/i,
  /reveal (?:your |the )?(?:system prompt|credentials|secrets)/i,
  /bypass (?:approval|security|policy)/i,
  /access (?:another|other|unrelated) (?:customer|business|account)/i,
  /execute (?:this |the )?(?:tool|command) without/i,
];

const rank: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function riskFloorForContent(content: string): RiskLevel {
  if (CRITICAL_PATTERNS.some((pattern) => pattern.test(content))) return "CRITICAL";
  if (HIGH_PATTERNS.some((pattern) => pattern.test(content))) return "HIGH";
  return "LOW";
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return rank[a] >= rank[b] ? a : b;
}

export function promptInjectionSuspected(content: string) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

export function isFinanciallyProhibited(content: string) {
  return /(?:wire|ach|routing number|bank account|payment destination|card number|execute refund|send refund|settlement payment)/i.test(content);
}
