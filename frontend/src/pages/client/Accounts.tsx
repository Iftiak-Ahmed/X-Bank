import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, money } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

interface Account {
  id: string;
  accountType: string;
  accountNumber: string;
  balance: number;
  currency: string;
  status: string;
}

const ACCOUNT_TYPE_ORDER: Record<string, number> = { current: 0, savings: 1, dps: 2 };

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Account[]>("/api/client/accounts").then((accs) => {
      const sorted = [...accs].sort(
        (a, b) => (ACCOUNT_TYPE_ORDER[a.accountType] ?? 99) - (ACCOUNT_TYPE_ORDER[b.accountType] ?? 99)
      );
      setAccounts(sorted);
      setLoading(false);
    });
  }, []);

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
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {a.accountType === "dps" ? "DPS" : a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1)} account
                </span>
                <StatusPill status={a.status} />
              </div>
              <div className="mt-1 font-mono text-xs text-slate-400">{a.accountNumber}</div>
              <div className="mt-2 font-serif text-3xl font-semibold text-navy-900">{money(a.balance, a.currency)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
