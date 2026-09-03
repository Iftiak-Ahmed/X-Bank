import { io, Socket } from "socket.io-client";
import { firebaseAuth } from "./firebase";

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  if (socket?.connected) return socket;

  const token = await user.getIdToken();
  socket = io(import.meta.env.VITE_API_BASE_URL as string, { auth: { token } });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
