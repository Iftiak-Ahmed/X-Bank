export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export function isLocked(failedLoginCount: number | undefined, lastFailedLoginAt: FirebaseFirestore.Timestamp | undefined): boolean {
  const lastFailedAt = lastFailedLoginAt?.toMillis?.() ?? 0;
  return (failedLoginCount ?? 0) >= MAX_FAILED_ATTEMPTS && Date.now() - lastFailedAt < LOCKOUT_MS;
}
