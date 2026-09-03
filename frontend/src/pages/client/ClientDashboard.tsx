import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, money, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

interface Summary {
  customer: { fullName: string; kycStatus: string; customerCode: string } | null;
  totalBalance: number;
  accounts: { id: string; accountType: string; accountNumber: string; balance: number; currency: string; status: string }[];
  recentTransactions: any[];
}

export default function ClientDashboard() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Summary>("/api/client/dashboard/summary")
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!summary) return <EmptyState message="Could not load dashboard." />;

  return (
    <div>
      <PageHeader title={`Welcome back, ${summary.customer?.fullName?.split(" ")[0] ?? "there"}`} subtitle={profile?.customer?.customerCode} />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Available Balance</div>
          <div className="mt-1 font-serif text-4xl font-semibold text-navy-900">{money(summary.totalBalance)}</div>
          <div className="mt-6 flex flex-wrap gap-3">
            <QuickAction to="/transfer" label="Transfer Money" />
            <QuickAction to="/accounts" label="Deposit" />
            <QuickAction to="/accounts" label="Withdraw" />
            <QuickAction to="/beneficiaries" label="Add Beneficiary" />
            <QuickAction to="/transactions" label="View Transactions" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Account Status</div>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">KYC Status</span>
              <StatusPill status={summary.customer?.kycStatus} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Account Status</span>
              <StatusPill status="active" />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {summary.accounts.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 capitalize">{a.accountType} account</span>
              <StatusPill status={a.status} />
            </div>
            <div className="mt-1 font-mono text-xs text-slate-400">{a.accountNumber}</div>
            <div className="mt-2 font-serif text-2xl font-semibold text-navy-900">{money(a.balance, a.currency)}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Recent Transactions</h2>
          <Link to="/transactions" className="text-sm font-semibold text-teal-700">View all</Link>
        </div>
        {summary.recentTransactions.length === 0 ? (
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
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.recentTransactions.map((t) => (
                  <tr key={t.id}>
                    <Td>{formatDate(t.createdAt)}</Td>
                    <Td className="font-mono text-xs">{t.reference}</Td>
                    <Td className="capitalize">{t.type}</Td>
                    <Td>{money(t.amount, t.currency)}</Td>
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

function QuickAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:border-teal-600 hover:bg-teal-50"
    >
      {label}
    </Link>
  );
}
