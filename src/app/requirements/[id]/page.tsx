import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { getRequirement, listAuditForEntity } from "@/db/queries";
import { Badge, Card, Money, PageHeader, RouteBadge, formatDate, formatDateTime } from "@/components/ui";
import { RequirementActions } from "@/components/requirement-actions";

export const dynamic = "force-dynamic";

type Preferred = {
  supplierId: string;
  poCount: number;
  recency: number;
  contract: number;
  score: number;
  onTime: number;
  quality: number;
  referencePrice: number | null;
  referenceBasis: string;
  lastPoDate: string | null;
};

export default async function RequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requirement = await getRequirement(id);
  if (!requirement) notFound();
  const audit = await listAuditForEntity("REQUIREMENT", id);
  const preferred = ((requirement.evidence.preferred as Preferred[] | undefined) ?? []).slice(0, 5);
  const isPo = ["CONTRACT_PO", "EMERGENCY_PO", "SPOT_PO"].includes(requirement.route);

  return (
    <div className="space-y-5">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Back to inbox
      </Link>
      <PageHeader
        eyebrow={`${requirement.group_id} · ${requirement.first_pr_no}/${requirement.first_pr_line} · ${requirement.plant}`}
        title={requirement.item_description}
        description={`${requirement.item_code} · ${requirement.quantity.toLocaleString("en-IN")} ${requirement.lines[0]?.uom ?? "units"} · need by ${formatDate(requirement.need_by_date)}`}
        action={<RouteBadge route={requirement.route} />}
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision</div>
                <div className="mt-1 text-xl font-semibold text-slate-950">
                  {isPo
                    ? `${requirement.supplier_id ?? "Supplier"} at ${requirement.po_unit_price ? `₹${requirement.po_unit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "reference price"}`
                    : requirement.route === "NEW_ITEM_SOURCING"
                      ? "New item sourcing"
                      : `Sourcing request · ${requirement.suggested_supplier_ids || "buyer to find suppliers"}`}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Requirement value <Money value={requirement.group_value_inr} /> · policy {requirement.clause ?? "—"} ·{" "}
                  {requirement.requires_approval ? `${requirement.requires_approval} approval` : "standard approval"}
                </div>
              </div>
              <Badge tone={requirement.status === "APPROVED" ? "green" : "amber"}>{requirement.status}</Badge>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <RequirementActions
                id={requirement.id}
                route={requirement.route}
                supplierId={requirement.supplier_id}
                status={requirement.status}
                suggested={requirement.suggested_supplier_ids}
              />
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="text-lg font-semibold text-slate-950">Why this decision</h2>
            <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{requirement.reason}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valuation (3.1)</div>
                <div className="mt-1 text-sm text-slate-800">
                  {requirement.valuation_price ? `₹${requirement.valuation_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per unit` : "Unknown estimate"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {String((requirement.evidence as Record<string, unknown>).valuationBasis ?? "")}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Award price (6.3)</div>
                <div className="mt-1 text-sm text-slate-800">
                  {requirement.po_unit_price ? `₹${requirement.po_unit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per unit` : "Not a PO"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {String((requirement.evidence as Record<string, unknown>).boughtNote ?? "")}
                </div>
              </div>
            </div>
            {requirement.contract_id ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <ShieldCheck className="size-4 text-blue-600" /> Contract {requirement.contract_id} · {requirement.supplier_name}
              </div>
            ) : null}
            {requirement.po_id ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <FileText className="size-4 text-slate-500" /> Planned {requirement.po_id}
                {requirement.approved_po_number ? ` · approved as ${requirement.approved_po_number}` : " · awaiting approval"}
              </div>
            ) : null}
            {requirement.override_reason ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Overridden: {requirement.override_reason}
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">PR lines in this requirement</h2>
              <p className="mt-1 text-sm text-slate-500">Clubbed by item, plant, 14-day creation window and ±7-day need-by window.</p>
            </div>
            <div className="table-wrap rounded-none border-0 shadow-none">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PR line</th>
                    <th>Created</th>
                    <th>Need by</th>
                    <th>Qty</th>
                    <th>Department</th>
                    <th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {requirement.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="font-medium text-slate-900">
                        {line.pr_no}/{line.pr_line}
                      </td>
                      <td>{formatDateTime(line.created_at)}</td>
                      <td>{formatDate(line.need_by_date)}</td>
                      <td className="tabular-nums">
                        {line.quantity.toLocaleString("en-IN")} {line.uom}
                      </td>
                      <td>{line.department}</td>
                      <td>{line.urgency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="card-pad">
            <h2 className="text-lg font-semibold text-slate-950">Preferred supplier evidence</h2>
            <p className="mt-1 text-sm text-slate-500">As of the requirement date. Ranking is explainable, not a black box.</p>
            <div className="mt-4 space-y-3">
              {preferred.length > 0 ? (
                preferred.map((supplier, index) => (
                  <div key={supplier.supplierId} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        #{index + 1} {supplier.supplierId}
                      </div>
                      <div className="text-xs font-semibold text-slate-600">{supplier.score.toFixed(3)}</div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>{supplier.poCount} POs / 548d</span>
                      <span>recency {supplier.recency.toFixed(1)}</span>
                      <span>{supplier.contract ? "contract held" : "no contract"}</span>
                      <span>{supplier.onTime}% on-time</span>
                      <span>quality {supplier.quality}</span>
                      <span>ref ₹{supplier.referencePrice?.toFixed(2) ?? "—"}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">
                  No preferred suppliers yet. {requirement.route === "NEW_ITEM_SOURCING" ? "New items require the buyer to find suppliers." : "Use the suggested list."}
                </div>
              )}
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="text-lg font-semibold text-slate-950">Audit timeline</h2>
            <div className="mt-4 space-y-4">
              {audit.length > 0 ? (
                audit.map((event) => (
                  <div key={event.id} className="border-l-2 border-slate-200 pl-3">
                    <div className="text-sm font-medium text-slate-800">{event.summary}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {event.action} · {event.actor} · {formatDateTime(event.created_at)}
                    </div>
                    {event.comment ? <div className="mt-1 text-xs text-amber-700">“{event.comment}”</div> : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No actions yet. Approving or overriding will create an immutable audit entry.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
