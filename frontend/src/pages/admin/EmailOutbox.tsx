import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

export default function EmailOutbox() {
  const [emails, setEmails] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/admin/emails").then((e) => {
      setEmails(e);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Sent Emails" subtitle="Credential and notification emails — delivered via SMTP when configured, otherwise recorded here." />
      {emails.length === 0 ? <EmptyState message="No emails sent yet." /> : (
        <div className="space-y-2">
          {emails.map((e) => (
            <Card key={e.id} className="p-4">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <div>
                  <div className="text-sm font-semibold text-navy-900">{e.subject}</div>
                  <div className="text-xs text-slate-400">To {e.to} · {formatDate(e.sentAt)}</div>
                </div>
                <StatusPill status={e.status} />
              </button>
              {open === e.id && (
                <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{e.bodyText}</div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
