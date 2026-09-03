import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";

export default function Security() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/client/security/activity").then((a) => {
      setItems(a);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Security activity" subtitle="Recent sign-in activity on your account." />
      <Card>
        {items.length === 0 ? (
          <EmptyState message="No recent activity." />
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Event</Th><Th>When</Th><Th>IP</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((i) => (
                <tr key={i.id}>
                  <Td className="capitalize">{i.action.replace(/[._]/g, " ")}</Td>
                  <Td>{formatDate(i.createdAt)}</Td>
                  <Td>{i.ip ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
