import { Router } from "express";
import { z } from "zod";
import { auth, db, FieldValue } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../utils/audit";
import { ROLES } from "../types/roles";
import { generateTempPassword } from "../utils/ids";
import { generateSequentialStaffUserId } from "../utils/unique";
import { renderStaffCredentialsEmail, sendEmail } from "../utils/email";
import { readKycDocument } from "../utils/fileStorage";
import { provisionClientFromApplication } from "../services/accountProvisioning";
import { asyncHandler } from "../utils/asyncHandler";
import { isLocked } from "../config/lockout";
import { emitLoginResolved } from "../realtime/socket";
import { localDateKey } from "../utils/dateKey";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

// ---------------------------------------------------------------------------
// Login approval — Employee and Admin logins wait here for a live admin to
// approve or deny before a session token is ever issued.
// ---------------------------------------------------------------------------

// The requesting client gives up polling after ~5.3 minutes (see AuthContext's
// APPROVAL_MAX_POLLS), but that's purely client-side — nothing ever updated the
// Firestore doc, so an abandoned request (closed tab, expired session) stayed
// "pending" forever and kept reappearing in the admin's approval panel on every
// dashboard load. Lazily expire anything past that window here instead.
const LOGIN_REQUEST_EXPIRY_MS = 6 * 60 * 1000;

adminRouter.get("/login-requests", asyncHandler(async (req, res) => {
  const status = (req.query.status as string) ?? "pending";
  const snap = await db.collection("loginRequests").where("status", "==", status).orderBy("createdAt", "desc").limit(50).get();

  if (status !== "pending") {
    return res.json(snap.docs.map((d) => ({ id: d.id, ...d.data(), customToken: undefined })));
  }

  const now = Date.now();
  const stillPending: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const expired: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const doc of snap.docs) {
    const createdAtMs = doc.data().createdAt?.toMillis?.() ?? now;
    (now - createdAtMs > LOGIN_REQUEST_EXPIRY_MS ? expired : stillPending).push(doc);
  }
  if (expired.length) {
    const batch = db.batch();
    expired.forEach((doc) => batch.update(doc.ref, { status: "expired", resolvedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }
  res.json(stillPending.map((d) => ({ id: d.id, ...d.data(), customToken: undefined })));
}));

adminRouter.post("/login-requests/:id/approve", asyncHandler(async (req, res) => {
  const ref = db.collection("loginRequests").doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const request = snap.data()!;
  if (request.status !== "pending") return res.status(409).json({ error: `Already ${request.status}.` });

  const customToken = await auth.createCustomToken(request.uid, { role: request.role });
  await ref.update({ status: "approved", customToken, approvedBy: req.user!.uid, resolvedAt: FieldValue.serverTimestamp() });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "auth.login_approved",
    resource: "loginRequests",
    resourceId: req.params.id,
    description: `Admin approved login for ${request.userId} (${request.role}).`,
    ip: req.ip,
  });

  emitLoginResolved(req.params.id);
  res.status(204).end();
}));

adminRouter.post("/login-requests/:id/deny", asyncHandler(async (req, res) => {
  const ref = db.collection("loginRequests").doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const request = snap.data()!;
  if (request.status !== "pending") return res.status(409).json({ error: `Already ${request.status}.` });

  await ref.update({ status: "denied", approvedBy: req.user!.uid, resolvedAt: FieldValue.serverTimestamp() });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "auth.login_denied",
    resource: "loginRequests",
    resourceId: req.params.id,
    description: `Admin denied login for ${request.userId} (${request.role}).`,
    ip: req.ip,
  });

  emitLoginResolved(req.params.id);
  res.status(204).end();
}));

