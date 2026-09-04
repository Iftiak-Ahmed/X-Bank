import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, dashboardPathForRole, LoginRoleOption } from "../../context/AuthContext";
import { Logo } from "../../components/Logo";

const ROLE_OPTIONS: { value: LoginRoleOption; label: string }[] = [
  { value: "client", label: "Customer" },
  { value: "employee", label: "Banking Executive" },
  { value: "compliance", label: "Compliance Officer" },
  { value: "admin", label: "System Administrator" },
];

export default function Login() {
  const { login, awaitingApproval } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<LoginRoleOption>("client");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const profile = await login(role, userId.trim(), password);
      if (profile.mustChangePassword) navigate("/change-password");
      else navigate(dashboardPathForRole(profile.role));
    } catch (err: any) {
      setError(err.message ?? "Invalid User ID, role, or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center">
          <Logo className="h-10 w-auto" />
        </Link>
        <div className="rounded-xl border border-slate-300 bg-white p-8 shadow-sm">
          <h1 className="font-serif text-xl font-semibold text-navy-900">Log in</h1>
          <p className="mt-1 text-sm text-slate-500">Access your X Bank account.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as LoginRoleOption)}
                className="mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">User ID</label>
              <input
                type="text"
                required
                inputMode="numeric"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm font-mono shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="e.g. 58321"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-400 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {awaitingApproval && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Waiting for an administrator to approve this login — please keep this page open.
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-50"
            >
              {awaitingApproval ? "Awaiting approval…" : submitting ? "Signing in…" : "Log in"}
            </button>
            <Link to="/forgot-password" className="block text-center text-xs font-semibold text-teal-700">
              Forgot password?
            </Link>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          New to X Bank?{" "}
          <Link to="/register" className="font-semibold text-teal-700">
            Open an account
          </Link>
        </p>
      </div>
    </div>
  );
}
