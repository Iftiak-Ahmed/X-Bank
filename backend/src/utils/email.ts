import nodemailer, { Transporter } from "nodemailer";
import { db, FieldValue } from "../config/firebase";
import { env } from "../config/env";

export type EmailType = "account_opening" | "staff_credentials" | "credentials_reset" | "password_reset";

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  relatedApplicationId?: string | null;
  type: EmailType;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

/**
 * Sends real mail when SMTP credentials are configured; otherwise writes the
 * fully-rendered message to the emailOutbox collection so the send is still
 * visible and testable (Admin > Sent Emails) without needing credentials.
 */
export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  const t = getTransporter();
  let delivered = false;
  let error: string | null = null;

  if (t) {
    try {
      await t.sendMail({ from: env.smtp.from ?? env.smtp.user!, to: message.to, subject: message.subject, text: message.text, html: message.html });
      delivered = true;
    } catch (err: any) {
      error = err?.message ?? "Unknown SMTP error";
    }
  }

  await db.collection("emailOutbox").add({
    to: message.to,
    subject: message.subject,
    bodyText: message.text,
    bodyHtml: message.html,
    relatedApplicationId: message.relatedApplicationId ?? null,
    type: message.type,
    status: delivered ? "sent" : t ? "failed" : "simulated",
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
