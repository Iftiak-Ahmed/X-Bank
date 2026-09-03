import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { Card, PageHeader, PrimaryButton } from "../../components/Shared";

export default function StaffProfile() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await api.patch("/api/auth/profile", { fullName, email });
      await refreshProfile();
      setSaved(true);
    } catch (err: any) {
      setError(err.message ?? "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Update your own name and email." />
      <Card className="max-w-md p-6">
        <dl className="mb-6 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">User ID</dt><dd className="font-mono text-navy-900">{profile?.userId}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Role</dt><dd className="capitalize text-navy-900">{profile?.role?.replace(/_/g, " ")}</dd></div>
        </dl>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Full name</label>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-slate-400">Used to log in and receive notifications.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-teal-700">Saved.</p>}
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</PrimaryButton>
        </form>
        <Link to="/change-password" className="mt-4 inline-block text-xs font-semibold text-slate-500 hover:text-slate-700">
          Change password →
        </Link>
      </Card>
    </div>
  );
}