adminRouter.get("/dashboard", asyncHandler(async (_req, res) => {
  const [users, customers, transactions, rules, alerts, pendingApps, criticalAlerts, highRiskCustomers] = await Promise.all([
    db.collection("users").count().get(),
    db.collection("customers").count().get(),
    db.collection("transactions").count().get(),
    db.collection("complianceRules").count().get(),
    db.collection("complianceAlerts").where("status", "!=", "closed").count().get(),
    db.collection("clientApplications").where("status", "==", "pending_approval").count().get(),
    db.collection("complianceAlerts").where("riskLevel", "==", "critical").where("status", "!=", "closed").count().get(),
    db.collection("transactions").where("riskLevel", "in", ["high", "critical"]).count().get(),
  ]);
  res.json({
    totalUsers: users.data().count,
    totalCustomers: customers.data().count,
    totalTransactions: transactions.data().count,
    totalRules: rules.data().count,
    openAlerts: alerts.data().count,
    pendingApplications: pendingApps.data().count,
    criticalAlerts: criticalAlerts.data().count,
    highRiskTransactions: highRiskCustomers.data().count,
  });
}));

const CASH_IN_TYPES = new Set(["cash_in", "deposit", "dps_deposit"]);
const TRANSFER_TYPES = new Set(["transfer", "fund_transfer"]);
const WITHDRAWAL_TYPES = new Set(["withdrawal", "cash_out"]);

adminRouter.get("/dashboard/transaction-activity", asyncHandler(async (_req, res) => {
  const daysBack = 6;
  const daysForward = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - daysBack);

  const snap = await db.collection("transactions").where("createdAt", ">=", cutoff).get();

  const byDay = new Map<string, { cashIn: number; transfer: number; withdrawal: number }>();
  for (let i = -daysBack; i <= daysForward; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    byDay.set(localDateKey(d), { cashIn: 0, transfer: 0, withdrawal: 0 });
  }

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.();
    if (!createdAt) return;
    const bucket = byDay.get(localDateKey(createdAt));
    if (!bucket) return;
    const amount = Number(data.amount ?? 0);
    if (CASH_IN_TYPES.has(data.type)) bucket.cashIn += amount;
    else if (TRANSFER_TYPES.has(data.type)) bucket.transfer += amount;
    else if (WITHDRAWAL_TYPES.has(data.type)) bucket.withdrawal += amount;
  });

  res.json([...byDay.entries()].map(([date, v]) => ({ date, cashIn: v.cashIn, transfer: v.transfer, withdrawal: v.withdrawal })));
}));

adminRouter.get("/dashboard/suspicious-transactions", asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit ?? 8);
  // A plain "in" filter (single field) is always auto-indexed; adding orderBy(createdAt)
  // on top would need a composite index this environment can't provision, so sort in memory.
  const snap = await db.collection("transactions").where("riskLevel", "in", ["high", "critical"]).get();
  const sorted = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, limit);

  const customerIds = [...new Set(sorted.map((t: any) => t.senderCustomerId).filter(Boolean))];
  const customerDocs = customerIds.length ? await db.getAll(...customerIds.map((id) => db.collection("customers").doc(id))) : [];
  const customerNameById = new Map(customerDocs.map((d) => [d.id, d.exists ? d.data()!.fullName : null]));

  res.json(
    sorted.map((t: any) => ({
      id: t.id,
      reference: t.reference,
      customerName: customerNameById.get(t.senderCustomerId) ?? "Unknown",
      amount: t.amount,
      currency: t.currency,
      type: t.type,
      riskLevel: t.riskLevel,
      riskScore: t.riskScore,
      status: t.status,
      createdAt: t.createdAt,
    }))
  );
}));

