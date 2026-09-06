import { db, FieldValue } from "../config/firebase";
import { env } from "../config/env";

export type EmailType = "account_opening" | "staff_credentials" | "credentials_reset" | "password_reset" | "transfer_otp" | "withdrawal_otp";

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  relatedApplicationId?: string | null;
  type: EmailType;
}

function isGmailConfigured(): boolean {
  return Boolean(env.gmail.clientId && env.gmail.clientSecret && env.gmail.refreshToken);
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

// Sends via the Gmail REST API over HTTPS (not SMTP) — several hosts, Render's
// free tier included, block outbound SMTP ports entirely and every send just
// times out. The API works anywhere plain HTTPS does.
async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) {
    return cachedAccessToken.token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.gmail.clientId,
      client_secret: env.gmail.clientSecret,
      refresh_token: env.gmail.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMimeMessage(from: string, to: string, subject: string, text: string, html: string): string {
  const boundary = `xbank_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    "",
    `--${boundary}--`,
  ];
  return lines.join("\r\n");
}

async function sendViaGmail(to: string, subject: string, text: string, html: string): Promise<void> {
  const accessToken = await getAccessToken();
  const from = env.gmail.from || "me";
  const raw = base64UrlEncode(buildMimeMessage(from, to, subject, text, html));
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
}

/**
 * Sends real mail when Gmail API credentials are configured; otherwise writes
 * the fully-rendered message to the emailOutbox collection so the send is
 * still visible and testable (Admin > Sent Emails) without needing credentials.
 */
export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  const configured = isGmailConfigured();
  let delivered = false;
  let error: string | null = null;

  if (configured) {
    try {
      await sendViaGmail(message.to, message.subject, message.text, message.html);
      delivered = true;
    } catch (err: any) {
      error = err?.message ?? "Unknown Gmail API error";
    }
  }

  await db.collection("emailOutbox").add({
    to: message.to,
    subject: message.subject,
    bodyText: message.text,
    bodyHtml: message.html,
    relatedApplicationId: message.relatedApplicationId ?? null,
    type: message.type,
    status: delivered ? "sent" : configured ? "failed" : "simulated",
    error,
    sentAt: FieldValue.serverTimestamp(),
  });

  return { delivered };
}

export function renderCredentialsEmail(params: {
  fullName: string;
  accountNumber: string;
  userId: string;
  tempPassword: string;
}) {
  const { fullName, accountNumber, userId, tempPassword } = params;
  const subject = "Your X Bank account is ready";
  const text = `Hello ${fullName},

Your X Bank account has been approved and is now active.

Account Number: ${accountNumber}
User ID: ${userId}
Temporary Password: ${tempPassword}

Log in at the X Bank portal using your User ID and this temporary password.
You will be required to set a new password on your first login.

For your security, never share your User ID or password with anyone, including X Bank staff.

— X Bank`;

  const html = `<p>Hello ${fullName},</p>
<p>Your X Bank account has been approved and is now active.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td><b>Account Number</b></td><td>${accountNumber}</td></tr>
<tr><td><b>User ID</b></td><td>${userId}</td></tr>
<tr><td><b>Temporary Password</b></td><td>${tempPassword}</td></tr>
</table>
<p>Log in at the X Bank portal using your User ID and this temporary password. You will be required to set a new password on your first login.</p>
<p style="color:#888;font-size:12px">For your security, never share your User ID or password with anyone, including X Bank staff.</p>
<p>— X Bank</p>`;

  return { subject, text, html };
}

export function renderPasswordResetEmail(params: { fullName: string; resetLink: string }) {
  const { fullName, resetLink } = params;
  const subject = "Reset your X Bank password";
  const text = `Hello ${fullName},

We received a request to reset your X Bank password. Click the link below to choose a new one:

${resetLink}

If you didn't request this, you can safely ignore this email — your password will not change.

This link will expire soon for your security.

— X Bank`;

  const html = `<p>Hello ${fullName},</p>
<p>We received a request to reset your X Bank password. Click the link below to choose a new one:</p>
<p><a href="${resetLink}">${resetLink}</a></p>
<p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email — your password will not change. This link will expire soon for your security.</p>
<p>— X Bank</p>`;

  return { subject, text, html };
}

export function renderTransferOtpEmail(params: {
  fullName: string;
  otp: string;
  amount: number;
  currency: string;
  receiverAccountNumber: string;
}) {
  const { fullName, otp, amount, currency, receiverAccountNumber } = params;
  const subject = "Your X Bank transfer confirmation code";
  const text = `Hello ${fullName},

Use this code to confirm your transfer of ${amount} ${currency} to account ${receiverAccountNumber}:

${otp}

This code expires in 2 minutes. If you didn't request this transfer, do not share this code with anyone and contact X Bank support.

— X Bank`;

  const html = `<p>Hello ${fullName},</p>
<p>Use this code to confirm your transfer of <b>${amount} ${currency}</b> to account <b>${receiverAccountNumber}</b>:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
<p style="color:#888;font-size:12px">This code expires in 2 minutes. If you didn't request this transfer, do not share this code with anyone and contact X Bank support.</p>
<p>— X Bank</p>`;

  return { subject, text, html };
}

export function renderCashWithdrawalOtpEmail(params: {
  fullName: string;
  otp: string;
  amount: number;
  currency: string;
  accountNumber: string;
}) {
  const { fullName, otp, amount, currency, accountNumber } = params;
  const subject = "Your X Bank cash withdrawal confirmation code";
  const text = `Hello ${fullName},

A branch teller has requested a cash withdrawal of ${amount} ${currency} from your account ${accountNumber}. Use this code to confirm it:

${otp}

This code expires in 2 minutes. If you didn't authorize this withdrawal, do not share this code with anyone and contact X Bank support immediately.

— X Bank`;

  const html = `<p>Hello ${fullName},</p>
<p>A branch teller has requested a cash withdrawal of <b>${amount} ${currency}</b> from your account <b>${accountNumber}</b>. Use this code to confirm it:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
<p style="color:#888;font-size:12px">This code expires in 2 minutes. If you didn't authorize this withdrawal, do not share this code with anyone and contact X Bank support immediately.</p>
<p>— X Bank</p>`;

  return { subject, text, html };
}

export function renderStaffCredentialsEmail(params: {
  fullName: string;
  role: string;
  userId: string;
  tempPassword: string;
}) {
  const { fullName, role, userId, tempPassword } = params;
  const roleLabel = role.replace(/_/g, " ");
  const subject = "Your X Bank staff account is ready";
  const text = `Hello ${fullName},

An administrator has created a ${roleLabel} account for you on the X Bank internal platform.

User ID: ${userId}
Temporary Password: ${tempPassword}

Log in and select "${roleLabel}" as your role. You will be required to set a new password on first login.

— X Bank`;

  const html = `<p>Hello ${fullName},</p>
<p>An administrator has created a <b>${roleLabel}</b> account for you on the X Bank internal platform.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td><b>User ID</b></td><td>${userId}</td></tr>
<tr><td><b>Temporary Password</b></td><td>${tempPassword}</td></tr>
</table>
<p>Log in and select "${roleLabel}" as your role. You will be required to set a new password on first login.</p>
<p>— X Bank</p>`;

  return { subject, text, html };
}
