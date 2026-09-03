import { RuleResult } from "../rules/types";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskScoreResult {
  score: number;
  level: RiskLevel;
  factors: RuleResult[];
  triggeredRuleCodes: string[];
}

export function classify(score: number): RiskLevel {
  if (score <= 30) return "low";
  if (score <= 60) return "medium";
  if (score <= 80) return "high";
  return "critical";
}

export function computeRiskScore(factors: RuleResult[]): RiskScoreResult {
  const raw = factors.reduce((sum, f) => sum + f.score, 0);
  const score = Math.max(0, Math.min(100, raw));
  return {
    score,
    level: classify(score),
    factors,
    triggeredRuleCodes: factors.filter((f) => f.triggered).map((f) => f.ruleCode),
  };
}

// Below this, a transaction auto-approves with no compliance alert.
export const ALERT_THRESHOLD = 31;
