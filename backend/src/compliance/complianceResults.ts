import { db, FieldValue } from "../config/firebase";
import { RuleResult } from "./rules/types";

export type ComplianceResultValue = "pass" | "fail" | "needs_review" | "not_applicable";

function severityFor(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 20) return "critical";
  if (score >= 12) return "high";
  if (score >= 6) return "medium";
  return "low";
}

/**
 * Turns rule outcomes into per-control results, per architecture section 17-18:
 * a control is FAIL only when its linked rule actually triggered; missing
 * data produces NEEDS_REVIEW rather than an automatic violation; a control
 * with no linked rule evaluated for this transaction is NOT_APPLICABLE.
 * Traceability: Framework -> Control -> Rule -> Transaction -> Evidence -> Result.
 */
export async function generateComplianceResults(
  transactionId: string,
  customerId: string | null,
  factors: RuleResult[],
  evidenceIds: string[]
): Promise<void> {
  const [rulesSnap, controlsSnap] = await Promise.all([
    db.collection("complianceRules").get(),
    db.collection("complianceControls").get(),
  ]);

  const linkedControlsByRule = new Map<string, string[]>();
  rulesSnap.docs.forEach((d) => linkedControlsByRule.set(d.id, d.data().linkedControlIds ?? []));

  const controlById = new Map(controlsSnap.docs.map((d) => [d.id, d.data()]));
  // Most controls are never linked to any monitoring rule and so can never be
  // evaluated for any transaction — writing a "not_applicable" row for those on
  // every single transaction is pure noise that burns write/read quota for
  // nothing. Only controls reachable from some rule are eligible for that row.
  const eligibleControlIds = new Set<string>([...linkedControlsByRule.values()].flat());
  const evaluatedControlIds = new Set<string>();
  const batch = db.batch();

  for (const factor of factors) {
    const controlIds = linkedControlsByRule.get(factor.ruleCode) ?? [];
    for (const controlId of controlIds) {
      const control = controlById.get(controlId);
      if (!control || control.status !== "active") continue;
      evaluatedControlIds.add(controlId);

      let result: ComplianceResultValue;
      if (factor.insufficientData) result = "needs_review";
      else if (factor.triggered) result = "fail";
      else result = "pass";

      const ref = db.collection("complianceResults").doc();
      batch.set(ref, {
        transactionId,
        customerId,
        controlId,
        frameworkId: control.frameworkId,
        ruleCode: factor.ruleCode,
        result,
        reason: factor.reason,
        severity: factor.triggered ? severityFor(factor.score) : null,
        riskContribution: factor.score,
        evidenceIds,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Controls with no rule evaluated at all for this transaction are explicitly
  // not-applicable, rather than silently absent from the analysis — but only
  // for controls a rule could ever reach; the rest are skipped entirely.
  for (const [controlId, control] of controlById) {
    if (control.status !== "active" || evaluatedControlIds.has(controlId) || !eligibleControlIds.has(controlId)) continue;
    const ref = db.collection("complianceResults").doc();
    batch.set(ref, {
      transactionId,
      customerId,
      controlId,
      frameworkId: control.frameworkId,
      ruleCode: null,
      result: "not_applicable" as ComplianceResultValue,
      reason: "No monitoring rule linked to this control applied to this transaction.",
      severity: null,
      riskContribution: 0,
      evidenceIds: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}
