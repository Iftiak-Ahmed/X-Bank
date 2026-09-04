import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, Td, Th } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";
import { useAuth } from "../../context/AuthContext";

const ROLES = ["employee", "compliance_officer", "admin"];

const ROLE_LABELS: Record<string, string> = {
  client: "Customer",
  employee: "Banking Executive",
  compliance_officer: "Compliance Officer",
  admin: "System Administrator",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", role: "employee", department: "", branch: "", userId: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ userId: string; tempPassword: string; emailDelivered: boolean } | null>(null);
  const isBankingExecutive = form.role === "employee";

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
      const { userId, password, ...rest } = form;
      const payload = isBankingExecutive ? { ...rest, userId, password } : rest;
      const result = await api.post<{ userId: string; tempPassword: string; emailDelivered: boolean }>("/api/admin/users", payload);
      setCreated(result);
      setForm({ fullName: "", email: "", role: "employee", department: "", branch: "", userId: "", password: "" });
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

  async function deleteUser(uid: string, email: string, role: string) {
    const message =
      role === "client"
        ? `Delete ${email}? This permanently removes their login, bank accounts, customer profile, and KYC record. Can't be undone.`
        : `Delete the account for ${email}? This permanently removes their login and can't be undone.`;
    if (!confirm(message)) return;
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

  const needle = search.trim().toLowerCase();
  const filteredUsers = !needle
    ? users
    : users.filter((u) => {
        const currentAccountNumbers = (u.accounts ?? []).filter((a: any) => a.accountType === "current").map((a: any) => a.accountNumber);
        const haystack = [u.fullName, u.email, u.userId, ...currentAccountNumbers].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(needle);
      });

  return (
    <div>
      <PageHeader title="User Management" subtitle="Create and manage staff accounts. Credentials are generated automatically, except Banking Executive." />

      <Card className="mb-6 p-5">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">New staff account</h2>
        <form onSubmit={createUser} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input required placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <input placeholder="Department (optional)" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Branch (optional)" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          {isBankingExecutive && (
            <>
              <input required placeholder="User ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              <input required type="text" placeholder="Password (min 8 characters)" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </>
          )}
          <PrimaryButton type="submit">Create</PrimaryButton>
        </form>
        {isBankingExecutive && (
          <p className="mt-2 text-xs text-slate-400">Banking Executive accounts use a User ID and password you set here, instead of auto-generated ones.</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {created && (
          <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
            Credentials — User ID <span className="font-mono font-semibold">{created.userId}</span>, temp password{" "}
            <span className="font-mono font-semibold">{created.tempPassword}</span>.{" "}
            {created.emailDelivered ? "Emailed to the staff member." : "Also saved to the email outbox (no SMTP configured)."}
          </div>
        )}
      </Card>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, User ID, or account number…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 sm:w-80"
        />
      </div>

      <Card>
        {loading ? <LoadingState /> : filteredUsers.length === 0 ? (
          <EmptyState message={users.length === 0 ? "No users." : "No users match your search."} />
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Name</Th><Th>Account Number</Th><Th>Role</Th><Th>Status</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <Td>{u.fullName ?? "—"}</Td>
                  <Td className="font-mono text-xs">
                    {(() => {
                      const currentAccounts = (u.accounts ?? []).filter((a: any) => a.accountType === "current");
                      if (!currentAccounts.length) return u.userId ?? "—";
                      return currentAccounts.map((a: any) => a.accountNumber).join(", ");
                    })()}
                  </Td>
                  <Td>{roleLabel(u.role)}</Td>
                  <Td className="space-x-1.5">
                    <StatusPill status={u.status} />
                    {u.locked && <StatusPill status="locked" />}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => toggleStatus(u.id, u.status)}
                        className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
                      >
                        {u.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                      {u.locked && (
                        <button
                          onClick={() => unlockUser(u.id)}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                        >
                          Unlock
                        </button>
                      )}
                      {u.role !== "client" && (
                        <button
                          onClick={() => resetCredentials(u.id)}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                          Reset credentials
                        </button>
                      )}
                      {u.id !== profile?.uid && (
                        <button
                          onClick={() => deleteUser(u.id, u.email, u.role)}
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      )}
                    </div>
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
