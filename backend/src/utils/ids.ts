import { customAlphabet } from "nanoid";

const digits8 = customAlphabet("0123456789", 8);
const digits5 = customAlphabet("0123456789", 5);
const alphaNum = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

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

/** Fixed default password for all newly issued/reset accounts — must be changed on first login. */
export function generateTempPassword() {
  return "123456";
}

export function generateReference(prefix: string) {
  return `${prefix}-${alphaNum()}`;
}

export function generateApplicationId() {
  return `APP-${alphaNum()}`;
}
