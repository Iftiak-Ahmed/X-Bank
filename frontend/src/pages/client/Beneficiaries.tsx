import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, Td, Th } from "../../components/Shared";

interface Beneficiary {
  id: string;
  beneficiaryName: string;
  accountNumber: string;
}

export default function Beneficiaries() {
  const [items, setItems] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api.get<Beneficiary[]>("/api/client/beneficiaries").then((b) => {
      setItems(b);
      setLoading(false);
    });
  }
  useEffect(load, []);

  async function lookupAccount() {
    setResolvedName(null);
    setLookupError(null);
    if (!accountNumber.trim()) return;
    setLooking(true);
    try {
      const result = await api.get<{ fullName: string }>(`/api/client/accounts/lookup?accountNumber=${encodeURIComponent(accountNumber.trim())}`);
      setResolvedName(result.fullName);
    } catch (err: any) {
      setLookupError(err.message ?? "No account found with that number.");
    } finally {
      setLooking(false);
    }
  }

  async function addBeneficiary(e: FormEvent) {
    e.preventDefault();
    if (!resolvedName) return;
    setSubmitting(true);
    try {
      await api.post("/api/client/beneficiaries", { beneficiaryName: resolvedName, accountNumber: accountNumber.trim() });
      setAccountNumber("");
      setResolvedName(null);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    await api.delete(`/api/client/beneficiaries/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader title="Beneficiaries" subtitle="People and businesses you send money to." />

      <Card className="mb-6 p-5">
        <form onSubmit={addBeneficiary} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            required
            placeholder="Account number"
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value);
              setResolvedName(null);
              setLookupError(null);
            }}
            onBlur={lookupAccount}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <input
            readOnly
            placeholder={looking ? "Looking up…" : "Name (auto-filled)"}
            value={resolvedName ?? ""}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          />
          <PrimaryButton type="submit" disabled={!resolvedName || submitting}>{submitting ? "Adding…" : "Add"}</PrimaryButton>
        </form>
        {lookupError && <p className="mt-2 text-sm text-red-600">{lookupError}</p>}
      </Card>

      <Card>
        {loading ? <LoadingState /> : items.length === 0 ? (
          <EmptyState message="No beneficiaries yet." />
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Name</Th><Th>Account</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((b) => (
                <tr key={b.id}>
                  <Td>{b.beneficiaryName}</Td>
                  <Td className="font-mono text-xs">{b.accountNumber}</Td>
                  <Td><button onClick={() => remove(b.id)} className="text-xs font-semibold text-red-600">Remove</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
