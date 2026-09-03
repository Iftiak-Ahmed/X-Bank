import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth, dashboardPathForRole } from "../../context/AuthContext";

export default function ChangePassword() {
  const { profile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) return setError("Passwords do not match.");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters.");

    setSubmitting(true);
    try {
      await api.post("/api/auth/change-password", { newPassword });
      await refreshProfile();
      navigate(profile ? dashboardPathForRole(profile.role) : "/login");
    } catch (err: any) {
      setError(err.message ?? "Could not change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="font-serif text-xl font-semibold text-navy-900">Set a new password</h1>
        <p className="mt-1 text-sm text-slate-500">
          You're using a temporary password. Choose a new one to continue to your dashboard.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">New password</label>
            <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Confirm password</label>
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50">
            {submitting ? "Saving…" : "Set password"}
          </button>
        </form>
        <button onClick={() => logout()} className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600">
          Log out instead
        </button>
      </div>
    </div>
  );
}