// Which monitoring rule(s) fired on this transaction, and which framework
// control each one violates — traces Transaction -> Rule -> Control -> Framework.
adminRouter.get("/dashboard/suspicious-transactions/:id/violations", asyncHandler(async (req, res) => {
  // Single equality filter only (no compound where), so no composite index is needed;
  // a transaction has a handful of compliance results at most, so filtering in memory is cheap.
  const resultsSnap = await db.collection("complianceResults").where("transactionId", "==", req.params.id).get();
  const failedResults = resultsSnap.docs.map((d) => d.data()).filter((r) => r.result === "fail");

  const controlIds = [...new Set(failedResults.map((r) => r.controlId).filter(Boolean))];
  const controlDocs = controlIds.length ? await db.getAll(...controlIds.map((id: string) => db.collection("complianceControls").doc(id))) : [];
  const controlById = new Map(controlDocs.map((d) => [d.id, d.data()]));

  const frameworkIds = [...new Set(controlDocs.map((d) => d.data()?.frameworkId).filter(Boolean))];
  const frameworkDocs = frameworkIds.length ? await db.getAll(...frameworkIds.map((id: string) => db.collection("complianceFrameworks").doc(id))) : [];
  const frameworkById = new Map(frameworkDocs.map((d) => [d.id, d.data()]));

  res.json(
    failedResults.map((r) => {
      const control = controlById.get(r.controlId);
      const framework = control ? frameworkById.get(control.frameworkId) : null;
      return {
        ruleCode: r.ruleCode,
        reason: r.reason,
        severity: r.severity,
        controlId: control?.controlId ?? null,
        controlName: control?.name ?? null,
        frameworkName: framework?.name ?? null,
        frameworkSource: framework?.source ?? null,
      };
    })
  );
}));

// ---------------------------------------------------------------------------
// Compliance alerts — read-only for admin, so they can see the same alerts,
// rule violations, and risk scores compliance works with, without taking over
// the investigation actions (notes/false-positive/resolve/close stay
// compliance-officer-only, on the compliance router).
// ---------------------------------------------------------------------------

