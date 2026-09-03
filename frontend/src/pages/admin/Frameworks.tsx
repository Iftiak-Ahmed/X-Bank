import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton } from "../../components/Shared";

export default function Frameworks() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fwForm, setFwForm] = useState({ name: "", version: "", source: "", description: "" });
  const [controlForm, setControlForm] = useState({ frameworkId: "", controlId: "", name: "", requirement: "", category: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api.get<any[]>("/api/admin/frameworks").then((f) => {
      setFrameworks(f);
      setLoading(false);
      if (!controlForm.frameworkId && f[0]) setControlForm((c) => ({ ...c, frameworkId: f[0].id }));
    });
  }
  useEffect(load, []);

  async function createFramework(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/admin/frameworks", fwForm);
      setFwForm({ name: "", version: "", source: "", description: "" });
      setNotice("Framework created.");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createControl(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/admin/controls", controlForm);
      setControlForm((c) => ({ ...c, controlId: "", name: "", requirement: "", category: "" }));
      setNotice("Control added.");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Compliance Frameworks" subtitle="Upload frameworks and controls used by the monitoring engine — nothing here is hardcoded." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">New framework</h2>
          <form onSubmit={createFramework} className="mt-3 space-y-3">
            <input required placeholder="Name (e.g. ISO/IEC 27001:2022)" value={fwForm.name} onChange={(e) => setFwForm({ ...fwForm, name: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required placeholder="Version" value={fwForm.version} onChange={(e) => setFwForm({ ...fwForm, version: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Source (ISO, NIST, internal...)" value={fwForm.source} onChange={(e) => setFwForm({ ...fwForm, source: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <textarea placeholder="Description" value={fwForm.description} onChange={(e) => setFwForm({ ...fwForm, description: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <PrimaryButton type="submit">Create framework</PrimaryButton>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-slate-400">Add control to a framework</h2>
          <form onSubmit={createControl} className="mt-3 space-y-3">
            <select required value={controlForm.frameworkId} onChange={(e) => setControlForm({ ...controlForm, frameworkId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select framework…</option>
              {frameworks.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <input required placeholder="Control ID (e.g. A.8.16)" value={controlForm.controlId} onChange={(e) => setControlForm({ ...controlForm, controlId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required placeholder="Control name" value={controlForm.name} onChange={(e) => setControlForm({ ...controlForm, name: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <textarea required placeholder="Requirement text" value={controlForm.requirement} onChange={(e) => setControlForm({ ...controlForm, requirement: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Category" value={controlForm.category} onChange={(e) => setControlForm({ ...controlForm, category: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <PrimaryButton type="submit">Add control</PrimaryButton>
          </form>
          <p className="mt-2 text-xs text-slate-400">
            To link a control to a monitoring rule, open Compliance Rules and set its Linked Control IDs.
          </p>
        </Card>
      </div>

      {(error || notice) && (
        <p className={`mt-4 text-sm ${error ? "text-red-600" : "text-teal-700"}`}>{error ?? notice}</p>
      )}

      <Card className="mt-6">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-serif text-lg font-semibold text-navy-900">Frameworks</h2></div>
        {loading ? <LoadingState /> : frameworks.length === 0 ? <EmptyState message="No frameworks yet." /> : (
          <ul className="divide-y divide-slate-100">
            {frameworks.map((f) => (
              <li key={f.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-navy-900">{f.name}</span>
                  <span className="text-xs text-slate-400">v{f.version} · {f.source}</span>
                </div>
                {f.description && <p className="mt-1 text-sm text-slate-500">{f.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
