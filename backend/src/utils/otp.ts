import crypto from "node:crypto";

export const OTP_TTL_MS = 2 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}
