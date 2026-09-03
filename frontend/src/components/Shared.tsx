import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function KpiCard({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-serif text-2xl font-semibold ${accent ?? "text-navy-900"}`}>{value}</div>
    </Card>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="p-10 text-center text-sm text-slate-400">{message}</div>;
}

export function LoadingState() {
  return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
}

export function money(amount: number, currency = "BDT") {
  return `${currency === "BDT" ? "৳" : currency + " "}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: any) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : value?._seconds ? new Date(value._seconds * 1000) : new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 text-sm text-slate-700 ${className}`}>{children}</td>;
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
