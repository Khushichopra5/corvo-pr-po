import fs from "node:fs";
import path from "node:path";
import { kitDir } from "../src/engine/load-data";

const base = process.env.APP_URL ?? "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert(health.ok && health.counts.items === 73 && health.counts.pos === 468, "health/seed counts");

  const search = await fetch(`${base}/api/items/search?q=nitrile%20gloves`).then((response) => response.json());
  assert(search.items?.[0]?.itemCode === "ITM-1048", "item search ITM-1048");

  const form = new FormData();
  const sample = path.join(kitDir(), "pr_batches", "sample_pr_batch.csv");
  form.append("file", new Blob([fs.readFileSync(sample)], { type: "text/csv" }), "sample_pr_batch.csv");
  const batchResponse = await fetch(`${base}/api/process-batch`, { method: "POST", body: form });
  const batch = await batchResponse.json();
  assert(batchResponse.ok, `process-batch: ${JSON.stringify(batch).slice(0, 300)}`);
  assert(batch.rows.length === 186, "decision rows 186");
  assert(batch.summary.total_requirements === 149, "requirements 149");
  assert(batch.summary.total_pos === 82, "POs 82");
  assert(batch.summary.route_counts_requirements.CONTRACT_PO === 30, "contract PO count");

  const exportResponse = await fetch(`${base}/api/runs/${batch.run_id}/export.csv`);
  const exportText = await exportResponse.text();
  assert(exportText.split(/\r?\n/).length === 187, "export has header + 186 rows");
  assert(exportText.startsWith("pr_no,pr_line,resolved_item_code,group_id,po_id,decision,route,supplier_id,unit_price,group_value_inr,suggested_supplier_ids,policy_version,reason"), "export header");

  const preferred = await fetch(`${base}/api/preferred-suppliers/export.csv?as_of=2026-11-01`).then((response) => response.text());
  assert(preferred.startsWith("item_code,rank,supplier_id,reference_price"), "preferred header");
  assert(preferred.includes("ITM-1048") && preferred.includes("S029"), "preferred ranking");

  const policyResponse = await fetch(`${base}/api/policies/from-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Amendment effective 2026-11-20. Replace the spot PO limit of INR 2,00,000 with INR 1,50,000.",
    }),
  });
  const policy = await policyResponse.json();
  assert(policyResponse.ok && policy.draft.parameters.spot_po_max_inr === 150000, "policy spot extraction");

  console.log("SMOKE OK", {
    health: health.counts,
    run: batch.run_id,
    rows: batch.rows.length,
    preferredRows: preferred.split(/\r?\n/).length - 1,
    policyDraft: policy.id,
  });
}

main().catch((error) => {
  console.error("SMOKE FAILED", error);
  process.exitCode = 1;
});
