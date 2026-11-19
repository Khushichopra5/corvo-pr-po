import type { DecisionRow } from "@/engine/types";
import type { PreferredRow } from "@/db/queries";

function cell(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))].join("\n");
}

export const DECISION_HEADERS = [
  "pr_no",
  "pr_line",
  "resolved_item_code",
  "group_id",
  "po_id",
  "decision",
  "route",
  "supplier_id",
  "unit_price",
  "group_value_inr",
  "suggested_supplier_ids",
  "policy_version",
  "reason",
];

export function decisionRowsToCsv(rows: DecisionRow[]): string {
  return toCsv(
    DECISION_HEADERS,
    rows.map((row) => [
      row.pr_no,
      row.pr_line,
      row.resolved_item_code,
      row.group_id,
      row.po_id,
      row.decision,
      row.route,
      row.supplier_id,
      row.unit_price,
      row.group_value_inr,
      row.suggested_supplier_ids,
      row.policy_version,
      row.reason,
    ]),
  );
}

export const PREFERRED_HEADERS = ["item_code", "rank", "supplier_id", "reference_price"];

export function preferredRowsToCsv(rows: PreferredRow[]): string {
  return toCsv(
    PREFERRED_HEADERS,
    rows
      .filter((row) => row.rank <= 3)
      .sort((a, b) => a.item_code.localeCompare(b.item_code) || a.rank - b.rank)
      .map((row) => [row.item_code, row.rank, row.supplier_id, (row.reference_price ?? 0).toFixed(2)]),
  );
}
