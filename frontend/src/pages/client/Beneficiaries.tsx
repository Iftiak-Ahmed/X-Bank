import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, Td, Th } from "../../components/Shared";

interface Beneficiary {
  id: string;
  beneficiaryName: string;
  accountNumber: string;
  bankName?: string;
}

export default function Beneficiaries() {
  const [items, setItems] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ beneficiaryName: "", accountNumber: "", bankName: "" });

  function load() {
    api.get<Beneficiary[]>("/api/client/beneficiaries").then((b) => {
      setItems(b);
      setLoading(false);
    });
  }
  useEffect(load, []);

  async function addBeneficiary(e: FormEvent) {
    e.preventDefault();
    await api.post("/api/client/beneficiaries", form);
    setForm({ beneficiaryName: "", accountNumber: "", bankName: "" });
    load();
  }

  async function remove(id: string) {
    await api.delete(`/api/client/beneficiaries/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader title="Beneficiaries" subtitle="People and businesses you send money to." />

      <Card className="mb-6 p-5">
        <form onSubmit={addBeneficiary} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input required placeholder="Name" value={form.beneficiaryName} onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input required placeholder="Account number" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Bank (optional)" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <PrimaryButton type="submit">Add</PrimaryButton>
        </form>
      </Card>

      <Card>
        {loading ? <LoadingState /> : items.length === 0 ? (
          <EmptyState message="No beneficiaries yet." />
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><Th>Name</Th><Th>Account</Th><Th>Bank</Th><Th></Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((b) => (
                <tr key={b.id}>
                  <Td>{b.beneficiaryName}</Td>
                  <Td className="font-mono text-xs">{b.accountNumber}</Td>
                  <Td>{b.bankName ?? "—"}</Td>
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
