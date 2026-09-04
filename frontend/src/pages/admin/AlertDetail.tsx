import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, LoadingState, PageHeader, money, formatDate } from "../../components/Shared";
import { RiskChip, StatusPill } from "../../components/RiskChip";

export default function AlertDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id) api.get(`/api/admin/alerts/${id}`).then(setData);
  }, [id]);

  if (!data) return <LoadingState />;
  const { alert, transaction, investigations, evidence } = data;

  return (
    <div>
      <PageHeader title="Alert" subtitle={id} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Alert</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusPill status={alert.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Risk</dt><dd><RiskChip level={alert.riskLevel} /> <span className="text-xs text-slate-400">{alert.riskScore}</span></dd></div>
            <Row label="Rule" value={alert.primaryRuleCode} />
            <Row label="Created" value={formatDate(alert.createdAt)} />
          </dl>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Reasons</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {alert.reasons?.map((r: string, i: number) => <li key={i}>· {r}</li>)}
          </ul>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Investigation notes</h3>
          {investigations.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {investigations.map((inv: any) => (
                <li key={inv.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="text-slate-700">{inv.notes}</p>
                  <p className="mt-1 text-xs text-slate-400">{inv.outcome} · {formatDate(inv.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Transaction &amp; customer</h2>
          {transaction ? (
            <>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Reference" value={transaction.reference} />
                <Row label="Amount" value={money(transaction.amount, transaction.currency)} />
                <Row label="Purpose" value={transaction.purpose ?? "—"} />
                <Row label="Location" value={transaction.location} />
                <Row label="Risk Score" value={String(alert.riskScore ?? "—")} />
              </dl>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No linked transaction.</p>
          )}

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence</h3>
          {evidence.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No evidence linked.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs font-mono text-slate-500">
              {evidence.map((e: any) => <li key={e.id}>{e.evidenceType} · {e.hash?.slice(0, 14)}…</li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-navy-900">{value}</dd>
    </div>
  );
}
