import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/employee/customers").then((c) => {
      setCustomers(c);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Customers" subtitle="All customers assigned to your desk." />
      <Card>
        {customers.length === 0 ? (
          <EmptyState message="No customers found." />
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Customer</Th><Th>Customer ID</Th><Th>Email</Th><Th>KYC</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id}>
                  <Td>{c.fullName}</Td>
                  <Td className="font-mono text-xs">{c.customerCode}</Td>
                  <Td>{c.email}</Td>
                  <Td><StatusPill status={c.kycStatus} /></Td>
                  <Td><Link to={`/employee/customers/${c.id}`} className="text-xs font-semibold text-teal-700">View</Link></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
