import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, formatDate } from "../../components/Shared";
import { StatusPill } from "../../components/RiskChip";

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "account_opening", label: "Account Opening" },
  { value: "staff_credentials", label: "Staff Credentials" },
  { value: "credentials_reset", label: "Credentials Reset" },
  { value: "password_reset", label: "Password Recovery" },
];

export default function EmailOutbox() {
  const [emails, setEmails] = useState<any[]>([]);
  const [type, setType] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = type ? `?type=${type}` : "";
    api.get<any[]>(`/api/admin/emails${params}`).then((e) => {
      setEmails(e);
      setLoading(false);
    });
  }, [type]);

  return (
    <div>
      <PageHeader title="Sent Emails" subtitle="Credential and notification emails — delivered via SMTP when configured, otherwise recorded here." />

      <div className="mb-4 flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setType(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${type === f.value ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : emails.length === 0 ? <EmptyState message="No emails in this category." /> : (
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
