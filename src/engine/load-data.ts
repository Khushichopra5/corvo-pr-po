import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type {
  Contract,
  EngineData,
  Item,
  Plant,
  PoHistoryRow,
  RawPRLine,
  Supplier,
  SupplierStatus,
} from "./types";
import { parseDateOnly } from "./money";

export const SAMPLE_HEADERS = [
  "pr_no",
  "pr_line",
  "created_at",
  "requester",
  "department",
  "plant",
  "item_code",
  "description",
  "quantity",
  "uom",
  "estimated_unit_price",
  "need_by_date",
  "urgency",
] as const;

export function kitDir(): string {
  return process.env.KIT_DIR ? path.resolve(process.env.KIT_DIR) : path.join(process.cwd(), "kit");
}

function dataPath(file: string): string {
  const master = new Set(["plants.csv", "item_master.csv", "supplier_master.csv", "po_history.csv"]);
  const contracts = new Set(["contract_register.csv", "contract_lines.csv"]);
  if (master.has(file)) return path.join(kitDir(), "master_data", file);
  if (contracts.has(file)) return path.join(kitDir(), "contracts", file);
  if (file === "sample_pr_batch.csv") return path.join(kitDir(), "pr_batches", file);
  return path.join(kitDir(), "seed", "data", file);
}

function readCsv<T extends Record<string, string>>(file: string): T[] {
  const text = fs.readFileSync(dataPath(file), "utf8").replace(/^\uFEFF/, "");
  const parsed = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV ${file}: ${first.message} (row ${first.row ?? "?"})`);
  }
  return parsed.data;
}

function numberOr(value: string | undefined, fallback = 0): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function numberOrNull(value: string | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function loadSeedData(): EngineData {
  const plants: Plant[] = readCsv<{ plant: string; name: string }>("plants.csv").map((row) => ({
    code: row.plant.trim(),
    name: row.name.trim(),
  }));

  const items: Item[] = readCsv<{
    item_code: string;
    description: string;
    uom: string;
    category: string;
    item_type: string;
    standard_price: string;
  }>("item_master.csv").map((row) => ({
    itemCode: row.item_code.trim(),
    description: row.description.trim(),
    uom: row.uom.trim(),
    category: row.category.trim(),
    itemType: row.item_type.trim(),
    standardPrice: numberOr(row.standard_price),
  }));

  const suppliers: Supplier[] = readCsv<{
    supplier_id: string;
    name: string;
    city: string;
    categories: string;
    status: string;
    on_time_pct: string;
    quality_rating: string;
  }>("supplier_master.csv").map((row) => ({
    supplierId: row.supplier_id.trim(),
    name: row.name.trim(),
    city: row.city.trim(),
    categories: row.categories.split(";").map((c) => c.trim()).filter(Boolean),
    status: row.status.trim() as SupplierStatus,
    onTimePct: numberOr(row.on_time_pct),
    qualityRating: numberOr(row.quality_rating),
  }));

  const poHistory: PoHistoryRow[] = readCsv<{
    po_number: string;
    po_date: string;
    supplier_id: string;
    item_code: string;
    quantity: string;
    uom: string;
    unit_price: string;
    plant: string;
    delivered_on_time: string;
  }>("po_history.csv").map((row) => ({
    poNumber: row.po_number.trim(),
    poDate: parseDateOnly(row.po_date),
    supplierId: row.supplier_id.trim(),
    itemCode: row.item_code.trim(),
    quantity: numberOr(row.quantity),
    uom: row.uom.trim(),
    unitPrice: numberOr(row.unit_price),
    plant: row.plant.trim(),
    deliveredOnTime: row.delivered_on_time.trim().toLowerCase() === "true",
  }));

  const register = readCsv<{
    contract_id: string;
    supplier_id: string;
    supplier_name: string;
    start_date: string;
    end_date: string;
    value_cap: string;
    consumed_value: string;
  }>("contract_register.csv");
  const lineRows = readCsv<{
    contract_id: string;
    item_code: string;
    description: string;
    uom: string;
    rate: string;
  }>("contract_lines.csv");
  const rates = new Map<string, Record<string, number>>();
  for (const row of lineRows) {
    const entry = rates.get(row.contract_id) ?? {};
    entry[row.item_code.trim()] = numberOr(row.rate);
    rates.set(row.contract_id, entry);
  }

  const registerContracts: Contract[] = register.map((row) => ({
    contractId: row.contract_id.trim(),
    supplierId: row.supplier_id.trim(),
    supplierName: row.supplier_name.trim(),
    startDate: parseDateOnly(row.start_date),
    endDate: parseDateOnly(row.end_date),
    valueCap: numberOr(row.value_cap),
    consumedValue: numberOr(row.consumed_value),
    source: "REGISTER",
    rates: rates.get(row.contract_id.trim()) ?? {},
  }));

  const pdfCache = [
    path.join(kitDir(), "contracts", "pdf_contracts.json"),
    path.join(kitDir(), "pdf_contracts.json"),
    path.join(kitDir(), "seed", "data", "pdf_contracts.json"),
  ].find((candidate) => fs.existsSync(candidate));
  const pdfContracts = pdfCache
    ? (JSON.parse(fs.readFileSync(pdfCache, "utf8")) as Array<Omit<Contract, "source"> & { source: string }>).map(
        (contract) => ({ ...contract, source: "PDF" as const }),
      )
    : [];

  return {
    plants,
    items,
    suppliers,
    poHistory,
    contracts: [...registerContracts, ...pdfContracts],
  };
}

export function rawLineFromRecord(record: Record<string, string>, inputOrder: number): RawPRLine {
  const prLine = Number.parseInt(String(record.pr_line ?? "").trim(), 10);
  return {
    prNo: String(record.pr_no ?? "").trim(),
    prLine: Number.isFinite(prLine) ? prLine : 0,
    createdAt: String(record.created_at ?? "").trim(),
    requester: String(record.requester ?? "").trim(),
    department: String(record.department ?? "").trim(),
    plant: String(record.plant ?? "").trim(),
    itemCode: String(record.item_code ?? "").trim(),
    description: String(record.description ?? "").trim(),
    quantity: numberOr(record.quantity),
    uom: String(record.uom ?? "").trim(),
    estimatedUnitPrice: numberOrNull(record.estimated_unit_price),
    needByDate: parseDateOnly(record.need_by_date ?? ""),
    urgency: String(record.urgency ?? "").trim(),
    inputOrder,
  };
}

export function parsePrCsv(text: string): { lines: RawPRLine[]; headers: string[]; errors: string[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = SAMPLE_HEADERS.filter((header) => !headers.includes(header));
  const errors = missing.map((header) => `Missing required column: ${header}`);
  if (parsed.errors.length > 0) {
    for (const error of parsed.errors.slice(0, 5)) {
      errors.push(`${error.message} (row ${error.row ?? "?"})`);
    }
  }
  const lines = parsed.data.map((record, index) => rawLineFromRecord(record, index));
  return { lines, headers, errors };
}

export function loadSampleLines(): RawPRLine[] {
  const text = fs.readFileSync(dataPath("sample_pr_batch.csv"), "utf8");
  const parsed = parsePrCsv(text);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join("; "));
  return parsed.lines;
}

export function loadSampleCsvText(): string {
  return fs.readFileSync(dataPath("sample_pr_batch.csv"), "utf8");
}
