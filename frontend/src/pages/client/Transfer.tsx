import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, PageHeader, PrimaryButton, SecondaryButton, money } from "../../components/Shared";

interface Account {
  id: string;
  accountType: string;
  accountNumber: string;
  balance: number;
  currency: string;
}

interface Beneficiary {
  id: string;
  beneficiaryName: string;
  accountNumber: string;
}

type Step = "form" | "confirm" | "otp" | "result";

export default function Transfer() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: string; reference: string; amount: number } | null>(null);
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [form, setForm] = useState({
    senderAccountId: "",
    receiverAccountNumber: "",
    amount: "",
    remark: "",
  });

  useEffect(() => {
    api.get<Account[]>("/api/client/accounts").then((accs) => setAccounts(accs.filter((a) => a.accountType !== "dps")));
    api.get<Beneficiary[]>("/api/client/beneficiaries").then((b) => {
      setBeneficiaries(b);
      setLoadingBeneficiaries(false);
    });
  }, []);

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function requestOtp() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ otpId: string; expiresInSeconds: number }>("/api/client/transactions/transfer/request-otp", {
        senderAccountId: form.senderAccountId,
        receiverAccountNumber: form.receiverAccountNumber,
        amount: Number(form.amount),
        purpose: form.remark,
      });
      setOtpId(res.otpId);
      setSecondsLeft(res.expiresInSeconds);
      setOtpValue("");
      setStep("otp");
    } catch (err: any) {
      setError(err.message ?? "Could not send confirmation code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmTransfer() {
    if (!otpId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<any>("/api/client/transactions/transfer/confirm", { otpId, otp: otpValue });
      setResult({ status: res.status, reference: res.reference, amount: res.amount });
      setStep("result");
    } catch (err: any) {
      setError(err.message ?? "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAccount = accounts.find((a) => a.id === form.senderAccountId);
  const selectedBeneficiary = beneficiaries.find((b) => b.accountNumber === form.receiverAccountNumber);

  if (step === "result" && result) {
    const approved = result.status === "approved";
    return (
      <div className="mx-auto max-w-md">
        <Card className={`p-8 text-center ${approved ? "border-teal-200" : "border-amber-200"}`}>
          <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${approved ? "bg-teal-50 text-teal-600" : "bg-amber-50 text-amber-600"}`}>
            {approved ? "✓" : "⏳"}
          </div>
          <h1 className="font-serif text-xl font-semibold text-navy-900">{approved ? "Transfer Approved" : "Transfer Pending Review"}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {approved
              ? "Your transfer has been completed."
              : "Your transfer is being reviewed and may take a little longer to settle."}
          </p>
          <p className="mt-4 font-mono text-sm text-slate-400">{result.reference}</p>
          <p className="mt-1 font-serif text-2xl font-semibold text-navy-900">{money(result.amount)}</p>
          <SecondaryButton
            className="mt-6"
            onClick={() => {
              setStep("form");
              setForm((f) => ({ ...f, amount: "", remark: "" }));
              setOtpId(null);
              setOtpValue("");
            }}
          >
            Make another transfer
          </SecondaryButton>
        </Card>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="Confirm transfer" />
        <Card className="p-6">
          <dl className="space-y-3 text-sm">
            <Row label="From" value={`${selectedAccount?.accountType} · ${selectedAccount?.accountNumber}`} />
            <Row label="To" value={selectedBeneficiary ? `${selectedBeneficiary.beneficiaryName} · ${selectedBeneficiary.accountNumber}` : form.receiverAccountNumber} />
            <Row label="Amount" value={money(Number(form.amount))} />
            <Row label="Remark" value={form.remark} />
          </dl>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex gap-3">
            <SecondaryButton onClick={() => setStep("form")} className="flex-1">Back</SecondaryButton>
            <PrimaryButton onClick={requestOtp} disabled={submitting} className="flex-1">
              {submitting ? "Sending code…" : "Send confirmation code"}
            </PrimaryButton>
          </div>
        </Card>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="Enter confirmation code" />
        <Card className="p-6">
          <p className="text-sm text-slate-500">
            We've emailed a 5-digit code to your registered email address. Enter it below to confirm this transfer.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="00000"
            value={otpValue}
            onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-2xl tracking-[0.5em] text-navy-900"
          />
          <p className="mt-2 text-xs text-slate-400">
            {secondsLeft > 0
              ? `Code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
              : "Code expired — request a new one below."}
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex gap-3">
            <SecondaryButton onClick={() => setStep("confirm")} className="flex-1">Back</SecondaryButton>
            <PrimaryButton onClick={confirmTransfer} disabled={submitting || otpValue.length !== 5 || secondsLeft <= 0} className="flex-1">
              {submitting ? "Confirming…" : "Confirm transfer"}
            </PrimaryButton>
          </div>
          <button
            type="button"
            onClick={requestOtp}
            disabled={submitting || secondsLeft > 0}
            className="mt-4 w-full text-center text-sm font-semibold text-teal-700 disabled:text-slate-300"
          >
            Resend code
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Transfer money" subtitle="Send funds to another X Bank account." />
      <Card className="p-6">
        {!loadingBeneficiaries && beneficiaries.length === 0 ? (
          <EmptyState message="You haven't added any beneficiaries yet." />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep("confirm");
            }}
            className="space-y-4"
          >
            {selectedAccount && (
              <p className="text-xs text-slate-500">
                Available balance: <span className="font-semibold text-navy-900">{money(selectedAccount.balance, selectedAccount.currency)}</span>
              </p>
            )}
            <select
              required
              value={form.senderAccountId}
              onChange={(e) => update("senderAccountId", e.target.value)}
              className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${form.senderAccountId ? "text-navy-900" : "text-slate-400"}`}
            >
              <option value="" disabled>Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} className="text-navy-900">
                  {a.accountType} · {a.accountNumber}
                </option>
              ))}
            </select>
            <select
              required
              value={form.receiverAccountNumber}
              onChange={(e) => update("receiverAccountNumber", e.target.value)}
              className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${form.receiverAccountNumber ? "text-navy-900" : "text-slate-400"}`}
            >
              <option value="" disabled>Select beneficiary</option>
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.accountNumber} className="text-navy-900">
                  {b.beneficiaryName} · {b.accountNumber}
                </option>
              ))}
            </select>
            <input
              type="number"
              required
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <Field label="Remark" value={form.remark} onChange={(v) => update("remark", v)} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <PrimaryButton type="submit" className="w-full">Continue</PrimaryButton>
          </form>
        )}
        {!loadingBeneficiaries && beneficiaries.length === 0 && (
          <Link to="/beneficiaries" className="mt-4 block text-center text-sm font-semibold text-teal-700">
            Add a beneficiary →
          </Link>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-navy-900">{value}</dd>
    </div>
  );
}
