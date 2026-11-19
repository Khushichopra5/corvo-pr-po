import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { kitDir, loadSampleLines, loadSeedData } from "../src/engine/load-data";
import { processBatch } from "../src/engine/process";
import { DEFAULT_POLICY } from "../src/engine/default-policy";

const fixture = process.env.ORACLE_CSV ?? path.join(kitDir(), "oracle", "decisions_v5.csv");
if (!fs.existsSync(fixture)) {
  console.error(`Oracle fixture not found at ${fixture}. Set ORACLE_CSV or place it in the kit.`);
  process.exit(1);
}
const expected = Papa.parse<Record<string, string>>(
  fs.readFileSync(fixture, "utf8").replace(/^\uFEFF/, ""),
  { header: true, skipEmptyLines: true },
).data;
const actual = processBatch(loadSampleLines(), loadSeedData(), { policy: DEFAULT_POLICY }).rows;

const keys = [
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
] as const;

const actualByKey = new Map(
  actual.map((row) => [`${row.pr_no}|${row.pr_line}`, row] as [string, (typeof actual)[number]]),
);
const counts: Record<string, number> = {};
const samples: Record<string, string[]> = {};
for (const row of expected) {
  const a = actualByKey.get(`${row.pr_no}|${row.pr_line}`);
  if (!a) {
    counts.KEY = (counts.KEY ?? 0) + 1;
    continue;
  }
  for (const key of keys) {
    const av = String((a as unknown as Record<string, unknown>)[key] ?? "");
    const ev = String(row[key] ?? "");
    if (av !== ev) {
      counts[key] = (counts[key] ?? 0) + 1;
      (samples[key] ??= []).push(`${row.pr_no}/${row.pr_line}: expected=${ev} actual=${av}`);
    }
  }
}
console.log("mismatch counts", counts);
for (const [key, values] of Object.entries(samples)) {
  console.log(`\n${key} (${values.length})`);
  console.log(values.slice(0, 12).join("\n"));
}
