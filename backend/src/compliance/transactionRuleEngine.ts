import { db, FieldValue } from "../config/firebase";
import { generateReference } from "../utils/ids";
import { writeAuditLog } from "../utils/audit";
import { emitAlertCreated } from "../realtime/socket";
import { localDateKey } from "../utils/dateKey";

export type TransactionRuleAction = "block" | "flag" | "alert";
export type TransactionRuleType = "all" | "transfer" | "deposit" | "withdrawal";

export interface TransactionRuleViolation {
  ruleId: string;
  ruleName: string;
  violationAction: TransactionRuleAction;
  reason: string;
}

interface CheckInput {
  accountId: string;
  transactionType: Exclude<TransactionRuleType, "all">;
  amount: number;
  customerType?: string;
}

interface TransactionRuleDoc {
  id: string;
  ruleName: string;
  transactionType: TransactionRuleType;
  customerType: "all" | "individual" | "business";
  perTransactionLimit?: number | null;
  dailyTransactionLimit?: number | null;
  monthlyTransactionLimit?: number | null;
  dailyCountLimit?: number | null;
  monthlyCountLimit?: number | null;
  status: "active" | "inactive";
  violationAction: TransactionRuleAction;
}

interface UsageState {
  dayKey: string;
  monthKey: string;
  dayTotal: Record<string, number>;
  dayCount: Record<string, number>;
  monthTotal: Record<string, number>;
  monthCount: Record<string, number>;
}

function monthKeyFor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function freshUsage(dayKey: string, monthKey: string): UsageState {
  return { dayKey, monthKey, dayTotal: {}, dayCount: {}, monthTotal: {}, monthCount: {} };
}

// Rolls the stored running totals over whenever the calendar day/month has changed
// since they were last written, so a rule check on a new day starts from zero
// instead of carrying yesterday's spend forward.
function loadUsage(data: FirebaseFirestore.DocumentData | undefined, dayKey: string, monthKey: string): UsageState {
  if (!data) return freshUsage(dayKey, monthKey);
  return {
    dayKey,
    monthKey,
    dayTotal: data.dayKey === dayKey ? { ...(data.dayTotal ?? {}) } : {},
    dayCount: data.dayKey === dayKey ? { ...(data.dayCount ?? {}) } : {},
    monthTotal: data.monthKey === monthKey ? { ...(data.monthTotal ?? {}) } : {},
    monthCount: data.monthKey === monthKey ? { ...(data.monthCount ?? {}) } : {},
  };
}

async function loadApplicableRules(input: CheckInput): Promise<TransactionRuleDoc[]> {
  const rulesSnap = await db.collection("transactionRules").where("status", "==", "active").get();
  const customerType = input.customerType ?? "individual";
  return rulesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<TransactionRuleDoc, "id">) }))
    .filter(
      (r) =>
        (r.transactionType === "all" || r.transactionType === input.transactionType) &&
        (r.customerType === "all" || r.customerType === customerType)
    );
}

function evaluate(applicable: TransactionRuleDoc[], usage: UsageState, amount: number): TransactionRuleViolation[] {
  const violations: TransactionRuleViolation[] = [];
  for (const rule of applicable) {
    const bucket = rule.transactionType;
    const dayTotal = usage.dayTotal[bucket] ?? 0;
    const dayCount = usage.dayCount[bucket] ?? 0;
    const monthTotal = usage.monthTotal[bucket] ?? 0;
    const monthCount = usage.monthCount[bucket] ?? 0;

    if (rule.perTransactionLimit && amount > rule.perTransactionLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `Amount ${amount.toLocaleString()} exceeds the per-transaction limit of ${Number(rule.perTransactionLimit).toLocaleString()}.`,
      });
    } else if (rule.dailyTransactionLimit && dayTotal + amount > rule.dailyTransactionLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `Today's total of ${(dayTotal + amount).toLocaleString()} would exceed the daily limit of ${Number(rule.dailyTransactionLimit).toLocaleString()}.`,
      });
    } else if (rule.monthlyTransactionLimit && monthTotal + amount > rule.monthlyTransactionLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `This month's total of ${(monthTotal + amount).toLocaleString()} would exceed the monthly limit of ${Number(rule.monthlyTransactionLimit).toLocaleString()}.`,
      });
    } else if (rule.dailyCountLimit && dayCount + 1 > rule.dailyCountLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `This would be transaction #${dayCount + 1} today, exceeding the daily count limit of ${rule.dailyCountLimit}.`,
      });
    } else if (rule.monthlyCountLimit && monthCount + 1 > rule.monthlyCountLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `This would be transaction #${monthCount + 1} this month, exceeding the monthly count limit of ${rule.monthlyCountLimit}.`,
      });
    }
  }
  return violations;
}

