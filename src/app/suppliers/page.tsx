import Link from "next/link";
import { Download } from "lucide-react";
import { getEngineData, getPreferredList } from "@/db/queries";
import { Badge, Card, PageHeader, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const asOf = typeof params.as_of === "string" ? params.as_of : "2026-11-01";
  const item = typeof params.item === "string" ? params.item : "";
  const [data, rows] = await Promise.all([getEngineData(), getPreferredList(asOf, item || undefined)]);
  const top = rows.filter((row) => row.rank <= 3);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Policy 6.1–6.4"
        title="Preferred suppliers"
        description="Built from purchase history and contract history as of a chosen date. Ranking is item-scoped, Active-only and explainable: frequency, recency, contract held, on-time delivery and quality."
        action={
          <Link href={`/api/preferred-suppliers/export.csv?as_of=${asOf}`} className="btn-primary">
            <Download className="size-4" /> Export top 3 CSV
          </Link>
        }
      />

      <Card className="card-pad">
        <form className="flex flex-wrap items-end gap-3" action="/suppliers">
          <div>
            <label className="label">As-of date</label>
            <input type="date" name="as_of" defaultValue={asOf} className="input w-44" />
          </div>
          <div>
            <label className="label">Item</label>
            <select name="item" defaultValue={item} className="input w-80">
              <option value="">All items</option>
              {data.items.map((candidate) => (
                <option key={candidate.itemCode} value={candidate.itemCode}>
                  {candidate.itemCode} · {candidate.description}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit">
            Recalculate
          </button>
          <div className="ml-auto text-xs text-slate-500">
            {top.length} ranked rows · {data.items.length} items · {formatDate(asOf)}
          </div>
        </form>
      </Card>

      <Card>
        <div className="table-wrap rounded-none border-0 shadow-none">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Rank</th>
                <th>Supplier</th>
                <th>Reference price</th>
                <th>POs / 548d</th>
                <th>Recency</th>
                <th>Contract</th>
                <th>On-time</th>
                <th>Quality</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr key={`${row.item_code}-${row.supplier_id}`}>
                  <td>
                    <div className="font-semibold text-slate-900">{row.item_code}</div>
                    <div className="text-xs text-slate-500">{row.item_description}</div>
                  </td>
                  <td>
                    <Badge tone={row.rank === 1 ? "green" : row.rank === 2 ? "blue" : "slate"}>#{row.rank}</Badge>
                  </td>
                  <td>
                    <div className="font-medium text-slate-800">{row.supplier_name}</div>
                    <div className="text-xs text-slate-500">{row.supplier_id}</div>
                  </td>
                  <td className="tabular-nums">₹{(row.reference_price ?? 0).toFixed(2)}</td>
                  <td>{row.po_count}</td>
                  <td>{row.recency.toFixed(1)}</td>
                  <td>{row.contract ? "Yes" : "No"}</td>
                  <td>{row.on_time}%</td>
                  <td>{row.quality}</td>
                  <td className="font-semibold tabular-nums text-slate-900">{row.score.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {top.length === 0 ? <div className="p-6 text-sm text-slate-500">No eligible suppliers for this selection.</div> : null}
      </Card>

      <Card className="card-pad">
        <h2 className="text-lg font-semibold text-slate-950">How the ranking works</h2>
        <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-5">
          {[
            ["Frequency", "40%", "PO count in 548d, capped at 3"],
            ["Recency", "30%", "1.0 ≤90d · 0.5 ≤365d · 0 otherwise"],
            ["Contract", "15%", "Contract covering item started ≤ date"],
            ["On-time", "7.5%", "Supplier master delivery %"],
            ["Quality", "7.5%", "Supplier master rating / 5"],
          ].map(([label, weight, detail]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label} · {weight}</div>
              <div className="mt-1 text-xs text-slate-600">{detail}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          The top-up for sourcing uses 50% on-time and 50% quality, with Active-only category membership. New items get no suggestions. Expired contracts count for membership and the contract term, but are never usable for a CONTRACT_PO.
        </p>
      </Card>
    </div>
  );
}
