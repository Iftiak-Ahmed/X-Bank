import { Router } from "express";
import { z } from "zod";
import { auth, db, FieldValue } from "../config/firebase";
import { writeAuditLog } from "../utils/audit";
import { requireAuth } from "../middleware/auth";
import { loginRateLimit, forgotPasswordRateLimit } from "../middleware/rateLimit";
import { env } from "../config/env";
import { asyncHandler } from "../utils/asyncHandler";
import { renderPasswordResetEmail, sendEmail } from "../utils/email";
import { isLocked } from "../config/lockout";
import { emitLoginRequested } from "../realtime/socket";

export const authRouter = Router();

const LOGIN_ROLE_GROUPS: Record<string, string[]> = {
  client: ["client"],
  employee: ["employee"],
  compliance: ["compliance_officer"],
  admin: ["admin"],
};

// Client, Compliance, and Admin sign in immediately; Employee logins require a
// live admin approval (a floating request on the Admin dashboard) before a
// session is issued. Admin itself is excluded — otherwise if every admin
// session ever logged out, no one would be left to approve the next admin login.
const NEEDS_APPROVAL_ROLES = ["employee"];
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

const loginSchema = z.object({
  role: z.enum(["client", "employee", "compliance", "admin"]),
  userId: z.string().trim().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", loginRateLimit, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { role, userId, password } = parsed.data;
  const genericError = { error: "Invalid User ID, role, or password." };

  const userSnap = await db.collection("users").where("userId", "==", userId).limit(1).get();
  if (userSnap.empty) {
    await writeAuditLog({ userId: null, role: null, action: "auth.login_failed", resource: "users", resourceId: userId, description: `Login failed: no account for User ID ${userId}.`, ip: req.ip });
    return res.status(401).json(genericError);
  }
  const userDoc = userSnap.docs[0];
  const user = userDoc.data();

  if (!LOGIN_ROLE_GROUPS[role]?.includes(user.role)) {
    await writeAuditLog({ userId: userDoc.id, role: user.role, action: "auth.login_failed", resource: "users", resourceId: userDoc.id, description: `Login failed: role mismatch (selected ${role}, actual ${user.role}).`, ip: req.ip });
    return res.status(401).json(genericError);
  }

  if (user.status !== "active") {
    return res.status(403).json({ error: `This account is ${user.status}. Contact your administrator.` });
  }

  if (isLocked(user.failedLoginCount, user.lastFailedLoginAt)) {
    return res.status(429).json({ error: "Too many failed attempts. This account is temporarily locked — try again later, or contact your administrator." });
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.firebaseWebApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password, returnSecureToken: true }),
    }
  );

  if (!verifyRes.ok) {
    await userDoc.ref.update({ failedLoginCount: FieldValue.increment(1), lastFailedLoginAt: FieldValue.serverTimestamp() });
    await writeAuditLog({ userId: userDoc.id, role: user.role, action: "auth.login_failed", resource: "users", resourceId: userDoc.id, description: `Login failed: incorrect password for User ID ${userId}.`, ip: req.ip });
    return res.status(401).json(genericError);
  }

  await userDoc.ref.update({ failedLoginCount: 0, lastLoginAt: FieldValue.serverTimestamp() });

  if (NEEDS_APPROVAL_ROLES.includes(user.role)) {
    const existingPending = await db
      .collection("loginRequests")
      .where("uid", "==", userDoc.id)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    let requestId: string;
    if (!existingPending.empty && Date.now() - (existingPending.docs[0].data().createdAt?.toMillis?.() ?? 0) < APPROVAL_TIMEOUT_MS) {
      requestId = existingPending.docs[0].id;
    } else {
      const ref = await db.collection("loginRequests").add({
        uid: userDoc.id,
        userId,
        role: user.role,
        email: user.email,
        fullName: user.fullName ?? user.email,
        mustChangePassword: Boolean(user.mustChangePassword),
        status: "pending",
        customToken: null,
        approvedBy: null,
        createdAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
        ip: req.ip,
      });
      requestId = ref.id;

      await writeAuditLog({ userId: userDoc.id, role: user.role, action: "auth.login_pending_approval", resource: "users", resourceId: userDoc.id, description: `${userId} (${user.role}) is awaiting admin approval to log in.`, ip: req.ip });

      emitLoginRequested({
        id: requestId,
        userId,
        role: user.role,
        email: user.email,
        fullName: user.fullName ?? user.email,
        createdAt: new Date().toISOString(),
      });
    }

    return res.json({ pendingApproval: true, requestId });
  }

  await writeAuditLog({ userId: userDoc.id, role: user.role, action: "auth.login", resource: "users", resourceId: userDoc.id, description: `${userId} logged in as ${user.role}.`, ip: req.ip });

  const customToken = await auth.createCustomToken(userDoc.id, { role: user.role });
  res.json({ customToken, role: user.role, mustChangePassword: Boolean(user.mustChangePassword) });
}));

