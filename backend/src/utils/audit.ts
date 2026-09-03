import { db, FieldValue } from "../config/firebase";

interface AuditEntry {
  userId: string | null;
  role: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  description: string;
  previousValue?: unknown;
  newValue?: unknown;
  ip?: string;
}

// Append-only by convention: no route in this codebase updates or deletes audit_logs.
export async function writeAuditLog(entry: AuditEntry) {
  await db.collection("auditLogs").add({
    ...entry,
    resourceId: entry.resourceId ?? null,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    ip: entry.ip ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
