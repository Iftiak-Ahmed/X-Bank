import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  firebaseProjectId: required("FIREBASE_PROJECT_ID"),
  googleCredentialsPath: path.resolve(
    process.cwd(),
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./secrets/firebase-admin-key.json"
  ),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  largeTransactionThreshold: Number(process.env.LARGE_TRANSACTION_THRESHOLD ?? 200000),
  highRiskLocations: (process.env.HIGH_RISK_LOCATIONS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  monitoringIntervalMs: Number(process.env.MONITORING_INTERVAL_MS ?? 30000),
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY ?? "",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",
  },
};
