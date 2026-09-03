const STYLES: Record<string, string> = {
  low: "text-risk-low bg-risk-lowBg",
  medium: "text-risk-medium bg-risk-mediumBg",
  high: "text-risk-high bg-risk-highBg",
  critical: "text-risk-critical bg-risk-criticalBg",
};

export function RiskChip({ level }: { level?: string | null }) {
  if (!level) return <span className="text-slate-400 text-xs">—</span>;
  const cls = STYLES[level] ?? "text-slate-500 bg-slate-100";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: "text-teal-700 bg-teal-50",
  approved: "text-teal-700 bg-teal-50",
  cleared: "text-teal-700 bg-teal-50",
  verified: "text-teal-700 bg-teal-50",
  resolved: "text-teal-700 bg-teal-50",
  pending: "text-amber-700 bg-amber-50",
  pending_review: "text-amber-700 bg-amber-50",
  under_review: "text-amber-700 bg-amber-50",
  new: "text-amber-700 bg-amber-50",
  escalated: "text-orange-700 bg-orange-50",
  suspended: "text-red-700 bg-red-50",
  locked: "text-red-700 bg-red-50",
  rejected: "text-red-700 bg-red-50",
  expired: "text-red-700 bg-red-50",
  closed: "text-slate-600 bg-slate-100",
  false_positive: "text-slate-600 bg-slate-100",
};

export function StatusPill({ status }: { status?: string | null }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const cls = STATUS_STYLES[status] ?? "text-slate-600 bg-slate-100";
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {label}
    </span>
  );
}
