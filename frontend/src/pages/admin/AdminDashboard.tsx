import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { KpiCard, LoadingState, PageHeader } from "../../components/Shared";

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

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    api.get<Kpis>("/api/admin/dashboard").then(setKpis);
  }, []);

  if (!kpis) return <LoadingState />;

  return (
    <div>
      <PageHeader title="System Overview" subtitle="X Bank — governance at a glance." />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Total Users" value={kpis.totalUsers} />
        <KpiCard label="Total Clients" value={kpis.totalCustomers} />
        <KpiCard label="Total Transactions" value={kpis.totalTransactions} />
        <KpiCard label="Compliance Rules" value={kpis.totalRules} />
        <Link to="/admin/applications">
          <KpiCard label="Pending Applications" value={kpis.pendingApplications} accent={kpis.pendingApplications > 0 ? "text-amber-600" : undefined} />
        </Link>
        <KpiCard label="Open Alerts" value={kpis.openAlerts} accent={kpis.openAlerts > 0 ? "text-amber-600" : undefined} />
        <KpiCard label="Critical Alerts" value={kpis.criticalAlerts} accent={kpis.criticalAlerts > 0 ? "text-red-600" : undefined} />
        <KpiCard label="High-Risk Transactions" value={kpis.highRiskTransactions} accent={kpis.highRiskTransactions > 0 ? "text-red-600" : undefined} />
      </div>
    </div>
  );
}
