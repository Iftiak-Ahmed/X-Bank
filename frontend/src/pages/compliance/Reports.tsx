import { useState } from "react";
import { api } from "../../lib/api";
import { downloadCsv } from "../../lib/csv";
import { Card, PageHeader, PrimaryButton } from "../../components/Shared";

interface ReportDef {
  key: string;
  title: string;
  description: string;
  endpoint: string;
}

const REPORTS: ReportDef[] = [
  { key: "transactions", title: "Transaction Monitoring Report", description: "All monitored transactions with risk score and compliance status.", endpoint: "/api/compliance/transactions?limit=500" },
  { key: "suspicious", title: "Suspicious Activity Report", description: "Transactions with High or Critical risk level.", endpoint: "/api/compliance/transactions?riskLevel=critical&limit=500" },
  { key: "alerts", title: "Alert Report", description: "All compliance alerts and their current status.", endpoint: "/api/compliance/alerts?limit=500" },
  { key: "kyc", title: "KYC Compliance Report", description: "KYC status across all customers.", endpoint: "/api/compliance/kyc" },
  { key: "matrix", title: "Compliance Violation Report", description: "Every FAIL result in the compliance matrix.", endpoint: "/api/compliance/matrix?result=fail&limit=500" },
  { key: "audit", title: "Audit Activity Report", description: "Full audit trail.", endpoint: "/api/compliance/audit-logs?limit=500" },
];

export default function Reports() {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function generate(report: ReportDef) {
    setBusyKey(report.key);
    try {
      const data = await api.get<any[]>(report.endpoint);
      const rows = data.map((row) => flatten(row));
      downloadCsv(`${report.key}-report.csv`, rows);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate CSV exports of monitoring, alert, KYC, and audit data." />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Card key={r.key} className="flex flex-col justify-between p-5">
            <div>
              <h3 className="font-serif text-lg font-semibold text-navy-900">{r.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            </div>
            <PrimaryButton className="mt-4 self-start" disabled={busyKey === r.key} onClick={() => generate(r)}>
              {busyKey === r.key ? "Generating…" : "Export CSV"}
            </PrimaryButton>
          </Card>
        ))}
      </div>
    </div>
  );
}

function flatten(obj: any, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !("toDate" in (v as any))) {
      Object.assign(out, flatten(v, key));
    } else if (v && typeof v === "object" && "toDate" in (v as any)) {
      out[key] = (v as any).toDate?.().toISOString?.() ?? String(v);
    } else if (Array.isArray(v)) {
      out[key] = v.join("; ");
    } else {
      out[key] = v;
    }
  }
  return out;
}
