import type { RiskLevel } from "@/domain/agent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Rule = { id: string; priority: number; conditions: Record<string, unknown>; actions: unknown[] | Record<string, unknown> };

type RuleContext = { category: string; subcategory?: string | null; risk: RiskLevel; senderEmail: string; confidence: number };

function matches(rule: Rule, context: RuleContext) {
  const c = rule.conditions ?? {};
  if (typeof c.category === "string" && c.category !== context.category) return false;
  if (typeof c.subcategory === "string" && c.subcategory !== context.subcategory) return false;
  if (typeof c.risk === "string" && c.risk !== context.risk) return false;
  if (typeof c.senderDomain === "string" && !context.senderEmail.toLowerCase().endsWith(`@${String(c.senderDomain).toLowerCase()}`)) return false;
  if (typeof c.minConfidence === "number" && context.confidence < c.minConfidence) return false;
  return true;
}

function actionNames(rule: Rule) {
  if (Array.isArray(rule.actions)) return rule.actions.map((a) => typeof a === "string" ? a : typeof a === "object" && a ? String((a as any).type ?? "") : "");
  return Object.keys(rule.actions ?? {}).filter((key) => Boolean((rule.actions as any)[key]));
}

export async function evaluateBusinessRules(businessId: string, context: RuleContext) {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("business_rules").select("id,priority,conditions,actions").eq("business_id", businessId).eq("enabled", true).order("priority", { ascending: true });
  const matching = ((data ?? []) as Rule[]).filter((rule) => matches(rule, context));
  const actions = matching.flatMap(actionNames);
  const requiresApproval = actions.includes("REQUIRE_APPROVAL") || actions.includes("DRAFT") || actions.includes("ESCALATE");
  const explicitlyAllowsAutoReply = actions.includes("AUTO_REPLY") && !requiresApproval;
  return { matchingRuleIds: matching.map((r) => r.id), actions, requiresApproval, explicitlyAllowsAutoReply };
}
