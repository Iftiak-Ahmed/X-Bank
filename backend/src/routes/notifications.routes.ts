import { Router } from "express";
import { db } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", asyncHandler(async (req, res) => {
  const snap = await db
    .collection("notifications")
    .where("userId", "==", req.user!.uid)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}));

notificationsRouter.patch("/:id/read", asyncHandler(async (req, res) => {
  const ref = db.collection("notifications").doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.userId !== req.user!.uid) return res.status(404).json({ error: "Not found" });
  await ref.update({ read: true });
  res.status(204).end();
}));
