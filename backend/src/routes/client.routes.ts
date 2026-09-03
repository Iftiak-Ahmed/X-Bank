import { Router } from "express";
import { z } from "zod";
import { db, FieldValue } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { generateAccountNumber, generateReference } from "../utils/ids";
import { writeAuditLog } from "../utils/audit";
import { runComplianceCheck } from "../compliance/monitoringService";
import { asyncHandler } from "../utils/asyncHandler";

export const clientRouter = Router();
clientRouter.use(requireAuth, requireRole("client"));

async function requireOwnCustomer(req: any, res: any): Promise<string | null> {
  const customerId = req.user.customerId;
  if (!customerId) {
    res.status(403).json({ error: "No customer profile linked to this account." });
    return null;
  }
  return customerId;
}

clientRouter.get("/dashboard/summary", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;

  const [customerSnap, accountsSnap] = await Promise.all([
    db.collection("customers").doc(customerId).get(),
    db.collection("accounts").where("customerId", "==", customerId).get(),
  ]);
  const accountIds = accountsSnap.docs.map((d) => d.id);
  const totalBalance = accountsSnap.docs.reduce((sum, d) => sum + Number(d.data().balance ?? 0), 0);

  let recentTransactions: any[] = [];
  if (accountIds.length) {
    const txSnap = await db
      .collection("transactions")
      .where("senderAccountId", "in", accountIds.slice(0, 10))
      .orderBy("createdAt", "desc")
      .limit(8)
      .get();
    recentTransactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  res.json({
    customer: customerSnap.exists ? { id: customerSnap.id, ...customerSnap.data() } : null,
    totalBalance,
    accounts: accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    recentTransactions,
  });
}));

clientRouter.get("/accounts", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const snap = await db.collection("accounts").where("customerId", "==", customerId).get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

clientRouter.get("/transactions", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const accountsSnap = await db.collection("accounts").where("customerId", "==", customerId).get();
  const accountIds = accountsSnap.docs.map((d) => d.id);
  if (!accountIds.length) return res.json([]);

  const [sent, received] = await Promise.all([
    db.collection("transactions").where("senderAccountId", "in", accountIds.slice(0, 10)).get(),
    db.collection("transactions").where("receiverAccountId", "in", accountIds.slice(0, 10)).get(),
  ]);
  const byId = new Map<string, any>();
  [...sent.docs, ...received.docs].forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
  const all = [...byId.values()].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  res.json(all);
}));

clientRouter.get("/transactions/:id", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const snap = await db.collection("transactions").doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const tx = snap.data()!;
  if (tx.senderCustomerId !== customerId && tx.receiverCustomerId !== customerId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ id: snap.id, ...tx });
}));

const transferSchema = z.object({
  senderAccountId: z.string(),
  receiverAccountNumber: z.string(),
  amount: z.number().positive(),
  currency: z.string().default("BDT"),
  purpose: z.string().min(2),
  description: z.string().optional(),
  location: z.string().default("BD"),
});

