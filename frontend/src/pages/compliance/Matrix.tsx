import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";

const RESULT_LABEL: Record<string, string> = { pass: "Pass", fail: "Fail", needs_review: "Needs Review", not_applicable: "Not Applicable" };
const RESULT_CLASS: Record<string, string> = {
  pass: "text-risk-low bg-risk-lowBg",
  fail: "text-risk-critical bg-risk-criticalBg",
  needs_review: "text-risk-medium bg-risk-mediumBg",
  not_applicable: "text-slate-500 bg-slate-100",
};

export default function Matrix() {
  const [rows, setRows] = useState<any[]>([]);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = result ? `?result=${result}` : "";
    api.get<any[]>(`/api/compliance/matrix${params}`).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [result]);

  return (
    <div>
      <PageHeader title="Compliance Matrix" subtitle="Every transaction × control evaluation, with full traceability." />

      <div className="mb-4 flex gap-2">
        {["", "pass", "fail", "needs_review", "not_applicable"].map((s) => (
          <button key={s} onClick={() => setResult(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${result === s ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600"}`}>
            {s ? RESULT_LABEL[s] : "All"}
          </button>
        ))}
      </div>

      <Card>
        {loading ? <LoadingState /> : rows.length === 0 ? <EmptyState message="No compliance results yet — they're generated as transactions occur." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>When</Th><Th>Transaction</Th><Th>Control</Th><Th>Result</Th><Th>Severity</Th><Th>Risk contribution</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>{formatDate(r.createdAt)}</Td>
                    <Td><Link to={`/compliance/transactions/${r.transactionId}`} className="font-mono text-xs text-teal-700">{r.transactionId?.slice(0, 10)}</Link></Td>
                    <Td>
                      {r.control ? (
                        <Link to={`/compliance/controls/${r.controlId}`} className="text-xs font-semibold text-navy-900">{r.control.controlId} · {r.control.name}</Link>
                      ) : "—"}
                    </Td>
                    <Td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_CLASS[r.result]}`}>{RESULT_LABEL[r.result]}</span></Td>
                    <Td className="capitalize">{r.severity ?? "—"}</Td>
                    <Td>{r.riskContribution ?? 0}</Td>
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
