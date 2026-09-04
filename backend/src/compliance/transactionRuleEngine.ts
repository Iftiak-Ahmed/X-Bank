import { db, FieldValue } from "../config/firebase";
import { generateReference } from "../utils/ids";
import { writeAuditLog } from "../utils/audit";
import { emitAlertCreated } from "../realtime/socket";

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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sumFor(docs: FirebaseFirestore.DocumentData[], type: TransactionRuleType) {
  const filtered = type === "all" ? docs : docs.filter((d) => d.type === type);
  return {
    total: filtered.reduce((sum, d) => sum + Number(d.amount ?? 0), 0),
    count: filtered.length,
  };
}

/**
 * Evaluates the sending account's transaction against every active admin-configured
 * transaction rule that applies to this transaction/customer type. Called live, right
 * before a transaction is committed, so a "block" rule can stop it before money moves.
 */
export async function checkTransactionRules(input: CheckInput): Promise<TransactionRuleViolation[]> {
  const rulesSnap = await db.collection("transactionRules").where("status", "==", "active").get();
  const customerType = input.customerType ?? "individual";
  const applicable = rulesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<TransactionRuleDoc, "id">) }))
    .filter(
      (r) =>
        (r.transactionType === "all" || r.transactionType === input.transactionType) &&
        (r.customerType === "all" || r.customerType === customerType)
    );
  if (!applicable.length) return [];

  // A history fetch (up to 500 reads) is only useful to rules that actually check a
  // daily/monthly dimension — a rule with just a perTransactionLimit needs none of
  // this, so skip the read entirely rather than paying for it on every transaction.
  const needsHistory = applicable.some(
    (r) => r.dailyTransactionLimit || r.monthlyTransactionLimit || r.dailyCountLimit || r.monthlyCountLimit
  );

  let dayDocs: FirebaseFirestore.DocumentData[] = [];
  let monthDocs: FirebaseFirestore.DocumentData[] = [];
  if (needsHistory) {
    // A plain equality + range filter on two different fields would need a composite
    // index this environment can't provision on demand, so we reuse the equality +
    // orderBy(createdAt) shape already indexed elsewhere in this app, and filter the
    // day/month windows out of that single recent-history fetch in memory instead.
    const now = new Date();
    const dayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const recentSnap = await db
      .collection("transactions")
      .where("senderAccountId", "==", input.accountId)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    const recentDocs = recentSnap.docs.map((d) => d.data());
    const createdAtMillis = (d: FirebaseFirestore.DocumentData): number => {
      const ts = d.createdAt;
      return typeof ts?.toMillis === "function" ? ts.toMillis() : 0;
    };
    dayDocs = recentDocs.filter((d) => createdAtMillis(d) >= dayStart.getTime());
    monthDocs = recentDocs.filter((d) => createdAtMillis(d) >= monthStart.getTime());
  }

  const violations: TransactionRuleViolation[] = [];
  for (const rule of applicable) {
    const type: TransactionRuleType = rule.transactionType;
    const day = sumFor(dayDocs, type);
    const month = sumFor(monthDocs, type);

    if (rule.perTransactionLimit && input.amount > rule.perTransactionLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `Amount ${input.amount.toLocaleString()} exceeds the per-transaction limit of ${Number(rule.perTransactionLimit).toLocaleString()}.`,
      });
    } else if (rule.dailyTransactionLimit && day.total + input.amount > rule.dailyTransactionLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `Today's total of ${(day.total + input.amount).toLocaleString()} would exceed the daily limit of ${Number(rule.dailyTransactionLimit).toLocaleString()}.`,
      });
    } else if (rule.monthlyTransactionLimit && month.total + input.amount > rule.monthlyTransactionLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `This month's total of ${(month.total + input.amount).toLocaleString()} would exceed the monthly limit of ${Number(rule.monthlyTransactionLimit).toLocaleString()}.`,
      });
    } else if (rule.dailyCountLimit && day.count + 1 > rule.dailyCountLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `This would be transaction #${day.count + 1} today, exceeding the daily count limit of ${rule.dailyCountLimit}.`,
      });
    } else if (rule.monthlyCountLimit && month.count + 1 > rule.monthlyCountLimit) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.ruleName,
        violationAction: rule.violationAction,
        reason: `This would be transaction #${month.count + 1} this month, exceeding the monthly count limit of ${rule.monthlyCountLimit}.`,
      });
    }
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
