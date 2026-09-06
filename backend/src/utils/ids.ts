import { customAlphabet } from "nanoid";

const digits8 = customAlphabet("0123456789", 8);
const digits5 = customAlphabet("0123456789", 5);
const alphaNum = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const tempPasswordUpper = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ", 4);
const tempPasswordDigits = customAlphabet("0123456789", 4);
const tempPasswordSpecial = customAlphabet("!@#$%&*", 2);

export function generateCustomerCode() {
  return `MSB-${digits8()}`;
}

/** Exactly 8 digits, e.g. "48273195". Leading zero is fine — it's a string, not a number. */
export function generateAccountNumber() {
  return digits8();
}

/** Exactly 5 digits, e.g. "58321". Used as the client-facing login identifier. */
export function generateUserId() {
  return digits5();
}

/**
 * Random one-time password for newly issued/reset accounts — must be changed on
 * first login (enforced server-side by requireAuth, not just the frontend redirect).
 * Guaranteed to satisfy the same policy customers must meet when they set their own
 * password: 8+ characters, an uppercase letter, and a special character.
 */
export function generateTempPassword() {
  const chars = `${tempPasswordUpper()}${tempPasswordDigits()}${tempPasswordSpecial()}`;
  return chars
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

export function generateReference(prefix: string) {
  return `${prefix}-${alphaNum()}`;
}

/** Exactly 5 digits, e.g. "58321". One-time code emailed to confirm a transfer. */
export function generateTransferOtp() {
  return digits5();
}

export function generateApplicationId() {
  return `APP-${alphaNum()}`;
}
