import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth, dashboardPathForRole } from "../../context/AuthContext";
import { passwordRequirements, passwordStrength } from "../../lib/passwordStrength";
import { PasswordInput } from "../../components/Shared";

const STRENGTH_LABEL: Record<string, string> = { weak: "Weak", medium: "Medium", strong: "Strong" };
const STRENGTH_COLOR: Record<string, string> = { weak: "bg-red-500", medium: "bg-amber-500", strong: "bg-teal-600" };
const STRENGTH_TEXT: Record<string, string> = { weak: "text-red-600", medium: "text-amber-600", strong: "text-teal-700" };
const STRENGTH_WIDTH: Record<string, string> = { weak: "w-1/3", medium: "w-2/3", strong: "w-full" };

export default function ChangePassword() {
  const { profile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requirements = passwordRequirements(newPassword);
  const meetsRequirements = requirements.length && requirements.upper && requirements.special;
  const strength = passwordStrength(newPassword);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) return setError("Passwords do not match.");
    if (!requirements.length) return setError("Password must be at least 8 characters.");
    if (!requirements.upper) return setError("Password must include at least one uppercase letter.");
    if (!requirements.special) return setError("Password must include at least one special character.");

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
            <PasswordInput
              required
              value={newPassword}
              onChange={setNewPassword}
              className="mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
            />

            {newPassword && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full transition-all ${STRENGTH_COLOR[strength]} ${STRENGTH_WIDTH[strength]}`} />
                </div>
                <p className={`mt-1 text-xs font-semibold ${STRENGTH_TEXT[strength]}`}>{STRENGTH_LABEL[strength]} password</p>
              </div>
            )}

            <ul className="mt-2 space-y-0.5 text-xs">
              <li className={requirements.length ? "text-teal-700" : "text-slate-400"}>
                {requirements.length ? "✓" : "•"} At least 8 characters
              </li>
              <li className={requirements.upper ? "text-teal-700" : "text-slate-400"}>
                {requirements.upper ? "✓" : "•"} One uppercase letter
              </li>
              <li className={requirements.special ? "text-teal-700" : "text-slate-400"}>
                {requirements.special ? "✓" : "•"} One special character (e.g. # ! @ %)
              </li>
            </ul>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Confirm password</label>
            <PasswordInput
              required
              value={confirm}
              onChange={setConfirm}
              className="mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !meetsRequirements}
            className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
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
