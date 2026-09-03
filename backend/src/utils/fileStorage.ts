import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// KYC documents are stored on local disk rather than Firebase Storage: the
// project's Firebase plan doesn't have Cloud Storage provisioned (it needs a
// billing account we deliberately did not attach), and this is a synthetic-data
// academic prototype anyway. Access is gated entirely by our own auth/rbac
// middleware — files are never served from a public path.
const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "kyc");

export type DocumentKind = "nidFront" | "nidBack" | "signature" | "ownPhoto";

export function ensureUploadDir(applicationId: string): string {
  const dir = path.join(UPLOAD_ROOT, applicationId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveKycDocument(applicationId: string, kind: DocumentKind, buffer: Buffer, mimeType: string): string {
  const dir = ensureUploadDir(applicationId);
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const filename = `${kind}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return filename; // stored relative to the application's folder
}

export function readKycDocument(applicationId: string, filename: string): { buffer: Buffer; mimeType: string } {
  // filenames are backend-generated (see saveKycDocument), never taken from user input,
  // so there is no path-traversal surface here.
  const safeApplicationId = path.basename(applicationId);
  const safeFilename = path.basename(filename);
  const fullPath = path.join(UPLOAD_ROOT, safeApplicationId, safeFilename);
  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(safeFilename).slice(1);
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { buffer, mimeType };
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
