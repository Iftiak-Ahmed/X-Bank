import { FormEvent, useState } from "react";
import { api } from "../../lib/api";
import { Card, PageHeader, PrimaryButton, SecondaryButton, money } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

type DocKind = "ownPhoto" | "nidFront" | "nidBack" | "signature";

interface LookupResult {
  account: { id: string; accountNumber: string; accountType: string; currency: string; status: string; balance: number };
  customer: { id: string; fullName: string; address: string; phone: string; nationality: string };
  kyc: { id: string; status: string; nidNumber: string; hasDocuments: Record<DocKind, boolean> } | null;
}

export default function FundTransfer() {
  const [senderAccountNumber, setSenderAccountNumber] = useState("");
  const [sender, setSender] = useState<LookupResult | null>(null);
  const [senderImages, setSenderImages] = useState<Record<string, string>>({});
  const [senderImageErrors, setSenderImageErrors] = useState<Record<string, boolean>>({});
  const [senderError, setSenderError] = useState<string | null>(null);
  const [senderLooking, setSenderLooking] = useState(false);

  const [receiverAccountNumber, setReceiverAccountNumber] = useState("");
  const [receiver, setReceiver] = useState<LookupResult | null>(null);
  const [receiverError, setReceiverError] = useState<string | null>(null);
  const [receiverLooking, setReceiverLooking] = useState(false);

  const [amount, setAmount] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ reference: string; amount: number; currency: string } | null>(null);

  async function lookupSender() {
    setSenderError(null);
    setSender(null);
    setSenderImages({});
    setSenderImageErrors({});
    if (!senderAccountNumber.trim()) return;
    setSenderLooking(true);
    try {
      const data = await api.get<LookupResult>(`/api/employee/accounts/lookup?accountNumber=${encodeURIComponent(senderAccountNumber.trim())}`);
      setSender(data);
      if (data.kyc) {
        (["ownPhoto", "nidFront", "nidBack", "signature"] as const).forEach((kind) => {
          if (data.kyc!.hasDocuments[kind]) {
            api
              .getBlobUrl(`/api/employee/kyc/${data.kyc!.id}/document/${kind}`)
              .then((url) => setSenderImages((prev) => ({ ...prev, [kind]: url })))
              .catch(() => setSenderImageErrors((prev) => ({ ...prev, [kind]: true })));
          }
        });
      }
    } catch (err: any) {
      setSenderError(err.message ?? "Account not found.");
    } finally {
      setSenderLooking(false);
    }
  }

  async function lookupReceiver() {
    setReceiverError(null);
    setReceiver(null);
    if (!receiverAccountNumber.trim()) return;
    setReceiverLooking(true);
    try {
      const data = await api.get<LookupResult>(`/api/employee/accounts/lookup?accountNumber=${encodeURIComponent(receiverAccountNumber.trim())}`);
      setReceiver(data);
    } catch (err: any) {
      setReceiverError(err.message ?? "Account not found.");
    } finally {
      setReceiverLooking(false);
    }
  }

  async function submitTransfer(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const amt = Number(amount);
    if (!sender || !receiver || !amt || amt <= 0) return;
    if (amt > sender.account.balance) {
      setSubmitError("Amount exceeds the sender's current balance.");
      return;
    }
    setSubmitting(true);
    try {
      const tx = await api.post<{ reference: string; amount: number; currency: string }>("/api/employee/fund-transfer", {
        senderAccountNumber: sender.account.accountNumber,
        receiverAccountNumber: receiver.account.accountNumber,
        amount: amt,
      });
      setReceipt({ reference: tx.reference, amount: tx.amount, currency: tx.currency });
      setSenderAccountNumber("");
      setSender(null);
      setReceiverAccountNumber("");
      setReceiver(null);
      setAmount("");
    } catch (err: any) {
      setSubmitError(err.message ?? "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Fund Transfer" subtitle="Move funds between two customer accounts after verifying the sender's identity." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">From account</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={senderAccountNumber}
              onChange={(e) => setSenderAccountNumber(e.target.value)}
              onBlur={lookupSender}
              placeholder="Account number"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          {senderLooking && <p className="mt-2 text-xs text-slate-400">Looking up…</p>}
          {senderError && <p className="mt-2 text-sm text-red-600">{senderError}</p>}

          {sender && (
            <>
              <dl className="mt-4 space-y-1.5 text-sm">
                <Row label="Name" value={sender.customer.fullName} />
                <Row label="Balance" value={money(sender.account.balance, sender.account.currency)} />
              </dl>
              {sender.kyc ? (
                <>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-500">KYC status</span>
                    <StatusPill status={sender.kyc.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <DocPreview label="Photo" src={senderImages.ownPhoto} available={sender.kyc.hasDocuments.ownPhoto} failed={senderImageErrors.ownPhoto} />
                    <DocPreview label="NID front" src={senderImages.nidFront} available={sender.kyc.hasDocuments.nidFront} failed={senderImageErrors.nidFront} />
                    <DocPreview label="NID back" src={senderImages.nidBack} available={sender.kyc.hasDocuments.nidBack} failed={senderImageErrors.nidBack} />
                    <DocPreview label="Signature" src={senderImages.signature} available={sender.kyc.hasDocuments.signature} failed={senderImageErrors.signature} />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No KYC record on file for this customer.</p>
              )}
            </>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">To account</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={receiverAccountNumber}
              onChange={(e) => setReceiverAccountNumber(e.target.value)}
              onBlur={lookupReceiver}
              placeholder="Account number"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          {receiverLooking && <p className="mt-2 text-xs text-slate-400">Looking up…</p>}
          {receiverError && <p className="mt-2 text-sm text-red-600">{receiverError}</p>}
          {receiver && (
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Name" value={receiver.customer.fullName} />
              <Row label="Account number" value={receiver.account.accountNumber} />
            </dl>
          )}

          {sender && receiver && (
            <form onSubmit={submitTransfer} className="mt-6 border-t border-slate-100 pt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</label>
              <input
                type="number"
                min="1"
                max={sender.account.balance}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. 5000"
              />
              {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}
              <PrimaryButton type="submit" disabled={submitting} className="mt-3 w-full">
                {submitting ? "Processing…" : "Confirm Transfer"}
              </PrimaryButton>
            </form>
          )}
        </Card>
      </div>

      {receipt && (
        <Card className="mt-6 max-w-xl p-6 text-center">
          <h2 className="font-serif text-xl font-semibold text-navy-900">Transfer submitted</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2"><dt className="text-slate-500">Reference</dt><dd className="font-mono font-semibold">{receipt.reference}</dd></div>
            <div className="flex justify-between pb-2"><dt className="text-slate-500">Amount</dt><dd className="font-semibold">{money(receipt.amount, receipt.currency)}</dd></div>
          </dl>
          <SecondaryButton className="mt-4" onClick={() => setReceipt(null)}>Make another transfer</SecondaryButton>
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