adminRouter.get("/alerts", asyncHandler(async (req, res) => {
  const { status } = req.query;
  let q: FirebaseFirestore.Query = db.collection("complianceAlerts");
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc").limit(100);
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

adminRouter.get("/alerts/:id", asyncHandler(async (req, res) => {
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

// ---------------------------------------------------------------------------
// Client applications (KYC review + approval)
// ---------------------------------------------------------------------------

adminRouter.get("/applications", asyncHandler(async (req, res) => {
  const { status } = req.query;
  let q: FirebaseFirestore.Query = db.collection("clientApplications");
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc").limit(100);
  const snap = await q.get();
  res.json(
    snap.docs.map((d) => {
      const data = d.data();
      const { documents, ...rest } = data;
      return { id: d.id, ...rest, hasDocuments: Boolean(documents) };
    })
  );
}));

adminRouter.get("/applications/:id", asyncHandler(async (req, res) => {
  const snap = await db.collection("clientApplications").doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "kyc.reviewed",
    resource: "clientApplications",
    resourceId: req.params.id,
    description: `Admin viewed application ${req.params.id}.`,
    ip: req.ip,
  });

  res.json({ id: snap.id, ...snap.data() });
}));

// Documents are streamed through this authenticated, admin-only route rather
// than a public URL — "sensitive KYC documents must only be accessible to
// authorized users" (spec section 5).
adminRouter.get("/applications/:id/document/:kind", asyncHandler(async (req, res) => {
  const snap = await db.collection("clientApplications").doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const documents = snap.data()!.documents;
  const doc = documents?.[req.params.kind];
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const stored = await readKycDocument(req.params.id, doc.filename);
  if (!stored) return res.status(404).json({ error: "Document not found" });
  res.setHeader("Content-Type", stored.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(stored.buffer);
}));

adminRouter.post("/applications/:id/approve", asyncHandler(async (req, res) => {
  try {
    const result = await provisionClientFromApplication(req.params.id, req.user!.uid);
    res.json({ status: "approved", ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Approval failed." });
  }
}));

const reviewSchema = z.object({ remarks: z.string().min(1) });

adminRouter.post("/applications/:id/reject", asyncHandler(async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Remarks are required." });
  const ref = db.collection("clientApplications").doc(req.params.id);
  await ref.update({ status: "rejected", reviewRemarks: parsed.data.remarks, reviewedBy: req.user!.uid, reviewedAt: FieldValue.serverTimestamp() });
  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "kyc.rejected",
    resource: "clientApplications",
    resourceId: req.params.id,
    description: `Application rejected: ${parsed.data.remarks}`,
    ip: req.ip,
  });
  res.status(204).end();
}));

adminRouter.post("/applications/:id/request-info", asyncHandler(async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Remarks are required." });
  const ref = db.collection("clientApplications").doc(req.params.id);
  await ref.update({ status: "info_requested", reviewRemarks: parsed.data.remarks, reviewedBy: req.user!.uid, reviewedAt: FieldValue.serverTimestamp() });
  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "kyc.info_requested",
    resource: "clientApplications",
    resourceId: req.params.id,
    description: `More information requested: ${parsed.data.remarks}`,
    ip: req.ip,
  });
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Staff (Employee / Compliance Officer / Admin) accounts
// ---------------------------------------------------------------------------

adminRouter.get("/users", asyncHandler(async (_req, res) => {
  const snap = await db.collection("users").orderBy("createdAt", "desc").limit(100).get();
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const customerIds = [...new Set(users.map((u: any) => u.customerId).filter(Boolean))];
  const accountsByCustomer = new Map<string, { id: string; accountNumber: string; accountType: string }[]>();
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const accountsSnap = await db.collection("accounts").where("customerId", "in", chunk).get();
    accountsSnap.docs.forEach((a) => {
      const data = a.data();
      const entry = { id: a.id, accountNumber: data.accountNumber, accountType: data.accountType };
      accountsByCustomer.set(data.customerId, [...(accountsByCustomer.get(data.customerId) ?? []), entry]);
    });
  }

  res.json(
    users.map((u: any) => ({
      ...u,
      locked: isLocked(u.failedLoginCount, u.lastFailedLoginAt),
      accounts: u.customerId ? accountsByCustomer.get(u.customerId) ?? [] : [],
    }))
  );
}));

adminRouter.delete("/accounts/:id", asyncHandler(async (req, res) => {
  const ref = db.collection("accounts").doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const account = snap.data()!;

  if (Number(account.balance) !== 0) {
    return res.status(400).json({ error: "This account still has a balance. Move the funds out before deleting it." });
  }

  await ref.delete();

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "account.deleted",
    resource: "accounts",
    resourceId: req.params.id,
    description: `Admin deleted ${account.accountType} account ${account.accountNumber}.`,
    previousValue: { accountNumber: account.accountNumber, accountType: account.accountType, customerId: account.customerId },
    ip: req.ip,
  });

  res.status(204).end();
}));

const createStaffSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    role: z.enum(["employee", "compliance_officer", "admin"]),
    permissions: z.array(z.string()).optional(),
    // Banking Executive accounts have their User ID and password set by the
    // admin directly, instead of the auto-generated ones used for other roles.
    userId: z.string().min(3).max(20).optional(),
    password: z.string().min(8).optional(),
  })
  .refine((v) => v.role !== "employee" || Boolean(v.userId), { message: "User ID is required for a Banking Executive account.", path: ["userId"] })
  .refine((v) => v.role !== "employee" || Boolean(v.password), { message: "Password is required for a Banking Executive account.", path: ["password"] });

