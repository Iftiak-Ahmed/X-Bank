import { ChangeEvent, FormEvent, useState } from "react";
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
  const [uploadingKind, setUploadingKind] = useState<DocKind | null>(null);
  const [removingKind, setRemovingKind] = useState<DocKind | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
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

  function fetchSenderDocument(kycId: string, kind: DocKind) {
    api
      .getBlobUrl(`/api/employee/kyc/${kycId}/document/${kind}`)
      .then((url) => setSenderImages((prev) => ({ ...prev, [kind]: url })))
      .catch(() => setSenderImageErrors((prev) => ({ ...prev, [kind]: true })));
  }

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
          if (data.kyc!.hasDocuments[kind]) fetchSenderDocument(data.kyc!.id, kind);
        });
      }
    } catch (err: any) {
      setSenderError(err.message ?? "Account not found.");
    } finally {
      setSenderLooking(false);
    }
  }

  async function uploadSenderDocument(kind: DocKind, file: File) {
    if (!sender?.kyc) return;
    const kycId = sender.kyc.id;
    setUploadError(null);
    setUploadingKind(kind);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.postForm(`/api/employee/kyc/${kycId}/document/${kind}`, form);
      setSenderImageErrors((prev) => ({ ...prev, [kind]: false }));
      setSender((prev) => (prev && prev.kyc ? { ...prev, kyc: { ...prev.kyc, hasDocuments: { ...prev.kyc.hasDocuments, [kind]: true } } } : prev));
      fetchSenderDocument(kycId, kind);
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed.");
    } finally {
      setUploadingKind(null);
    }
  }

  async function removeSenderDocument(kind: DocKind) {
    if (!sender?.kyc) return;
    const kycId = sender.kyc.id;
    setUploadError(null);
    setRemovingKind(kind);
    try {
      await api.delete(`/api/employee/kyc/${kycId}/document/${kind}`);
      setSenderImages((prev) => {
        const next = { ...prev };
        delete next[kind];
        return next;
      });
      setSenderImageErrors((prev) => ({ ...prev, [kind]: false }));
      setSender((prev) => (prev && prev.kyc ? { ...prev, kyc: { ...prev.kyc, hasDocuments: { ...prev.kyc.hasDocuments, [kind]: false } } } : prev));
    } catch (err: any) {
      setUploadError(err.message ?? "Remove failed.");
    } finally {
      setRemovingKind(null);
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
                  {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(["ownPhoto", "nidFront", "nidBack", "signature"] as const).map((kind) => (
                      <DocPreview
                        key={kind}
                        label={kind === "ownPhoto" ? "Photo" : kind === "nidFront" ? "NID front" : kind === "nidBack" ? "NID back" : "Signature"}
                        src={senderImages[kind]}
                        available={sender.kyc!.hasDocuments[kind]}
                        failed={senderImageErrors[kind]}
                        uploading={uploadingKind === kind}
                        removing={removingKind === kind}
                        onUpload={(file) => uploadSenderDocument(kind, file)}
                        onRemove={() => removeSenderDocument(kind)}
                      />
                    ))}
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

function DocPreview({
  label,
  src,
  available,
  failed,
  uploading,
  removing,
  onUpload,
  onRemove,
}: {
  label: string;
  src?: string;
  available: boolean;
  failed?: boolean;
  uploading?: boolean;
  removing?: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const needsUpload = !available || failed;
  const busy = uploading || removing;

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = "";
  }

  return (
    <div>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {uploading ? (
          <span className="text-xs text-slate-400">Uploading…</span>
        ) : removing ? (
          <span className="text-xs text-slate-400">Removing…</span>
        ) : src ? (
          <img src={src} alt={label} className="h-full w-full object-contain" />
        ) : !available ? (
          <span className="text-xs text-slate-400">Not on file</span>
        ) : failed ? (
          <span className="px-2 text-center text-xs text-red-500">Not available</span>
        ) : (
          <span className="text-xs text-slate-400">Loading…</span>
        )}
      </div>
      <p className="mt-1 text-center text-xs text-slate-500">{label}</p>
      {!busy && needsUpload && (
        <label className="mt-1 block cursor-pointer text-center text-xs font-semibold text-teal-700 hover:text-teal-800">
          Upload
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
        </label>
      )}
      {!busy && !needsUpload && src && (
        <button type="button" onClick={onRemove} className="mt-1 block w-full text-center text-xs font-semibold text-red-600 hover:text-red-700">
          Remove
        </button>
      )}
    </div>
  );
}
