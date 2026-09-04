import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th } from "../../components/Shared";

export default function FrameworkDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id) api.get(`/api/compliance/frameworks/${id}`).then(setData);
  }, [id]);

  if (!data) return <LoadingState />;
  const { framework, controls, mostViolated } = data;

  return (
    <div>
      <PageHeader title={framework.name} subtitle={`${framework.source} · v${framework.version}`} />
      {framework.description && <p className="mb-6 max-w-2xl text-sm text-slate-500">{framework.description}</p>}

      <Card className="mb-6">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-serif text-lg font-semibold text-navy-900">Most frequently violated controls</h2></div>
        {mostViolated.filter((c: any) => c.resultCounts.fail > 0).length === 0 ? (
          <EmptyState message="No violations recorded for this framework yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100"><Th>Control</Th><Th>Name</Th><Th>Failures</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {mostViolated.filter((c: any) => c.resultCounts.fail > 0).map((c: any) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-xs">{c.controlId}</Td>
                    <Td><Link to={`/compliance/controls/${c.id}`} className="font-semibold text-teal-700">{c.name}</Link></Td>
                    <Td>{c.resultCounts.fail}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-serif text-lg font-semibold text-navy-900">All controls</h2></div>
        {controls.length === 0 ? <EmptyState message="No controls in this framework." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100"><Th>Control</Th><Th>Name</Th><Th>Pass</Th><Th>Fail</Th><Th>Review</Th><Th>N/A</Th><Th></Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {controls.map((c: any) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-xs">{c.controlId}</Td>
                    <Td>{c.name}</Td>
                    <Td className="text-risk-low">{c.resultCounts.pass}</Td>
                    <Td className="text-risk-critical">{c.resultCounts.fail}</Td>
                    <Td className="text-risk-medium">{c.resultCounts.needs_review}</Td>
                    <Td className="text-slate-400">{c.resultCounts.not_applicable}</Td>
                    <Td><Link to={`/compliance/controls/${c.id}`} className="text-xs font-semibold text-teal-700">Detail</Link></Td>
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
