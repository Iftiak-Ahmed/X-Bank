import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader } from "../../components/Shared";

export default function Frameworks() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/compliance/frameworks").then((f) => {
      setFrameworks(f);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Compliance Frameworks" subtitle="Coverage and compliance percentage per uploaded framework." />
      {frameworks.length === 0 ? <EmptyState message="No frameworks configured yet — add one in Admin." /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {frameworks.map((f) => (
            <Link key={f.id} to={`/compliance/frameworks/${f.id}`}>
              <Card className="p-5 transition hover:border-teal-300">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">{f.source} · v{f.version}</span>
                  {f.compliancePercentage !== null && (
                    <span className={`font-serif text-2xl font-semibold ${f.compliancePercentage >= 80 ? "text-risk-low" : f.compliancePercentage >= 50 ? "text-risk-medium" : "text-risk-critical"}`}>
                      {f.compliancePercentage}%
                    </span>
                  )}
                </div>
                <h3 className="mt-2 font-serif text-lg font-semibold text-navy-900">{f.name}</h3>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <Stat label="Controls" value={f.totalControls} />
                  <Stat label="Pass" value={f.pass} accent="text-risk-low" />
                  <Stat label="Fail" value={f.fail} accent="text-risk-critical" />
                  <Stat label="Review" value={f.needsReview} accent="text-risk-medium" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className={`font-serif text-lg font-semibold ${accent ?? "text-navy-900"}`}>{value}</div>
      <div className="text-slate-400">{label}</div>
    </div>
  );
}
