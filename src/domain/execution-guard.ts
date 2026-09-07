import type { AutonomyLevel, RiskLevel } from "./agent";

export type ExecutionIntent = {
  organizationId: string;
  businessId: string;
  mailboxId: string;
  action: string;
  risk: RiskLevel;
  confidence: number;
  autonomyLevel: AutonomyLevel;
  globalAiActive: boolean;
  globalAutoSendActive: boolean;
  businessAiActive: boolean;
  businessAutoSendActive: boolean;
  mailboxAiActive: boolean;
  mailboxAutoSendActive: boolean;
  actionAllowedByBusinessRule: boolean;
  recipientAuthorized: boolean;
  duplicateDetected: boolean;
  prohibitedCategory: boolean;
  attachmentPermissionSatisfied: boolean;
  approvalSatisfied: boolean;
};

export type GuardDecision =
  | { allowed: true; reason: "AUTHORIZED" }
  | { allowed: false; reason: string };

export function authorizeExecution(intent: ExecutionIntent): GuardDecision {
  if (!intent.globalAiActive) return deny("GLOBAL_AI_DISABLED");
  if (!intent.businessAiActive) return deny("BUSINESS_AI_DISABLED");
  if (!intent.mailboxAiActive) return deny("MAILBOX_AI_DISABLED");
  if (intent.duplicateDetected) return deny("DUPLICATE_ACTION");
  if (intent.prohibitedCategory) return deny("PROHIBITED_CATEGORY");
  if (!intent.recipientAuthorized) return deny("RECIPIENT_NOT_AUTHORIZED");
  if (!intent.attachmentPermissionSatisfied) return deny("ATTACHMENT_PERMISSION_REQUIRED");
  if (intent.risk === "CRITICAL") return deny("CRITICAL_REQUIRES_HUMAN");
  if (intent.risk === "HIGH" && !intent.approvalSatisfied) return deny("HIGH_RISK_REQUIRES_APPROVAL");
  if (!intent.actionAllowedByBusinessRule) return deny("BUSINESS_RULE_DENIED");

  const isSend = intent.action === "SEND_EMAIL";
  if (isSend) {
    if (!intent.globalAutoSendActive) return deny("GLOBAL_AUTO_SEND_DISABLED");
    if (!intent.businessAutoSendActive) return deny("BUSINESS_AUTO_SEND_DISABLED");
    if (!intent.mailboxAutoSendActive) return deny("MAILBOX_AUTO_SEND_DISABLED");

    if (intent.autonomyLevel < 2) return deny("AUTONOMY_LEVEL_REQUIRES_APPROVAL");

    if (intent.risk === "MEDIUM" && intent.confidence < 0.95) {
      return deny("MEDIUM_RISK_CONFIDENCE_TOO_LOW");
    }

    if (intent.risk === "LOW" && intent.confidence < 0.95) {
      return deny("LOW_RISK_CONFIDENCE_TOO_LOW");
    }
  }

  if (intent.approvalSatisfied) return { allowed: true, reason: "AUTHORIZED" };

  if (intent.risk === "MEDIUM" && intent.autonomyLevel < 2) {
    return deny("MEDIUM_RISK_REQUIRES_GUARDED_AUTOPILOT");
  }

  return { allowed: true, reason: "AUTHORIZED" };
}

function deny(reason: string): GuardDecision {
  return { allowed: false, reason };
}
