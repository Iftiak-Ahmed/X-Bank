import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, money } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

interface Summary {
  customer: { fullName: string; kycStatus: string; customerCode: string } | null;
  totalBalance: number;
  accounts: { id: string; accountType: string; accountNumber: string; balance: number; currency: string; status: string }[];
  recentTransactions: any[];
}

export default function ClientDashboard() {
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
      <PageHeader title={summary.customer?.fullName ?? "there"} />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Available Balance</div>
          <div className="mt-1 font-serif text-4xl font-semibold text-navy-900">{money(summary.totalBalance)}</div>
          <div className="mt-6 flex flex-wrap gap-3">
            <QuickAction to="/transfer" label="Transfer Money" />
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
