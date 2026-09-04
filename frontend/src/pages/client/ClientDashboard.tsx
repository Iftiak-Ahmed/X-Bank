import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, money } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

interface Summary {
  customer: { fullName: string; kycStatus: string; customerCode: string } | null;
  totalBalance: number;
  accounts: { id: string; accountType: string; accountNumber: string; balance: number; currency: string; status: string }[];
  recentTransactions: any[];
}

interface BalancePoint {
  date: string;
  balance: number;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function compactAmount(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function BalanceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point: BalancePoint = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-navy-900">{shortDate(label)}</div>
      <div className="mt-1 text-slate-600">{money(point.balance)}</div>
    </div>
  );
}

export default function ClientDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<BalancePoint[] | null>(null);

  useEffect(() => {
    api
      .get<Summary>("/api/client/dashboard/summary")
      .then(setSummary)
      .finally(() => setLoading(false));
    api.get<BalancePoint[]>("/api/client/dashboard/balance-trend").then(setTrend);
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

      <Card className="mt-6 p-5">
        <h2 className="font-serif text-lg font-semibold text-navy-900">Balance Trend</h2>
        <p className="text-sm text-slate-500">Your total balance across all accounts, last 14 days.</p>
        <div className="mt-4 h-64">
          {!trend ? (
            <LoadingState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis tickFormatter={compactAmount} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} domain={["auto", "auto"]} />
                <Tooltip content={<BalanceTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: 4 }} />
                <Line type="monotone" dataKey="balance" stroke="#1f6f6b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
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
