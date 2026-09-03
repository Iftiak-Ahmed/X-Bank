import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, formatDate } from "../../components/Shared";

export default function Evidence() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>("/api/compliance/evidence").then((e) => {
      setItems(e);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <PageHeader title="Evidence Repository" subtitle="Immutable, hashed evidence collected by the agentic collectors." />
      <Card>
        {loading ? <LoadingState /> : items.length === 0 ? <EmptyState message="No evidence collected yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Collected</Th><Th>Type</Th><Th>Source</Th><Th>Provenance</Th><Th>Hash</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((e) => (
                  <tr key={e.id}>
                    <Td>{formatDate(e.collectedAt)}</Td>
                    <Td className="capitalize">{e.evidenceType}</Td>
                    <Td className="text-xs">{e.sourceSystem}</Td>
                    <Td className="text-xs">{e.provenance}</Td>
                    <Td className="font-mono text-xs">{e.hash?.slice(0, 16)}…</Td>
                    <Td className="capitalize">{e.validationStatus}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
