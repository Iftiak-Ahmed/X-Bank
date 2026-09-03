import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import { auth, db } from "../config/firebase";
import { env } from "../config/env";

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.clientOrigin, credentials: true },
  });

  io.on("connection", async (socket: Socket) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return socket.disconnect(true);

      const decoded = await auth.verifyIdToken(token);
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      const role = userDoc.exists ? userDoc.data()!.role : null;

      if (role === "compliance_officer") socket.join("officers");
      if (role === "compliance_manager") socket.join("officers"), socket.join("managers");
      if (role === "admin") socket.join("managers");
      if (!["compliance_officer", "compliance_manager", "admin"].includes(role)) {
        return socket.disconnect(true);
      }
    } catch {
      socket.disconnect(true);
    }
  });

  return io;
}

export function emitAlertCreated(payload: unknown, riskLevel: string) {
  if (!io) return;
  io.to("officers").emit("alert.created", payload);
  if (riskLevel === "critical") io.to("managers").emit("alert.created", payload);
}

export function emitTransactionCleared(payload: unknown) {
  io?.to("officers").emit("transaction.cleared", payload);
}

export function emitAlertUpdated(payload: unknown) {
  io?.to("officers").emit("alert.updated", payload);
  io?.to("managers").emit("alert.updated", payload);
}

export function emitKycStatusChanged(payload: unknown) {
  io?.to("officers").emit("kyc.status_changed", payload);
}