adminRouter.post("/users", asyncHandler(async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { fullName, email, role, permissions } = parsed.data;

  try {
    let userId: string;
    let tempPassword: string;
    if (role === "employee") {
      userId = parsed.data.userId!;
      tempPassword = parsed.data.password!;
      const existing = await db.collection("users").where("userId", "==", userId).limit(1).get();
      if (!existing.empty) return res.status(409).json({ error: "That User ID is already taken." });
    } else {
      [userId, tempPassword] = await Promise.all([generateSequentialStaffUserId(), Promise.resolve(generateTempPassword())]);
    }
    const userRecord = await auth.createUser({ email, password: tempPassword, displayName: fullName });
    await db.collection("users").doc(userRecord.uid).set({
      email,
      fullName,
      userId,
      role,
      permissions: permissions ?? [],
      status: "active",
      mustChangePassword: true,
      failedLoginCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    const { subject, text, html } = renderStaffCredentialsEmail({ fullName, role, userId, tempPassword });
    const emailResult = await sendEmail({ to: email, subject, text, html, type: "staff_credentials" });

    await writeAuditLog({
      userId: req.user!.uid,
      role: "admin",
      action: "user.created",
      resource: "users",
      resourceId: userRecord.uid,
      description: `Admin created ${role} account for ${email} (User ID ${userId}).`,
      newValue: { role },
      ip: req.ip,
    });

    res.status(201).json({ uid: userRecord.uid, userId, tempPassword, emailDelivered: emailResult.delivered });
  } catch (err: any) {
    if (err?.errorInfo?.code === "auth/email-already-exists") {
      return res.status(409).json({ error: "Email already in use." });
    }
    res.status(500).json({ error: "Failed to create user." });
  }
}));

const statusSchema = z.object({ status: z.enum(["active", "suspended", "disabled"]) });
adminRouter.patch("/users/:uid/status", asyncHandler(async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" });
  const ref = db.collection("users").doc(req.params.uid);
  const before = await ref.get();
  await ref.update({ status: parsed.data.status });
  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "user.status_changed",
    resource: "users",
    resourceId: req.params.uid,
    description: `Admin set status to ${parsed.data.status}.`,
    previousValue: before.data()?.status,
    newValue: parsed.data.status,
    ip: req.ip,
  });
  res.status(204).end();
}));

adminRouter.post("/users/:uid/unlock", asyncHandler(async (req, res) => {
  const ref = db.collection("users").doc(req.params.uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });

  await ref.update({ failedLoginCount: 0, lastFailedLoginAt: FieldValue.delete() });
  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "user.unlocked",
    resource: "users",
    resourceId: req.params.uid,
    description: `Admin cleared the login lockout for ${snap.data()!.email}.`,
    ip: req.ip,
  });
  res.status(204).end();
}));

adminRouter.delete("/users/:uid", asyncHandler(async (req, res) => {
  if (req.params.uid === req.user!.uid) {
    return res.status(400).json({ error: "You can't delete your own account." });
  }
  const ref = db.collection("users").doc(req.params.uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const user = snap.data()!;

  let cascaded: { accounts: number; kycRecords: number; beneficiaries: number } | null = null;

  if (user.role === "client" && user.customerId) {
    const accountsSnap = await db.collection("accounts").where("customerId", "==", user.customerId).get();
    const nonZero = accountsSnap.docs.find((a) => Number(a.data().balance) !== 0);
    if (nonZero) {
      return res.status(400).json({
        error: `Can't delete: account ${nonZero.data().accountNumber} still has a balance. Move the funds out first.`,
      });
    }

    const [kycSnap, beneficiariesSnap] = await Promise.all([
      db.collection("kycRecords").where("customerId", "==", user.customerId).get(),
      db.collection("beneficiaries").where("customerId", "==", user.customerId).get(),
    ]);

    const batch = db.batch();
    accountsSnap.docs.forEach((a) => batch.delete(a.ref));
    kycSnap.docs.forEach((k) => batch.delete(k.ref));
    beneficiariesSnap.docs.forEach((b) => batch.delete(b.ref));
    batch.delete(db.collection("customers").doc(user.customerId));
    await batch.commit();

    cascaded = { accounts: accountsSnap.size, kycRecords: kycSnap.size, beneficiaries: beneficiariesSnap.size };
  }

  await auth.deleteUser(req.params.uid).catch((err: any) => {
    if (err?.errorInfo?.code !== "auth/user-not-found") throw err;
  });
  await ref.delete();

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "user.deleted",
    resource: "users",
    resourceId: req.params.uid,
    description: cascaded
      ? `Admin deleted client ${user.email} (User ID ${user.userId ?? "—"}) and their ${cascaded.accounts} account(s), customer profile, and KYC record.`
      : `Admin deleted ${user.role} account for ${user.email} (User ID ${user.userId ?? "—"}).`,
    previousValue: { email: user.email, role: user.role, userId: user.userId, cascaded },
    ip: req.ip,
  });

  res.status(204).end();
}));

