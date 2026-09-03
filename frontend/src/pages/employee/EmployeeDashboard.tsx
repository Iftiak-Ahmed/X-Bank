import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, KpiCard, LoadingState, PageHeader, Td, Th, money, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

interface Dashboard {
  customerCount: number;
  recentCustomers: any[];
  recentTransactions: any[];
}

export default function EmployeeDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api.get<Dashboard>("/api/employee/dashboard").then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Operational Dashboard" subtitle="Assigned customers and recent activity." />
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label="Total Customers" value={data.customerCount} />
        <KpiCard label="Recent Transactions" value={data.recentTransactions.length} />
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Recent Customers</h2>
          <Link to="/employee/customers" className="text-sm font-semibold text-teal-700">View all</Link>
        </div>
        {data.recentCustomers.length === 0 ? (
          <EmptyState message="No customers yet." />
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Customer</Th><Th>ID</Th><Th>KYC</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.recentCustomers.map((c) => (
                <tr key={c.id}>
                  <Td>{c.fullName}</Td>
                  <Td className="font-mono text-xs">{c.customerCode}</Td>
                  <Td><StatusPill status={c.kycStatus} /></Td>
                  <Td><Link to={`/employee/customers/${c.id}`} className="text-xs font-semibold text-teal-700">View</Link></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-6">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Recent Transactions</h2>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-slate-100"><Th>Date</Th><Th>Reference</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.recentTransactions.map((t) => (
              <tr key={t.id}>
                <Td>{formatDate(t.createdAt)}</Td>
                <Td className="font-mono text-xs">{t.reference}</Td>
                <Td>{money(t.amount, t.currency)}</Td>
                <Td><StatusPill status={t.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
