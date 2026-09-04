import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [resource, setResource] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get<any[]>("/api/admin/audit-logs?limit=500").then((l) => {
      setLogs(l);
      setLoading(false);
    });
  }, []);

  const roles = useMemo(() => [...new Set(logs.map((l) => l.role ?? "system"))].sort(), [logs]);
  const resources = useMemo(() => [...new Set(logs.map((l) => l.resource).filter(Boolean))].sort(), [logs]);

  const needle = search.trim().toLowerCase();
  const filteredLogs = logs.filter((l) => {
    if (role && (l.role ?? "system") !== role) return false;
    if (resource && l.resource !== resource) return false;
    if (needle) {
      const haystack = [l.action, l.description, l.resource].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader title="System Log" subtitle="Full, unscoped audit trail. Read-only." />

      <div className="mb-4 flex flex-wrap gap-3">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r} className="capitalize">{String(r).replace("_", " ")}</option>)}
        </select>
        <select value={resource} onChange={(e) => setResource(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All resources</option>
          {resources.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action or description…"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
        />
      </div>

      <Card>
        {loading ? <LoadingState /> : filteredLogs.length === 0 ? (
          <EmptyState message={logs.length === 0 ? "No entries yet." : "No entries match these filters."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>When</Th><Th>Action</Th><Th>Resource</Th><Th>Role</Th><Th className="wrap">Description</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <Td>{formatDate(l.createdAt)}</Td>
                    <Td className="font-mono text-xs">{l.action}</Td>
                    <Td className="text-xs">{l.resource}</Td>
                    <Td className="text-xs capitalize">{l.role ?? "system"}</Td>
                    <Td className="whitespace-normal text-xs text-slate-500">{l.description}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
