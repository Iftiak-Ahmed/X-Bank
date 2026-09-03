import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function Kyc() {
  const [kyc, setKyc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/client/kyc").then((k) => {
      setKyc(k);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="KYC Verification" subtitle="Your identity verification status with X Bank." />
      <Card className="p-6">
        {!kyc ? (
          <EmptyState message="No KYC record found." />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</dt>
              <dd className="mt-1"><StatusPill status={kyc.status} /></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted</dt>
              <dd className="mt-1 text-sm text-slate-700">{formatDate(kyc.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Verified</dt>
              <dd className="mt-1 text-sm text-slate-700">{formatDate(kyc.verifiedAt)}</dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