adminRouter.post("/users/:uid/reset-credentials", asyncHandler(async (req, res) => {
  const ref = db.collection("users").doc(req.params.uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const user = snap.data()!;

  const tempPassword = generateTempPassword();
  await auth.updateUser(req.params.uid, { password: tempPassword });
  await ref.update({ mustChangePassword: true, failedLoginCount: 0 });

  const { subject, text, html } = renderStaffCredentialsEmail({ fullName: user.fullName ?? user.email, role: user.role, userId: user.userId, tempPassword });
  await sendEmail({ to: user.email, subject, text, html, type: "credentials_reset" });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "credentials.reset",
    resource: "users",
    resourceId: req.params.uid,
    description: `Admin reset credentials for ${user.email}.`,
    ip: req.ip,
  });

  res.json({ tempPassword });
}));

adminRouter.get("/roles", asyncHandler(async (_req, res) => {
  res.json(ROLES);
}));

// ---------------------------------------------------------------------------
// Transaction Rules — admin-configurable transaction limits, enforced live by
// the compliance monitoring system on every deposit/withdrawal/transfer
// (see compliance/transactionRuleEngine.ts).
// ---------------------------------------------------------------------------

const transactionRuleSchema = z.object({
  ruleName: z.string().min(2),
  transactionType: z.enum(["all", "transfer", "deposit", "withdrawal"]),
  customerType: z.enum(["all", "individual", "business"]),
  perTransactionLimit: z.number().nonnegative().nullable().optional(),
  dailyTransactionLimit: z.number().nonnegative().nullable().optional(),
  monthlyTransactionLimit: z.number().nonnegative().nullable().optional(),
  dailyCountLimit: z.number().int().nonnegative().nullable().optional(),
  monthlyCountLimit: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(["active", "inactive"]),
  violationAction: z.enum(["block", "flag", "alert"]),
});

