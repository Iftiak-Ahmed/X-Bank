import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, money, formatDate } from "../../components/Shared";
import { RiskChip, StatusPill } from "../../components/RiskChip";

export default function TransactionMonitoring() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [riskLevel, setRiskLevel] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (riskLevel) params.set("riskLevel", riskLevel);
    if (status) params.set("status", status);
    api.get<any[]>(`/api/compliance/transactions?${params}`).then((t) => {
      setTransactions(t);
      setLoading(false);
    });
  }

  useEffect(load, [riskLevel, status]);

  return (
    <div>
      <PageHeader title="Transaction Monitoring" subtitle="Every transaction that has passed through the compliance engine." />

      <div className="mb-4 flex gap-3">
        <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All risk levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending Review</option>
        </select>
      </div>

      <Card>
        {loading ? <LoadingState /> : transactions.length === 0 ? (
          <EmptyState message="No transactions match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Date</Th><Th>Reference</Th><Th>Amount</Th><Th>Type</Th><Th>Risk</Th><Th>Compliance</Th><Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <Td>{formatDate(t.createdAt)}</Td>
                    <Td className="font-mono text-xs">{t.reference}</Td>
                    <Td>{money(t.amount, t.currency)}</Td>
                    <Td className="capitalize">{t.type}</Td>
                    <Td><RiskChip level={t.riskLevel} /> <span className="text-xs text-slate-400">{t.riskScore ?? "—"}</span></Td>
                    <Td><StatusPill status={t.status} /></Td>
                    <Td><Link to={`/compliance/transactions/${t.id}`} className="text-xs font-semibold text-teal-700">Investigate</Link></Td>
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
