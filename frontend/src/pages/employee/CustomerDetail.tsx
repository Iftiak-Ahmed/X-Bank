import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, money, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function CustomerDetail() {
  const { id } = useParams();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [kyc, setKyc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<any[]>(`/api/employee/customers/${id}/accounts`),
      api.get<any[]>(`/api/employee/customers/${id}/transactions`),
      api.get(`/api/employee/customers/${id}/kyc`),
    ]).then(([acc, tx, k]) => {
      setAccounts(acc);
      setTransactions(tx);
      setKyc(k);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Customer detail" subtitle={id} />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-5 md:col-span-1">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">KYC</h2>
          {kyc ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Status</span><StatusPill status={kyc.status} /></div>
              <div className="flex justify-between"><span className="text-slate-500">Submitted</span><span>{formatDate(kyc.submittedAt)}</span></div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No KYC record.</p>
          )}
        </Card>

        <Card className="p-5 md:col-span-2">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Accounts</h2>
          {accounts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No accounts.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {accounts.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="text-xs capitalize text-slate-400">{a.accountType}</div>
                  <div className="font-mono text-xs text-slate-400">{a.accountNumber}</div>
                  <div className="font-serif text-lg font-semibold text-navy-900">{money(a.balance, a.currency)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Transactions</h2>
        </div>
        {transactions.length === 0 ? (
          <EmptyState message="No transactions." />
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Date</Th><Th>Reference</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => (
                <tr key={t.id}>
                  <Td>{formatDate(t.createdAt)}</Td>
                  <Td className="font-mono text-xs">{t.reference}</Td>
                  <Td>{money(t.amount, t.currency)}</Td>
                  <Td><StatusPill status={t.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
