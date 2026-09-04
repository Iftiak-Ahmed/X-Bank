import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { UserCheck, Banknote } from "lucide-react";
import { api } from "../../lib/api";
import { Card, KpiCard, LoadingState, PageHeader, money } from "../../components/Shared";

interface Dashboard {
  customerCount: number;
}

interface ActivityPoint {
  date: string;
  cashIn: number;
  cashOut: number;
  transfer: number;
}

const SERIES = [
  { key: "cashIn", label: "Cash In", color: "#1f6f6b" },
  { key: "cashOut", label: "Cash Withdrawal", color: "#b45309" },
  { key: "transfer", label: "Balance Transfer", color: "#14335c" },
] as const;

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function compactAmount(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function ActivityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point: ActivityPoint = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-navy-900">{shortDate(label)}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="mt-1 flex items-center gap-1.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}: {money(point[s.key])}
        </div>
      ))}
    </div>
  );
}

export default function EmployeeDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[] | null>(null);

  useEffect(() => {
    api.get<Dashboard>("/api/employee/dashboard").then(setData);
    api.get<ActivityPoint[]>("/api/employee/dashboard/activity-trend").then(setActivity);
  }, []);

  if (!data) return <LoadingState />;

  const today = activity?.[activity.length - 1];
  const todayTotal = today ? today.cashIn + today.cashOut + today.transfer : null;

  return (
    <div>
      <PageHeader title="Operational Dashboard" subtitle="Branch activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label="Total Customers" value={data.customerCount} tone="teal" icon={<UserCheck className="h-5 w-5" />} />
        <KpiCard label="Today's Transaction" value={todayTotal === null ? "…" : money(todayTotal)} tone="sky" icon={<Banknote className="h-5 w-5" />} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-serif text-lg font-semibold text-navy-900">Branch Activity</h2>
        <p className="text-sm text-slate-500">Cash in, cash withdrawal, and balance transfer amounts, last 7 days.</p>
        <div className="mt-4 h-72">
          {!activity ? (
            <LoadingState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activity} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis tickFormatter={compactAmount} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<ActivityTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: 4 }} />
                <Legend
                  formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                  iconType="circle"
                  iconSize={8}
                />
                {SERIES.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
