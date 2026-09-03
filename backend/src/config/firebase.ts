import admin from "firebase-admin";
import { env } from "./env";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(env.googleCredentialsPath),
    projectId: env.firebaseProjectId,
  });
}

export const auth = admin.auth();
export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
