import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

const RESULT_LABEL: Record<string, string> = { pass: "Pass", fail: "Fail", needs_review: "Needs Review", not_applicable: "Not Applicable" };
const RESULT_CLASS: Record<string, string> = {
  pass: "text-risk-low bg-risk-lowBg",
  fail: "text-risk-critical bg-risk-criticalBg",
  needs_review: "text-risk-medium bg-risk-mediumBg",
  not_applicable: "text-slate-500 bg-slate-100",
};

export default function ControlDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id) api.get(`/api/compliance/controls/${id}`).then(setData);
  }, [id]);

  if (!data) return <LoadingState />;
  const { control, framework, linkedRules, recentResults, relatedAlerts } = data;

  return (
    <div>
      <PageHeader title={control.name} subtitle={`${control.controlId} · ${framework?.name ?? "Unlinked"}`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Requirement</h2>
          <p className="mt-2 text-sm text-slate-600">{control.requirement}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Category</dt><dd>{control.category ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Source</dt><dd>{control.source ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusPill status={control.status} /></dd></div>
          </dl>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Linked monitoring rules</h3>
          {linkedRules.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No monitoring rule is linked to this control yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {linkedRules.map((r: any) => <li key={r.id} className="font-mono text-xs">{r.code} · {r.name}</li>)}
            </ul>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Recent evaluation results</h2>
          {recentResults.length === 0 ? (
            <EmptyState message="This control hasn't been evaluated against any transaction yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-3 w-full">
                <thead><tr className="border-b border-slate-100"><Th>When</Th><Th>Transaction</Th><Th>Result</Th><Th>Reason</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {recentResults.map((r: any) => (
                    <tr key={r.id}>
                      <Td>{formatDate(r.createdAt)}</Td>
                      <Td>
                        <Link to={`/compliance/transactions/${r.transactionId}`} className="font-mono text-xs text-teal-700">{r.transactionId?.slice(0, 10)}</Link>
                      </Td>
                      <Td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_CLASS[r.result]}`}>{RESULT_LABEL[r.result]}</span></Td>
                      <Td className="whitespace-normal text-xs text-slate-500">{r.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Related alerts</h3>
          {relatedAlerts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No alerts trace back to this control.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {relatedAlerts.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span>{a.primaryRuleCode}</span>
                  <StatusPill status={a.status} />
                  <Link to={`/compliance/alerts/${a.id}`} className="text-xs font-semibold text-teal-700">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
