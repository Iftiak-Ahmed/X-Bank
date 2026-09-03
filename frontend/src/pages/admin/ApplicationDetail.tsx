import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, LoadingState, PageHeader, PrimaryButton, SecondaryButton, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<{ accountNumber: string; userId: string; tempPassword: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/api/admin/applications/${id}`).then((a: any) => {
      setApp(a);
      (["nidFront", "nidBack", "signature"] as const).forEach((kind) => {
        if (a.documents?.[kind]) {
          api.getBlobUrl(`/api/admin/applications/${id}/document/${kind}`).then((url) => {
            setImages((prev) => ({ ...prev, [kind]: url }));
          });
        }
      });
    });
  }, [id]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<any>(`/api/admin/applications/${id}/approve`);
      setApproved(result);
    } catch (err: any) {
      setError(err.message ?? "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!remarks.trim()) return setError("Add remarks before rejecting.");
    setBusy(true);
    try {
      await api.post(`/api/admin/applications/${id}/reject`, { remarks });
      navigate("/admin/applications");
    } finally {
      setBusy(false);
    }
  }

  async function requestInfo() {
    if (!remarks.trim()) return setError("Add remarks describing what's needed.");
    setBusy(true);
    try {
      await api.post(`/api/admin/applications/${id}/request-info`, { remarks });
      navigate("/admin/applications");
    } finally {
      setBusy(false);
    }
  }

  if (!app) return <LoadingState />;

  if (approved) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="p-8 text-center">
          <h1 className="font-serif text-xl font-semibold text-navy-900">Account created</h1>
          <p className="mt-2 text-sm text-slate-500">Credentials have been generated and emailed to {app.email}.</p>
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2"><dt className="text-slate-500">Account Number</dt><dd className="font-mono font-semibold">{approved.accountNumber}</dd></div>
            <div className="flex justify-between border-b border-slate-100 pb-2"><dt className="text-slate-500">User ID</dt><dd className="font-mono font-semibold">{approved.userId}</dd></div>
            <div className="flex justify-between pb-2"><dt className="text-slate-500">Temporary Password</dt><dd className="font-mono font-semibold">{approved.tempPassword}</dd></div>
          </dl>
          <SecondaryButton className="mt-6 w-full" onClick={() => navigate("/admin/applications")}>Back to applications</SecondaryButton>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={app.fullName} subtitle={id} action={<StatusPill status={app.status} />} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Applicant information</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Email" value={app.email} />
            <Row label="Phone" value={app.phone} />
            <Row label="Date of birth" value={app.dateOfBirth} />
            <Row label="Gender" value={app.gender} />
            <Row label="Address" value={app.address} />
            <Row label="Occupation" value={app.occupation} />
            <Row label="Nationality" value={app.nationality} />
            <Row label="NID number" value={app.nidNumber} />
            <Row label="Submitted" value={formatDate(app.createdAt)} />
          </dl>
          {app.reviewRemarks && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <span className="font-semibold">Previous remarks:</span> {app.reviewRemarks}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">KYC documents</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <DocPreview label="NID front" src={images.nidFront} />
            <DocPreview label="NID back" src={images.nidBack} />
            <DocPreview label="Signature" src={images.signature} />
          </div>

          {app.status === "pending_approval" || app.status === "info_requested" ? (
            <div className="mt-6">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Review remarks</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Required for reject / request info" />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <PrimaryButton disabled={busy} onClick={approve}>Approve</PrimaryButton>
                <SecondaryButton disabled={busy} onClick={requestInfo}>Request Info</SecondaryButton>
                <SecondaryButton disabled={busy} onClick={reject} className="border-red-200 text-red-700 hover:bg-red-50">Reject</SecondaryButton>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-400">This application has already been {app.status}.</p>
          )}
        </Card>
      </div>
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

function DocPreview({ label, src }: { label: string; src?: string }) {
  return (
    <div>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {src ? <img src={src} alt={label} className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">Loading…</span>}
      </div>
      <p className="mt-1 text-center text-xs text-slate-500">{label}</p>
    </div>
  );
}
