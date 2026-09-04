import { Router } from "express";
import { z } from "zod";
import { db, FieldValue } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { generateAccountNumber, generateReference } from "../utils/ids";
import { generateUniqueAccountNumber } from "../utils/unique";
import { writeAuditLog } from "../utils/audit";
import { runComplianceCheck } from "../compliance/monitoringService";
import { checkTransactionRulesInTransaction, recordTransactionRuleAlert } from "../compliance/transactionRuleEngine";
import { asyncHandler } from "../utils/asyncHandler";
import { calculateDpsMaturity, DPS_ALLOWED_TERM_YEARS, DPS_PROFIT_RATE_PERCENT } from "../utils/dps";
import { localDateKey } from "../utils/dateKey";
import { InsufficientBalanceError, TransactionRuleBlockedError } from "../utils/errors";

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
    const ids = accountIds.slice(0, 10);
    // A single "in" query can't cover both directions of money movement, so an
    // incoming transfer (this account only as receiver) would otherwise silently
    // never show up here even though the balance already reflects it — fetch both
    // sides and merge, same as the full transaction history endpoint does.
    const [sentSnap, receivedSnap] = await Promise.all([
      db.collection("transactions").where("senderAccountId", "in", ids).orderBy("createdAt", "desc").limit(8).get(),
      db.collection("transactions").where("receiverAccountId", "in", ids).orderBy("createdAt", "desc").limit(8).get(),
    ]);
    const byId = new Map<string, any>();
    for (const d of [...sentSnap.docs, ...receivedSnap.docs]) byId.set(d.id, { id: d.id, ...d.data() });
    recentTransactions = [...byId.values()]
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, 8);
  }

  res.json({
    customer: customerSnap.exists ? { id: customerSnap.id, ...customerSnap.data() } : null,
    totalBalance,
    accounts: accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    recentTransactions,
  });
}));

