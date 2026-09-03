import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, money, formatDate } from "../../components/Shared";

const TERM_OPTIONS = [1, 2, 3, 5];

interface DpsTransaction {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  createdAt: unknown;
}

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  balance: number;
  currency: string;
  dps?: {
    sourceAccountId: string;
    termYears: number;
    monthlyDeposit: number;
    profitRatePercent: number;
    expectedMaturityAmount: number;
    totalMonths: number;
    depositsMade: number;
    maturityDate: string;
  };
}

export default function Dps() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [termYears, setTermYears] = useState("");
  const [monthlyDeposit, setMonthlyDeposit] = useState("");
  const [quote, setQuote] = useState<{ totalDeposited: number; expectedMaturityAmount: number; profitRatePercent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [depositBusyId, setDepositBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, DpsTransaction[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  function load() {
    api.get<Account[]>("/api/client/accounts").then((accs) => {
      setAccounts(accs);
      setLoading(false);
    });
  }
  useEffect(load, []);

  const currentAccounts = accounts.filter((a) => a.accountType === "current");
  const dpsAccounts = accounts.filter((a) => a.accountType === "dps");

  useEffect(() => {
    setQuote(null);
    const amount = Number(monthlyDeposit);
    const term = Number(termYears);
    if (!amount || amount <= 0 || !TERM_OPTIONS.includes(term)) return;
    const t = setTimeout(() => {
      api
        .get<{ totalDeposited: number; expectedMaturityAmount: number; profitRatePercent: number }>(
          `/api/client/dps/quote?monthlyDeposit=${amount}&termYears=${term}`
        )
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 300);
    return () => clearTimeout(t);
  }, [monthlyDeposit, termYears]);

  async function openDps(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sourceAccountId || !termYears || !monthlyDeposit) return;
    setSubmitting(true);
    try {
      await api.post("/api/client/dps", {
        sourceAccountId,
        termYears: Number(termYears),
        monthlyDeposit: Number(monthlyDeposit),
      });
      setSourceAccountId("");
      setTermYears("");
      setMonthlyDeposit("");
      setQuote(null);
      load();
    } catch (err: any) {
      setError(err.message ?? "Failed to open DPS.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleHistory(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!history[id]) {
      setLoadingHistory(id);
      try {
        const txs = await api.get<DpsTransaction[]>(`/api/client/dps/${id}/transactions`);
        setHistory((h) => ({ ...h, [id]: txs }));
      } finally {
        setLoadingHistory(null);
      }
    }
  }

  async function makeDeposit(id: string) {
    setDepositBusyId(id);
    try {
      await api.post(`/api/client/dps/${id}/deposit`);
      setHistory((h) => {
        const { [id]: _drop, ...rest } = h;
        return rest;
      });
      load();
    } catch (err: any) {
      setError(err.message ?? "Deposit failed.");
    } finally {
      setDepositBusyId(null);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="DPS" subtitle="A fixed-term recurring deposit, funded from your current account, with profit shared on maturity." />

      <Card className="mb-6 max-w-lg p-6">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Open a new DPS</h2>
        {currentAccounts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">You need a current account to open a DPS.</p>
        ) : (
          <form onSubmit={openDps} className="mt-4 space-y-4">
            <select
              required
              value={sourceAccountId}
              onChange={(e) => setSourceAccountId(e.target.value)}
              className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${sourceAccountId ? "text-navy-900" : "text-slate-400"}`}
            >
              <option value="" disabled>Select current account</option>
              {currentAccounts.map((a) => (
                <option key={a.id} value={a.id} className="text-navy-900">
                  {a.accountType} · {a.accountNumber}
                </option>
              ))}
            </select>

            <select
              required
              value={termYears}
              onChange={(e) => setTermYears(e.target.value)}
              className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${termYears ? "text-navy-900" : "text-slate-400"}`}
            >
              <option value="" disabled>Select term</option>
              {TERM_OPTIONS.map((y) => (
                <option key={y} value={y} className="text-navy-900">{y} {y === 1 ? "year" : "years"}</option>
              ))}
            </select>

            <input
              type="number"
              required
              min="1"
              placeholder="Monthly deposit"
              value={monthlyDeposit}
              onChange={(e) => setMonthlyDeposit(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />

            {quote && (
              <div className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                <div className="flex justify-between"><span>Total you'll deposit</span><span className="font-semibold">{money(quote.totalDeposited)}</span></div>
                <div className="mt-1 flex justify-between"><span>Expected at maturity ({quote.profitRatePercent}% p.a. profit)</span><span className="font-semibold">{money(quote.expectedMaturityAmount)}</span></div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <PrimaryButton type="submit" disabled={submitting || !quote} className="w-full">
              {submitting ? "Opening…" : "Open DPS"}
            </PrimaryButton>
          </form>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-serif text-lg font-semibold text-navy-900">Your DPS accounts</h2>
        </div>
        {dpsAccounts.length === 0 ? (
          <EmptyState message="No DPS accounts yet." />
        ) : (
          <div className="divide-y divide-slate-100">
            {dpsAccounts.map((a) => (
              <div key={a.id} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-slate-400">{a.accountNumber}</span>
                  <span className="whitespace-nowrap text-xs text-slate-400">Matures {formatDate(a.dps!.maturityDate)}</span>
                </div>
                <div className="mt-1 font-serif text-2xl font-semibold text-navy-900">{money(a.balance, a.currency)}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {a.dps!.depositsMade} of {a.dps!.totalMonths} monthly deposits · {money(a.dps!.monthlyDeposit)} each · expected maturity {money(a.dps!.expectedMaturityAmount)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PrimaryButton
                    disabled={depositBusyId === a.id || a.dps!.depositsMade >= a.dps!.totalMonths}
                    onClick={() => makeDeposit(a.id)}
                  >
                    {a.dps!.depositsMade >= a.dps!.totalMonths ? "Term complete" : depositBusyId === a.id ? "Depositing…" : "Make this month's deposit"}
                  </PrimaryButton>
                  <button
                    onClick={() => toggleHistory(a.id)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {expandedId === a.id ? "Hide history" : "Transaction history"}
                  </button>
                </div>

                {expandedId === a.id && (
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    {loadingHistory === a.id ? (
                      <p className="text-xs text-slate-400">Loading…</p>
                    ) : !history[a.id] || history[a.id].length === 0 ? (
                      <p className="text-xs text-slate-400">No deposits yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {history[a.id].map((tx) => (
                          <li key={tx.id} className="flex items-center justify-between text-xs">
                            <span className="font-mono text-slate-500">{tx.reference}</span>
                            <span className="text-slate-400">{formatDate(tx.createdAt)}</span>
                            <span className="font-semibold text-navy-900">{money(tx.amount, tx.currency)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
