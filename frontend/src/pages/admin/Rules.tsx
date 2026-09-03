import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, LoadingState, PageHeader } from "../../components/Shared";

export default function Rules() {
  const [rules, setRules] = useState<any[]>([]);
  const [controls, setControls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    Promise.all([api.get<any[]>("/api/admin/rules"), api.get<any[]>("/api/admin/controls")]).then(([r, c]) => {
      setRules(r.sort((a, b) => a.code.localeCompare(b.code)));
      setControls(c);
      setLoading(false);
    });
  }
  useEffect(load, []);

  async function toggle(id: string, enabled: boolean) {
    await api.patch(`/api/admin/rules/${id}`, { enabled: !enabled });
    load();
  }

  async function updateWeight(id: string, weight: number) {
    await api.patch(`/api/admin/rules/${id}`, { weight });
    load();
  }

  async function toggleControl(rule: any, controlId: string) {
    const current: string[] = rule.linkedControlIds ?? [];
    const next = current.includes(controlId) ? current.filter((c) => c !== controlId) : [...current, controlId];
    await api.patch(`/api/admin/rules/${rule.id}`, { linkedControlIds: next });
    load();
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Compliance Rule Management" subtitle="Enable, disable, reweight, and link rules to compliance controls." />
      <div className="space-y-3">
        {rules.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-mono text-xs text-slate-400">{r.code}</div>
                <div className="font-semibold text-navy-900">{r.name}</div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  Weight
                  <input type="number" defaultValue={r.weight} onBlur={(e) => updateWeight(r.id, Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                </label>
                <button onClick={() => toggle(r.id, r.enabled)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${r.enabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>
                  {r.enabled ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-xs font-semibold text-slate-500">
                  {r.linkedControlIds?.length ?? 0} linked controls
                </button>
              </div>
            </div>
            {expanded === r.id && (
              <div className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3 sm:grid-cols-2">
                {controls.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={(r.linkedControlIds ?? []).includes(c.id)}
                      onChange={() => toggleControl(r, c.id)}
                    />
                    <span className="font-mono">{c.controlId}</span> {c.name}
                  </label>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
