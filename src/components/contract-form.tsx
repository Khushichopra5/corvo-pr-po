"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Plus } from "lucide-react";

type Line = { itemCode: string; description?: string; uom?: string; rate: number };

export function ContractForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [contractId, setContractId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [valueCap, setValueCap] = useState("");
  const [consumedValue, setConsumedValue] = useState("0");
  const [linesText, setLinesText] = useState("[]");
  const [extractNote, setExtractNote] = useState("");

  async function extract(file: File) {
    setPending("extract");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/contracts/extract", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not read the PDF");
      setContractId(body.contractId ?? "");
      setSupplierId(body.supplierId ?? "");
      setStartDate(body.startDate ?? "");
      setEndDate(body.endDate ?? "");
      setValueCap(String(body.valueCap ?? ""));
      setLinesText(JSON.stringify(body.lines ?? [], null, 2));
      setExtractNote(`Extracted with ${Math.round((body.confidence ?? 0) * 100)}% field confidence${body.warnings?.length ? ` · ${body.warnings.join("; ")}` : ""}`);
      setOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the PDF");
    } finally {
      setPending("");
    }
  }

  async function save() {
    setPending("save");
    setError("");
    try {
      const lines = JSON.parse(linesText) as Line[];
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId,
          supplierId,
          startDate,
          endDate,
          valueCap: Number(valueCap),
          consumedValue: Number(consumedValue || 0),
          source: "MANUAL",
          lines,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not save the contract");
      setOpen(false);
      setContractId("");
      setSupplierId("");
      setStartDate("");
      setEndDate("");
      setValueCap("");
      setLinesText("[]");
      setExtractNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the contract");
    } finally {
      setPending("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setOpen((value) => !value)}>
          <Plus className="size-4" /> Add a contract
        </button>
        <label className="btn cursor-pointer">
          {pending === "extract" ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Upload signed PDF
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void extract(file);
            }}
          />
        </label>
      </div>
      {extractNote ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">{extractNote}</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {open ? (
        <div className="card card-pad space-y-4">
          <div className="text-sm font-semibold text-slate-900">Contract details</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Contract ID</label>
              <input className="input" value={contractId} onChange={(event) => setContractId(event.target.value)} placeholder="RC-2026-040" />
            </div>
            <div>
              <label className="label">Supplier ID</label>
              <input className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} placeholder="S021" />
            </div>
            <div>
              <label className="label">Ceiling (INR)</label>
              <input className="input" value={valueCap} onChange={(event) => setValueCap(event.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label className="label">Start date</label>
              <input type="date" className="input" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div>
              <label className="label">End date</label>
              <input type="date" className="input" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
            <div>
              <label className="label">Register consumed (INR)</label>
              <input className="input" value={consumedValue} onChange={(event) => setConsumedValue(event.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div>
            <label className="label">Schedule A lines (JSON)</label>
            <textarea className="input min-h-40 font-mono text-xs" value={linesText} onChange={(event) => setLinesText(event.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Each line: {"{ itemCode, description, uom, rate }"}</p>
          </div>
          <button className="btn-primary" onClick={save} disabled={Boolean(pending)}>
            {pending === "save" ? <Loader2 className="size-4 animate-spin" /> : null} Save contract
          </button>
        </div>
      ) : null}
    </div>
  );
}
