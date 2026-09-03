import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function Controls() {
  const [controls, setControls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/compliance/controls").then((c) => {
      setControls(c);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Compliance Controls" subtitle="Representative controls mapped to recognized frameworks — an academic prototype, not a certification." />
      {controls.length === 0 ? <EmptyState message="No controls configured." /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {controls.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">{c.framework}</span>
                <StatusPill status={c.status} />
              </div>
              <h3 className="mt-2 font-serif text-lg font-semibold text-navy-900">{c.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{c.requirement}</p>
              <div className="mt-4 flex justify-between text-xs text-slate-400">
                <span>{c.evidenceCount} evidence items</span>
                <span>Checked {formatDate(c.lastChecked)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
