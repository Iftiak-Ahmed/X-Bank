import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function Applications() {
  const [apps, setApps] = useState<any[]>([]);
  const [status, setStatus] = useState("pending_approval");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = status ? `?status=${status}` : "";
    api.get<any[]>(`/api/admin/applications${params}`).then((a) => {
      setApps(a);
      setLoading(false);
    });
  }, [status]);

  return (
    <div>
      <PageHeader title="Customer Applications" subtitle="New account applications awaiting KYC review." />

      <div className="mb-4 flex gap-2">
        {["pending_approval", "info_requested", "approved", "rejected", ""].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${status === s ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600"}`}>
            {s ? s.replace(/_/g, " ") : "All"}
          </button>
        ))}
      </div>

      <Card>
        {loading ? <LoadingState /> : apps.length === 0 ? <EmptyState message="No applications in this status." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100"><Th>Applicant</Th><Th>Email</Th><Th>Submitted</Th><Th>Status</Th><Th></Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {apps.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.fullName}</Td>
                    <Td>{a.email}</Td>
                    <Td>{formatDate(a.createdAt)}</Td>
                    <Td><StatusPill status={a.status} /></Td>
                    <Td><Link to={`/admin/applications/${a.id}`} className="text-xs font-semibold text-teal-700">Review</Link></Td>
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
