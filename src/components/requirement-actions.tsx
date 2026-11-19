"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PencilLine } from "lucide-react";

const ROUTES = [
  "CONTRACT_PO",
  "EMERGENCY_PO",
  "SPOT_PO",
  "RFQ",
  "RFP",
  "CAPEX_SOURCING",
  "NEW_ITEM_SOURCING",
];

export function RequirementActions({
  id,
  route,
  supplierId,
  status,
  suggested,
}: {
  id: string;
  route: string;
  supplierId: string | null;
  status: string;
  suggested: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideRoute, setOverrideRoute] = useState(route);
  const [overrideSupplier, setOverrideSupplier] = useState(supplierId ?? "");
  const [overridePrice, setOverridePrice] = useState("");
  const [comment, setComment] = useState("");

  async function approve() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/requirements/${id}/approve`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Approval failed");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approval failed");
    } finally {
      setPending(false);
    }
  }

  async function override() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/requirements/${id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: overrideRoute,
          supplierId: overrideSupplier || undefined,
          unitPrice: overridePrice ? Number(overridePrice) : null,
          comment,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Override failed");
      setOverrideOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Override failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {status === "APPROVED" ? (
        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          <Check className="size-4" /> Approved and recorded
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={approve} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve & create {["CONTRACT_PO", "EMERGENCY_PO", "SPOT_PO"].includes(route) ? "PO" : route === "RFP" ? "RFP" : route === "RFQ" ? "RFQ" : "sourcing event"}
          </button>
          <button className="btn" onClick={() => setOverrideOpen((open) => !open)} disabled={pending}>
            <PencilLine className="size-4" /> Override
          </button>
        </div>
      )}

      {overrideOpen ? (
        <div className="card card-pad space-y-3 border-amber-200 bg-amber-50/40">
          <div className="text-sm font-semibold text-slate-900">Override with a written reason</div>
          <p className="text-xs text-slate-600">
            The original decision is preserved. Suggested suppliers: {suggested || "none"}.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">New route</label>
              <select className="input" value={overrideRoute} onChange={(event) => setOverrideRoute(event.target.value)}>
                {ROUTES.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Supplier ID</label>
              <input className="input" value={overrideSupplier} onChange={(event) => setOverrideSupplier(event.target.value)} placeholder="S029" />
            </div>
            <div>
              <label className="label">Unit price (optional)</label>
              <input className="input" value={overridePrice} onChange={(event) => setOverridePrice(event.target.value)} placeholder="90.32" inputMode="decimal" />
            </div>
          </div>
          <div>
            <label className="label">Reason (required)</label>
            <textarea className="input min-h-20" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Explain why the policy decision is being changed." />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={override} disabled={pending || !comment.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save override
            </button>
            <button className="btn" onClick={() => setOverrideOpen(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
