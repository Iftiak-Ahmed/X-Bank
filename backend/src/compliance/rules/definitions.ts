import { RuleContext, RuleFn, RuleResult } from "./types";

function minutesBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

function toDate(v: unknown): Date {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  return v instanceof Date ? v : new Date();
}

/** Rule 001 — Large Transaction: amount exceeds the configurable threshold. */
export const rule001LargeTransaction: RuleFn = (ctx) => {
  const amount = Number(ctx.transaction.amount ?? 0);
  const threshold = ctx.config.largeTransactionThreshold;
  const ratio = amount / threshold;
  const triggered = amount > threshold;
  const score = triggered ? Math.min(30, Math.round(10 + ratio * 8)) : 0;
  return {
    ruleCode: "RULE-001",
    ruleName: "Large Transaction",
    triggered,
    score,
    reason: triggered
      ? `Amount ${amount.toLocaleString()} exceeds the large-transaction threshold of ${threshold.toLocaleString()} (${ratio.toFixed(1)}x).`
      : "Amount within normal range.",
  };
};

/** Rule 002 — Multiple High-Value Transactions within a short window. */
export const rule002MultipleHighValue: RuleFn = (ctx) => {
  const now = toDate(ctx.transaction.createdAt);
  const halfThreshold = ctx.config.largeTransactionThreshold * 0.5;
  const recentHighValue = ctx.history.filter(
    (t) => Number(t.amount ?? 0) >= halfThreshold && minutesBetween(now, toDate(t.createdAt)) <= 30
  );
  const count = recentHighValue.length + (Number(ctx.transaction.amount ?? 0) >= halfThreshold ? 1 : 0);
  const triggered = count >= 3;
  const score = triggered ? Math.min(12, count * 3) : 0;
  return {
    ruleCode: "RULE-002",
    ruleName: "Multiple High-Value Transactions",
    triggered,
    score,
    reason: triggered
      ? `${count} high-value transactions within the last 30 minutes.`
      : "No clustering of high-value transactions detected.",
  };
};

/** Rule 003 — Unusual Transaction Frequency vs. the account's own baseline. */
export const rule003UnusualFrequency: RuleFn = (ctx) => {
  if (ctx.history.length === 0) {
    return { ruleCode: "RULE-003", ruleName: "Unusual Transaction Frequency", triggered: false, score: 0, insufficientData: true, reason: "No prior transaction history to establish a frequency baseline." };
  }
  const now = toDate(ctx.transaction.createdAt);
  const last24h = ctx.history.filter((t) => minutesBetween(now, toDate(t.createdAt)) <= 24 * 60).length + 1;
  const baseline = 4; // simple static baseline for a demo account; production would use a rolling per-customer average
  const triggered = last24h > baseline * 2;
  const score = triggered ? Math.min(8, Math.round((last24h - baseline) * 1.5)) : 0;
  return {
    ruleCode: "RULE-003",
    ruleName: "Unusual Transaction Frequency",
    triggered,
    score,
    reason: triggered
      ? `${last24h} transactions in 24h vs. a baseline of ~${baseline}.`
      : "Transaction frequency is within the customer's normal range.",
  };
};

/** Rule 004 — Rapid Fund Movement: money in, then quickly out. */
export const rule004RapidFundMovement: RuleFn = (ctx) => {
  const now = toDate(ctx.transaction.createdAt);
  const recentInbound = ctx.history.find(
    (t) =>
      t.receiverAccountId === ctx.transaction.senderAccountId &&
      minutesBetween(now, toDate(t.createdAt)) <= 15
  );
  const triggered = Boolean(recentInbound);
  return {
    ruleCode: "RULE-004",
    ruleName: "Rapid Fund Movement",
    triggered,
    score: triggered ? 10 : 0,
    reason: triggered
      ? "Funds received into this account within the last 15 minutes were immediately moved out."
      : "No rapid in-then-out fund movement detected.",
  };
};

/** Rule 005 — High-Risk Location: transaction originates from a configured high-risk location. */
export const rule005HighRiskLocation: RuleFn = (ctx) => {
  const location = String(ctx.transaction.location ?? "").toUpperCase();
  const triggered = ctx.config.highRiskLocations.includes(location);
  return {
    ruleCode: "RULE-005",
    ruleName: "High-Risk Location",
    triggered,
    score: triggered ? 15 : 0,
    reason: triggered
      ? `Transaction originated from ${location}, a configured high-risk location.`
      : "Origin location is not flagged as high-risk.",
  };
};

/** Rule 006 — Unusual Behavior: this transaction deviates sharply from the customer's own history. */
export const rule006UnusualBehavior: RuleFn = (ctx) => {
  const amount = Number(ctx.transaction.amount ?? 0);
  const historyAmounts = ctx.history.map((t) => Number(t.amount ?? 0)).filter((n) => n > 0);
  if (historyAmounts.length < 3) {
    return { ruleCode: "RULE-006", ruleName: "Unusual Behavior", triggered: false, score: 0, insufficientData: true, reason: "Insufficient history to establish a baseline." };
  }
  const avg = historyAmounts.reduce((a, b) => a + b, 0) / historyAmounts.length;
  const ratio = avg > 0 ? amount / avg : 0;
  const triggered = ratio >= 5;
  const score = triggered ? Math.min(15, Math.round(ratio)) : 0;
  return {
    ruleCode: "RULE-006",
    ruleName: "Unusual Behavior",
    triggered,
    score,
    reason: triggered
      ? `Amount is ${ratio.toFixed(1)}x this customer's average transaction (${avg.toLocaleString()}).`
      : "Consistent with this customer's historical pattern.",
  };
};

/** Rule 007 — KYC Problem: missing, pending too long, expired, or rejected. */
export const rule007KycProblem: RuleFn = (ctx) => {
  const status = ctx.kyc?.status ?? "missing";
  const triggered = ["missing", "pending", "expired", "rejected"].includes(status);
  const severity: Record<string, number> = { missing: 10, rejected: 10, expired: 8, pending: 5 };
  return {
    ruleCode: "RULE-007",
    ruleName: "KYC Problem",
    triggered,
    score: triggered ? severity[status] ?? 5 : 0,
    reason: triggered ? `Customer KYC status is "${status}".` : "KYC is verified and current.",
  };
};

export const ALL_RULES: RuleFn[] = [
  rule001LargeTransaction,
  rule002MultipleHighValue,
  rule003UnusualFrequency,
  rule004RapidFundMovement,
  rule005HighRiskLocation,
  rule006UnusualBehavior,
  rule007KycProblem,
];

export function evaluateAllRules(ctx: RuleContext): RuleResult[] {
  return ALL_RULES.map((rule) => rule(ctx));
}
