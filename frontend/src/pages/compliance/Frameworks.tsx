import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, PrimaryButton, Td, Th } from "../../components/Shared";

export default function Frameworks() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fwForm, setFwForm] = useState({ name: "", version: "", source: "", description: "" });
  const [controlForm, setControlForm] = useState({ frameworkId: "", controlId: "", name: "", requirement: "", category: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [controlsByFramework, setControlsByFramework] = useState<Record<string, any[]>>({});
  const [loadingControls, setLoadingControls] = useState(false);

  function load() {
    api.get<any[]>("/api/compliance/frameworks").then((f) => {
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
      await api.post("/api/compliance/frameworks", fwForm);
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
      await api.post("/api/compliance/controls", controlForm);
      setControlForm((c) => ({ ...c, controlId: "", name: "", requirement: "", category: "" }));
      setNotice("Control added.");
      setControlsByFramework((prev) => {
        const { [controlForm.frameworkId]: _stale, ...rest } = prev;
        return rest;
      });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleFramework(frameworkId: string) {
    if (expandedId === frameworkId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(frameworkId);
    if (!controlsByFramework[frameworkId]) {
      setLoadingControls(true);
      try {
        const data = await api.get<{ controls: any[] }>(`/api/compliance/frameworks/${frameworkId}`);
        setControlsByFramework((prev) => ({ ...prev, [frameworkId]: data.controls }));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoadingControls(false);
      }
    }
  }

  return (
    <div>
      <PageHeader title="Compliance Frameworks" subtitle="Register ISO/NIST frameworks and controls used by the monitoring engine." />

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
                <button type="button" onClick={() => toggleFramework(f.id)} className="flex w-full items-center justify-between text-left">
                  <span className="font-semibold text-navy-900">{f.name}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-400">
                    v{f.version} · {f.source}
                    <span className="text-teal-700">{expandedId === f.id ? "Hide controls ▲" : "Show controls ▼"}</span>
                  </span>
                </button>
                {f.description && <p className="mt-1 text-sm text-slate-500">{f.description}</p>}

                {expandedId === f.id && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
                    {loadingControls && !controlsByFramework[f.id] ? (
                      <LoadingState />
                    ) : (controlsByFramework[f.id]?.length ?? 0) === 0 ? (
                      <EmptyState message="No controls in this framework yet." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full table-fixed">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                              <Th className="w-24">Control ID</Th>
                              <Th className="w-1/4">Name</Th>
                              <Th className="w-28">Category</Th>
                              <Th>Description</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {controlsByFramework[f.id].map((c) => (
                              <tr key={c.id}>
                                <Td className="align-top py-4 font-mono text-xs">
                                  <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.controlId}</div>
                                </Td>
                                <Td className="align-top py-4 font-medium text-navy-900">
                                  <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.name}</div>
                                </Td>
                                <Td className="align-top py-4 text-xs text-slate-500">
                                  <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.category}</div>
                                </Td>
                                <Td className="align-top py-4 text-sm leading-relaxed text-slate-500">
                                  <div style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{c.requirement}</div>
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
