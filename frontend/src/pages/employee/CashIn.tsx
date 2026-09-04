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

export default function CashIn() {
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [uploadingKind, setUploadingKind] = useState<DocKind | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ reference: string; amount: number; currency: string; newBalance: number } | null>(null);

  function fetchDocument(kycId: string, kind: DocKind) {
    api
      .getBlobUrl(`/api/employee/kyc/${kycId}/document/${kind}`)
      .then((url) => setImages((prev) => ({ ...prev, [kind]: url })))
      .catch(() => setImageErrors((prev) => ({ ...prev, [kind]: true })));
  }

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
          if (data.kyc!.hasDocuments[kind]) fetchDocument(data.kyc!.id, kind);
        });
      }
    } catch (err: any) {
      setLookupError(err.message ?? "Account not found.");
    } finally {
      setLooking(false);
    }
  }

  async function uploadDocument(kind: DocKind, file: File) {
    if (!result?.kyc) return;
    const kycId = result.kyc.id;
    setUploadError(null);
    setUploadingKind(kind);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.postForm(`/api/employee/kyc/${kycId}/document/${kind}`, form);
      setImageErrors((prev) => ({ ...prev, [kind]: false }));
      setResult((prev) => (prev && prev.kyc ? { ...prev, kyc: { ...prev.kyc, hasDocuments: { ...prev.kyc.hasDocuments, [kind]: true } } } : prev));
      fetchDocument(kycId, kind);
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed.");
    } finally {
      setUploadingKind(null);
    }
  }

  async function submitCashIn(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const amt = Number(amount);
    if (!result || !amt || amt <= 0) return;
    setSubmitting(true);
    try {
      const tx = await api.post<{ reference: string; amount: number; currency: string }>("/api/employee/cash-in", {
        accountNumber: result.account.accountNumber,
        amount: amt,
      });
      setReceipt({ reference: tx.reference, amount: tx.amount, currency: tx.currency, newBalance: result.account.balance + amt });
      setAmount("");
      setResult(null);
      setAccountNumber("");
    } catch (err: any) {
      setSubmitError(err.message ?? "Cash-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Cash In" subtitle="Deposit cash into a customer's account after verifying their identity." />

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

            <form onSubmit={submitCashIn} className="mt-6 border-t border-slate-100 pt-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Amount to cash in</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. 5000"
              />
              {submitError && <p className="mt-2 text-sm text-red-600">{submitError}</p>}
              <PrimaryButton type="submit" disabled={submitting || result.account.status !== "active"} className="mt-3 w-full">
                {submitting ? "Processing…" : "Confirm Cash In"}
              </PrimaryButton>
              {result.account.status !== "active" && (
                <p className="mt-2 text-xs text-red-600">This account is {result.account.status} and can't accept deposits.</p>
              )}
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Identity verification</h2>
            {result.kyc ? (
              <>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">KYC status</dt><dd><StatusPill status={result.kyc.status} /></dd></div>
                  <Row label="NID number" value={result.kyc.nidNumber} />
                </dl>
                {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(["ownPhoto", "nidFront", "nidBack", "signature"] as const).map((kind) => (
                    <DocPreview
                      key={kind}
                      label={kind === "ownPhoto" ? "Applicant photo" : kind === "nidFront" ? "NID front" : kind === "nidBack" ? "NID back" : "Signature"}
                      src={images[kind]}
                      available={result.kyc!.hasDocuments[kind]}
                      failed={imageErrors[kind]}
                      uploading={uploadingKind === kind}
                      onUpload={(file) => uploadDocument(kind, file)}
                    />
                  ))}
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
          <h2 className="font-serif text-xl font-semibold text-navy-900">Cash-in complete</h2>
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

function DocPreview({
  label,
  src,
  available,
  failed,
  uploading,
  onUpload,
}: {
  label: string;
  src?: string;
  available: boolean;
  failed?: boolean;
  uploading?: boolean;
  onUpload: (file: File) => void;
}) {
  const needsUpload = !available || failed;

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
      {needsUpload && !uploading && (
        <label className="mt-1 block cursor-pointer text-center text-xs font-semibold text-teal-700 hover:text-teal-800">
          Upload
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
        </label>
      )}
    </div>
  );
}
