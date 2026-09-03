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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) {
      return res.status(401).json({ error: "User record not found" });
    }
    const data = userDoc.data()!;
    if (data.status !== "active") {
      return res.status(403).json({ error: `Account is ${data.status}` });
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
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