adminRouter.get("/transaction-rules", asyncHandler(async (_req, res) => {
  const snap = await db.collection("transactionRules").orderBy("createdAt", "desc").get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

adminRouter.post("/transaction-rules", asyncHandler(async (req, res) => {
  const parsed = transactionRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const ref = await db.collection("transactionRules").add({
    ...parsed.data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "transaction_rule.created",
    resource: "transactionRules",
    resourceId: ref.id,
    description: `Admin created transaction rule "${parsed.data.ruleName}".`,
    newValue: parsed.data,
    ip: req.ip,
  });

  res.status(201).json({ id: ref.id });
}));

adminRouter.patch("/transaction-rules/:id", asyncHandler(async (req, res) => {
  const parsed = transactionRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const ref = db.collection("transactionRules").doc(req.params.id);
  const before = await ref.get();
  if (!before.exists) return res.status(404).json({ error: "Not found" });

  await ref.update({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "transaction_rule.updated",
    resource: "transactionRules",
    resourceId: req.params.id,
    description: `Admin updated transaction rule "${before.data()!.ruleName}".`,
    previousValue: before.data(),
    newValue: parsed.data,
    ip: req.ip,
  });

  res.json({ id: req.params.id });
}));

adminRouter.delete("/transaction-rules/:id", asyncHandler(async (req, res) => {
  const ref = db.collection("transactionRules").doc(req.params.id);
  const before = await ref.get();
  if (!before.exists) return res.status(404).json({ error: "Not found" });

  await ref.delete();

  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "transaction_rule.deleted",
    resource: "transactionRules",
    resourceId: req.params.id,
    description: `Admin deleted transaction rule "${before.data()!.ruleName}".`,
    previousValue: before.data(),
    ip: req.ip,
  });

  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Compliance rule configuration
// ---------------------------------------------------------------------------

adminRouter.get("/rules", asyncHandler(async (_req, res) => {
  const snap = await db.collection("complianceRules").get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

const ruleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  weight: z.number().optional(),
  threshold: z.number().optional(),
  linkedControlIds: z.array(z.string()).optional(),
});

adminRouter.patch("/rules/:id", asyncHandler(async (req, res) => {
  const parsed = ruleUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const ref = db.collection("complianceRules").doc(req.params.id);
  const before = await ref.get();
  if (!before.exists) return res.status(404).json({ error: "Not found" });
  await ref.update(parsed.data);
  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "rule.modified",
    resource: "complianceRules",
    resourceId: req.params.id,
    description: `Admin updated rule ${req.params.id}.`,
    previousValue: before.data(),
    newValue: parsed.data,
    ip: req.ip,
  });
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Compliance frameworks & controls (uploaded, not hardcoded)
// ---------------------------------------------------------------------------

adminRouter.get("/frameworks", asyncHandler(async (_req, res) => {
  const snap = await db.collection("complianceFrameworks").get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

const frameworkSchema = z.object({
  name: z.string().min(2),
  version: z.string().min(1),
  source: z.string().optional(),
  description: z.string().optional(),
});

adminRouter.post("/frameworks", asyncHandler(async (req, res) => {
  const parsed = frameworkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const ref = await db.collection("complianceFrameworks").add({ ...parsed.data, createdAt: FieldValue.serverTimestamp() });
  await writeAuditLog({
    userId: req.user!.uid,
    role: "admin",
    action: "framework.created",
    resource: "complianceFrameworks",
    resourceId: ref.id,
    description: `Admin added framework ${parsed.data.name} v${parsed.data.version}.`,
    ip: req.ip,
  });
  res.status(201).json({ id: ref.id });
}));

const controlSchema = z.object({
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
adminRouter.post("/controls", asyncHandler(async (req, res) => {
  const bulk = z.array(controlSchema).safeParse(req.body.controls);
  const single = controlSchema.safeParse(req.body);
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
    role: "admin",
    action: "control.created",
    resource: "complianceControls",
    description: `Admin imported ${items.length} control(s).`,
    newValue: { count: items.length },
    ip: req.ip,
  });

  res.status(201).json({ ids });
}));

adminRouter.get("/controls", asyncHandler(async (req, res) => {
  const { frameworkId } = req.query;
  let q: FirebaseFirestore.Query = db.collection("complianceControls");
  if (frameworkId) q = q.where("frameworkId", "==", frameworkId);
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

adminRouter.get("/audit-logs", asyncHandler(async (req, res) => {
  const snap = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(Number(req.query.limit ?? 200)).get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

// ---------------------------------------------------------------------------
// Bank Audit — the full transaction ledger for admin review, with all
// date-range/type/channel/risk/status filtering done in memory (single
// orderBy+limit fetch, no compound query, so no composite index is needed).
// ---------------------------------------------------------------------------

adminRouter.get("/bank-audit/transactions", asyncHandler(async (req, res) => {
  const snap = await db.collection("transactions").orderBy("createdAt", "desc").limit(Number(req.query.limit ?? 2000)).get();
  const transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const customerIds = [...new Set(transactions.map((t: any) => t.senderCustomerId).filter(Boolean))];
  const customerDocs = customerIds.length ? await db.getAll(...customerIds.map((id: string) => db.collection("customers").doc(id))) : [];
  const customerNameById = new Map(customerDocs.map((d) => [d.id, d.exists ? d.data()!.fullName : null]));

  res.json(
    transactions.map((t: any) => ({
      id: t.id,
      reference: t.reference,
      customerName: customerNameById.get(t.senderCustomerId) ?? "Unknown",
      type: t.type,
      channel: t.channel,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      complianceStatus: t.complianceStatus,
      riskScore: t.riskScore,
      riskLevel: t.riskLevel,
      location: t.location,
      createdAt: t.createdAt,
    }))
  );
}));

adminRouter.get("/emails", asyncHandler(async (req, res) => {
  const { type } = req.query;
  let q: FirebaseFirestore.Query = db.collection("emailOutbox");
  if (type) q = q.where("type", "==", type);
  q = q.orderBy("sentAt", "desc").limit(Number(req.query.limit ?? 100));
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));
