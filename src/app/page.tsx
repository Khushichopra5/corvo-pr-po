import Link from "next/link";
import { ArrowRight, Bot, FileSpreadsheet, ScrollText } from "lucide-react";
import { getDashboardData, listRuns } from "@/db/queries";
import { Card, Empty, Money, PageHeader, RouteBadge, Stat, formatDateTime } from "@/components/ui";
import { getCurrentUser, roleLabel } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [{ latest, contracts, audit }, runs] = await Promise.all([getDashboardData(), listRuns(6)]);
  const summary = (latest?.summary ?? {}) as Record<string, unknown>;
  const routeCounts = (summary.route_counts_requirements ?? {}) as Record<string, number>;
  const maxRoute = Math.max(1, ...Object.values(routeCounts));
  const warnings = contracts.filter(
    (contract) =>
      contract.supplier_status !== "Active" ||
      contract.end_date < new Date().toISOString().slice(0, 10) ||
      contract.remaining / contract.value_cap < 0.1,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Signed in as ${roleLabel(user.role)}`}
        title="Procurement control tower"
        description="One workspace for policy-driven PR decisions, contract ceilings, sourcing events and audit history. Every decision below is reproducible from the active policy version and the master data."
        action={
          <Link href="/chat" className="btn-primary">
            <Bot className="size-4" /> Raise a request
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="PR lines" value={Number(summary.total_pr_lines ?? 0)} detail="In the latest processed batch" />
        <Stat label="Requirements" value={Number(summary.total_requirements ?? 0)} detail="After clubbing" />
        <Stat label="Purchase orders" value={Number(summary.total_pos ?? 0)} detail="Planned and consolidated" />
        <Stat label="Sourcing events" value={Number(summary.sourcing_events ?? 0)} detail="RFQ, RFP, capex and new item" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="card-pad">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Latest decision run</h2>
              <p className="mt-1 text-sm text-slate-500">
                {latest ? `${latest.filename} · policy ${latest.policyVersion} · ${formatDateTime(latest.createdAt)}` : "No run yet"}
              </p>
            </div>
            {latest ? (
              <Link href={`/api/runs/${latest.id}/export.csv`} className="btn text-xs">
                <FileSpreadsheet className="size-4" /> Export CSV
              </Link>
            ) : null}
          </div>
          {latest ? (
            <>
              <div className="mb-5 space-y-3">
                {Object.entries(routeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([route, count]) => (
                    <div key={route} className="grid grid-cols-[150px_1fr_40px] items-center gap-3 text-sm">
                      <RouteBadge route={route} />
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-700" style={{ width: `${(count / maxRoute) * 100}%` }} />
                      </div>
                      <span className="text-right font-semibold tabular-nums text-slate-700">{count}</span>
                    </div>
                  ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">Requirement value</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    <Money value={Number(summary.total_requirement_value ?? 0)} />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">PO award value</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    <Money value={Number(summary.po_award_value ?? 0)} />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">Not processed</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{Number(summary.not_processed_lines ?? 0)}</div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/inbox" className="btn-primary text-xs">
                  Review decisions <ArrowRight className="size-3.5" />
                </Link>
                <Link href="/policy" className="btn text-xs">
                  <ScrollText className="size-3.5" /> Policy
                </Link>
                <Link href="/import" className="btn text-xs">
                  <FileSpreadsheet className="size-3.5" /> Process a batch
                </Link>
              </div>
            </>
          ) : (
            <Empty title="No decisions yet">
              <Link href="/import" className="font-semibold text-slate-900 underline">
                Upload the sample batch
              </Link>{" "}
              to populate the workspace.
            </Empty>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="card-pad">
            <h2 className="text-lg font-semibold text-slate-950">Contract watch</h2>
            <p className="mt-1 text-sm text-slate-500">Expired, blocked or nearly exhausted contracts.</p>
            <div className="mt-4 space-y-3">
              {warnings.slice(0, 5).map((contract) => (
                <Link key={contract.contract_id} href={`/contracts#${contract.contract_id}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">{contract.contract_id}</span>
                    <Money value={contract.remaining} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {contract.supplier_name} · {contract.supplier_status} · ends {contract.end_date}
                  </div>
                </Link>
              ))}
              {warnings.length === 0 ? <div className="text-sm text-slate-500">No contract warnings.</div> : null}
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="text-lg font-semibold text-slate-950">Recent activity</h2>
            <div className="mt-4 space-y-3">
              {audit.length > 0 ? (
                audit.map((event) => (
                  <div key={event.id} className="text-sm">
                    <div className="font-medium text-slate-800">{event.summary}</div>
                    <div className="text-xs text-slate-500">
                      {event.actor} · {formatDateTime(event.created_at)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">Actions will appear here.</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Run history</h2>
          <Link href="/import" className="text-sm font-semibold text-slate-700 hover:text-slate-950">
            Open batch import
          </Link>
        </div>
        <div className="table-wrap rounded-none border-0 shadow-none">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Policy</th>
                <th>Lines</th>
                <th>POs</th>
                <th>Sourcing</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const s = run.summary as Record<string, unknown>;
                return (
                  <tr key={run.id}>
                    <td className="font-medium text-slate-900">{run.filename}</td>
                    <td>{run.policyVersion}</td>
                    <td>{Number(s.total_pr_lines ?? 0)}</td>
                    <td>{Number(s.total_pos ?? 0)}</td>
                    <td>{Number(s.sourcing_events ?? 0)}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(run.createdAt)}</td>
                    <td>
                      <Link href={`/api/runs/${run.id}/export.csv`} className="text-xs font-semibold text-slate-700 underline">
                        CSV
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
