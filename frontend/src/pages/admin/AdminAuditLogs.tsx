import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/admin/audit-logs").then((l) => {
      setLogs(l);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Full, unscoped audit trail. Read-only." />
      <Card>
        {loading ? <LoadingState /> : logs.length === 0 ? <EmptyState message="No entries yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>When</Th><Th>Action</Th><Th>Resource</Th><Th>Role</Th><Th className="wrap">Description</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
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
