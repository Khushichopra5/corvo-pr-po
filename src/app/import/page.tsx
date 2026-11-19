import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { Card, PageHeader, formatDateTime } from "@/components/ui";
import { listRuns } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const runs = await listRuns(20);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Batch API + export"
        title="Process a PR batch"
        description="Upload a CSV in the sample format. The API returns one decision per input line and persists the run for the buyer workspace. The same endpoint is available as POST /api/process-batch."
      />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="card-pad">
          <ImportForm />
        </Card>
        <Card className="card-pad">
          <h2 className="text-lg font-semibold text-slate-950">API quick start</h2>
          <p className="mt-1 text-sm text-slate-500">Use curl or any HTTP client. CSV output is byte-for-byte the required format.</p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">{`curl -F "file=@sample_pr_batch.csv" \\
  "$APP_URL/api/process-batch?format=csv" \\
  -o decisions.csv

curl "$APP_URL/api/preferred-suppliers/export.csv?as_of=2026-11-01" \\
  -o preferred_suppliers.csv`}</pre>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">Policy override:</span> append{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">?policy_version=5.1</code> to reprocess under a newer approved version.
            </p>
            <p>
              <span className="font-semibold text-slate-800">Health:</span>{" "}
              <Link href="/api/health" className="underline">
                /api/health
              </Link>{" "}
              returns seed counts, active policy and the latest run.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Run history</h2>
          <span className="text-xs text-slate-500">{runs.length} runs</span>
        </div>
        <div className="table-wrap rounded-none border-0 shadow-none">
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Policy</th>
                <th>Source</th>
                <th>Lines</th>
                <th>POs</th>
                <th>Sourcing</th>
                <th>Created</th>
                <th>CSV</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const summary = run.summary as Record<string, unknown>;
                return (
                  <tr key={run.id}>
                    <td className="font-mono text-xs text-slate-600">{run.id.slice(0, 8)}</td>
                    <td>{run.policyVersion}</td>
                    <td>{run.source}</td>
                    <td>{Number(summary.total_pr_lines ?? 0)}</td>
                    <td>{Number(summary.total_pos ?? 0)}</td>
                    <td>{Number(summary.sourcing_events ?? 0)}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(run.createdAt)}</td>
                    <td>
                      <Link href={`/api/runs/${run.id}/export.csv`} className="text-xs font-semibold text-slate-700 underline">
                        Download
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