authRouter.get("/login-requests/:id/status", asyncHandler(async (req, res) => {
  const snap = await db.collection("loginRequests").doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: "Not found" });
  const request = snap.data()!;

  const ageMs = Date.now() - (request.createdAt?.toMillis?.() ?? 0);
  if (request.status === "pending" && ageMs > APPROVAL_TIMEOUT_MS) {
    await snap.ref.update({ status: "expired", resolvedAt: FieldValue.serverTimestamp() });
    return res.json({ status: "expired" });
  }

  if (request.status === "approved" && request.customToken) {
    const customToken = request.customToken;
    await snap.ref.update({ customToken: null }); // one-time retrieval
    return res.json({ status: "approved", customToken, role: request.role, mustChangePassword: Boolean(request.mustChangePassword) });
  }

  res.json({ status: request.status });
}));

const forgotPasswordSchema = z.object({
  role: z.enum(["client", "employee", "compliance", "admin"]),
  userId: z.string().trim().min(1),
});

// Identified by Role + User ID (same as login, since that's what people actually
// remember) rather than email. Always returns the same generic message so the
// response can't be used to enumerate which User IDs exist.
authRouter.post("/forgot-password", forgotPasswordRateLimit, asyncHandler(async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { role, userId } = parsed.data;
  const genericMessage = { message: "If that account exists, a password reset link has been sent to the email on file." };

  const userSnap = await db.collection("users").where("userId", "==", userId).limit(1).get();
  if (userSnap.empty) return res.json(genericMessage);
  const userDoc = userSnap.docs[0];
  const user = userDoc.data();

  if (!LOGIN_ROLE_GROUPS[role]?.includes(user.role) || user.status !== "active") {
    return res.json(genericMessage);
  }

  const resetLink = await auth.generatePasswordResetLink(user.email, { url: `${env.clientOrigin}/login` });
  const { subject, text, html } = renderPasswordResetEmail({ fullName: user.fullName ?? user.email, resetLink });
  await sendEmail({ to: user.email, subject, text, html, type: "password_reset" });

  await writeAuditLog({
    userId: userDoc.id,
    role: user.role,
    action: "password.reset_requested",
    resource: "users",
    resourceId: userDoc.id,
    description: `Password reset link sent to ${user.email}.`,
    ip: req.ip,
  });

  res.json(genericMessage);
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  const userDoc = await db.collection("users").doc(user.uid).get();
  let customer = null;
  if (user.customerId) {
    const snap = await db.collection("customers").doc(user.customerId).get();
    customer = snap.exists ? { id: snap.id, ...snap.data() } : null;
  }
  res.json({
    uid: user.uid,
    email: user.email,
    role: user.role,
    status: user.status,
    userId: userDoc.data()?.userId ?? null,
    fullName: userDoc.data()?.fullName ?? null,
    mustChangePassword: Boolean(userDoc.data()?.mustChangePassword),
    customer,
  });
}));

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
});

// Self-service profile edit for staff accounts (admin/employee/compliance) — keeps
// the users doc and the Firebase Auth record's email/displayName in sync, since
// login looks up Firestore's `email` field to authenticate against Firebase Auth.
authRouter.patch("/profile", requireAuth, asyncHandler(async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  const { fullName, email } = parsed.data;
  if (!fullName && !email) return res.status(400).json({ error: "Nothing to update." });

  const uid = req.user!.uid;
  const authUpdate: { email?: string; displayName?: string } = {};
  if (email) authUpdate.email = email;
  if (fullName) authUpdate.displayName = fullName;

  try {
    if (Object.keys(authUpdate).length > 0) {
      await auth.updateUser(uid, authUpdate);
    }
  } catch (err: any) {
    if (err?.errorInfo?.code === "auth/email-already-exists") {
      return res.status(409).json({ error: "Email already in use." });
    }
    throw err;
  }

  const firestoreUpdate: { fullName?: string; email?: string } = {};
  if (fullName) firestoreUpdate.fullName = fullName;
  if (email) firestoreUpdate.email = email;
  await db.collection("users").doc(uid).update(firestoreUpdate);

  await writeAuditLog({
    userId: uid,
    role: req.user!.role,
    action: "profile.updated",
    resource: "users",
    resourceId: uid,
    description: `${req.user!.email} updated their own profile.`,
    newValue: firestoreUpdate,
    ip: req.ip,
  });

  res.json({ fullName: fullName ?? undefined, email: email ?? req.user!.email });
}));

const changePasswordSchema = z.object({ newPassword: z.string().min(8) });
authRouter.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Password must be at least 8 characters." });

  await auth.updateUser(req.user!.uid, { password: parsed.data.newPassword });
  await db.collection("users").doc(req.user!.uid).update({ mustChangePassword: false });
  await writeAuditLog({
    userId: req.user!.uid,
    role: req.user!.role,
    action: "password.changed",
    resource: "users",
    resourceId: req.user!.uid,
    description: `${req.user!.email} changed their password.`,
    ip: req.ip,
  });
  res.status(204).end();
}));

authRouter.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await writeAuditLog({
    userId: req.user!.uid,
    role: req.user!.role,
    action: "auth.logout",
    resource: "users",
    resourceId: req.user!.uid,
    description: `${req.user!.email} logged out.`,
    ip: req.ip,
  });
  res.status(204).end();
}));
