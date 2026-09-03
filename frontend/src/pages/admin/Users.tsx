import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, Td, Th } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";
import { useAuth } from "../../context/AuthContext";

const ROLES = ["employee", "compliance_officer", "compliance_manager", "admin"];

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: "", email: "", role: "employee", department: "", branch: "" });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ userId: string; tempPassword: string; emailDelivered: boolean } | null>(null);

  function load() {
    api.get<any[]>("/api/admin/users").then((u) => {
      setUsers(u);
      setLoading(false);
    });
  }
  useEffect(load, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    try {
      const result = await api.post<{ userId: string; tempPassword: string; emailDelivered: boolean }>("/api/admin/users", form);
      setCreated(result);
      setForm({ fullName: "", email: "", role: "employee", department: "", branch: "" });
      load();
    } catch (err: any) {
      setError(err.message ?? "Failed to create user.");
    }
  }

  async function toggleStatus(uid: string, current: string) {
    const next = current === "active" ? "suspended" : "active";
    await api.patch(`/api/admin/users/${uid}/status`, { status: next });
    load();
  }

  async function resetCredentials(uid: string) {
    const result = await api.post<{ tempPassword: string }>(`/api/admin/users/${uid}/reset-credentials`);
    setCreated({ userId: "(existing)", tempPassword: result.tempPassword, emailDelivered: false });
  }

  async function deleteUser(uid: string, email: string) {
    if (!confirm(`Delete the account for ${email}? This permanently removes their login and can't be undone.`)) return;
    try {
      await api.delete(`/api/admin/users/${uid}`);
      load();
    } catch (err: any) {
      setError(err.message ?? "Failed to delete user.");
    }
  }

  async function unlockUser(uid: string) {
    await api.post(`/api/admin/users/${uid}/unlock`);
    load();
  }

  return (
    <div>
      <PageHeader title="User Management" subtitle="Create and manage staff accounts. Credentials are generated automatically." />

      <Card className="mb-6 p-5">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">New staff account</h2>
        <form onSubmit={createUser} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input required placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
          </select>
          <input placeholder="Department (optional)" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Branch (optional)" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <PrimaryButton type="submit">Create</PrimaryButton>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {created && (
          <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
            Credentials generated — User ID <span className="font-mono font-semibold">{created.userId}</span>, temp password{" "}
            <span className="font-mono font-semibold">{created.tempPassword}</span>.{" "}
            {created.emailDelivered ? "Emailed to the staff member." : "Also saved to the email outbox (no SMTP configured)."}
          </div>
        )}
      </Card>

      <Card>
        {loading ? <LoadingState /> : users.length === 0 ? <EmptyState message="No users." /> : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Email</Th><Th>User ID</Th><Th>Role</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>{u.email}</Td>
                  <Td className="font-mono text-xs">{u.userId ?? "—"}</Td>
                  <Td className="capitalize">{u.role?.replace("_", " ")}</Td>
                  <Td className="space-x-1.5">
                    <StatusPill status={u.status} />
                    {u.locked && <StatusPill status="locked" />}
                  </Td>
                  <Td className="space-x-3">
                    <button onClick={() => toggleStatus(u.id, u.status)} className="text-xs font-semibold text-teal-700">
                      {u.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                    {u.locked && (
                      <button onClick={() => unlockUser(u.id)} className="text-xs font-semibold text-amber-700">
                        Unlock
                      </button>
                    )}
                    {u.role !== "client" && (
                      <button onClick={() => resetCredentials(u.id)} className="text-xs font-semibold text-slate-500">
                        Reset credentials
                      </button>
                    )}
                    {u.role !== "client" && u.id !== profile?.uid && (
                      <button onClick={() => deleteUser(u.id, u.email)} className="text-xs font-semibold text-red-600">
                        Delete
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
