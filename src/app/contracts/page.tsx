import { ContractForm } from "@/components/contract-form";
import { Badge, Card, Money, PageHeader, formatDate } from "@/components/ui";
import { listContracts } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const contracts = await listContracts();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rate contracts"
        title="Contract register"
        description="The register is the ceiling baseline. PDF-only contracts are binding from their start date and start at zero consumed value. A contract is usable only while its supplier is Active and the requirement date is inside its term."
      />
      <Card className="card-pad">
        <ContractForm />
      </Card>

      <div className="space-y-3">
        {contracts.map((contract) => {
          const used = contract.consumed_total;
          const pct = contract.value_cap > 0 ? Math.min(100, (used / contract.value_cap) * 100) : 0;
          const expired = contract.end_date < today;
          return (
            <Card key={contract.contract_id} className="card-pad" >
              <div id={contract.contract_id} className="scroll-mt-24" />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-950">{contract.contract_id}</h2>
                    <Badge tone={contract.source === "PDF" ? "violet" : "slate"}>{contract.source === "PDF" ? "PDF-only" : "Register"}</Badge>
                    <Badge tone={contract.supplier_status === "Active" ? "green" : "rose"}>{contract.supplier_status}</Badge>
                    {expired ? <Badge tone="rose">Expired</Badge> : null}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {contract.supplier_name} ({contract.supplier_id}) · {formatDate(contract.start_date)} → {formatDate(contract.end_date)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Remaining</div>
                  <div className="text-xl font-semibold text-slate-950"><Money value={contract.remaining} /></div>
                  <div className="text-xs text-slate-500">of <Money value={contract.value_cap} /></div>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${pct > 90 ? "bg-rose-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span>Register consumed <Money value={contract.consumed_value} /> · app POs <Money value={contract.app_consumed} /></span>
                <span>{pct.toFixed(1)}% consumed</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Schedule A · {contract.lines.length} lines</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {contract.lines.map((line) => (
                    <div key={line.item_code} className="rounded-lg bg-slate-50 p-2 text-xs">
                      <div className="font-semibold text-slate-800">{line.item_code}</div>
                      <div className="text-slate-500">{line.description}</div>
                      <div className="mt-1 flex justify-between text-slate-600">
                        <span>{line.uom}</span>
                        <span>₹{line.rate.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
