import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";

interface LoginRequest {
  id: string;
  userId: string;
  role: string;
  email: string;
  fullName: string;
  createdAt: unknown;
}

export function LoginApprovalPanel() {
  const [requests, setRequests] = useState<LoginRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.get<LoginRequest[]>("/api/admin/login-requests?status=pending").then(setRequests);

    let cleanup = () => {};
    getSocket().then((socket) => {
      if (!socket) return;
      const onRequested = (payload: LoginRequest) => {
        setRequests((prev) => (prev.some((r) => r.id === payload.id) ? prev : [payload, ...prev]));
      };
      const onResolved = ({ id }: { id: string }) => {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      };
      socket.on("login.requested", onRequested);
      socket.on("login.resolved", onResolved);
      cleanup = () => {
        socket.off("login.requested", onRequested);
        socket.off("login.resolved", onResolved);
      };
    });
    return () => cleanup();
  }, []);

  async function respond(id: string, action: "approve" | "deny") {
    setBusyId(id);
    try {
      await api.post(`/api/admin/login-requests/${id}/${action}`);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Login request</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700">{r.role}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-navy-900">{r.fullName}</p>
          <p className="text-xs text-slate-500">{r.email} · User ID {r.userId}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => respond(r.id, "approve")}
              disabled={busyId === r.id}
              className="flex-1 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy-800 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => respond(r.id, "deny")}
              disabled={busyId === r.id}
              className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
