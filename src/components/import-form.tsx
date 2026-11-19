"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [policyVersion, setPolicyVersion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    run_id: string;
    policy_version: string;
    summary: Record<string, unknown>;
  } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const query = policyVersion ? `?policy_version=${encodeURIComponent(policyVersion)}` : "";
      const response = await fetch(`/api/process-batch${query}`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Batch processing failed");
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Batch processing failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
          <Upload className="mx-auto size-8 text-slate-400" />
          <div className="mt-2 text-sm font-semibold text-slate-800">Upload a PR batch CSV</div>
          <p className="mt-1 text-xs text-slate-500">
            Sample format: 13 columns. Task data is not committed to this repository; upload the batch supplied to you.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="mx-auto mt-4 block text-sm text-slate-600"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {file ? <div className="mt-2 text-xs font-medium text-emerald-700">{file.name} · {(file.size / 1024).toFixed(1)} KB</div> : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Policy version (optional)</label>
            <input className="input w-40" value={policyVersion} onChange={(event) => setPolicyVersion(event.target.value)} placeholder="5.0" />
          </div>
          <button className="btn-primary" disabled={pending || !file}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Process batch
          </button>
        </div>
      </form>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {result ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="font-semibold">Batch processed under policy {result.policy_version}</div>
          <div className="mt-1">
            {Number(result.summary.total_pr_lines ?? 0)} lines · {Number(result.summary.total_requirements ?? 0)} requirements ·{" "}
            {Number(result.summary.total_pos ?? 0)} POs · {Number(result.summary.sourcing_events ?? 0)} sourcing events ·{" "}
            {Number(result.summary.not_processed_lines ?? 0)} not processed
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/inbox" className="btn-primary text-xs">
              Open decision inbox
            </Link>
            <Link href={`/api/runs/${result.run_id}/export.csv`} className="btn text-xs">
              Download decisions CSV
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
