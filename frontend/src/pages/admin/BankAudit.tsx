import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { downloadPdf } from "../../lib/pdf";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, SecondaryButton, Td, Th, formatDate, money } from "../../components/Shared";
import { RiskChip, StatusPill } from "../../components/RiskChip";

const TYPES = ["transfer", "deposit", "withdrawal", "cash_in", "cash_out", "fund_transfer", "dps_deposit"];
const CHANNELS = ["web", "branch"];
const RISK_LEVELS = ["low", "medium", "high", "critical"];
const STATUSES = ["pending", "approved", "pending_review"];

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  type: "",
  channel: "",
  riskLevel: "",
  status: "",
  search: "",
};

function toMillis(value: any): number {
  return value?.toMillis?.() ?? (value?._seconds ? value._seconds * 1000 : 0);
}

export default function BankAudit() {
  const [transactions, setTransactions] = useState<any[] | null>(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    api.get<any[]>("/api/admin/bank-audit/transactions").then(setTransactions);
  }, []);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const needle = filters.search.trim().toLowerCase();
    const fromMs = filters.dateFrom ? new Date(filters.dateFrom).setHours(0, 0, 0, 0) : null;
    const toMs = filters.dateTo ? new Date(filters.dateTo).setHours(23, 59, 59, 999) : null;

    return transactions.filter((t) => {
      const ms = toMillis(t.createdAt);
      if (fromMs !== null && ms < fromMs) return false;
      if (toMs !== null && ms > toMs) return false;
      if (filters.type && t.type !== filters.type) return false;
      if (filters.channel && t.channel !== filters.channel) return false;
      if (filters.riskLevel && t.riskLevel !== filters.riskLevel) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (needle) {
        const haystack = [t.reference, t.customerName].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions, filters]);

  function updateFilter<K extends keyof typeof EMPTY_FILTERS>(key: K, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function printReport() {
    const rows = filtered.map((t) => ({
      Date: formatDate(t.createdAt),
      Reference: t.reference,
      Customer: t.customerName,
      Type: t.type,
      Channel: t.channel,
      Amount: money(t.amount, t.currency),
      "Risk Level": t.riskLevel ?? "—",
      "Risk Score": t.riskScore ?? "—",
      Status: t.status,
    }));
    downloadPdf("bank-audit-report.pdf", "Bank Audit Report", rows);
  }

  return (
    <div>
      <PageHeader
        title="Bank Audit"
        subtitle="Every transaction, with full filtering and a printable report."
        action={<PrimaryButton onClick={printReport} disabled={!transactions || filtered.length === 0}>Print Report</PrimaryButton>}
      />

      <Card className="mb-6 p-5">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From
            <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter("dateFrom", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            To
            <input type="date" value={filters.dateTo} onChange={(e) => updateFilter("dateTo", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Type
            <select value={filters.type} onChange={(e) => updateFilter("type", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case capitalize">
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.replace("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Channel
            <select value={filters.channel} onChange={(e) => updateFilter("channel", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case capitalize">
              <option value="">All channels</option>
              {CHANNELS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Risk Level
            <select value={filters.riskLevel} onChange={(e) => updateFilter("riskLevel", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case capitalize">
              <option value="">All risk levels</option>
              {RISK_LEVELS.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case capitalize">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-3">
          <input
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            placeholder="Search reference or customer name…"
            className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
          <SecondaryButton type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</SecondaryButton>
        </div>
      </Card>

      <Card>
        {!transactions ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState message={transactions.length === 0 ? "No transactions yet." : "No transactions match these filters."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Date</Th><Th>Reference</Th><Th>Customer</Th><Th>Type</Th><Th>Channel</Th><Th>Amount</Th><Th>Risk</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <Td>{formatDate(t.createdAt)}</Td>
                    <Td className="font-mono text-xs">{t.reference}</Td>
                    <Td>{t.customerName}</Td>
                    <Td className="capitalize">{t.type?.replace("_", " ")}</Td>
                    <Td className="capitalize">{t.channel}</Td>
                    <Td>{money(t.amount, t.currency)}</Td>
                    <Td><RiskChip level={t.riskLevel} /> <span className="text-xs text-slate-400">{t.riskScore ?? "—"}</span></Td>
                    <Td><StatusPill status={t.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {transactions && (
        <p className="mt-3 text-xs text-slate-400">
          Showing {filtered.length} of {transactions.length} transactions.
        </p>
      )}
    </div>
  );
}
