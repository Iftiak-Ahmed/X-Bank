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

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

// ---------------------------------------------------------------------------
// Login approval — Employee and Admin logins wait here for a live admin to
// approve or deny before a session token is ever issued.
// ---------------------------------------------------------------------------

adminRouter.get("/login-requests", asyncHandler(async (req, res) => {
  const status = (req.query.status as string) ?? "pending";
  const snap = await db.collection("loginRequests").where("status", "==", status).orderBy("createdAt", "desc").limit(50).get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data(), customToken: undefined })));
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

  const { buffer, mimeType } = readKycDocument(req.params.id, doc.filename);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buffer);
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
// Staff (Employee / Compliance Officer / Compliance Manager / Admin) accounts
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

const createStaffSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["employee", "compliance_officer", "compliance_manager", "admin"]),
  department: z.string().optional(),
  branch: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

adminRouter.post("/users", asyncHandler(async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { fullName, email, role, department, branch, permissions } = parsed.data;

  try {
    const [userId, tempPassword] = await Promise.all([generateSequentialStaffUserId(), Promise.resolve(generateTempPassword())]);
    const userRecord = await auth.createUser({ email, password: tempPassword, displayName: fullName });
    await db.collection("users").doc(userRecord.uid).set({
      email,
      fullName,
      userId,
      role,
      department: department ?? null,
      branch: branch ?? null,
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
      newValue: { role, department: department ?? null, branch: branch ?? null },
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

adminRouter.get("/emails", asyncHandler(async (req, res) => {
  const { type } = req.query;
  let q: FirebaseFirestore.Query = db.collection("emailOutbox");
  if (type) q = q.where("type", "==", type);
  q = q.orderBy("sentAt", "desc").limit(Number(req.query.limit ?? 100));
  const snap = await q.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));
