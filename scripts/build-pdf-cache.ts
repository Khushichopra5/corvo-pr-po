import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { kitDir } from "../src/engine/load-data";
import { extractContractPdf } from "../src/lib/pdf";

async function main() {
  const dir = kitDir();
  const registerPath = path.join(dir, "contracts", "contract_register.csv");
  const pdfDir = path.join(dir, "contracts", "pdf");
  if (!fs.existsSync(registerPath) || !fs.existsSync(pdfDir)) {
    throw new Error(`Task kit not found at ${dir}. Set KIT_DIR to the supplied kit directory.`);
  }

  const register = Papa.parse<{ contract_id: string }>(fs.readFileSync(registerPath, "utf8"), {
    header: true,
    skipEmptyLines: true,
  }).data;
  const known = new Set(register.map((row) => row.contract_id.trim()).filter(Boolean));

  const contracts = [];
  for (const file of fs.readdirSync(pdfDir).filter((name) => name.toLowerCase().endsWith(".pdf")).sort()) {
    const draft = await extractContractPdf(new Uint8Array(fs.readFileSync(path.join(pdfDir, file))));
    if (!draft.contractId || known.has(draft.contractId)) continue;
    if (!draft.supplierId || !draft.startDate || !draft.endDate || !draft.valueCap || draft.lines.length === 0) {
      console.warn(`Skipping ${file}: incomplete extraction`, draft.warnings);
      continue;
    }
    contracts.push({
      contractId: draft.contractId,
      supplierId: draft.supplierId,
      supplierName: draft.supplierName,
      startDate: draft.startDate,
      endDate: draft.endDate,
      valueCap: draft.valueCap,
      consumedValue: 0,
      source: "PDF",
      rates: Object.fromEntries(draft.lines.map((line) => [line.itemCode, line.rate])),
    });
  }

  const target = path.join(dir, "contracts", "pdf_contracts.json");
  fs.writeFileSync(target, JSON.stringify(contracts, null, 2));
  console.log(`Wrote ${contracts.length} PDF-only contracts to ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
