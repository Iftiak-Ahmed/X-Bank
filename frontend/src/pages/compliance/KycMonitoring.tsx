import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, KpiCard, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function KycMonitoring() {
  const [records, setRecords] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filter ? `?status=${filter}` : "";
    api.get<any[]>(`/api/compliance/kyc${params}`).then((r) => {
      setRecords(r);
      setLoading(false);
    });
  }, [filter]);

  const counts = { verified: 0, pending: 0, expired: 0, rejected: 0 };
  records.forEach((r) => { if (r.status in counts) (counts as any)[r.status]++; });

  return (
    <div>
      <PageHeader title="KYC Monitoring" subtitle="Identity verification status across all customers." />

      <div className="grid gap-4 sm:grid-cols-4">
        <KpiCard label="Verified" value={counts.verified} tone="teal" />
        <KpiCard label="Pending" value={counts.pending} tone="amber" />
        <KpiCard label="Expired" value={counts.expired} tone="orange" />
        <KpiCard label="Rejected" value={counts.rejected} tone="rose" />
      </div>

      <div className="my-4 flex gap-2">
        {["", "verified", "pending", "expired", "rejected"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter === s ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600"}`}>
            {s || "All"}
          </button>
        ))}
      </div>

      <Card>
        {loading ? <LoadingState /> : records.length === 0 ? <EmptyState message="No KYC records." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100"><Th>Customer</Th><Th>Status</Th><Th>Submitted</Th><Th>Verified</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.customerId?.slice(0, 10)}</Td>
                    <Td><StatusPill status={r.status} /></Td>
                    <Td>{formatDate(r.submittedAt)}</Td>
                    <Td>{formatDate(r.verifiedAt)}</Td>
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
