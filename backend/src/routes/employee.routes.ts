import { Router } from "express";
import { z } from "zod";
import { db, FieldValue } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../utils/audit";
import { asyncHandler } from "../utils/asyncHandler";
import { generateReference } from "../utils/ids";
import { readKycDocument } from "../utils/fileStorage";
import { runComplianceCheck } from "../compliance/monitoringService";
import { localDateKey } from "../utils/dateKey";

export const employeeRouter = Router();
employeeRouter.use(requireAuth, requireRole("employee"));

employeeRouter.get("/dashboard", asyncHandler(async (_req, res) => {
  const customersSnap = await db.collection("customers").count().get();
  res.json({ customerCount: customersSnap.data().count });
}));

employeeRouter.get("/dashboard/activity-trend", asyncHandler(async (_req, res) => {
  const days = 7;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  // Single range filter on one field — no composite index needed. Bounded to a
  // week of activity, so filtering by channel/type in memory is cheap.
  const snap = await db.collection("transactions").where("createdAt", ">=", cutoff).get();

  const byDay = new Map<string, { cashIn: number; cashOut: number; transfer: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff);
    d.setDate(cutoff.getDate() + i);
    byDay.set(localDateKey(d), { cashIn: 0, cashOut: 0, transfer: 0 });
  }

  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.channel !== "branch") return;
    const createdAt = data.createdAt?.toDate?.();
    if (!createdAt) return;
    const bucket = byDay.get(localDateKey(createdAt));
    if (!bucket) return;
    const amount = Number(data.amount ?? 0);
    if (data.type === "cash_in") bucket.cashIn += amount;
    else if (data.type === "cash_out") bucket.cashOut += amount;
    else if (data.type === "fund_transfer") bucket.transfer += amount;
  });

  res.json([...byDay.entries()].map(([date, v]) => ({ date, cashIn: v.cashIn, cashOut: v.cashOut, transfer: v.transfer })));
}));

employeeRouter.get("/customers", asyncHandler(async (req, res) => {
  const { q } = req.query;
  const snap = await db.collection("customers").orderBy("createdAt", "desc").limit(200).get();
  let customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (q && typeof q === "string") {
    const needle = q.toLowerCase();
    customers = customers.filter(
      (c: any) =>
        c.fullName?.toLowerCase().includes(needle) ||
        c.customerCode?.toLowerCase().includes(needle) ||
        c.email?.toLowerCase().includes(needle)
    );
  }
  res.json(customers.slice(0, 50));
}));

