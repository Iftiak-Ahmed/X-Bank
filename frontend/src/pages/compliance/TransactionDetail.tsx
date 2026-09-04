import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, money, formatDate } from "../../components/Shared";
import { RiskChip, StatusPill } from "../../components/RiskChip";

export default function TransactionDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id) api.get(`/api/compliance/transactions/${id}`).then(setData);
  }, [id]);

  if (!data) return <LoadingState />;
  const { transaction, riskScore, alerts, customer, evidence, complianceAnalysis, complianceSummary } = data;

  return (
    <div>
      <PageHeader title="Transaction investigation" subtitle={transaction.reference} />

      <ComplianceAnalysis analysis={complianceAnalysis} summary={complianceSummary} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Transaction</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Amount" value={money(transaction.amount, transaction.currency)} />
            <Row label="Type" value={transaction.type} />
            <Row label="Purpose" value={transaction.purpose ?? "—"} />
            <Row label="Channel" value={transaction.channel} />
            <Row label="Location" value={transaction.location} />
            <Row label="Created" value={formatDate(transaction.createdAt)} />
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusPill status={transaction.status} /></dd></div>
          </dl>

          {customer && (
            <>
              <h2 className="mt-6 font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Customer</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Name" value={customer.fullName} />
                <Row label="Customer ID" value={customer.customerCode} />
                <div className="flex justify-between"><dt className="text-slate-500">KYC</dt><dd><StatusPill status={customer.kycStatus} /></dd></div>
              </dl>
              <Link to={`/compliance/customers/${customer.id}`} className="mt-3 inline-block text-xs font-semibold text-teal-700">
                View full risk profile →
              </Link>
            </>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Risk analysis</h2>
            {riskScore && <RiskChip level={riskScore.level} />}
          </div>

          {!riskScore ? (
            <p className="mt-3 text-sm text-slate-400">Risk not yet calculated.</p>
          ) : (
            <>
              <div className="mt-2 font-serif text-3xl font-semibold text-navy-900">{riskScore.score} / 100</div>
              <div className="mt-4 space-y-2">
                {riskScore.factors.map((f: any, i: number) => (
                  <div key={i} className={`flex items-start justify-between rounded-lg border px-3 py-2 text-sm ${f.triggered ? "border-amber-200 bg-amber-50" : "border-slate-100"}`}>
                    <div>
                      <div className="font-semibold text-navy-900">{f.ruleCode} · {f.ruleName}</div>
                      <div className="text-xs text-slate-500">{f.reason}</div>
                    </div>
                    <div className="font-mono text-sm font-semibold text-navy-900">+{f.score}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="mt-6 font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Related alerts</h2>
          {alerts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No alerts on this transaction.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {alerts.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span>{a.primaryRuleCode}</span>
                  <StatusPill status={a.status} />
                  <Link to={`/compliance/alerts/${a.id}`} className="text-xs font-semibold text-teal-700">Open</Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-6 font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Evidence</h2>
          {evidence.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No evidence records.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {evidence.map((e: any) => (
                <li key={e.id} className="font-mono">{e.evidenceType} · {e.provenance} · {e.hash?.slice(0, 12)}…</li>
              ))}
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

const RESULT_LABEL: Record<string, string> = { pass: "Pass", fail: "Fail", needs_review: "Needs Review", not_applicable: "Not Applicable" };
const RESULT_CLASS: Record<string, string> = {
  pass: "text-risk-low bg-risk-lowBg",
  fail: "text-risk-critical bg-risk-criticalBg",
  needs_review: "text-risk-medium bg-risk-mediumBg",
  not_applicable: "text-slate-500 bg-slate-100",
};

function ComplianceAnalysis({ analysis, summary }: { analysis: any[]; summary: Record<string, number> }) {
  if (!analysis || analysis.length === 0) {
    return (
      <Card className="mb-6 p-5">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Compliance analysis</h2>
        <p className="mt-2 text-sm text-slate-400">No compliance controls are linked to the rules evaluated for this transaction yet.</p>
      </Card>
    );
  }

  // "Not applicable" just means no rule tied to that control ran for this transaction —
  // it's noise here, not a finding. Only controls that were actually evaluated matter.
  const evaluated = analysis.filter((r) => r.result !== "not_applicable");
  if (evaluated.length === 0) {
    return (
      <Card className="mb-6 p-5">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Compliance analysis by framework</h2>
        <p className="mt-2 text-sm text-slate-400">No monitoring rule fired for this transaction, so no framework controls were evaluated.</p>
      </Card>
    );
  }

  const byFramework = new Map<string, any[]>();
  for (const r of evaluated) {
    const key = r.control?.frameworkName ?? "Unmapped";
    byFramework.set(key, [...(byFramework.get(key) ?? []), r]);
  }
  const resultOrder: Record<string, number> = { fail: 0, needs_review: 1, pass: 2 };
  for (const items of byFramework.values()) {
    items.sort((a, b) => (resultOrder[a.result] ?? 3) - (resultOrder[b.result] ?? 3));
  }
  // Frameworks with a violation first, so the officer sees what needs attention immediately.
  const frameworkNames = [...byFramework.keys()].sort((a, b) => {
    const failA = byFramework.get(a)!.some((r) => r.result === "fail");
    const failB = byFramework.get(b)!.some((r) => r.result === "fail");
    return failA === failB ? a.localeCompare(b) : failA ? -1 : 1;
  });

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Compliance analysis by framework</h2>
        <div className="flex gap-3 text-xs">
          {Object.entries(summary ?? {}).map(([k, v]) => (
            <span key={k} className={`rounded-full px-2 py-0.5 font-semibold ${RESULT_CLASS[k]}`}>{RESULT_LABEL[k]} {v}</span>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {frameworkNames.map((framework) => {
          const items = byFramework.get(framework)!;
          const violatedCount = items.filter((r) => r.result === "fail").length;
          return (
            <div key={framework}>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-sm font-semibold text-navy-900">{framework}</h3>
                {violatedCount > 0 ? (
                  <span className="rounded-full bg-risk-criticalBg px-2 py-0.5 text-xs font-semibold text-risk-critical">{violatedCount} violated</span>
                ) : (
                  <span className="rounded-full bg-risk-lowBg px-2 py-0.5 text-xs font-semibold text-risk-low">No violations</span>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {items.map((r: any) => (
                  <div key={r.id} className={`rounded-lg border px-3 py-2 text-sm ${r.result === "fail" ? "border-red-200 bg-red-50" : "border-slate-100"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        {r.ruleCode && <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">{r.ruleCode}</span>}
                        <span className="font-mono text-xs text-slate-400">{r.control?.controlId}</span>{" "}
                        <span className="font-semibold text-navy-900">{r.control?.name}</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_CLASS[r.result]}`}>{RESULT_LABEL[r.result]}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{r.reason}</p>
                    {r.control?.requirement && <p className="mt-1 text-xs italic text-slate-400">Requirement: {r.control.requirement}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
