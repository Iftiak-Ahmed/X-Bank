import { FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { Card, PageHeader, PrimaryButton } from "../../components/Shared";

export default function Profile() {
  const { profile } = useAuth();
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await api.patch("/api/client/profile", { phone, address });
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Leave blank to keep current" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Leave blank to keep current" />
          </div>
          <PrimaryButton type="submit">Save changes</PrimaryButton>
          {saved && <p className="text-sm text-teal-700">Saved.</p>}
        </form>
      </Card>
    </div>
  );
}
