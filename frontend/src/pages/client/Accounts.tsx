import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, SecondaryButton, money } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

interface Account {
  id: string;
  accountType: string;
  accountNumber: string;
  balance: number;
  currency: string;
  status: string;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  function load() {
    api.get<Account[]>("/api/client/accounts").then((accs) => {
      setAccounts(accs);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function act(accountId: string, kind: "deposit" | "withdraw") {
    const amount = Number(amounts[accountId]);
    if (!amount || amount <= 0) return;
    setBusyId(accountId);
    try {
      await api.post(`/api/client/transactions/${kind}`, { accountId, amount });
      setAmounts((a) => ({ ...a, [accountId]: "" }));
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Accounts" subtitle="Savings and current accounts held with X Bank." />
      {accounts.length === 0 ? (
        <EmptyState message="No accounts found." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {accounts.map((a) => (
            <Card key={a.id} className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 capitalize">{a.accountType} account</span>
                <StatusPill status={a.status} />
              </div>
              <div className="mt-1 font-mono text-xs text-slate-400">{a.accountNumber}</div>
              <div className="mt-2 font-serif text-3xl font-semibold text-navy-900">{money(a.balance, a.currency)}</div>

              <div className="mt-5 flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Amount"
                  value={amounts[a.id] ?? ""}
                  onChange={(e) => setAmounts((v) => ({ ...v, [a.id]: e.target.value }))}
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <SecondaryButton disabled={busyId === a.id} onClick={() => act(a.id, "deposit")}>Deposit</SecondaryButton>
                <PrimaryButton disabled={busyId === a.id} onClick={() => act(a.id, "withdraw")}>Withdraw</PrimaryButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