/**
 * Evaluates the sending account's transaction against every active admin-configured
 * transaction rule that applies to this transaction/customer type, and — if nothing
 * blocks it — reserves the amount against a running daily/monthly usage counter.
 *
 * Must be called from inside the same `db.runTransaction` that commits the balance
 * change, with all `t.get()` calls (including this function's) issued before any
 * writes. Firestore only guarantees consistency for documents a transaction both
 * reads and writes, so reading+writing the same per-account usage counter here is
 * what actually closes the race: two concurrent transfers against one account will
 * both read the same starting counter, but only one can win the commit — the other
 * is retried by Firestore against the updated counter and re-evaluated for real,
 * rather than both being allowed through against a stale limit snapshot.
 */
export async function checkTransactionRulesInTransaction(
  t: FirebaseFirestore.Transaction,
  input: CheckInput
): Promise<TransactionRuleViolation[]> {
  const applicable = await loadApplicableRules(input);
  if (!applicable.length) return [];

  const now = new Date();
  const dayKey = localDateKey(now);
  const monthKey = monthKeyFor(now);

  const needsHistory = applicable.some(
    (r) => r.dailyTransactionLimit || r.monthlyTransactionLimit || r.dailyCountLimit || r.monthlyCountLimit
  );
  if (!needsHistory) {
    return evaluate(applicable, freshUsage(dayKey, monthKey), input.amount);
  }

  const usageRef = db.collection("transactionRuleUsage").doc(input.accountId);
  const usageSnap = await t.get(usageRef);
  const usage = loadUsage(usageSnap.exists ? usageSnap.data() : undefined, dayKey, monthKey);
  const violations = evaluate(applicable, usage, input.amount);

  const blocked = violations.some((v) => v.violationAction === "block");
  if (!blocked) {
    for (const bucket of ["all", input.transactionType]) {
      usage.dayTotal[bucket] = (usage.dayTotal[bucket] ?? 0) + input.amount;
      usage.dayCount[bucket] = (usage.dayCount[bucket] ?? 0) + 1;
      usage.monthTotal[bucket] = (usage.monthTotal[bucket] ?? 0) + input.amount;
      usage.monthCount[bucket] = (usage.monthCount[bucket] ?? 0) + 1;
    }
    t.set(usageRef, usage);
  }

  return violations;
}

/**
 * Records non-blocking ("flag"/"alert") violations as a compliance alert, reusing the
 * same alert pipeline the risk-scoring engine uses, so it shows up in the existing
 * Alerts Queue with no separate UI needed. "alert" additionally pushes an immediate
 * notification to compliance staff; "flag" just queues it for review.
 */
export async function recordTransactionRuleAlert(
  transactionId: string,
  customerId: string | null,
  violations: TransactionRuleViolation[]
): Promise<void> {
  if (!violations.length) return;
  const isUrgent = violations.some((v) => v.violationAction === "alert");
  const riskLevel = isUrgent ? "high" : "medium";
  const riskScore = isUrgent ? 75 : 45;

  const alertRef = await db.collection("complianceAlerts").add({
    alertRef: generateReference("ALT"),
    customerId,
    transactionId,
    ruleCodes: violations.map((v) => `TXN-RULE:${v.ruleId}`),
    primaryRuleCode: `TXN-RULE:${violations[0].ruleName}`,
    riskScore,
    riskLevel,
    reasons: violations.map((v) => `[${v.ruleName}] ${v.reason}`),
    evidenceIds: [],
    status: "new",
    assignedTo: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    userId: null,
    role: "system",
    action: "transaction_rule.alert_created",
    resource: "complianceAlerts",
    resourceId: alertRef.id,
    description: `Transaction ${transactionId} flagged by transaction rule(s): ${violations.map((v) => v.ruleName).join(", ")}.`,
  });

  const alertSnap = await alertRef.get();
  emitAlertCreated({ id: alertSnap.id, ...alertSnap.data() }, riskLevel);

  if (isUrgent) {
    const officersSnap = await db
      .collection("users")
      .where("role", "==", "compliance_officer")
      .where("status", "==", "active")
      .get();
    await Promise.all(
      officersSnap.docs.map((o) =>
        db.collection("notifications").add({
          userId: o.id,
          type: "new_alert",
          message: `Transaction rule alert on transaction ${transactionId}: ${violations[0].ruleName}.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        })
      )
    );
  }
}
