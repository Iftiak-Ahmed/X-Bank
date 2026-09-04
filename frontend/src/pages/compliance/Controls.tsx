import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function Controls() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailByFramework, setDetailByFramework] = useState<Record<string, { controls: any[]; mostViolated: any[] }>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updatingControlId, setUpdatingControlId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any[]>("/api/compliance/frameworks").then((f) => {
      setFrameworks(f);
      setLoading(false);
    });
  }, []);

  async function toggleFramework(frameworkId: string) {
    if (expandedId === frameworkId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(frameworkId);
    if (!detailByFramework[frameworkId]) {
      setLoadingDetail(true);
      try {
        const data = await api.get<{ controls: any[]; mostViolated: any[] }>(`/api/compliance/frameworks/${frameworkId}`);
        setDetailByFramework((prev) => ({ ...prev, [frameworkId]: data }));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoadingDetail(false);
      }
    }
  }

  async function toggleStatus(frameworkId: string, control: any) {
    const nextStatus = control.status === "active" ? "inactive" : "active";
    setUpdatingControlId(control.id);
    setError(null);
    try {
      await api.patch(`/api/compliance/controls/${control.id}/status`, { status: nextStatus });
      setDetailByFramework((prev) => ({
        ...prev,
        [frameworkId]: {
          ...prev[frameworkId],
          controls: prev[frameworkId].controls.map((c) => (c.id === control.id ? { ...c, status: nextStatus } : c)),
        },
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingControlId(null);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Compliance Controls" subtitle="Framework coverage, most-violated controls, and every control's pass/fail record." />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <Card>
        {frameworks.length === 0 ? <EmptyState message="No frameworks configured yet — add one in Compliance Frameworks." /> : (
          <ul className="divide-y divide-slate-100">
            {frameworks.map((f) => {
              const detail = detailByFramework[f.id];
              const violated = detail?.mostViolated.filter((c: any) => c.resultCounts.fail > 0) ?? [];
              return (
                <li key={f.id} className="px-5 py-4">
                  <button type="button" onClick={() => toggleFramework(f.id)} className="flex w-full items-center justify-between text-left">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">{f.source} · v{f.version}</span>
                      <h3 className="font-serif text-lg font-semibold text-navy-900">{f.name}</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      {f.compliancePercentage !== null && (
                        <span className={`font-serif text-2xl font-semibold ${f.compliancePercentage >= 80 ? "text-risk-low" : f.compliancePercentage >= 50 ? "text-risk-medium" : "text-risk-critical"}`}>
                          {f.compliancePercentage}%
                        </span>
                      )}
                      <span className="text-xs font-semibold text-teal-700">{expandedId === f.id ? "Hide details ▲" : "Show details ▼"}</span>
                    </div>
                  </button>

                  <div className="mt-3 grid max-w-md grid-cols-4 gap-2 text-center text-xs">
                    <Stat label="Controls" value={f.totalControls} />
                    <Stat label="Pass" value={f.pass} accent="text-risk-low" />
                    <Stat label="Fail" value={f.fail} accent="text-risk-critical" />
                    <Stat label="Review" value={f.needsReview} accent="text-risk-medium" />
                  </div>

                  {expandedId === f.id && (
                    <div className="mt-5 space-y-6">
                      {loadingDetail && !detail ? <LoadingState /> : !detail ? null : (
                        <>
                          <div>
                            <h4 className="mb-2 font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Most frequently violated controls</h4>
                            <div className="overflow-hidden rounded-lg border border-slate-100">
                              {violated.length === 0 ? (
                                <EmptyState message="No violations recorded for this framework yet." />
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full table-fixed">
                                    <thead>
                                      <tr className="border-b border-slate-100 bg-slate-50">
                                        <Th className="w-24">Control</Th>
                                        <Th className="w-1/3">Name</Th>
                                        <Th>Failures</Th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {violated.map((c: any) => (
                                        <tr key={c.id}>
                                          <Td className="align-top py-3 font-mono text-xs">
                                            <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.controlId}</div>
                                          </Td>
                                          <Td className="align-top py-3">
                                            <Link to={`/compliance/controls/${c.id}`} className="font-semibold text-teal-700" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.name}</Link>
                                          </Td>
                                          <Td className="align-top py-3">{c.resultCounts.fail}</Td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            <h4 className="mb-2 font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">All controls</h4>
                            <div className="overflow-hidden rounded-lg border border-slate-100">
                              {detail.controls.length === 0 ? (
                                <EmptyState message="No controls in this framework." />
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full table-fixed">
                                    <thead>
                                      <tr className="border-b border-slate-100 bg-slate-50">
                                        <Th className="w-24">Control</Th>
                                        <Th className="w-1/4">Name</Th>
                                        <Th className="w-14">Pass</Th>
                                        <Th className="w-14">Fail</Th>
                                        <Th className="w-16">Review</Th>
                                        <Th className="w-14">N/A</Th>
                                        <Th className="w-20">Status</Th>
                                        <Th className="w-40"></Th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {detail.controls.map((c: any) => (
                                        <tr key={c.id}>
                                          <Td className="align-top py-3 font-mono text-xs">
                                            <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.controlId}</div>
                                          </Td>
                                          <Td className="align-top py-3">
                                            <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.name}</div>
                                          </Td>
                                          <Td className="align-top py-3 text-risk-low">{c.resultCounts.pass}</Td>
                                          <Td className="align-top py-3 text-risk-critical">{c.resultCounts.fail}</Td>
                                          <Td className="align-top py-3 text-risk-medium">{c.resultCounts.needs_review}</Td>
                                          <Td className="align-top py-3 text-slate-400">{c.resultCounts.not_applicable}</Td>
                                          <Td className="align-top py-3"><StatusPill status={c.status} /></Td>
                                          <Td className="align-top py-3">
                                            <div className="flex items-center gap-3">
                                              <button
                                                type="button"
                                                disabled={updatingControlId === c.id}
                                                onClick={() => toggleStatus(f.id, c)}
                                                className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${c.status === "active" ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-teal-50 text-teal-700 hover:bg-teal-100"}`}
                                              >
                                                {updatingControlId === c.id ? "…" : c.status === "active" ? "Deactivate" : "Activate"}
                                              </button>
                                              <Link to={`/compliance/controls/${c.id}`} className="text-xs font-semibold text-teal-700">Detail</Link>
                                            </div>
                                          </Td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
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
