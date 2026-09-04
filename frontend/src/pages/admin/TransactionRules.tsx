import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, Td, Th } from "../../components/Shared";

const TRANSACTION_TYPES = [
  { value: "all", label: "All Types" },
  { value: "transfer", label: "Transfer" },
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
];

const CUSTOMER_TYPES = [
  { value: "all", label: "All Customers" },
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
];

const VIOLATION_ACTIONS = [
  { value: "block", label: "Block" },
  { value: "flag", label: "Flag" },
  { value: "alert", label: "Alert" },
];

const EMPTY_FORM = {
  ruleName: "",
  transactionType: "all",
  customerType: "all",
  perTransactionLimit: "",
  dailyTransactionLimit: "",
  monthlyTransactionLimit: "",
  dailyCountLimit: "",
  monthlyCountLimit: "",
  status: "active",
  violationAction: "flag",
};

function toNumberOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function typeLabel(value: string, options: { value: string; label: string }[]): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export default function TransactionRules() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api.get<any[]>("/api/admin/transaction-rules").then((r) => {
      setRules(r);
      setLoading(false);
    });
  }
  useEffect(load, []);

  function startEdit(rule: any) {
    setEditingId(rule.id);
    setNotice(null);
    setError(null);
    setForm({
      ruleName: rule.ruleName,
      transactionType: rule.transactionType,
      customerType: rule.customerType,
      perTransactionLimit: rule.perTransactionLimit != null ? String(rule.perTransactionLimit) : "",
      dailyTransactionLimit: rule.dailyTransactionLimit != null ? String(rule.dailyTransactionLimit) : "",
      monthlyTransactionLimit: rule.monthlyTransactionLimit != null ? String(rule.monthlyTransactionLimit) : "",
      dailyCountLimit: rule.dailyCountLimit != null ? String(rule.dailyCountLimit) : "",
      monthlyCountLimit: rule.monthlyCountLimit != null ? String(rule.monthlyCountLimit) : "",
      status: rule.status,
      violationAction: rule.violationAction,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      ruleName: form.ruleName,
      transactionType: form.transactionType,
      customerType: form.customerType,
      perTransactionLimit: toNumberOrNull(form.perTransactionLimit),
      dailyTransactionLimit: toNumberOrNull(form.dailyTransactionLimit),
      monthlyTransactionLimit: toNumberOrNull(form.monthlyTransactionLimit),
      dailyCountLimit: toNumberOrNull(form.dailyCountLimit),
      monthlyCountLimit: toNumberOrNull(form.monthlyCountLimit),
      status: form.status,
      violationAction: form.violationAction,
    };
    try {
      if (editingId) {
        await api.patch(`/api/admin/transaction-rules/${editingId}`, payload);
        setNotice("Rule updated.");
      } else {
        await api.post("/api/admin/transaction-rules", payload);
        setNotice("Rule created.");
      }
      cancelEdit();
      load();
    } catch (err: any) {
      setError(err.message ?? "Failed to save rule.");
    }
  }

  async function deleteRule(id: string, ruleName: string) {
    if (!confirm(`Delete rule "${ruleName}"? This can't be undone.`)) return;
    try {
      await api.delete(`/api/admin/transaction-rules/${id}`);
      if (editingId === id) cancelEdit();
      load();
    } catch (err: any) {
      setError(err.message ?? "Failed to delete rule.");
    }
  }

  function displayLimit(rule: any): string {
    if (rule.perTransactionLimit != null) return `${Number(rule.perTransactionLimit).toLocaleString()} / txn`;
    if (rule.dailyTransactionLimit != null) return `${Number(rule.dailyTransactionLimit).toLocaleString()} / day`;
    if (rule.monthlyTransactionLimit != null) return `${Number(rule.monthlyTransactionLimit).toLocaleString()} / month`;
    if (rule.dailyCountLimit != null) return `${rule.dailyCountLimit} txns / day`;
    if (rule.monthlyCountLimit != null) return `${rule.monthlyCountLimit} txns / month`;
    return "—";
  }

  return (
    <div>
      <PageHeader title="Transaction Rules" subtitle="Configure basic transaction limits — enforced live on every deposit, withdrawal, and transfer." />

      <Card className="p-5">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">
          {editingId ? "Edit rule" : "New rule"}
        </h2>
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            required
            placeholder="Rule name (e.g. Daily Transfer Cap)"
            value={form.ruleName}
            onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2 lg:col-span-3"
          />

          <label className="text-sm text-slate-600">
            Transaction Type
            <select value={form.transactionType} onChange={(e) => setForm({ ...form, transactionType: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {TRANSACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            Customer/User Type
            <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            Violation Action
            <select value={form.violationAction} onChange={(e) => setForm({ ...form, violationAction: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {VIOLATION_ACTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            Per Transaction Limit
            <input type="number" min="0" placeholder="No limit" value={form.perTransactionLimit} onChange={(e) => setForm({ ...form, perTransactionLimit: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm text-slate-600">
            Daily Transaction Limit
            <input type="number" min="0" placeholder="No limit" value={form.dailyTransactionLimit} onChange={(e) => setForm({ ...form, dailyTransactionLimit: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm text-slate-600">
            Monthly Transaction Limit
            <input type="number" min="0" placeholder="No limit" value={form.monthlyTransactionLimit} onChange={(e) => setForm({ ...form, monthlyTransactionLimit: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm text-slate-600">
            Daily Transaction Count Limit
            <input type="number" min="0" placeholder="No limit" value={form.dailyCountLimit} onChange={(e) => setForm({ ...form, dailyCountLimit: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm text-slate-600">
            Monthly Transaction Count Limit
            <input type="number" min="0" placeholder="No limit" value={form.monthlyCountLimit} onChange={(e) => setForm({ ...form, monthlyCountLimit: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm text-slate-600">
            Rule Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
            <PrimaryButton type="submit">{editingId ? "Update Rule" : "Create Rule"}</PrimaryButton>
            {editingId && (
              <button type="button" onClick={cancelEdit} className="text-sm font-semibold text-slate-500">
                Cancel
              </button>
            )}
          </div>
        </form>

        {(error || notice) && (
          <p className={`mt-4 text-sm ${error ? "text-red-600" : "text-teal-700"}`}>{error ?? notice}</p>
        )}
      </Card>

      <Card className="mt-6">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-serif text-lg font-semibold text-navy-900">Rules</h2></div>
        {loading ? <LoadingState /> : rules.length === 0 ? <EmptyState message="No transaction rules yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Rule Name</Th>
                  <Th>Transaction Type</Th>
                  <Th>Limit</Th>
                  <Th>Status</Th>
                  <Th></Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium text-navy-900">{r.ruleName}</Td>
                    <Td className="capitalize">{typeLabel(r.transactionType, TRANSACTION_TYPES)}</Td>
                    <Td>{displayLimit(r)}</Td>
                    <Td>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "active" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>
                        {r.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </Td>
                    <Td>
                      <button onClick={() => startEdit(r)} className="text-xs font-semibold text-teal-700">Edit</button>
                    </Td>
                    <Td>
                      <button onClick={() => deleteRule(r.id, r.ruleName)} className="text-xs font-semibold text-red-600">Delete</button>
                    </Td>
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
