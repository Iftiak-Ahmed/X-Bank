import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, money, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/client/transactions").then((t) => {
      setTransactions(t);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Your full transaction history." />
      <Card>
        {transactions.length === 0 ? (
          <EmptyState message="No transactions yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Date</Th>
                  <Th>Reference</Th>
                  <Th>Type</Th>
                  <Th>Amount</Th>
                  <Th>Purpose</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <Td>{formatDate(t.createdAt)}</Td>
                    <Td className="font-mono text-xs">{t.reference}</Td>
                    <Td className="capitalize">{t.type}</Td>
                    <Td>{money(t.amount, t.currency)}</Td>
                    <Td>{t.purpose ?? "—"}</Td>
                    <Td><StatusPill status={t.status} /></Td>
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
