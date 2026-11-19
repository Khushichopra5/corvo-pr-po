import fs from "node:fs";
import Papa from "papaparse";
import { DECISION_HEADERS } from "../src/lib/csv";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run validate:csv -- path/to/decisions.csv");
  process.exit(1);
}
const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
const errors: string[] = [];
const headers = parsed.meta.fields ?? [];
if (JSON.stringify(headers) !== JSON.stringify(DECISION_HEADERS)) {
  errors.push(`Header mismatch. Expected ${DECISION_HEADERS.join(",")}; got ${headers.join(",")}`);
}
const routes = new Set([
  "CONTRACT_PO",
  "EMERGENCY_PO",
  "SPOT_PO",
  "RFQ",
  "RFP",
  "CAPEX_SOURCING",
  "NEW_ITEM_SOURCING",
  "NOT_PROCESSED",
]);
const blocked = new Set(["S004", "S008", "S011", "S031", "S034"]);
const seen = new Set<string>();
for (const [index, row] of parsed.data.entries()) {
  const line = index + 2;
  const key = `${row.pr_no}|${row.pr_line}`;
  if (seen.has(key)) errors.push(`Line ${line}: duplicate ${key}`);
  seen.add(key);
  if (!routes.has(row.route)) errors.push(`Line ${line}: invalid route ${row.route}`);
  if (row.decision && !["PO", "SOURCING_REQUEST", "NOT_PROCESSED"].includes(row.decision)) {
    errors.push(`Line ${line}: invalid decision ${row.decision}`);
  }
  if (row.supplier_id && blocked.has(row.supplier_id)) errors.push(`Line ${line}: blocked supplier ${row.supplier_id}`);
  for (const id of (row.suggested_supplier_ids || "").split(";").filter(Boolean)) {
    if (blocked.has(id)) errors.push(`Line ${line}: blocked suggested supplier ${id}`);
  }
  if (row.route === "NOT_PROCESSED" && !row.reason) errors.push(`Line ${line}: NOT_PROCESSED without reason`);
  if (row.route !== "NOT_PROCESSED" && !row.group_id) errors.push(`Line ${line}: missing group_id`);
  if (["CONTRACT_PO", "EMERGENCY_PO", "SPOT_PO"].includes(row.route)) {
    if (!row.po_id || !row.supplier_id || row.unit_price === "") errors.push(`Line ${line}: PO is missing po_id/supplier/unit_price`);
  }
}
if (errors.length > 0) {
  console.error(`INVALID ${file}`);
  for (const error of errors.slice(0, 50)) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`VALID ${file}: ${parsed.data.length} rows, exact headers, no blocked supplier references.`);
}
