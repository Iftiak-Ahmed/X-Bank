import crypto from "node:crypto";
import sharp from "sharp";
import { db } from "../config/firebase";

// KYC documents are stored in Firestore (base64) rather than on local disk or
// Firebase Storage: Render's free tier has no persistent disk — every deploy
// wiped previously-uploaded files — and Cloud Storage now requires the paid
// Blaze plan. Firestore documents cap out around 1 MiB, and base64 inflates
// size by ~33%, so anything large gets recompressed before it's stored.
const MAX_STORED_BYTES = 700_000;

export type DocumentKind = "nidFront" | "nidBack" | "signature" | "ownPhoto";

function docId(applicationId: string, filename: string): string {
  return `${applicationId}__${filename}`;
}

async function fitForStorage(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= MAX_STORED_BYTES) return { buffer, mimeType };

  for (const { width, quality } of [
    { width: 1600, quality: 70 },
    { width: 1200, quality: 55 },
    { width: 900, quality: 40 },
  ]) {
    const resized = await sharp(buffer).resize({ width, withoutEnlargement: true }).jpeg({ quality }).toBuffer();
    if (resized.length <= MAX_STORED_BYTES) return { buffer: resized, mimeType: "image/jpeg" };
  }
  // Last resort: whatever the smallest attempt produced, even if still over.
  const smallest = await sharp(buffer).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 30 }).toBuffer();
  return { buffer: smallest, mimeType: "image/jpeg" };
}

export async function saveKycDocument(
  applicationId: string,
  kind: DocumentKind,
  buffer: Buffer,
  mimeType: string
): Promise<{ filename: string; hash: string; mimeType: string }> {
  const fitted = await fitForStorage(buffer, mimeType);
  const ext = fitted.mimeType === "image/png" ? "png" : fitted.mimeType === "image/webp" ? "webp" : "jpg";
  const filename = `${kind}.${ext}`;
  const hash = hashBuffer(fitted.buffer);

  await db.collection("kycFiles").doc(docId(applicationId, filename)).set({
    applicationId,
    filename,
    mimeType: fitted.mimeType,
    data: fitted.buffer.toString("base64"),
    sizeBytes: fitted.buffer.length,
  });

  return { filename, hash, mimeType: fitted.mimeType };
}

export async function readKycDocument(applicationId: string, filename: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const snap = await db.collection("kycFiles").doc(docId(applicationId, filename)).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return { buffer: Buffer.from(data.data, "base64"), mimeType: data.mimeType };
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
