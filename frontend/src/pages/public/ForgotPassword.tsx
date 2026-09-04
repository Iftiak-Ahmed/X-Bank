import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Logo } from "../../components/Logo";

const ROLE_OPTIONS = [
  { value: "client", label: "Customer" },
  { value: "employee", label: "Banking Executive" },
  { value: "compliance", label: "Compliance Officer" },
  { value: "admin", label: "System Administrator" },
];

export default function ForgotPassword() {
  const [role, setRole] = useState("client");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/auth/forgot-password", { role, userId });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center">
          <Logo className="h-10 w-auto" />
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="font-serif text-xl font-semibold text-navy-900">Forgot password</h1>
          <p className="mt-1 text-sm text-slate-500">We'll email a reset link to the address on file.</p>

          {submitted ? (
            <div className="mt-6 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
              If that account exists, a password reset link has been sent to the email on file. Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="e.g. 58321"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-semibold text-teal-700">Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
