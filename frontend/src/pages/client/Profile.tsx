import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { Card, LoadingState, PageHeader, PrimaryButton } from "../../components/Shared";

interface CustomerDetails {
  phone?: string;
  address?: string;
}

export default function Profile() {
  const { profile, logout } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ customer: CustomerDetails | null }>("/api/client/dashboard/summary").then((data) => {
      setPhone(data.customer?.phone ?? "");
      setAddress(data.customer?.address ?? "");
      setLoaded(true);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !address.trim()) {
      setError("Phone and address can't be empty.");
      return;
    }
    await api.patch("/api/client/profile", { phone: phone.trim(), address: address.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div>
      <PageHeader title="Profile" subtitle="Update your contact details." />
      <Card className="max-w-md p-6">
        <dl className="mb-6 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Name</dt><dd className="font-medium text-navy-900">{profile?.customer?.fullName}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Customer ID</dt><dd className="font-mono text-navy-900">{profile?.customer?.customerCode}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="font-medium text-navy-900">{profile?.email}</dd></div>
        </dl>
        {!loaded ? (
          <LoadingState />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
              <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
              <input required value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <PrimaryButton type="submit">Save changes</PrimaryButton>
            {saved && <p className="text-sm text-teal-700">Saved.</p>}
          </form>
        )}
        <div className="mt-6 border-t border-slate-100 pt-4">
          <button
            onClick={() => logout()}
            className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            Log out
          </button>
        </div>
      </Card>
    </div>
  );
}
