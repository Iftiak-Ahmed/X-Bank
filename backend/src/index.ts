import express from "express";
import cors from "cors";
import http from "node:http";
import { env } from "./config/env";
import { initRealtime } from "./realtime/socket";
import { authRouter } from "./routes/auth.routes";
import { publicRouter } from "./routes/public.routes";
import { clientRouter } from "./routes/client.routes";
import { employeeRouter } from "./routes/employee.routes";
import { complianceRouter } from "./routes/compliance.routes";
import { adminRouter } from "./routes/admin.routes";
import { notificationsRouter } from "./routes/notifications.routes";

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (request likely failed, server staying up):", err);
});

const app = express();
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "meridian-sentinel-backend" }));

app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);
app.use("/api/client", clientRouter);
app.use("/api/employee", employeeRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const httpServer = http.createServer(app);
initRealtime(httpServer);

httpServer.listen(env.port, () => {
  console.log(`X Bank backend listening on http://localhost:${env.port}`);
});
