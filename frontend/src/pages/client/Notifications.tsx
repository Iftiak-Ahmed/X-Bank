import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, formatDate } from "../../components/Shared";

export default function Notifications() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/client/notifications").then((n) => {
      setItems(n);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Notifications" />
      <Card>
        {items.length === 0 ? (
          <EmptyState message="You're all caught up." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className="px-5 py-4">
                <p className="text-sm text-slate-700">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDate(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
