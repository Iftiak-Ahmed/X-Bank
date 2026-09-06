import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, PageHeader, PrimaryButton, SecondaryButton, money } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

type DocKind = "ownPhoto" | "nidFront" | "nidBack" | "signature";

interface LookupResult {
  account: { id: string; accountNumber: string; accountType: string; currency: string; status: string; balance: number };
  customer: { id: string; fullName: string; address: string; phone: string; nationality: string };
  kyc: { id: string; status: string; nidNumber: string; hasDocuments: Record<DocKind, boolean> } | null;
}

export default function CashWithdrawal() {
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ reference: string; amount: number; currency: string; newBalance: number } | null>(null);
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!otpId || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [otpId, secondsLeft]);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setResult(null);
    setImages({});
    setImageErrors({});
    setReceipt(null);
    if (!accountNumber.trim()) return;
    setLooking(true);
    try {
      const data = await api.get<LookupResult>(`/api/employee/accounts/lookup?accountNumber=${encodeURIComponent(accountNumber.trim())}`);
      setResult(data);
      if (data.kyc) {
        (["ownPhoto", "nidFront", "nidBack", "signature"] as const).forEach((kind) => {
          if (data.kyc!.hasDocuments[kind]) {
            api
              .getBlobUrl(`/api/employee/kyc/${data.kyc!.id}/document/${kind}`)
              .then((url) => setImages((prev) => ({ ...prev, [kind]: url })))
              .catch(() => setImageErrors((prev) => ({ ...prev, [kind]: true })));
          }
        });
      }
    } catch (err: any) {
      setLookupError(err.message ?? "Account not found.");
    } finally {
      setLooking(false);
    }
  }

  async function requestOtp() {
    setSubmitError(null);
    const amt = Number(amount);
    if (!result || !amt || amt <= 0) return;
    if (amt > result.account.balance) {
      setSubmitError("Amount exceeds the account's current balance.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ otpId: string; expiresInSeconds: number }>("/api/employee/cash-out/request-otp", {
        accountNumber: result.account.accountNumber,
        amount: amt,
      });
      setOtpId(res.otpId);
      setSecondsLeft(res.expiresInSeconds);
      setOtpValue("");
    } catch (err: any) {
      setSubmitError(err.message ?? "Could not send confirmation code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCashOut(e: FormEvent) {
    e.preventDefault();
    if (!otpId || !result) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const tx = await api.post<{ reference: string; amount: number; currency: string }>("/api/employee/cash-out/confirm", {
        otpId,
        otp: otpValue,
      });
      setReceipt({ reference: tx.reference, amount: tx.amount, currency: tx.currency, newBalance: result.account.balance - Number(amount) });
      setAmount("");
      setResult(null);
      setAccountNumber("");
      setOtpId(null);
      setOtpValue("");
    } catch (err: any) {
      setSubmitError(err.message ?? "Cash withdrawal failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Cash Withdrawal" subtitle="Withdraw cash from a customer's account after verifying their identity." />

      <Card className="max-w-xl p-6">
        <form onSubmit={lookup} className="flex gap-3">
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Account number"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <SecondaryButton type="submit" disabled={looking}>{looking ? "Looking up…" : "Look up"}</SecondaryButton>
        </form>
        {lookupError && <p className="mt-2 text-sm text-red-600">{lookupError}</p>}
      </Card>

      {result && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Account holder</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Name" value={result.customer.fullName} />
              <Row label="Address" value={result.customer.address} />
              <Row label="Mobile" value={result.customer.phone} />
              <Row label="Nationality" value={result.customer.nationality} />
              <Row label="Account" value={`${result.account.accountNumber} (${result.account.accountType})`} />
              <Row label="Current balance" value={money(result.account.balance, result.account.currency)} />
            </dl>

            {!otpId ? (
              <form onSubmit={(e) => { e.preventDefault(); requestOtp(); }} className="mt-6 border-t border-slate-100 pt-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Amount to withdraw</label>
                <input
                  type="number"
                  min="1"
                  max={result.account.balance}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. 5000"
                />
                {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}
                <PrimaryButton type="submit" disabled={submitting || result.account.status !== "active"} className="mt-3 w-full">
                  {submitting ? "Sending code…" : "Send confirmation code"}
                </PrimaryButton>
                {result.account.status !== "active" && (
                  <p className="mt-2 text-xs text-red-600">This account is {result.account.status} and can't process withdrawals.</p>
                )}
              </form>
            ) : (
              <form onSubmit={confirmCashOut} className="mt-6 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">
                  A 5-digit code was emailed to the account holder. Enter it below to confirm withdrawing {money(Number(amount), result.account.currency)}.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  required
                  placeholder="00000"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-2xl tracking-[0.5em] text-navy-900"
                />
                <p className="mt-2 text-xs text-slate-400">
                  {secondsLeft > 0
                    ? `Code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                    : "Code expired — request a new one below."}
                </p>
                {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}
                <div className="mt-3 flex gap-3">
                  <SecondaryButton type="button" onClick={() => { setOtpId(null); setOtpValue(""); setSubmitError(null); }} className="flex-1">
                    Back
                  </SecondaryButton>
                  <PrimaryButton type="submit" disabled={submitting || otpValue.length !== 5 || secondsLeft <= 0} className="flex-1">
                    {submitting ? "Confirming…" : "Confirm Withdrawal"}
                  </PrimaryButton>
                </div>
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={submitting || secondsLeft > 0}
                  className="mt-3 w-full text-center text-sm font-semibold text-teal-700 disabled:text-slate-300"
                >
                  Resend code
                </button>
              </form>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Identity verification</h2>
            {result.kyc ? (
              <>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">KYC status</dt><dd><StatusPill status={result.kyc.status} /></dd></div>
                  <Row label="NID number" value={result.kyc.nidNumber} />
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <DocPreview label="Applicant photo" src={images.ownPhoto} available={result.kyc.hasDocuments.ownPhoto} failed={imageErrors.ownPhoto} />
                  <DocPreview label="NID front" src={images.nidFront} available={result.kyc.hasDocuments.nidFront} failed={imageErrors.nidFront} />
                  <DocPreview label="NID back" src={images.nidBack} available={result.kyc.hasDocuments.nidBack} failed={imageErrors.nidBack} />
                  <DocPreview label="Signature" src={images.signature} available={result.kyc.hasDocuments.signature} failed={imageErrors.signature} />
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">No KYC record on file for this customer.</p>
            )}
          </Card>
        </div>
      )}

      {receipt && (
        <Card className="mt-6 max-w-xl p-6 text-center">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Cash withdrawal complete</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2"><dt className="text-slate-500">Reference</dt><dd className="font-mono font-semibold">{receipt.reference}</dd></div>
            <div className="flex justify-between pb-2"><dt className="text-slate-500">Amount</dt><dd className="font-semibold">{money(receipt.amount, receipt.currency)}</dd></div>
          </dl>
        </Card>
      )}
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

function DocPreview({ label, src, available, failed }: { label: string; src?: string; available: boolean; failed?: boolean }) {
  return (
    <div>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {!available ? (
          <span className="text-xs text-slate-400">Not on file</span>
        ) : src ? (
          <img src={src} alt={label} className="h-full w-full object-contain" />
        ) : failed ? (
          <span className="px-2 text-center text-xs text-red-500">Not available</span>
        ) : (
          <span className="text-xs text-slate-400">Loading…</span>
        )}
      </div>
      <p className="mt-1 text-center text-xs text-slate-500">{label}</p>
    </div>
  );
}
