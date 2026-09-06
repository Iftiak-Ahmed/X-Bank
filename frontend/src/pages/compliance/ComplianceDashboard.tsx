import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { Card, EmptyState, KpiCard, LoadingState, PageHeader, Td, Th, money, formatDate } from "../../components/Shared";
import { RiskChip, StatusPill } from "../../components/RiskChip";

interface Kpis {
  totalCustomers: number;
  totalTransactions: number;
  openAlerts: number;
  criticalAlerts: number;
  kycIssues: number;
}

interface RiskTrendPoint {
  date: string;
  total: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

const RISK_SERIES = [
  { key: "total", label: "Total Transactions", color: "#14335c" },
  { key: "low", label: "Low Risk", color: "#1f8a5f" },
  { key: "medium", label: "Medium Risk", color: "#a4740f" },
  { key: "high", label: "High Risk", color: "#c85a1f" },
  { key: "critical", label: "Critical Risk", color: "#c22a3e" },
] as const;

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RiskTrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point: RiskTrendPoint = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-navy-900">{shortDate(label)}</div>
      {RISK_SERIES.map((s) => (
        <div key={s.key} className="mt-1 flex items-center gap-1.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}: {point[s.key]}
        </div>
      ))}
    </div>
  );
}

export default function ComplianceDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [riskTrend, setRiskTrend] = useState<RiskTrendPoint[] | null>(null);
  const [live, setLive] = useState(false);

  function refresh() {
    api.get<Kpis>("/api/compliance/dashboard/kpis").then(setKpis);
    api.get<any[]>("/api/compliance/alerts").then((a) => setAlerts(a.slice(0, 10)));
    api.get<RiskTrendPoint[]>("/api/compliance/dashboard/risk-trend").then(setRiskTrend);
  }

  useEffect(() => {
    refresh();
    let cleanup = () => {};
    getSocket().then((socket) => {
      if (!socket) return;
      setLive(true);
      const onAlert = () => refresh();
      socket.on("alert.created", onAlert);
      socket.on("alert.updated", onAlert);
      cleanup = () => {
        socket.off("alert.created", onAlert);
        socket.off("alert.updated", onAlert);
      };
    });
    return () => cleanup();
  }, []);

  if (!kpis) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Compliance Dashboard"
        subtitle={live ? "Live — updates automatically when new alerts are generated." : "Connecting to live feed…"}
      />

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Customers" value={kpis.totalCustomers} />
        <KpiCard label="Total Transactions" value={kpis.totalTransactions} />
        <KpiCard label="Open Alerts" value={kpis.openAlerts} accent={kpis.openAlerts > 0 ? "text-amber-600" : undefined} />
        <KpiCard label="Critical Alerts" value={kpis.criticalAlerts} accent={kpis.criticalAlerts > 0 ? "text-red-600" : undefined} />
        <KpiCard label="KYC Issues" value={kpis.kycIssues} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-serif text-lg font-semibold text-navy-900">Transaction Risk Trend</h2>
        <p className="text-sm text-slate-500">Total transactions and their risk levels, last 14 days.</p>
        <div className="mt-4 h-80">
          {!riskTrend ? (
            <LoadingState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={riskTrend} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  label={{ value: "Date", position: "insideBottom", offset: -6, fill: "#64748b", fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  domain={[0, "auto"]}
                  label={{ value: "Transactions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }}
                />
                <Tooltip content={<RiskTrendTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: 4 }} />
                <Legend
                  formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                  iconType="circle"
                  iconSize={10}
                  verticalAlign="bottom"
                  wrapperStyle={{ paddingTop: 24, border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 16px" }}
                />
                {RISK_SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={{ r: 4, strokeWidth: 0, fill: s.color }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Recent Alerts</h2>
          <Link to="/compliance/alerts" className="text-sm font-semibold text-teal-700">View all</Link>
        </div>
        {alerts.length === 0 ? (
          <EmptyState message="No alerts yet — normal activity flows straight through." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Created</Th><Th>Customer</Th><Th>Rule</Th><Th>Risk</Th><Th>Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <Td>{formatDate(a.createdAt)}</Td>
                    <Td className="font-mono text-xs">{a.customerId?.slice(0, 8) ?? "—"}</Td>
                    <Td>{a.primaryRuleCode}</Td>
                    <Td><RiskChip level={a.riskLevel} /> <span className="text-xs text-slate-400">{a.riskScore}</span></Td>
                    <Td><StatusPill status={a.status} /></Td>
                    <Td><Link to={`/compliance/alerts/${a.id}`} className="text-xs font-semibold text-teal-700">Investigate</Link></Td>
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
