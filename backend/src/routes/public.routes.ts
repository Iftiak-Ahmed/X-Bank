import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { auth, db, FieldValue } from "../config/firebase";
import { generateApplicationId } from "../utils/ids";
import { hashBuffer, saveKycDocument } from "../utils/fileStorage";
import { writeAuditLog } from "../utils/audit";
import { applicationRateLimit } from "../middleware/rateLimit";

export const publicRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Only JPEG, PNG, or WebP images are allowed."));
    cb(null, true);
  },
});

const applicationSchema = z.object({
  fullName: z.string().min(2),
  dateOfBirth: z.string().min(4),
  gender: z.enum(["male", "female", "other"]),
  email: z.string().email(),
  phone: z.string().min(6),
  address: z.string().min(4),
  occupation: z.string().min(2),
  nationality: z.string().min(2),
  nidNumber: z.string().min(5),
});

publicRouter.post(
  "/applications",
  applicationRateLimit,
  upload.fields([
    { name: "nidFront", maxCount: 1 },
    { name: "nidBack", maxCount: 1 },
    { name: "signature", maxCount: 1 },
  ]),
  async (req, res) => {
    const parsed = applicationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const nidFront = files?.nidFront?.[0];
    const nidBack = files?.nidBack?.[0];
    const signature = files?.signature?.[0];
    if (!nidFront || !nidBack || !signature) {
      return res.status(400).json({ error: "NID front, NID back, and signature images are all required." });
    }

    const existingUser = await auth.getUserByEmail(parsed.data.email).catch(() => null);
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    const existingPending = await db
      .collection("clientApplications")
      .where("email", "==", parsed.data.email)
      .where("status", "in", ["pending_approval", "info_requested"])
      .limit(1)
      .get();
    if (!existingPending.empty) {
      return res.status(409).json({ error: "An application with this email is already pending review." });
    }

    const applicationId = generateApplicationId();
    const documents = {
      nidFront: { filename: saveKycDocument(applicationId, "nidFront", nidFront.buffer, nidFront.mimetype), hash: hashBuffer(nidFront.buffer), mimeType: nidFront.mimetype },
      nidBack: { filename: saveKycDocument(applicationId, "nidBack", nidBack.buffer, nidBack.mimetype), hash: hashBuffer(nidBack.buffer), mimeType: nidBack.mimetype },
      signature: { filename: saveKycDocument(applicationId, "signature", signature.buffer, signature.mimetype), hash: hashBuffer(signature.buffer), mimeType: signature.mimetype },
    };

    await db
      .collection("clientApplications")
      .doc(applicationId)
      .set({
        ...parsed.data,
        documents,
        status: "pending_approval",
        reviewRemarks: null,
        reviewedBy: null,
        reviewedAt: null,
        linkedUserId: null,
        linkedCustomerId: null,
        accountNumber: null,
        createdAt: FieldValue.serverTimestamp(),
      });

    await writeAuditLog({
      userId: null,
      role: null,
      action: "kyc.submitted",
      resource: "clientApplications",
      resourceId: applicationId,
      description: `New client application ${applicationId} submitted by ${parsed.data.email}.`,
      ip: req.ip,
    });

    const adminsSnap = await db.collection("users").where("role", "==", "admin").where("status", "==", "active").get();
    await Promise.all(
      adminsSnap.docs.map((a) =>
        db.collection("notifications").add({
          userId: a.id,
          type: "new_application",
          message: `New client application from ${parsed.data.fullName} is awaiting KYC review.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        })
      )
    );

    res.status(201).json({ applicationId, status: "pending_approval" });
  }
);
