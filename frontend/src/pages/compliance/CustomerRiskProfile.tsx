import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, LoadingState, PageHeader, Td, Th, money, formatDate } from "../../components/Shared";
import { RiskChip, StatusPill } from "../../components/RiskChip";

export default function CustomerRiskProfile() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id) api.get(`/api/compliance/customers/${id}/risk-profile`).then(setData);
  }, [id]);

  if (!data) return <LoadingState />;
  const { customer, kyc, accounts, transactions, alerts } = data;

  return (
    <div>
      <PageHeader title={customer.fullName} subtitle={customer.customerCode} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">KYC status</div>
          <div className="mt-2"><StatusPill status={kyc?.status ?? customer.kycStatus} /></div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Open alerts</div>
          <div className="mt-1 font-serif text-2xl font-semibold text-navy-900">{alerts.filter((a: any) => !["closed", "resolved", "false_positive"].includes(a.status)).length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total balance</div>
          <div className="mt-1 font-serif text-2xl font-semibold text-navy-900">
            {money(accounts.reduce((s: number, a: any) => s + Number(a.balance), 0))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-serif text-lg font-semibold text-navy-900">Recent transactions</h2></div>
        {transactions.length === 0 ? <EmptyState message="No transactions." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100"><Th>Date</Th><Th>Amount</Th><Th>Risk</Th><Th>Status</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.slice(0, 15).map((t: any) => (
                  <tr key={t.id}>
                    <Td>{formatDate(t.createdAt)}</Td>
                    <Td>{money(t.amount, t.currency)}</Td>
                    <Td><RiskChip level={t.riskLevel} /></Td>
                    <Td><StatusPill status={t.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-serif text-lg font-semibold text-navy-900">Alert history</h2></div>
        {alerts.length === 0 ? <EmptyState message="No prior alerts." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100"><Th>Created</Th><Th>Rule</Th><Th>Risk</Th><Th>Status</Th><Th></Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((a: any) => (
                  <tr key={a.id}>
                    <Td>{formatDate(a.createdAt)}</Td>
                    <Td>{a.primaryRuleCode}</Td>
                    <Td><RiskChip level={a.riskLevel} /></Td>
                    <Td><StatusPill status={a.status} /></Td>
                    <Td><Link to={`/compliance/alerts/${a.id}`} className="text-xs font-semibold text-teal-700">Open</Link></Td>
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
