import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserCheck, ArrowLeftRight, Bell, ShieldAlert, IdCard } from "lucide-react";
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

export default function ComplianceDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [live, setLive] = useState(false);

  function refresh() {
    api.get<Kpis>("/api/compliance/dashboard/kpis").then(setKpis);
    api.get<any[]>("/api/compliance/alerts").then((a) => setAlerts(a.slice(0, 10)));
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
        <KpiCard label="Total Customers" value={kpis.totalCustomers} tone="teal" icon={<UserCheck className="h-5 w-5" />} />
        <KpiCard label="Total Transactions" value={kpis.totalTransactions} tone="sky" icon={<ArrowLeftRight className="h-5 w-5" />} />
        <KpiCard
          label="Open Alerts"
          value={kpis.openAlerts}
          accent={kpis.openAlerts > 0 ? "text-amber-600" : undefined}
          tone="amber"
          icon={<Bell className="h-5 w-5" />}
        />
        <KpiCard
          label="Critical Alerts"
          value={kpis.criticalAlerts}
          accent={kpis.criticalAlerts > 0 ? "text-red-600" : undefined}
          tone="rose"
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <KpiCard label="KYC Issues" value={kpis.kycIssues} tone="violet" icon={<IdCard className="h-5 w-5" />} />
      </div>

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
