import { z } from "zod";

export const riskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const autonomyLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export const agentActionSchema = z.enum([
  "NO_ACTION",
  "RESPOND",
  "CREATE_TASK",
  "UPDATE_CRM",
  "RESPOND_AND_UPDATE",
  "ESCALATE",
  "REQUEST_MORE_INFORMATION",
]);
export type AgentAction = z.infer<typeof agentActionSchema>;

export const triageResultSchema = z.object({
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  risk: riskLevelSchema,
  sentiment: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  promptInjectionSuspected: z.boolean().default(false),
  summary: z.string().min(1),
});
export type TriageResult = z.infer<typeof triageResultSchema>;

export const decisionResultSchema = z.object({
  action: agentActionSchema,
  confidence: z.number().min(0).max(1),
  risk: riskLevelSchema,
  reasoningSummary: z.string().min(1),
  requiresResponse: z.boolean(),
  requiresApproval: z.boolean(),
  proposedToolActions: z.array(
    z.object({
      tool: z.string().min(1),
      operation: z.string().min(1),
      arguments: z.record(z.unknown()),
    }),
  ),
});
export type DecisionResult = z.infer<typeof decisionResultSchema>;

export const responseDraftSchema = z.object({
  subject: z.string().nullable(),
  bodyText: z.string().min(1),
  bodyHtml: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  citations: z.array(z.string()).default([]),
});
export type ResponseDraft = z.infer<typeof responseDraftSchema>;
