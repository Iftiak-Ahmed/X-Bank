import { db, FieldValue } from "../config/firebase";
import { env } from "../config/env";
import { TransactionEvidenceAgent } from "../agents/transactionEvidenceAgent";
import { IdentityKycAgent } from "../agents/identityKycAgent";
import { ComplianceEvidenceAgent } from "../agents/complianceEvidenceAgent";
import { evaluateAllRules } from "./rules/definitions";
import { RuleContext } from "./rules/types";
import { ALERT_THRESHOLD, computeRiskScore } from "./risk/scoring";
import { generateComplianceResults } from "./complianceResults";
import { writeAuditLog } from "../utils/audit";
import { emitAlertCreated, emitTransactionCleared } from "../realtime/socket";
import { generateReference } from "../utils/ids";

/**
 * Runs one transaction through the full compliance pipeline described in
 * architecture doc section 09: evidence collection -> rule evaluation ->
 * risk scoring -> alert generation (if needed) -> audit trail.
 * Called synchronously right after a transaction is created — event-driven,
 * not a polling job, matching "real-time/event-driven where practical".
 */
export async function runComplianceCheck(transactionId: string): Promise<{
  status: "approved" | "pending_review";
  riskScore: number;
  riskLevel: string;
}> {
  const txRef = db.collection("transactions").doc(transactionId);
  const txSnap = await txRef.get();
  if (!txSnap.exists) throw new Error("Transaction not found");
  const tx = txSnap.data()!;

  const evidenceAgent = new TransactionEvidenceAgent(transactionId);
  await evidenceAgent.run({ taskId: transactionId, triggeredBy: "transaction.created" });

  const customerId: string | null = tx.senderCustomerId ?? null;
  let customer: FirebaseFirestore.DocumentData | null = null;
  let kyc: FirebaseFirestore.DocumentData | null = null;
  if (customerId) {
    const kycAgent = new IdentityKycAgent(customerId);
    await kycAgent.run({ taskId: transactionId, triggeredBy: "transaction.created" });
    const [customerSnap, kycSnap] = await Promise.all([
      db.collection("customers").doc(customerId).get(),
      db.collection("kycRecords").where("customerId", "==", customerId).limit(1).get(),
    ]);
    customer = customerSnap.exists ? customerSnap.data()! : null;
    kyc = kycSnap.empty ? null : kycSnap.docs[0].data();
  }

  const [senderAccountSnap, historySnap] = await Promise.all([
    db.collection("accounts").doc(tx.senderAccountId).get(),
    db
      .collection("transactions")
      .where("senderAccountId", "==", tx.senderAccountId)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get(),
  ]);
  const inboundSnap = await db
    .collection("transactions")
    .where("receiverAccountId", "==", tx.senderAccountId)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const history = [
    ...historySnap.docs.filter((d) => d.id !== transactionId).map((d) => d.data()),
    ...inboundSnap.docs.filter((d) => d.id !== transactionId).map((d) => d.data()),
  ];

  const ctx: RuleContext = {
    transaction: { ...tx, id: transactionId },
    senderAccount: senderAccountSnap.exists ? senderAccountSnap.data()! : null,
    history,
    customer,
    kyc,
    config: {
      largeTransactionThreshold: env.largeTransactionThreshold,
      highRiskLocations: env.highRiskLocations,
    },
  };

  const factors = evaluateAllRules(ctx);
  const risk = computeRiskScore(factors);

  const riskScoreRef = await db.collection("riskScores").add({
    transactionId,
    score: risk.score,
    level: risk.level,
    factors: risk.factors,
    calculatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    userId: null,
    role: "system",
    action: "risk_score.calculated",
    resource: "transactions",
    resourceId: transactionId,
    description: `Risk score ${risk.score} (${risk.level}) calculated for transaction ${transactionId}.`,
    newValue: { score: risk.score, level: risk.level, riskScoreId: riskScoreRef.id },
  });

  const complianceEvidenceAgent = new ComplianceEvidenceAgent(
    transactionId,
    customerId,
    factors.filter((f) => f.triggered)
  );
  const complianceEvidenceIds = await complianceEvidenceAgent.run({
    taskId: transactionId,
    triggeredBy: "risk.evaluated",
  });

  await generateComplianceResults(transactionId, customerId, factors, complianceEvidenceIds);

  const approved = risk.score < ALERT_THRESHOLD;
  const status: "approved" | "pending_review" = approved ? "approved" : "pending_review";

  await txRef.update({
    riskScore: risk.score,
    riskLevel: risk.level,
    status,
    complianceStatus: approved ? "cleared" : "under_review",
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (approved) {
    emitTransactionCleared({ transactionId, riskScore: risk.score, riskLevel: risk.level });
  } else {
    const triggeredRule = factors.find((f) => f.triggered) ?? factors[0];
    const alertRef = await db.collection("complianceAlerts").add({
      alertRef: generateReference("ALT"),
      customerId,
      transactionId,
      ruleCodes: risk.triggeredRuleCodes,
      primaryRuleCode: triggeredRule.ruleCode,
      riskScore: risk.score,
      riskLevel: risk.level,
      reasons: factors.filter((f) => f.triggered).map((f) => f.reason),
      evidenceIds: complianceEvidenceIds,
      status: "new",
      assignedTo: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      userId: null,
      role: "system",
      action: "alert.created",
      resource: "complianceAlerts",
      resourceId: alertRef.id,
      description: `Alert ${alertRef.id} created for transaction ${transactionId} (${risk.level}, score ${risk.score}).`,
    });

    const alertSnap = await alertRef.get();
    emitAlertCreated({ id: alertRef.id, ...alertSnap.data() }, risk.level);

    const officersSnap = await db
      .collection("users")
      .where("role", "in", ["compliance_officer", "compliance_manager"])
      .where("status", "==", "active")
      .get();
    await Promise.all(
      officersSnap.docs.map((o) =>
        db.collection("notifications").add({
          userId: o.id,
          type: risk.level === "critical" ? "critical_alert" : "new_alert",
          message: `${risk.level === "critical" ? "Critical" : "New"} compliance alert on transaction ${transactionId} (risk ${risk.score}).`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        })
      )
    );
  }

  return { status, riskScore: risk.score, riskLevel: risk.level };
}
