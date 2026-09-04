import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../lib/api";
import { Card, EmptyState, KpiCard, LoadingState, PageHeader, Td, Th, money } from "../../components/Shared";
import { RiskChip, StatusPill } from "../../components/RiskChip";
import { LoginApprovalPanel } from "./LoginApprovalPanel";

interface Kpis {
  totalUsers: number;
  totalCustomers: number;
  totalTransactions: number;
  totalRules: number;
  openAlerts: number;
  pendingApplications: number;
  criticalAlerts: number;
  highRiskTransactions: number;
}

interface DailyActivity {
  date: string;
  cashIn: number;
  transfer: number;
  withdrawal: number;
}

const SERIES = [
  { key: "cashIn", label: "Cash In", color: "#1f6f6b" },
  { key: "transfer", label: "Balance Transfer", color: "#14335c" },
  { key: "withdrawal", label: "Withdrawal", color: "#b45309" },
] as const;

function compactAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ActivityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point: DailyActivity = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-navy-900">{shortDate(label)}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="mt-1 flex items-center gap-1.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}: {money(point[s.key])}
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [activity, setActivity] = useState<DailyActivity[] | null>(null);
  const [suspicious, setSuspicious] = useState<any[] | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [violationsByTx, setViolationsByTx] = useState<Record<string, any[]>>({});
  const [loadingViolations, setLoadingViolations] = useState(false);

  useEffect(() => {
    api.get<Kpis>("/api/admin/dashboard").then(setKpis);
    api.get<DailyActivity[]>("/api/admin/dashboard/transaction-activity").then(setActivity);
    api.get<any[]>("/api/admin/dashboard/suspicious-transactions").then(setSuspicious);
  }, []);

  async function toggleTransaction(txId: string) {
    if (expandedTxId === txId) {
      setExpandedTxId(null);
      return;
    }
    setExpandedTxId(txId);
    if (!violationsByTx[txId]) {
      setLoadingViolations(true);
      try {
        const violations = await api.get<any[]>(`/api/admin/dashboard/suspicious-transactions/${txId}/violations`);
        setViolationsByTx((prev) => ({ ...prev, [txId]: violations }));
      } finally {
        setLoadingViolations(false);
      }
    }
  }

  if (!kpis) return <LoadingState />;

  return (
    <div>
      <LoginApprovalPanel />
      <PageHeader title="System Overview" subtitle="X Bank — governance at a glance." />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Total Users" value={kpis.totalUsers} />
        <KpiCard label="Total Customers" value={kpis.totalCustomers} />
        <KpiCard label="Total Transactions" value={kpis.totalTransactions} />
        <KpiCard label="Compliance Rules" value={kpis.totalRules} />
        <Link to="/admin/applications">
          <KpiCard label="Pending Applications" value={kpis.pendingApplications} accent={kpis.pendingApplications > 0 ? "text-amber-600" : undefined} />
        </Link>
        <KpiCard label="Open Alerts" value={kpis.openAlerts} accent={kpis.openAlerts > 0 ? "text-amber-600" : undefined} />
        <KpiCard label="Critical Alerts" value={kpis.criticalAlerts} accent={kpis.criticalAlerts > 0 ? "text-red-600" : undefined} />
        <KpiCard label="High-Risk Transactions" value={kpis.highRiskTransactions} accent={kpis.highRiskTransactions > 0 ? "text-red-600" : undefined} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-serif text-lg font-semibold text-navy-900">Transaction Activity</h2>
        <p className="text-sm text-slate-500">Cash in, balance transfer, and withdrawal amounts, last 7 days.</p>
        <div className="mt-4 h-64">
          {!activity ? (
            <LoadingState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activity} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis tickFormatter={compactAmount} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ActivityTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: 4 }} />
                <Legend formatter={(value) => <span className="text-xs text-slate-600">{value}</span>} iconType="circle" iconSize={8} />
                {SERIES.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Recent Suspicious Transactions</h2>
          <p className="text-sm text-slate-500">Transactions scored high or critical risk.</p>
        </div>
        {!suspicious ? (
          <LoadingState />
        ) : suspicious.length === 0 ? (
          <EmptyState message="No high-risk transactions." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Transaction ID</Th>
                  <Th>Customer</Th>
                  <Th>Amount</Th>
                  <Th>Type</Th>
                  <Th>Risk</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suspicious.map((t) => (
                  <Fragment key={t.id}>
                    <tr onClick={() => toggleTransaction(t.id)} className="cursor-pointer hover:bg-slate-50">
                      <Td className="font-mono text-xs">{t.reference ?? t.id.slice(0, 10)}</Td>
                      <Td>{t.customerName}</Td>
                      <Td>{money(t.amount, t.currency)}</Td>
                      <Td className="capitalize">{t.type}</Td>
                      <Td><RiskChip level={t.riskLevel} /> <span className="text-xs text-slate-400">{t.riskScore ?? "—"}</span></Td>
                      <Td><StatusPill status={t.status} /></Td>
                      <Td className="text-xs font-semibold text-teal-700">{expandedTxId === t.id ? "Hide ▲" : "Why? ▼"}</Td>
                    </tr>
                    {expandedTxId === t.id && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-5 py-4">
                          {loadingViolations && !violationsByTx[t.id] ? (
                            <LoadingState />
                          ) : (violationsByTx[t.id]?.length ?? 0) === 0 ? (
                            <EmptyState message="No specific rule violations recorded — flagged by overall risk score." />
                          ) : (
                            <div className="space-y-3">
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Rules violated &amp; the framework controls they breach
                              </h3>
                              {violationsByTx[t.id].map((v, i) => (
                                <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-risk-criticalBg px-2 py-0.5 font-mono text-xs font-semibold text-risk-critical">{v.ruleCode}</span>
                                    <span className="text-slate-500">{v.reason}</span>
                                  </div>
                                  {v.frameworkName && (
                                    <div className="mt-2 text-xs text-slate-500">
                                      Violates{" "}
                                      <span className="font-semibold text-navy-900">{v.frameworkName}</span>
                                      {" · "}
                                      <span className="font-mono">{v.controlId}</span>
                                      {" — "}
                                      {v.controlName}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
