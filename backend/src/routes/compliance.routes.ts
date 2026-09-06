import { Router } from "express";
import { z } from "zod";
import { db, FieldValue } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../utils/audit";
import { emitAlertUpdated } from "../realtime/socket";
import { asyncHandler } from "../utils/asyncHandler";
import { localDateKey } from "../utils/dateKey";

export const complianceRouter = Router();
complianceRouter.use(requireAuth, requireRole("compliance_officer"));

complianceRouter.get("/dashboard/kpis", asyncHandler(async (_req, res) => {
  const [customers, transactions, alertsOpen, alertsCritical, kycIssues] = await Promise.all([
    db.collection("customers").count().get(),
    db.collection("transactions").count().get(),
    db.collection("complianceAlerts").where("status", "in", ["new", "under_review", "escalated"]).count().get(),
    db.collection("complianceAlerts").where("riskLevel", "==", "critical").where("status", "!=", "closed").count().get(),
    db.collection("kycRecords").where("status", "in", ["pending", "expired", "rejected"]).count().get(),
  ]);

  res.json({
    totalCustomers: customers.data().count,
    totalTransactions: transactions.data().count,
    openAlerts: alertsOpen.data().count,
    criticalAlerts: alertsCritical.data().count,
    kycIssues: kycIssues.data().count,
  });
}));

complianceRouter.get("/dashboard/risk-trend", asyncHandler(async (_req, res) => {
  const days = 14;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const cutoff = new Date(dayStart);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  // Single range filter on createdAt — no composite index needed, same shape
  // already used elsewhere for dashboard trend charts.
  const snap = await db.collection("transactions").where("createdAt", ">=", cutoff).get();

  const countsByDay = new Map<string, { total: number; low: number; medium: number; high: number; critical: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff);
    d.setDate(cutoff.getDate() + i);
    countsByDay.set(localDateKey(d), { total: 0, low: 0, medium: 0, high: 0, critical: 0 });
  }

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.();
    if (!createdAt) return;
    const bucket = countsByDay.get(localDateKey(createdAt));
    if (!bucket) return;
    bucket.total++;
    const level = data.riskLevel as string | null;
    if (level === "low" || level === "medium" || level === "high" || level === "critical") bucket[level]++;
  });

  res.json([...countsByDay.entries()].map(([date, v]) => ({ date, ...v })));
}));

