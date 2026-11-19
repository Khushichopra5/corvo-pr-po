import fs from "node:fs";
import path from "node:path";
import { kitDir } from "../src/engine/load-data";
import { extractContractPdf } from "../src/lib/pdf";

async function main() {
  const source = fs.readFileSync(path.join(kitDir(), "contracts", "pdf", "RC-2026-031.pdf"));
  const draft = await extractContractPdf(new Uint8Array(source));
  console.log({
    contractId: draft.contractId,
    supplierId: draft.supplierId,
    supplierName: draft.supplierName,
    startDate: draft.startDate,
    endDate: draft.endDate,
    valueCap: draft.valueCap,
    lines: draft.lines.length,
    confidence: draft.confidence,
    warnings: draft.warnings,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