clientRouter.get("/dashboard/balance-trend", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;

  const accountsSnap = await db.collection("accounts").where("customerId", "==", customerId).get();
  const accountIds = accountsSnap.docs.map((d) => d.id);
  const currentBalance = accountsSnap.docs.reduce((sum, d) => sum + Number(d.data().balance ?? 0), 0);

  const days = 14;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const cutoff = new Date(dayStart);
  cutoff.setDate(cutoff.getDate() - (days - 1));

  // Plain equality/"in" filters only (no orderBy/range) — same shape already
  // proven safe elsewhere in this app, avoids a composite index this
  // environment can't provision. Bounded to one customer's own accounts, so
  // sorting/filtering the small result set in memory is cheap.
  let txDocs: FirebaseFirestore.DocumentData[] = [];
  if (accountIds.length) {
    const [sentSnap, receivedSnap] = await Promise.all([
      db.collection("transactions").where("senderAccountId", "in", accountIds.slice(0, 10)).get(),
      db.collection("transactions").where("receiverAccountId", "in", accountIds.slice(0, 10)).get(),
    ]);
    const byId = new Map<string, FirebaseFirestore.DocumentData>();
    [...sentSnap.docs, ...receivedSnap.docs].forEach((d) => byId.set(d.id, d.data()));
    txDocs = [...byId.values()];
  }

  const accountIdSet = new Set(accountIds);

  const deltaByDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff);
    d.setDate(cutoff.getDate() + i);
    deltaByDay.set(localDateKey(d), 0);
  }

  for (const tx of txDocs) {
    const createdAt = tx.createdAt?.toDate?.();
    if (!createdAt || createdAt < cutoff) continue;
    const key = localDateKey(createdAt);
    if (!deltaByDay.has(key)) continue;

    const amount = Number(tx.amount ?? 0);
    const senderIsMine = accountIdSet.has(tx.senderAccountId);
    const receiverIsMine = accountIdSet.has(tx.receiverAccountId);
    // Deposit/withdrawal are self-referential (sender === receiver === the
    // funded account) and represent real cash in/out, not an internal
    // transfer, so they're handled before the general netting rule below —
    // otherwise "mine both sides" would net them to zero.
    let delta = 0;
    if (tx.type === "deposit") delta = amount;
    else if (tx.type === "withdrawal") delta = -amount;
    else delta = (receiverIsMine ? amount : 0) - (senderIsMine ? amount : 0);

    deltaByDay.set(key, (deltaByDay.get(key) ?? 0) + delta);
  }

  // Walk backward from today's known balance to reconstruct each day's
  // closing balance, since only the current balance is stored (no history).
  const sortedDays = [...deltaByDay.keys()].sort();
  const balanceByDay = new Map<string, number>();
  let runningBalance = currentBalance;
  for (let i = sortedDays.length - 1; i >= 0; i--) {
    balanceByDay.set(sortedDays[i], runningBalance);
    runningBalance -= deltaByDay.get(sortedDays[i]) ?? 0;
  }

  res.json(sortedDays.map((date) => ({ date, balance: Math.round(balanceByDay.get(date)! * 100) / 100 })));
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
  if (senderSnap.data()!.accountNumber === receiverAccountNumber) {
    return res.status(400).json({ error: "Sender and receiver accounts must be different." });
  }
  if (Number(senderSnap.data()!.balance) < amount) {
    return res.status(400).json({ error: "Insufficient balance." });
  }

  const receiverSnap = await db.collection("accounts").where("accountNumber", "==", receiverAccountNumber).limit(1).get();
  if (receiverSnap.empty) return res.status(404).json({ error: "Beneficiary account not found." });
  const receiverDoc = receiverSnap.docs[0];

  const customerSnap = await db.collection("customers").doc(customerId).get();
  const customerType = customerSnap.exists ? customerSnap.data()!.customerType ?? "individual" : "individual";

  const txRef = db.collection("transactions").doc();
  let violations: Awaited<ReturnType<typeof checkTransactionRulesInTransaction>> = [];
  try {
    await db.runTransaction(async (t) => {
      const freshSender = await t.get(senderRef);
      const freshReceiver = await t.get(receiverDoc.ref);
      if (Number(freshSender.data()!.balance) < amount) throw new InsufficientBalanceError();

      violations = await checkTransactionRulesInTransaction(t, {
        accountId: senderAccountId,
        transactionType: "transfer",
        amount,
        customerType,
      });
      const blocking = violations.find((v) => v.violationAction === "block");
      if (blocking) throw new TransactionRuleBlockedError(blocking.ruleName, blocking.reason);

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
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return res.status(400).json({ error: err.message });
    if (err instanceof TransactionRuleBlockedError) return res.status(403).json({ error: err.message });
    throw err;
  }

  await writeAuditLog({
    userId: req.user!.uid,
    role: "client",
    action: "transaction.created",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Transfer of ${amount} ${currency} submitted.`,
    ip: req.ip,
  });

  const nonBlockingViolations = violations.filter((v) => v.violationAction !== "block");
  if (nonBlockingViolations.length) await recordTransactionRuleAlert(txRef.id, customerId, nonBlockingViolations);

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
  let depositViolations: Awaited<ReturnType<typeof checkTransactionRulesInTransaction>> = [];
  try {
    await db.runTransaction(async (t) => {
      depositViolations = await checkTransactionRulesInTransaction(t, { accountId, transactionType: "deposit", amount });
      const depositBlocking = depositViolations.find((v) => v.violationAction === "block");
      if (depositBlocking) throw new TransactionRuleBlockedError(depositBlocking.ruleName, depositBlocking.reason);

      t.update(accountRef, { balance: FieldValue.increment(amount) });
      t.set(txRef, {
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
    });
  } catch (err) {
    if (err instanceof TransactionRuleBlockedError) return res.status(403).json({ error: err.message });
    throw err;
  }

  await writeAuditLog({
    userId: req.user!.uid,
    role: "client",
    action: "transaction.created",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Simulated deposit of ${amount} BDT.`,
    ip: req.ip,
  });

  const depositNonBlocking = depositViolations.filter((v) => v.violationAction !== "block");
  if (depositNonBlocking.length) await recordTransactionRuleAlert(txRef.id, customerId, depositNonBlocking);

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
  let withdrawViolations: Awaited<ReturnType<typeof checkTransactionRulesInTransaction>> = [];
  try {
    await db.runTransaction(async (t) => {
      const freshAccount = await t.get(accountRef);
      if (Number(freshAccount.data()!.balance) < amount) throw new InsufficientBalanceError();

      withdrawViolations = await checkTransactionRulesInTransaction(t, { accountId, transactionType: "withdrawal", amount });
      const withdrawBlocking = withdrawViolations.find((v) => v.violationAction === "block");
      if (withdrawBlocking) throw new TransactionRuleBlockedError(withdrawBlocking.ruleName, withdrawBlocking.reason);

      t.update(accountRef, { balance: FieldValue.increment(-amount) });
      t.set(txRef, {
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
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return res.status(400).json({ error: err.message });
    if (err instanceof TransactionRuleBlockedError) return res.status(403).json({ error: err.message });
    throw err;
  }

  await writeAuditLog({
    userId: req.user!.uid,
    role: "client",
    action: "transaction.created",
    resource: "transactions",
    resourceId: txRef.id,
    description: `Simulated withdrawal of ${amount} BDT.`,
    ip: req.ip,
  });

  const withdrawNonBlocking = withdrawViolations.filter((v) => v.violationAction !== "block");
  if (withdrawNonBlocking.length) await recordTransactionRuleAlert(txRef.id, customerId, withdrawNonBlocking);

  res.status(201).json({ id: txRef.id });
}));

// ---------------------------------------------------------------------------
// DPS (Deposit Pension Scheme) — a fixed-term recurring-deposit savings
// account. Opening one debits the first monthly installment immediately from
// a linked current account; further installments are contributed manually
// (this prototype has no scheduler for real monthly auto-debits).
// ---------------------------------------------------------------------------

clientRouter.get("/dps/quote", asyncHandler(async (req, res) => {
  const monthlyDeposit = Number(req.query.monthlyDeposit);
  const termYears = Number(req.query.termYears);
  if (!monthlyDeposit || monthlyDeposit <= 0 || !DPS_ALLOWED_TERM_YEARS.includes(termYears)) {
    return res.status(400).json({ error: "Invalid monthly deposit or term." });
  }
  res.json({
    profitRatePercent: DPS_PROFIT_RATE_PERCENT,
    totalDeposited: monthlyDeposit * termYears * 12,
    expectedMaturityAmount: calculateDpsMaturity(monthlyDeposit, termYears),
  });
}));

const openDpsSchema = z.object({
  sourceAccountId: z.string(),
  termYears: z.number().refine((v) => DPS_ALLOWED_TERM_YEARS.includes(v), "Invalid term."),
  monthlyDeposit: z.number().positive(),
});

clientRouter.post("/dps", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const parsed = openDpsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { sourceAccountId, termYears, monthlyDeposit } = parsed.data;

  const sourceRef = db.collection("accounts").doc(sourceAccountId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists || sourceSnap.data()!.customerId !== customerId) {
    return res.status(403).json({ error: "Not your account." });
  }
  if (sourceSnap.data()!.accountType !== "current") {
    return res.status(400).json({ error: "DPS installments can only be funded from a current account." });
  }
  if (Number(sourceSnap.data()!.balance) < monthlyDeposit) {
    return res.status(400).json({ error: "Insufficient balance for the first installment." });
  }

  const accountNumber = await generateUniqueAccountNumber();
  const totalMonths = termYears * 12;
  const maturityDate = new Date();
  maturityDate.setMonth(maturityDate.getMonth() + totalMonths);
  const expectedMaturityAmount = calculateDpsMaturity(monthlyDeposit, termYears);

  const dpsRef = db.collection("accounts").doc();
  const txRef = db.collection("transactions").doc();

  await db.runTransaction(async (t) => {
    const freshSource = await t.get(sourceRef);
    if (Number(freshSource.data()!.balance) < monthlyDeposit) throw new Error("Insufficient balance for the first installment.");

    t.update(sourceRef, { balance: FieldValue.increment(-monthlyDeposit) });
    t.set(dpsRef, {
      customerId,
      accountNumber,
      accountType: "dps",
      currency: "BDT",
      balance: monthlyDeposit,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      dps: {
        sourceAccountId,
        termYears,
        monthlyDeposit,
        profitRatePercent: DPS_PROFIT_RATE_PERCENT,
        expectedMaturityAmount,
        totalMonths,
        depositsMade: 1,
        maturityDate: maturityDate.toISOString(),
      },
    });
    t.set(txRef, {
      reference: generateReference("DPS"),
      senderAccountId: sourceAccountId,
      senderCustomerId: customerId,
      receiverAccountId: dpsRef.id,
      receiverCustomerId: customerId,
      amount: monthlyDeposit,
      currency: "BDT",
      type: "dps_deposit",
      purpose: "DPS installment",
      channel: "web",
      location: "BD",
      status: "approved",
      complianceStatus: "cleared",
      riskScore: 0,
      riskLevel: "low",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await writeAuditLog({
    userId: req.user!.uid,
    role: "client",
    action: "dps.opened",
    resource: "accounts",
    resourceId: dpsRef.id,
    description: `Opened a ${termYears}-year DPS with a monthly deposit of ${monthlyDeposit} BDT.`,
    ip: req.ip,
  });

  res.status(201).json({ id: dpsRef.id, accountNumber, expectedMaturityAmount });
}));

clientRouter.post("/dps/:id/deposit", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;

  const dpsRef = db.collection("accounts").doc(req.params.id);
  const dpsSnap = await dpsRef.get();
  if (!dpsSnap.exists || dpsSnap.data()!.customerId !== customerId || dpsSnap.data()!.accountType !== "dps") {
    return res.status(404).json({ error: "DPS account not found." });
  }
  const dps = dpsSnap.data()!.dps;
  if (dps.depositsMade >= dps.totalMonths) {
    return res.status(400).json({ error: "This DPS has already reached its full term." });
  }

  const sourceRef = db.collection("accounts").doc(dps.sourceAccountId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists || Number(sourceSnap.data()!.balance) < dps.monthlyDeposit) {
    return res.status(400).json({ error: "Insufficient balance in the linked current account." });
  }

  const txRef = db.collection("transactions").doc();
  await db.runTransaction(async (t) => {
    const freshSource = await t.get(sourceRef);
    if (Number(freshSource.data()!.balance) < dps.monthlyDeposit) throw new Error("Insufficient balance in the linked current account.");

    t.update(sourceRef, { balance: FieldValue.increment(-dps.monthlyDeposit) });
    t.update(dpsRef, { balance: FieldValue.increment(dps.monthlyDeposit), "dps.depositsMade": dps.depositsMade + 1 });
    t.set(txRef, {
      reference: generateReference("DPS"),
      senderAccountId: dps.sourceAccountId,
      senderCustomerId: customerId,
      receiverAccountId: dpsRef.id,
      receiverCustomerId: customerId,
      amount: dps.monthlyDeposit,
      currency: "BDT",
      type: "dps_deposit",
      purpose: "DPS installment",
      channel: "web",
      location: "BD",
      status: "approved",
      complianceStatus: "cleared",
      riskScore: 0,
      riskLevel: "low",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  res.status(204).end();
}));

clientRouter.get("/dps/:id/transactions", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;

  const dpsSnap = await db.collection("accounts").doc(req.params.id).get();
  if (!dpsSnap.exists || dpsSnap.data()!.customerId !== customerId || dpsSnap.data()!.accountType !== "dps") {
    return res.status(404).json({ error: "DPS account not found." });
  }

  const snap = await db
    .collection("transactions")
    .where("receiverAccountId", "==", req.params.id)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

clientRouter.get("/beneficiaries", asyncHandler(async (req, res) => {
  const customerId = await requireOwnCustomer(req, res);
  if (!customerId) return;
  const snap = await db.collection("beneficiaries").where("customerId", "==", customerId).get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

clientRouter.get("/accounts/lookup", asyncHandler(async (req, res) => {
  const accountNumber = String(req.query.accountNumber ?? "").trim();
  if (!accountNumber) return res.status(400).json({ error: "Account number is required." });

  const accountSnap = await db.collection("accounts").where("accountNumber", "==", accountNumber).limit(1).get();
  if (accountSnap.empty) return res.status(404).json({ error: "No account found with that number." });

  const customerSnap = await db.collection("customers").doc(accountSnap.docs[0].data().customerId).get();
  if (!customerSnap.exists) return res.status(404).json({ error: "No account found with that number." });

  res.json({ fullName: customerSnap.data()!.fullName });
}));

const beneficiarySchema = z.object({ beneficiaryName: z.string().min(2), accountNumber: z.string().min(4) });

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