complianceRouter.get("/transactions", asyncHandler(async (req, res) => {
  const { riskLevel, status, limit } = req.query;
  let q: FirebaseFirestore.Query = db.collection("transactions");
  if (riskLevel) q = q.where("riskLevel", "==", riskLevel);
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc").limit(Number(limit ?? 50));
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

complianceRouter.get("/transactions/:id", asyncHandler(async (req, res) => {
  const txSnap = await db.collection("transactions").doc(req.params.id).get();
  if (!txSnap.exists) return res.status(404).json({ error: "Not found" });
  const tx = txSnap.data()!;

  const [riskSnap, alertsSnap, customerSnap, evidenceSnap, resultsSnap] = await Promise.all([
    db.collection("riskScores").where("transactionId", "==", req.params.id).orderBy("calculatedAt", "desc").limit(1).get(),
    db.collection("complianceAlerts").where("transactionId", "==", req.params.id).get(),
    tx.senderCustomerId ? db.collection("customers").doc(tx.senderCustomerId).get() : Promise.resolve(null),
    db.collection("evidence").where("relatedTransactionId", "==", req.params.id).get(),
    db.collection("complianceResults").where("transactionId", "==", req.params.id).get(),
  ]);

  const controlIds = [...new Set(resultsSnap.docs.map((d) => d.data().controlId).filter(Boolean))];
  const controlDocs = controlIds.length
    ? await db.getAll(...controlIds.map((id) => db.collection("complianceControls").doc(id)))
    : [];
  const controlById = new Map(controlDocs.map((d) => [d.id, d.data()]));

  const frameworkIds = [...new Set(controlDocs.map((d) => d.data()?.frameworkId).filter(Boolean))];
  const frameworkDocs = frameworkIds.length
    ? await db.getAll(...frameworkIds.map((id: string) => db.collection("complianceFrameworks").doc(id)))
    : [];
  const frameworkById = new Map(frameworkDocs.map((d) => [d.id, d.data()]));

  const complianceAnalysis = resultsSnap.docs.map((d) => {
    const r = d.data();
    const control = controlById.get(r.controlId) ?? null;
    const framework = control ? frameworkById.get(control.frameworkId) ?? null : null;
    return {
      id: d.id,
      ...r,
      control: control ? { ...control, frameworkName: framework?.name ?? null } : null,
    };
  });
  const summary = { pass: 0, fail: 0, needs_review: 0, not_applicable: 0 };
  complianceAnalysis.forEach((r: any) => { if (r.result in summary) summary[r.result as keyof typeof summary]++; });

  res.json({
    transaction: { id: txSnap.id, ...tx },
    riskScore: riskSnap.empty ? null : { id: riskSnap.docs[0].id, ...riskSnap.docs[0].data() },
    alerts: alertsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    customer: customerSnap && customerSnap.exists ? { id: customerSnap.id, ...customerSnap.data() } : null,
    evidence: evidenceSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    complianceAnalysis,
    complianceSummary: summary,
  });
}));

complianceRouter.get("/alerts", asyncHandler(async (req, res) => {
  const { status } = req.query;
  let q: FirebaseFirestore.Query = db.collection("complianceAlerts");
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc").limit(100);
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

complianceRouter.get("/alerts/:id", asyncHandler(async (req, res) => {
  const alertSnap = await db.collection("complianceAlerts").doc(req.params.id).get();
  if (!alertSnap.exists) return res.status(404).json({ error: "Not found" });
  const alert = alertSnap.data()!;

  const [txSnap, investigationsSnap, evidenceSnap] = await Promise.all([
    alert.transactionId ? db.collection("transactions").doc(alert.transactionId).get() : Promise.resolve(null),
    db.collection("investigations").where("alertId", "==", req.params.id).orderBy("updatedAt", "desc").get(),
    alert.evidenceIds?.length
      ? db.collection("evidence").where("__name__", "in", alert.evidenceIds.slice(0, 10)).get()
      : Promise.resolve({ docs: [] } as any),
  ]);

  res.json({
    alert: { id: alertSnap.id, ...alert },
    transaction: txSnap && txSnap.exists ? { id: txSnap.id, ...txSnap.data() } : null,
    investigations: investigationsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
    evidence: evidenceSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
  });
}));

async function updateAlert(req: any, res: any, updates: Record<string, unknown>, action: string, note?: string) {
  const ref = db.collection("complianceAlerts").doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });

  await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });

  if (note !== undefined) {
    await db.collection("investigations").add({
      alertId: req.params.id,
      officerId: req.user.uid,
      notes: note,
      outcome: action,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await writeAuditLog({
    userId: req.user.uid,
    role: req.user.role,
    action: `alert.${action}`,
    resource: "complianceAlerts",
    resourceId: req.params.id,
    description: `${req.user.email} performed ${action} on alert ${req.params.id}.`,
    previousValue: snap.data(),
    newValue: updates,
    ip: req.ip,
  });

  const updated = await ref.get();
  emitAlertUpdated({ id: updated.id, ...updated.data() });
  res.json({ id: updated.id, ...updated.data() });
}

const noteSchema = z.object({ note: z.string().min(1) });
complianceRouter.post("/alerts/:id/notes", asyncHandler(async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Note text required" });
  await updateAlert(req, res, {}, "note_added", parsed.data.note);
}));

complianceRouter.post("/alerts/:id/false-positive", asyncHandler(async (req, res) => {
  await updateAlert(req, res, { status: "false_positive" }, "false_positive", req.body.note ?? "Marked as false positive.");
}));

complianceRouter.post("/alerts/:id/resolve", asyncHandler(async (req, res) => {
  await updateAlert(req, res, { status: "resolved" }, "resolved", req.body.note ?? "Resolved.");
}));

complianceRouter.post("/alerts/:id/close", asyncHandler(async (req, res) => {
  await updateAlert(req, res, { status: "closed" }, "closed", req.body.note ?? "Case closed.");
}));

complianceRouter.get("/customers/:id/risk-profile", asyncHandler(async (req, res) => {
  const [customerSnap, kycSnap, accountsSnap, alertsSnap] = await Promise.all([
    db.collection("customers").doc(req.params.id).get(),
    db.collection("kycRecords").where("customerId", "==", req.params.id).limit(1).get(),
    db.collection("accounts").where("customerId", "==", req.params.id).get(),
    db.collection("complianceAlerts").where("customerId", "==", req.params.id).orderBy("createdAt", "desc").limit(20).get(),
  ]);
  if (!customerSnap.exists) return res.status(404).json({ error: "Not found" });

  const accountIds = accountsSnap.docs.map((d) => d.id);
  let transactions: any[] = [];
  if (accountIds.length) {
    const txSnap = await db
      .collection("transactions")
      .where("senderAccountId", "in", accountIds.slice(0, 10))
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  res.json({
    customer: { id: customerSnap.id, ...customerSnap.data() },
    kyc: kycSnap.empty ? null : kycSnap.docs[0].data(),
    accounts: accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    transactions,
    alerts: alertsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}));

complianceRouter.get("/kyc", asyncHandler(async (req, res) => {
  const { status } = req.query;
  let q: FirebaseFirestore.Query = db.collection("kycRecords");
  if (status) q = q.where("status", "==", status);
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

complianceRouter.get("/evidence", asyncHandler(async (req, res) => {
  const { customerId, transactionId } = req.query;
  let q: FirebaseFirestore.Query = db.collection("evidence");
  if (customerId) q = q.where("relatedCustomerId", "==", customerId);
  if (transactionId) q = q.where("relatedTransactionId", "==", transactionId);
  q = q.orderBy("collectedAt", "desc").limit(100);
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

complianceRouter.get("/evidence/:id", asyncHandler(async (req, res) => {
  const snap = await db.collection("evidence").doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  res.json({ id: snap.id, ...snap.data() });
}));

complianceRouter.get("/controls", asyncHandler(async (_req, res) => {
  const snap = await db.collection("complianceControls").get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

// ---------------------------------------------------------------------------
// Frameworks, control traceability, and the compliance matrix
// ---------------------------------------------------------------------------

complianceRouter.get("/frameworks", asyncHandler(async (_req, res) => {
  const [frameworksSnap, controlsSnap, resultsSnap] = await Promise.all([
    db.collection("complianceFrameworks").get(),
    db.collection("complianceControls").get(),
    db.collection("complianceResults").get(),
  ]);

  const controlsByFramework = new Map<string, string[]>();
  controlsSnap.docs.forEach((d) => {
    const fw = d.data().frameworkId;
    controlsByFramework.set(fw, [...(controlsByFramework.get(fw) ?? []), d.id]);
  });

  const resultCountsByControl = new Map<string, Record<string, number>>();
  resultsSnap.docs.forEach((d) => {
    const { controlId, result } = d.data();
    const counts = resultCountsByControl.get(controlId) ?? { pass: 0, fail: 0, needs_review: 0, not_applicable: 0 };
    counts[result] = (counts[result] ?? 0) + 1;
    resultCountsByControl.set(controlId, counts);
  });

  const frameworks = frameworksSnap.docs.map((d) => {
    const controlIds = controlsByFramework.get(d.id) ?? [];
    let pass = 0, fail = 0, needsReview = 0, notApplicable = 0;
    controlIds.forEach((cid) => {
      const c = resultCountsByControl.get(cid);
      if (c) { pass += c.pass; fail += c.fail; needsReview += c.needs_review; notApplicable += c.not_applicable; }
    });
    const evaluated = pass + fail + needsReview;
    const compliancePercentage = evaluated > 0 ? Math.round((pass / evaluated) * 100) : null;
    return {
      id: d.id,
      ...d.data(),
      totalControls: controlIds.length,
      pass,
      fail,
      needsReview,
      notApplicable,
      compliancePercentage,
    };
  });

  res.json(frameworks);
}));

complianceRouter.get("/frameworks/:id", asyncHandler(async (req, res) => {
  const [fwSnap, controlsSnap, resultsSnap] = await Promise.all([
    db.collection("complianceFrameworks").doc(req.params.id).get(),
    db.collection("complianceControls").where("frameworkId", "==", req.params.id).get(),
    // One query for the whole framework instead of one per control (was N+1).
    db.collection("complianceResults").where("frameworkId", "==", req.params.id).get(),
  ]);
  if (!fwSnap.exists) return res.status(404).json({ error: "Not found" });

  const countsByControl = new Map<string, { pass: number; fail: number; needs_review: number; not_applicable: number }>();
  resultsSnap.docs.forEach((r) => {
    const data = r.data();
    const counts = countsByControl.get(data.controlId) ?? { pass: 0, fail: 0, needs_review: 0, not_applicable: 0 };
    if (data.result in counts) (counts as any)[data.result]++;
    countsByControl.set(data.controlId, counts);
  });

  const controls = controlsSnap.docs.map((c) => ({
    id: c.id,
    ...c.data(),
    resultCounts: countsByControl.get(c.id) ?? { pass: 0, fail: 0, needs_review: 0, not_applicable: 0 },
  }));

  const mostViolated = [...controls].sort((a, b) => b.resultCounts.fail - a.resultCounts.fail).slice(0, 5);

  res.json({ framework: { id: fwSnap.id, ...fwSnap.data() }, controls, mostViolated });
}));

const complianceFrameworkSchema = z.object({
  name: z.string().min(2),
  version: z.string().min(1),
  source: z.string().optional(),
  description: z.string().optional(),
});

complianceRouter.post("/frameworks", asyncHandler(async (req, res) => {
  const parsed = complianceFrameworkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const ref = await db.collection("complianceFrameworks").add({ ...parsed.data, createdAt: FieldValue.serverTimestamp() });
  await writeAuditLog({
    userId: req.user!.uid,
    role: req.user!.role,
    action: "framework.created",
    resource: "complianceFrameworks",
    resourceId: ref.id,
    description: `${req.user!.email} added framework ${parsed.data.name} v${parsed.data.version}.`,
    ip: req.ip,
  });
  res.status(201).json({ id: ref.id });
}));

const complianceControlSchema = z.object({
  frameworkId: z.string(),
  controlId: z.string().min(1),
  name: z.string().min(2),
  requirement: z.string().min(2),
  category: z.string().optional(),
  source: z.string().optional(),
  version: z.string().optional(),
});

// Accepts either one control or a bulk array under `controls`, so an entire
// uploaded framework's control set can be imported in one call.
complianceRouter.post("/controls", asyncHandler(async (req, res) => {
  const bulk = z.array(complianceControlSchema).safeParse(req.body.controls);
  const single = complianceControlSchema.safeParse(req.body);
  const items = bulk.success ? bulk.data : single.success ? [single.data] : null;
  if (!items) return res.status(400).json({ error: "Invalid control payload." });

  const batch = db.batch();
  const ids: string[] = [];
  for (const item of items) {
    const ref = db.collection("complianceControls").doc();
    ids.push(ref.id);
    batch.set(ref, { ...item, status: "active", evidenceCount: 0, lastChecked: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();

  await writeAuditLog({
    userId: req.user!.uid,
    role: req.user!.role,
    action: "control.created",
    resource: "complianceControls",
    description: `${req.user!.email} imported ${items.length} control(s).`,
    newValue: { count: items.length },
    ip: req.ip,
  });

  res.status(201).json({ ids });
}));

complianceRouter.get("/controls/:id", asyncHandler(async (req, res) => {
  const controlSnap = await db.collection("complianceControls").doc(req.params.id).get();
  if (!controlSnap.exists) return res.status(404).json({ error: "Not found" });
  const control = controlSnap.data()!;

  const [frameworkSnap, rulesSnap, resultsSnap] = await Promise.all([
    control.frameworkId ? db.collection("complianceFrameworks").doc(control.frameworkId).get() : Promise.resolve(null),
    db.collection("complianceRules").where("linkedControlIds", "array-contains", req.params.id).get(),
    db.collection("complianceResults").where("controlId", "==", req.params.id).orderBy("createdAt", "desc").limit(50).get(),
  ]);

  const violatingResults = resultsSnap.docs.filter((d) => d.data().result === "fail");
  const violatingTransactionIds = [...new Set(violatingResults.map((d) => d.data().transactionId))];
  const relatedAlertsSnap = violatingTransactionIds.length
    ? await db.collection("complianceAlerts").where("transactionId", "in", violatingTransactionIds.slice(0, 10)).get()
    : { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] };

  res.json({
    control: { id: controlSnap.id, ...control },
    framework: frameworkSnap && frameworkSnap.exists ? { id: frameworkSnap.id, ...frameworkSnap.data() } : null,
    linkedRules: rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    recentResults: resultsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    violatingTransactionIds,
    relatedAlerts: relatedAlertsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}));

const controlStatusSchema = z.object({ status: z.enum(["active", "inactive"]) });

complianceRouter.patch("/controls/:id/status", asyncHandler(async (req, res) => {
  const parsed = controlStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const ref = db.collection("complianceControls").doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const control = snap.data()!;

  await ref.update({ status: parsed.data.status, updatedAt: FieldValue.serverTimestamp() });

  await writeAuditLog({
    userId: req.user!.uid,
    role: req.user!.role,
    action: "control.status_changed",
    resource: "complianceControls",
    resourceId: req.params.id,
    description: `${req.user!.email} set control ${control.controlId} (${control.name}) to ${parsed.data.status}.`,
    previousValue: { status: control.status },
    newValue: { status: parsed.data.status },
    ip: req.ip,
  });

  res.json({ id: req.params.id, status: parsed.data.status });
}));

complianceRouter.get("/matrix", asyncHandler(async (req, res) => {
  const { result, severity, frameworkId, limit } = req.query;
  let q: FirebaseFirestore.Query = db.collection("complianceResults");
  if (result) q = q.where("result", "==", result);
  if (severity) q = q.where("severity", "==", severity);
  if (frameworkId) q = q.where("frameworkId", "==", frameworkId);
  q = q.orderBy("createdAt", "desc").limit(Number(limit ?? 100));
  const snap = await q.get();

  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const controlIds = [...new Set(rows.map((r: any) => r.controlId).filter(Boolean))];
  const controlDocs = controlIds.length ? await db.getAll(...controlIds.map((id: string) => db.collection("complianceControls").doc(id))) : [];
  const controlById = new Map(controlDocs.map((d) => [d.id, d.data()]));

  res.json(rows.map((r: any) => ({ ...r, control: controlById.get(r.controlId) ?? null })));
}));

complianceRouter.get("/audit-logs", asyncHandler(async (req, res) => {
  const snap = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(Number(req.query.limit ?? 100)).get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));