clientRouter.post("/transactions/transfer", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { senderAccountId, receiverAccountNumber, amount, currency, purpose, description, location } = parsed.data;

  const senderRef = db.collection("accounts").doc(senderAccountId);
  const senderSnap = await senderRef.get();
  if (!senderSnap.exists || senderSnap.data()!.customerId !== customerId) {
    return res.status(403).json({ error: "Not your account." });
  }
  if (Number(senderSnap.data()!.balance) < amount) {
    return res.status(400).json({ error: "Insufficient balance." });
  }

  const receiverSnap = await db.collection("accounts").where("accountNumber", "==", receiverAccountNumber).limit(1).get();
  if (receiverSnap.empty) return res.status(404).json({ error: "Beneficiary account not found." });
  const receiverDoc = receiverSnap.docs[0];

  const txRef = db.collection("transactions").doc();
  await db.runTransaction(async (t) => {
    const freshSender = await t.get(senderRef);
    const freshReceiver = await t.get(receiverDoc.ref);
    if (Number(freshSender.data()!.balance) < amount) throw new Error("Insufficient balance.");

    t.update(senderRef, { balance: FieldValue.increment(-amount) });
    t.update(receiverDoc.ref, { balance: FieldValue.increment(amount) });
    t.set(txRef, {
      reference: generateReference("TXN"),
      senderAccountId,
      senderCustomerId: customerId,
      receiverAccountId: receiverDoc.id,
      receiverCustomerId: freshReceiver.data()!.customerId,
      amount,
      currency,
      type: "transfer",
      purpose,
      description: description ?? "",
      channel: "web",
      location,
      status: "pending",
      complianceStatus: "pending_check",
      riskScore: null,
      riskLevel: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "client",
    action: "transaction.created",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Transfer of ${amount} ${currency} submitted.`,
    ip: req.ip,
  });

  const result = await runComplianceCheck(txRef.id);
  const finalSnap = await txRef.get();

  res.status(201).json({ id: txRef.id, ...finalSnap.data(), complianceResult: result });
}));

const simpleAmountSchema = z.object({ accountId: z.string(), amount: z.number().positive() });

clientRouter.post("/transactions/deposit", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const parsed = simpleAmountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { accountId, amount } = parsed.data;

  const accountRef = db.collection("accounts").doc(accountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists || accountSnap.data()!.customerId !== customerId) {
    return res.status(403).json({ error: "Not your account." });
  }

  const txRef = db.collection("transactions").doc();
  await accountRef.update({ balance: FieldValue.increment(amount) });
  await txRef.set({
    reference: generateReference("DEP"),
    senderAccountId: accountId,
    senderCustomerId: customerId,
    receiverAccountId: accountId,
    receiverCustomerId: customerId,
    amount,
    currency: "BDT",
    type: "deposit",
    purpose: "Simulated deposit",
    channel: "web",
    location: "BD",
    status: "approved",
    complianceStatus: "cleared",
    riskScore: 0,
    riskLevel: "low",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "client",
    action: "transaction.created",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Simulated deposit of ${amount} BDT.`,
    ip: req.ip,
  });

  res.status(201).json({ id: txRef.id });
}));

clientRouter.post("/transactions/withdraw", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const parsed = simpleAmountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { accountId, amount } = parsed.data;

  const accountRef = db.collection("accounts").doc(accountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists || accountSnap.data()!.customerId !== customerId) {
    return res.status(403).json({ error: "Not your account." });
  }
  if (Number(accountSnap.data()!.balance) < amount) {
    return res.status(400).json({ error: "Insufficient balance." });
  }

  const txRef = db.collection("transactions").doc();
  await accountRef.update({ balance: FieldValue.increment(-amount) });
  await txRef.set({
    reference: generateReference("WDR"),
    senderAccountId: accountId,
    senderCustomerId: customerId,
    receiverAccountId: accountId,
    receiverCustomerId: customerId,
    amount,
    currency: "BDT",
    type: "withdrawal",
    purpose: "Simulated withdrawal",
    channel: "web",
    location: "BD",
    status: "approved",
    complianceStatus: "cleared",
    riskScore: 0,
    riskLevel: "low",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "client",
    action: "transaction.created",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Simulated withdrawal of ${amount} BDT.`,
    ip: req.ip,
  });

  res.status(201).json({ id: txRef.id });
}));

clientRouter.get("/beneficiaries", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const snap = await db.collection("beneficiaries").where("customerId", "==", customerId).get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

const beneficiarySchema = z.object({ beneficiaryName: z.string().min(2), accountNumber: z.string().min(4), bankName: z.string().optional() });

clientRouter.post("/beneficiaries", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const parsed = beneficiarySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const ref = await db.collection("beneficiaries").add({
    customerId,
    ...parsed.data,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });
  res.status(201).json({ id: ref.id });
}));

clientRouter.delete("/beneficiaries/:id", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const ref = db.collection("beneficiaries").doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.customerId !== customerId) return res.status(403).json({ error: "Forbidden" });
  await ref.delete();
  res.status(204).end();
}));

clientRouter.get("/kyc", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const snap = await db.collection("kycRecords").where("customerId", "==", customerId).limit(1).get();
  res.json(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
}));

clientRouter.get("/notifications", asyncHandler(async (req, res) => {
  const snap = await db
    .collection("notifications")
    .where("userId", "==", req.user!.uid)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

clientRouter.patch("/profile", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const allowed = ["phone", "address"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
  await db.collection("customers").doc(customerId).update(updates);
  res.status(204).end();
}));

clientRouter.get("/security/activity", asyncHandler(async (req, res) => {
  const snap = await db
    .collection("auditLogs")
    .where("userId", "==", req.user!.uid)
    .where("action", "in", ["auth.login", "auth.login_failed", "auth.logout"])
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));
