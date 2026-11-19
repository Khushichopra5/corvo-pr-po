import fs from "node:fs";
import path from "node:path";
import { kitDir, loadSampleLines, loadSeedData } from "../src/engine/load-data";
import { processBatch } from "../src/engine/process";
import { DEFAULT_POLICY } from "../src/engine/default-policy";

const data = loadSeedData();
const lines = loadSampleLines();
const result = processBatch(lines, data, { policy: DEFAULT_POLICY });
console.log("counts", {
  lines: result.summary.total_pr_lines,
  requirements: result.summary.total_requirements,
  pos: result.summary.total_pos,
  sourcing: result.summary.sourcing_events,
  routes: result.summary.route_counts_requirements,
  consumption: result.summary.contract_consumption
    .filter((c) => c.consumed_by_batch > 0)
    .map((c) => [c.contract_id, c.consumed_by_batch]),
});
console.log("first rows", result.rows.slice(0, 5));
const oraclePath = process.env.ORACLE_CSV ?? path.join(kitDir(), "oracle", "decisions_v5.csv");
if (fs.existsSync(oraclePath)) {
  const expected = fs.readFileSync(oraclePath, "utf8").trim().split(/\r?\n/);
  console.log("expected rows header", expected[0]);
}
console.log("actual first row", result.rows[0]);
