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
  // Gmail API (OAuth2, HTTPS) — used instead of raw SMTP because several hosts
  // (Render's free tier included) block outbound SMTP ports entirely, silently
  // timing out every send.
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID ?? "",
    clientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
    refreshToken: process.env.GMAIL_REFRESH_TOKEN ?? "",
    from: process.env.GMAIL_FROM ?? "",
  },
};