employeeRouter.get("/customers/:id/accounts", asyncHandler(async (req, res) => {
  await writeAuditLog({
    userId: req.user!.uid,
    role: "employee",
    action: "customer_data.accessed",
    resource: "customers",
    resourceId: req.params.id,
    description: "Employee viewed customer accounts.",
    ip: req.ip,
  });
  const snap = await db.collection("accounts").where("customerId", "==", req.params.id).get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

employeeRouter.get("/customers/:id/transactions", asyncHandler(async (req, res) => {
  const accountsSnap = await db.collection("accounts").where("customerId", "==", req.params.id).get();
  const accountIds = accountsSnap.docs.map((d) => d.id);
  if (!accountIds.length) return res.json([]);
  const ids = accountIds.slice(0, 10);
  // Money received (e.g. an incoming transfer) only sets receiverAccountId, so a
  // sender-only query would silently hide it from this customer's transaction list.
  const [sentSnap, receivedSnap] = await Promise.all([
    db.collection("transactions").where("senderAccountId", "in", ids).orderBy("createdAt", "desc").limit(30).get(),
    db.collection("transactions").where("receiverAccountId", "in", ids).orderBy("createdAt", "desc").limit(30).get(),
  ]);
  const byId = new Map<string, any>();
  for (const d of [...sentSnap.docs, ...receivedSnap.docs]) byId.set(d.id, { id: d.id, ...d.data() });
  const transactions = [...byId.values()]
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, 30);
  res.json(transactions);
}));

employeeRouter.get("/customers/:id/kyc", asyncHandler(async (req, res) => {
  const snap = await db.collection("kycRecords").where("customerId", "==", req.params.id).limit(1).get();
  res.json(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
}));

// ---------------------------------------------------------------------------
// Branch cash-in: teller looks up a customer's account by account number,
// verifies their identity against the KYC record on file (name/address/phone
// auto-fill, NID number, and the original NID/signature images), then posts
// a cash deposit. Routed through the same compliance pipeline as a transfer
// since cash-in is a classic AML monitoring point.
// ---------------------------------------------------------------------------

employeeRouter.get("/accounts/lookup", asyncHandler(async (req, res) => {
  const accountNumber = String(req.query.accountNumber ?? "").trim();
  if (!accountNumber) return res.status(400).json({ error: "Account number is required." });

  const accountSnap = await db.collection("accounts").where("accountNumber", "==", accountNumber).limit(1).get();
  if (accountSnap.empty) return res.status(404).json({ error: "No account found with that number." });
  const accountDoc = accountSnap.docs[0];
  const account = accountDoc.data();

  const [customerSnap, kycSnap] = await Promise.all([
    db.collection("customers").doc(account.customerId).get(),
    db.collection("kycRecords").where("customerId", "==", account.customerId).limit(1).get(),
  ]);
  if (!customerSnap.exists) return res.status(404).json({ error: "No customer record linked to this account." });
  const customer = customerSnap.data()!;
  const kycDoc = kycSnap.empty ? null : kycSnap.docs[0];
  const kyc = kycDoc?.data();

  await writeAuditLog({
    userId: req.user!.uid,
    role: "employee",
    action: "customer_data.accessed",
    resource: "accounts",
    resourceId: accountDoc.id,
    description: `Employee looked up account ${accountNumber}.`,
    ip: req.ip,
  });

  res.json({
    account: { id: accountDoc.id, accountNumber: account.accountNumber, accountType: account.accountType, currency: account.currency, status: account.status, balance: account.balance },
    customer: { id: customerSnap.id, fullName: customer.fullName, address: customer.address, phone: customer.phone, nationality: customer.nationality },
    kyc: kycDoc
      ? {
          id: kycDoc.id,
          status: kyc!.status,
          nidNumber: kyc!.nidNumber,
          hasDocuments: {
            ownPhoto: Boolean(kyc!.documents?.ownPhoto),
            nidFront: Boolean(kyc!.documents?.nidFront),
            nidBack: Boolean(kyc!.documents?.nidBack),
            signature: Boolean(kyc!.documents?.signature),
          },
        }
      : null,
  });
}));

employeeRouter.get("/kyc/:kycId/document/:kind", asyncHandler(async (req, res) => {
  const snap = await db.collection("kycRecords").doc(req.params.kycId).get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const kyc = snap.data()!;
  const doc = kyc.documents?.[req.params.kind];
  if (!doc || !kyc.applicationId) return res.status(404).json({ error: "Document not found" });

  const stored = await readKycDocument(kyc.applicationId, doc.filename);
  if (!stored) return res.status(404).json({ error: "Document not found" });
  res.setHeader("Content-Type", stored.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(stored.buffer);
}));

const cashInSchema = z.object({
  accountNumber: z.string().min(4),
  amount: z.number().positive(),
});

employeeRouter.post("/cash-in", asyncHandler(async (req, res) => {
  const parsed = cashInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  const { accountNumber, amount } = parsed.data;

  const accountSnap = await db.collection("accounts").where("accountNumber", "==", accountNumber).limit(1).get();
  if (accountSnap.empty) return res.status(404).json({ error: "No account found with that number." });
  const accountDoc = accountSnap.docs[0];
  const account = accountDoc.data();
  if (account.status !== "active") return res.status(400).json({ error: `This account is ${account.status}.` });

  const txRef = db.collection("transactions").doc();
  await db.runTransaction(async (t) => {
    t.update(accountDoc.ref, { balance: FieldValue.increment(amount) });
    t.set(txRef, {
      reference: generateReference("CSH"),
      senderAccountId: accountDoc.id,
      senderCustomerId: account.customerId,
      receiverAccountId: accountDoc.id,
      receiverCustomerId: account.customerId,
      amount,
      currency: account.currency ?? "BDT",
      type: "cash_in",
      purpose: "Branch cash deposit",
      channel: "branch",
      location: "BD",
      performedBy: req.user!.uid,
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
    role: "employee",
    action: "cash_in.performed",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Employee cashed in ${amount} ${account.currency ?? "BDT"} to account ${accountNumber}.`,
    ip: req.ip,
  });

  const result = await runComplianceCheck(txRef.id);
  const finalSnap = await txRef.get();

  res.status(201).json({ id: txRef.id, ...finalSnap.data(), complianceResult: result });
}));

const cashOutSchema = z.object({
  accountNumber: z.string().min(4),
  amount: z.number().positive(),
});

employeeRouter.post("/cash-out", asyncHandler(async (req, res) => {
  const parsed = cashOutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  const { accountNumber, amount } = parsed.data;

  const accountSnap = await db.collection("accounts").where("accountNumber", "==", accountNumber).limit(1).get();
  if (accountSnap.empty) return res.status(404).json({ error: "No account found with that number." });
  const accountDoc = accountSnap.docs[0];
  const account = accountDoc.data();
  if (account.status !== "active") return res.status(400).json({ error: `This account is ${account.status}.` });
  if (Number(account.balance) < amount) return res.status(400).json({ error: "Insufficient balance." });

  const txRef = db.collection("transactions").doc();
  await db.runTransaction(async (t) => {
    const freshAccount = await t.get(accountDoc.ref);
    if (Number(freshAccount.data()!.balance) < amount) throw new Error("Insufficient balance.");

    t.update(accountDoc.ref, { balance: FieldValue.increment(-amount) });
    t.set(txRef, {
      reference: generateReference("CSH"),
      senderAccountId: accountDoc.id,
      senderCustomerId: account.customerId,
      receiverAccountId: accountDoc.id,
      receiverCustomerId: account.customerId,
      amount,
      currency: account.currency ?? "BDT",
      type: "cash_out",
      purpose: "Branch cash withdrawal",
      channel: "branch",
      location: "BD",
      performedBy: req.user!.uid,
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
    role: "employee",
    action: "cash_out.performed",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Employee cashed out ${amount} ${account.currency ?? "BDT"} from account ${accountNumber}.`,
    ip: req.ip,
  });

  const result = await runComplianceCheck(txRef.id);
  const finalSnap = await txRef.get();

  res.status(201).json({ id: txRef.id, ...finalSnap.data(), complianceResult: result });
}));

// ---------------------------------------------------------------------------
// Fund transfer — a teller-assisted transfer between two customer accounts.
// The sender is verified against their KYC photo/NID/signature on file (they're
// the one authorizing money to leave their account); the receiver only needs
// name + account number confirmation.
// ---------------------------------------------------------------------------

const fundTransferSchema = z.object({
  senderAccountNumber: z.string().min(4),
  receiverAccountNumber: z.string().min(4),
  amount: z.number().positive(),
});

employeeRouter.post("/fund-transfer", asyncHandler(async (req, res) => {
  const parsed = fundTransferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  const { senderAccountNumber, receiverAccountNumber, amount } = parsed.data;

  if (senderAccountNumber === receiverAccountNumber) {
    return res.status(400).json({ error: "Sender and receiver accounts must be different." });
  }

  const [senderSnap, receiverSnap] = await Promise.all([
    db.collection("accounts").where("accountNumber", "==", senderAccountNumber).limit(1).get(),
    db.collection("accounts").where("accountNumber", "==", receiverAccountNumber).limit(1).get(),
  ]);
  if (senderSnap.empty) return res.status(404).json({ error: "Sender account not found." });
  if (receiverSnap.empty) return res.status(404).json({ error: "Receiver account not found." });

  const senderDoc = senderSnap.docs[0];
  const receiverDoc = receiverSnap.docs[0];
  const sender = senderDoc.data();
  const receiver = receiverDoc.data();

  if (sender.accountType === "dps" || receiver.accountType === "dps") {
    return res.status(400).json({ error: "DPS accounts can't send or receive fund transfers." });
  }
  if (sender.status !== "active") return res.status(400).json({ error: `Sender account is ${sender.status}.` });
  if (receiver.status !== "active") return res.status(400).json({ error: `Receiver account is ${receiver.status}.` });
  if (Number(sender.balance) < amount) return res.status(400).json({ error: "Insufficient balance in sender's account." });

  const txRef = db.collection("transactions").doc();
  await db.runTransaction(async (t) => {
    const freshSender = await t.get(senderDoc.ref);
    if (Number(freshSender.data()!.balance) < amount) throw new Error("Insufficient balance in sender's account.");

    t.update(senderDoc.ref, { balance: FieldValue.increment(-amount) });
    t.update(receiverDoc.ref, { balance: FieldValue.increment(amount) });
    t.set(txRef, {
      reference: generateReference("FTX"),
      senderAccountId: senderDoc.id,
      senderCustomerId: sender.customerId,
      receiverAccountId: receiverDoc.id,
      receiverCustomerId: receiver.customerId,
      amount,
      currency: sender.currency ?? "BDT",
      type: "fund_transfer",
      purpose: "Branch-assisted fund transfer",
      channel: "branch",
      location: "BD",
      performedBy: req.user!.uid,
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
    role: "employee",
    action: "fund_transfer.performed",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Employee transferred ${amount} ${sender.currency ?? "BDT"} from ${senderAccountNumber} to ${receiverAccountNumber}.`,
    ip: req.ip,
  });

  const result = await runComplianceCheck(txRef.id);
  const finalSnap = await txRef.get();

  res.status(201).json({ id: txRef.id, ...finalSnap.data(), complianceResult: result });
}));
