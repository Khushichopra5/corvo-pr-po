"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, Save } from "lucide-react";
import type { Policy, PolicyRule } from "@/engine/types";

const PARAMETER_FIELDS: Array<[string, string]> = [
  ["spot_po_max_inr", "Spot PO limit (INR)"],
  ["emergency_po_max_inr", "Emergency PO limit (INR)"],
  ["rfq_max_inr", "RFQ/RFP threshold (INR)"],
  ["rfq_suggestions", "RFQ suggestions"],
  ["rfp_suggestions", "RFP suggestions"],
  ["capex_suggestions", "Capex suggestions"],
  ["consolidation_hours", "PO consolidation (hours)"],
  ["clubbing_created_days", "Clubbing creation window (days)"],
  ["clubbing_need_by_days", "Need-by tolerance (days)"],
  ["frequency_cap", "Ranking frequency cap"],
];

export function PolicyEditor({
  id,
  initialPolicy,
  status,
}: {
  id: string;
  initialPolicy: Policy;
  status: string;
}) {
  const router = useRouter();
  const readonly = status !== "draft";
  const [parameters, setParameters] = useState<Record<string, unknown>>(initialPolicy.parameters);
  const [rulesText, setRulesText] = useState(JSON.stringify(initialPolicy.rules, null, 2));
  const [version, setVersion] = useState(initialPolicy.version);
  const [effectiveFrom, setEffectiveFrom] = useState(initialPolicy.effective_from);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [newRule, setNewRule] = useState({
    id: "R-NEW-RULE",
    clause: "5.5a",
    priority: "45",
    fact: "requirement.plant",
    op: "eq",
    value: "CHK1",
    route: "RFP",
    suggestCount: "5",
  });
  const [preview, setPreview] = useState<null | {
    changed: number;
    beforeCounts: Record<string, number>;
    afterCounts: Record<string, number>;
    changedRows: Array<{ pr_no: string; pr_line: number; before: string; after: string }>;
  }>(null);

  function buildPolicy(): Policy {
    const rules = JSON.parse(rulesText) as Policy["rules"];
    return {
      ...initialPolicy,
      version,
      effective_from: effectiveFrom,
      status: "draft",
      parameters,
      rules,
    };
  }

  async function save() {
    setPending("save");
    setError("");
    try {
      const response = await fetch(`/api/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: buildPolicy(), label: `Draft ${version}` }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not save");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setPending("");
    }
  }

  async function approve() {
    setPending("approve");
    setError("");
    try {
      const saveResponse = await fetch(`/api/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: buildPolicy(), label: `Policy ${version}` }),
      });
      if (!saveResponse.ok) {
        const body = await saveResponse.json();
        throw new Error(body?.error?.message ?? "Could not save before approval");
      }
      const response = await fetch(`/api/policies/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveFrom, note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not approve");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve");
    } finally {
      setPending("");
    }
  }

  async function runPreview() {
    setPending("preview");
    setError("");
    try {
      const saved = await fetch(`/api/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: buildPolicy(), label: `Draft ${version}` }),
      });
      if (!saved.ok) {
        const body = await saved.json();
        throw new Error(body?.error?.message ?? "Could not save before preview");
      }
      const response = await fetch(`/api/policies/${id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not preview");
      setPreview(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not preview");
    } finally {
      setPending("");
    }
  }

  function addRule() {
    try {
      const rules = JSON.parse(rulesText) as PolicyRule[];
      const numeric = ["requirement.value", "requirement.quantity"].includes(newRule.fact);
      const boolean = newRule.fact === "requirement.is_emergency";
      const value = numeric ? Number(newRule.value) : boolean ? newRule.value === "true" : newRule.value;
      const isPo = ["CONTRACT_PO", "EMERGENCY_PO", "SPOT_PO"].includes(newRule.route);
      const isContract = newRule.route === "CONTRACT_PO";
      const rule: PolicyRule = {
        id: newRule.id,
        clause: newRule.clause,
        priority: Number(newRule.priority),
        enabled: true,
        label: `${newRule.fact} ${newRule.op} ${newRule.value} → ${newRule.route}`,
        when: { fact: newRule.fact, op: newRule.op as PolicyRule["when"]["op"], value },
        then: {
          decision: isPo ? "PO" : "SOURCING_REQUEST",
          route: newRule.route as PolicyRule["then"]["route"],
          supplier: isContract ? "CONTRACT" : isPo ? "PREFERRED_RANK_1" : "NONE",
          price: isContract ? "CONTRACT_RATE" : isPo ? "REFERENCE_PRICE" : "NONE",
          suggest_count: isPo ? undefined : Number(newRule.suggestCount),
        },
      };
      rules.push(rule);
      setRulesText(JSON.stringify(rules, null, 2));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the rule");
    }
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Version</label>
          <input className="input" value={version} onChange={(event) => setVersion(event.target.value)} disabled={readonly} />
        </div>
        <div>
          <label className="label">Effective from</label>
          <input type="date" className="input" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} disabled={readonly} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Parameters</label>
          <span className="text-xs text-slate-500">Numbers are data; no redeploy.</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PARAMETER_FIELDS.map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">{label}</label>
              <input
                className="input"
                value={String(parameters[key] ?? "")}
                onChange={(event) => {
                  const raw = event.target.value;
                  setParameters((current) => ({ ...current, [key]: key.endsWith("_inr") || key.includes("suggestions") || key.includes("cap") || key.includes("hours") || key.includes("days") ? Number(raw) : raw }));
                }}
                disabled={readonly}
                inputMode="numeric"
              />
            </div>
          ))}
        </div>
      </div>

      {!readonly ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add a rule without code</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            <input className="input" value={newRule.id} onChange={(event) => setNewRule({ ...newRule, id: event.target.value })} placeholder="Rule ID" />
            <input className="input" value={newRule.clause} onChange={(event) => setNewRule({ ...newRule, clause: event.target.value })} placeholder="Clause" />
            <input className="input" value={newRule.priority} onChange={(event) => setNewRule({ ...newRule, priority: event.target.value })} placeholder="Priority" inputMode="numeric" />
            <select className="input" value={newRule.fact} onChange={(event) => setNewRule({ ...newRule, fact: event.target.value })}>
              <option value="requirement.plant">plant</option>
              <option value="item.category">category</option>
              <option value="item.item_type">item type</option>
              <option value="requirement.value">value</option>
              <option value="requirement.is_emergency">emergency</option>
            </select>
            <select className="input" value={newRule.op} onChange={(event) => setNewRule({ ...newRule, op: event.target.value })}>
              <option value="eq">=</option>
              <option value="gte">≥</option>
              <option value="lt">&lt;</option>
              <option value="lte">≤</option>
            </select>
            <input className="input" value={newRule.value} onChange={(event) => setNewRule({ ...newRule, value: event.target.value })} placeholder="Value" />
            <select className="input" value={newRule.route} onChange={(event) => setNewRule({ ...newRule, route: event.target.value })}>
              {["RFP", "RFQ", "SPOT_PO", "CONTRACT_PO", "CAPEX_SOURCING"].map((route) => <option key={route} value={route}>{route}</option>)}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input className="input w-32" value={newRule.suggestCount} onChange={(event) => setNewRule({ ...newRule, suggestCount: event.target.value })} placeholder="Suggestions" inputMode="numeric" />
            <button className="btn text-xs" onClick={addRule}>Add to draft</button>
            <span className="text-xs text-slate-500">Then Save draft and Preview impact.</span>
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Rule set (ordered, first match wins)</label>
          <span className="text-xs text-slate-500">Edit or append a rule object, then save.</span>
        </div>
        <textarea
          className="input min-h-[420px] font-mono text-xs leading-5"
          value={rulesText}
          onChange={(event) => setRulesText(event.target.value)}
          disabled={readonly}
          spellCheck={false}
        />
      </div>

      {!readonly ? (
        <div className="flex flex-wrap items-end gap-2">
          <button className="btn" onClick={save} disabled={Boolean(pending)}>
            {pending === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save draft
          </button>
          <button className="btn" onClick={runPreview} disabled={Boolean(pending)}>
            {pending === "preview" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Preview impact
          </button>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="label">Approval note</label>
              <input className="input w-64" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reviewed against amendment" />
            </div>
            <button className="btn-primary" onClick={approve} disabled={Boolean(pending)}>
              {pending === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve & activate
            </button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-blue-950">Impact preview: {preview.changed} lines change</div>
            <div className="text-xs text-blue-700">
              {Object.entries(preview.afterCounts)
                .map(([route, count]) => `${route} ${count}`)
                .join(" · ")}
            </div>
          </div>
          <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-blue-200 bg-white">
            <table className="data-table min-w-[480px]">
              <thead>
                <tr>
                  <th>PR</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {preview.changedRows.slice(0, 30).map((row) => (
                  <tr key={`${row.pr_no}-${row.pr_line}`}>
                    <td className="font-mono text-xs">
                      {row.pr_no}/{row.pr_line}
                    </td>
                    <td>{row.before}</td>
                    <td className="font-semibold text-blue-800">{row.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
