import { NextFunction, Request, Response } from "express";
import { Role } from "../types/roles";
import { writeAuditLog } from "../utils/audit";

export function requireRole(...allowed: readonly Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthenticated" });

    if (!allowed.includes(user.role)) {
      await writeAuditLog({
        userId: user.uid,
        role: user.role,
        action: "access.denied",
        resource: req.originalUrl,
        description: `Role ${user.role} blocked from ${req.method} ${req.originalUrl}`,
        ip: req.ip,
      });
      return res.status(403).json({ error: "Forbidden for this role" });
    }
    next();
  };
}
