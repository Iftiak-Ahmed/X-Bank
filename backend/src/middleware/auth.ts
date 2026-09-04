import { NextFunction, Request, Response } from "express";
import { auth, db } from "../config/firebase";
import { Role } from "../types/roles";

export interface AuthedUser {
  uid: string;
  email: string;
  role: Role;
  status: string;
  customerId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

// Routes reachable while mustChangePassword is still true — just enough for the
// client to fetch its own profile, set a new password, and sign out. Everything
// else must be blocked here too, not just via the frontend's /change-password
// redirect, since that redirect is trivially bypassed by calling the API directly
// with the temporary-password-derived token.
const PASSWORD_CHANGE_EXEMPT: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/api/auth/me" },
  { method: "POST", path: "/api/auth/change-password" },
  { method: "POST", path: "/api/auth/logout" },
];

function isExemptFromPasswordGate(req: Request): boolean {
  const path = req.originalUrl.split("?")[0];
  return PASSWORD_CHANGE_EXEMPT.some((e) => e.method === req.method && e.path === path);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // A failure past this point is our own database, not the caller's credentials —
  // reporting it as "invalid token" would send the client on a pointless re-login.
  try {
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) {
      return res.status(401).json({ error: "User record not found" });
    }
    const data = userDoc.data()!;
    if (data.status !== "active") {
      return res.status(403).json({ error: `Account is ${data.status}` });
    }
    if (data.mustChangePassword && !isExemptFromPasswordGate(req)) {
      return res.status(403).json({ error: "You must set a new password before continuing.", mustChangePassword: true });
    }
    req.user = {
      uid: decoded.uid,
      email: data.email,
      role: data.role,
      status: data.status,
      customerId: data.customerId,
    };
    next();
  } catch (err) {
    console.error("requireAuth: failed to load user record", err);
    res.status(503).json({ error: "Service temporarily unavailable. Please try again shortly." });
  }
}
