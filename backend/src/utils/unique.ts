import { db } from "../config/firebase";
import { generateAccountNumber, generateUserId } from "./ids";

async function isTaken(collection: string, field: string, value: string): Promise<boolean> {
  const snap = await db.collection(collection).where(field, "==", value).limit(1).get();
  return !snap.empty;
}

export async function generateUniqueAccountNumber(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = generateAccountNumber();
    if (!(await isTaken("accounts", "accountNumber", candidate))) return candidate;
  }
  throw new Error("Could not generate a unique account number after 20 attempts.");
}

export async function generateUniqueUserId(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = generateUserId();
    if (!(await isTaken("users", "userId", candidate))) return candidate;
  }
  throw new Error("Could not generate a unique user ID after 20 attempts.");
}

// Staff accounts (admin, compliance, employee) get short sequential IDs instead of
// random ones — the seed reserves 00001-00004 for the demo staff, so this counter
// starts new hires at 00005. Client User IDs stay random (unpredictable on purpose
// for externally-facing bank logins).
const STAFF_COUNTER_REF = db.collection("counters").doc("staffUserId");

export async function generateSequentialStaffUserId(): Promise<string> {
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(STAFF_COUNTER_REF);
    const current = snap.exists ? (snap.data()!.next as number) : 1;
    tx.set(STAFF_COUNTER_REF, { next: current + 1 }, { merge: true });
    return current;
  });
  return String(next).padStart(5, "0");
}
