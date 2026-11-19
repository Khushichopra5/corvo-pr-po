import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { getLatestRun, getRequirements } from "@/db/queries";
import { Badge, Card, Empty, Money, PageHeader, RouteBadge, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const FILTERS = ["", "CONTRACT_PO", "SPOT_PO", "EMERGENCY_PO", "RFQ", "RFP", "CAPEX_SOURCING", "NEW_ITEM_SOURCING", "NOT_PROCESSED"];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const route = typeof params.route === "string" ? params.route : "";
  const q = typeof params.q === "string" ? params.q.toLowerCase() : "";
  const run = await getLatestRun();
  if (!run) {
    return (
      <div>
        <PageHeader title="Decision inbox" description="Buyer workspace for the latest processed batch." />
        <Empty title="No decisions yet">
          <Link href="/import" className="font-semibold text-slate-900 underline">
            Process the sample batch
          </Link>{" "}
          to create the first decision set.
        </Empty>
      </div>
    );
  }
  const requirements = await getRequirements(run.id);
  const filtered = requirements.filter((requirement) => {
    if (route && requirement.route !== route) return false;
    if (!q) return true;
    return `${requirement.group_id} ${requirement.item_code} ${requirement.item_description} ${requirement.first_pr_no} ${requirement.supplier_id ?? ""}`
      .toLowerCase()
      .includes(q);
  });
  const next = requirements.find((requirement) => requirement.status === "PENDING");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${run.policyVersion} · ${run.filename}`}
        title="Decision inbox"
        description="Every requirement with its route, value, supplier evidence and policy clause. Approve the planned PO/RFQ or override with a written reason."
        action={
          next ? (
            <Link href={`/requirements/${next.id}`} className="btn-primary">
              Review next <ArrowRight className="size-4" />
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter || "ALL"}
            href={filter ? `/inbox?route=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}` : "/inbox"}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${
              route === filter ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {filter ? filter.replaceAll("_", " ") : "All"}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2" action="/inbox">
          {route ? <input type="hidden" name="route" value={route} /> : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search item or PR" className="input w-56 pl-8" />
          </div>
          <button className="btn text-xs" type="submit">
            Search
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Open", requirements.filter((r) => r.status === "PENDING").length],
          ["Approved", requirements.filter((r) => r.status === "APPROVED").length],
          ["Emergency", requirements.filter((r) => r.is_emergency).length],
          ["Total value", `₹${Math.round(requirements.reduce((sum, r) => sum + (r.group_value_inr ?? 0), 0)).toLocaleString("en-IN")}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</div>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="table-wrap rounded-none border-0 shadow-none">
          <table className="data-table">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Plant / need-by</th>
                <th>Value</th>
                <th>Decision</th>
                <th>Supplier / suggestions</th>
                <th>Policy</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((requirement) => (
                <tr key={requirement.id}>
                  <td>
                    <div className="font-semibold text-slate-900">{requirement.item_description}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {requirement.item_code} · {requirement.group_id} · {requirement.first_pr_no}/{requirement.first_pr_line}
                    </div>
                  </td>
                  <td>
                    <div className="text-sm">{requirement.plant}</div>
                    <div className="text-xs text-slate-500">{formatDate(requirement.need_by_date)}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    <Money value={requirement.group_value_inr} />
                    <div className="text-xs text-slate-500">{requirement.quantity.toLocaleString("en-IN")} units</div>
                  </td>
                  <td>
                    <RouteBadge route={requirement.route} />
                    {requirement.is_emergency ? <div className="mt-1"><Badge tone="rose">Emergency</Badge></div> : null}
                  </td>
                  <td>
                    <div className="text-sm font-medium text-slate-800">
                      {requirement.supplier_id ?? (requirement.suggested_supplier_ids || "Buyer to find")}
                    </div>
                    <div className="text-xs text-slate-500">{requirement.contract_id ?? requirement.po_id ?? ""}</div>
                  </td>
                  <td>
                    <div className="text-sm">{requirement.clause ?? "—"}</div>
                    <div className="text-xs text-slate-500">{run.policyVersion}</div>
                  </td>
                  <td>
                    <Badge tone={requirement.status === "APPROVED" ? "green" : "amber"}>{requirement.status}</Badge>
                  </td>
                  <td>
                    <Link href={`/requirements/${requirement.id}`} className="text-xs font-semibold text-slate-800 underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? <div className="p-6 text-sm text-slate-500">No requirements match this filter.</div> : null}
      </Card>
    </div>
  );
}
