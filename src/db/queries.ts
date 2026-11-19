import { sql } from "./client";
import { DEFAULT_POLICY, clonePolicy } from "../engine/default-policy";
import { processBatch, preferredSupplierScores } from "../engine/process";
import { parsePrCsv } from "../engine/load-data";
import { roundRupee } from "../engine/money";
import type {
  DecisionRow,
  EngineData,
  Policy,
  ProcessResult,
  RawPRLine,
  Supplier,
} from "../engine/types";

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function dateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function timestampText(value: unknown): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  return String(value ?? "").replace("T", " ").slice(0, 19);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export interface PolicyRecord {
  id: string | null;
  policy: Policy;
  label?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt?: string | null;
}

export interface RunRecord {
  id: string;
  batchId: string;
  filename: string;
  source: string;
  policyVersion: string;
  policyVersionId: string | null;
  asOf: string;
  status: string;
  createdAt: string;
  createdBy: string | null;
  summary: Record<string, unknown>;
}

export interface RequirementLineView {
  id: string;
  pr_no: string;
  pr_line: number;
  created_at: string;
  requester: string;
  department: string;
  plant: string;
  description: string;
  quantity: number;
  uom: string;
  estimated_unit_price: number | null;
  need_by_date: string;
  urgency: string;
  resolved_item_code: string;
  match_confidence: number;
  match_note: string;
  validation_error: string | null;
}

export interface RequirementView {
  id: string;
  run_id: string;
  group_id: string;
  item_code: string;
  item_description: string;
  plant: string;
  first_pr_no: string;
  first_pr_line: number;
  first_created_at: string;
  need_by_date: string;
  is_emergency: boolean;
  quantity: number;
  valuation_price: number | null;
  po_unit_price: number | null;
  group_value_inr: number | null;
  decision: string;
  route: string;
  supplier_id: string | null;
  supplier_name: string | null;
  contract_id: string | null;
  po_id: string | null;
  suggested_supplier_ids: string;
  reason: string;
  evidence: Record<string, unknown>;
  clause: string | null;
  matched_rule: string | null;
  requires_approval: string | null;
  status: string;
  approved_po_id: string | null;
  approved_po_number: string | null;
  override_reason: string | null;
  original_decision: Record<string, unknown> | null;
  created_at: string;
  lines: RequirementLineView[];
}

export async function getEngineData(): Promise<EngineData> {
  const [plantRows, itemRows, supplierRows, poRows, contractRows, lineRows] = await Promise.all([
    sql<{ code: string; name: string }[]>`SELECT code, name FROM plants ORDER BY code`,
    sql<
      { item_code: string; description: string; uom: string; category: string; item_type: string; standard_price: string }[]
    >`SELECT item_code, description, uom, category, item_type, standard_price::text FROM items ORDER BY item_code`,
    sql<
      {
        supplier_id: string;
        name: string;
        city: string;
        categories: string;
        status: string;
        on_time_pct: string;
        quality_rating: string;
      }[]
    >`SELECT supplier_id, name, city, categories, status, on_time_pct::text, quality_rating::text FROM suppliers ORDER BY supplier_id`,
    sql<
      {
        po_number: string;
        po_date: string;
        supplier_id: string;
        item_code: string;
        quantity: string;
        uom: string;
        unit_price: string;
        plant: string;
        delivered_on_time: boolean;
      }[]
    >`SELECT po_number, po_date::text, supplier_id, item_code, quantity::text, uom, unit_price::text, plant, delivered_on_time FROM po_history ORDER BY po_date, po_number`,
    sql<
      {
        contract_id: string;
        supplier_id: string;
        supplier_name: string;
        start_date: string;
        end_date: string;
        value_cap: string;
        consumed_value: string;
        source: string;
      }[]
    >`SELECT contract_id, supplier_id, supplier_name, start_date::text, end_date::text, value_cap::text, consumed_value::text, source FROM contracts ORDER BY contract_id`,
    sql<{ contract_id: string; item_code: string; rate: string }[]>`
      SELECT contract_id, item_code, rate::text FROM contract_lines ORDER BY contract_id, item_code`,
  ]);

  const rates = new Map<string, Record<string, number>>();
  for (const row of lineRows) {
    const entry = rates.get(row.contract_id) ?? {};
    entry[row.item_code] = num(row.rate);
    rates.set(row.contract_id, entry);
  }

  return {
    plants: plantRows.map((row) => ({ code: row.code, name: row.name })),
    items: itemRows.map((row) => ({
      itemCode: row.item_code,
      description: row.description,
      uom: row.uom,
      category: row.category,
      itemType: row.item_type,
      standardPrice: num(row.standard_price),
    })),
    suppliers: supplierRows.map((row) => ({
      supplierId: row.supplier_id,
      name: row.name,
      city: row.city,
      categories: row.categories.split(";").map((category) => category.trim()).filter(Boolean),
      status: row.status as Supplier["status"],
      onTimePct: num(row.on_time_pct),
      qualityRating: num(row.quality_rating),
    })),
    poHistory: poRows.map((row) => ({
      poNumber: row.po_number,
      poDate: dateText(row.po_date),
      supplierId: row.supplier_id,
      itemCode: row.item_code,
      quantity: num(row.quantity),
      uom: row.uom,
      unitPrice: num(row.unit_price),
      plant: row.plant,
      deliveredOnTime: row.delivered_on_time,
    })),
    contracts: contractRows.map((row) => ({
      contractId: row.contract_id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      startDate: dateText(row.start_date),
      endDate: dateText(row.end_date),
      valueCap: num(row.value_cap),
      consumedValue: num(row.consumed_value),
      source: row.source === "PDF" ? "PDF" : "REGISTER",
      rates: rates.get(row.contract_id) ?? {},
    })),
  };
}

function policyFromRow(row: Record<string, unknown>): Policy {
  return {
    schema_version: "1.0",
    policy_id: text(row.policy_id) || DEFAULT_POLICY.policy_id,
    version: text(row.version),
    effective_from: dateText(row.effective_from),
    status: text(row.status) as Policy["status"],
    currency: "INR",
    plants: DEFAULT_POLICY.plants,
    supplier_guard: DEFAULT_POLICY.supplier_guard,
    parameters: parseJson<Record<string, unknown>>(row.parameters, DEFAULT_POLICY.parameters),
    rules: parseJson<Policy["rules"]>(row.rules, DEFAULT_POLICY.rules),
  };
}

export async function getPolicyRecord(version?: string, asOf?: string): Promise<PolicyRecord> {
  let rows: Record<string, unknown>[] = [];
  const today = new Date().toISOString().slice(0, 10);
  if (version) {
    rows = await sql`SELECT * FROM policy_versions WHERE version = ${version} LIMIT 1`;
  } else {
    const effectiveDate = asOf ?? today;
    rows = await sql`SELECT * FROM policy_versions
      WHERE status IN ('active','approved','scheduled','superseded') AND effective_from <= ${effectiveDate}
      ORDER BY effective_from DESC, approved_at DESC NULLS LAST, created_at DESC LIMIT 1`;
    if (rows.length === 0) {
      rows = await sql`SELECT * FROM policy_versions
        WHERE status IN ('active','approved')
        ORDER BY effective_from DESC, created_at DESC LIMIT 1`;
    }
  }
  if (rows.length === 0 && !version) {
    rows = await sql`SELECT * FROM policy_versions
      ORDER BY (status = 'active') DESC, effective_from DESC, created_at DESC LIMIT 1`;
  }
  if (rows.length === 0) {
    return { id: null, policy: clonePolicy(DEFAULT_POLICY) };
  }
  const row = rows[0];
  return {
    id: text(row.id) || null,
    policy: policyFromRow(row),
    label: text(row.label) || undefined,
    approvedBy: row.approved_by ? text(row.approved_by) : null,
    approvedAt: row.approved_at ? timestampText(row.approved_at) : null,
    createdAt: row.created_at ? timestampText(row.created_at) : null,
  };
}

export async function getPolicyById(id: string): Promise<PolicyRecord | null> {
  const rows = await sql`SELECT * FROM policy_versions WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: text(row.id),
    policy: policyFromRow(row),
    label: text(row.label) || undefined,
    approvedBy: row.approved_by ? text(row.approved_by) : null,
    approvedAt: row.approved_at ? timestampText(row.approved_at) : null,
    createdAt: row.created_at ? timestampText(row.created_at) : null,
  };
}

export async function listPolicies(): Promise<
  Array<{
    id: string;
    version: string;
    effective_from: string;
    status: string;
    label: string;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
  }>
> {
  const rows = await sql`
    SELECT id, version, effective_from::text, status, label, approved_by, approved_at::text, created_at::text
    FROM policy_versions
    ORDER BY effective_from DESC, created_at DESC`;
  return rows.map((row) => ({
    id: text(row.id),
    version: text(row.version),
    effective_from: dateText(row.effective_from),
    status: text(row.status),
    label: text(row.label),
    approved_by: row.approved_by ? text(row.approved_by) : null,
    approved_at: row.approved_at ? timestampText(row.approved_at) : null,
    created_at: timestampText(row.created_at),
  }));
}

export async function persistRun(params: {
  filename: string;
  source: "UPLOAD" | "SAMPLE" | "CHAT";
  rawLines: RawPRLine[];
  run: ProcessResult;
  policy: PolicyRecord;
  asOf: string;
  createdBy: string;
}): Promise<{ runId: string; batchId: string }> {
  const { filename, source, rawLines, run, policy, asOf, createdBy } = params;
  return sql.begin(async (tx) => {
    const [batch] = await tx<{ id: string }[]>`
      INSERT INTO pr_batches (filename, source, row_count, created_by)
      VALUES (${filename}, ${source}, ${rawLines.length}, ${createdBy})
      RETURNING id`;
    const prLineIds = new Map<number, string>();
    for (let index = 0; index < rawLines.length; index += 1) {
      const raw = rawLines[index];
      const line = run.normalizedLines[index];
      const createdAt = line.createdAtIso ? line.createdAtIso.replace("T", " ").slice(0, 19) : "1970-01-01 00:00:00";
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO pr_lines (batch_id, pr_no, pr_line, created_at, requester, department, plant, raw_item_code, description, quantity, uom, estimated_unit_price, need_by_date, urgency, resolved_item_code, match_confidence, match_note, validation_error, input_order)
        VALUES (${batch.id}, ${raw.prNo}, ${raw.prLine}, ${createdAt}, ${raw.requester}, ${raw.department}, ${raw.plant}, ${raw.itemCode}, ${raw.description}, ${raw.quantity}, ${raw.uom || line.uom}, ${raw.estimatedUnitPrice}, ${raw.needByDate || null}, ${raw.urgency || "Normal"}, ${line.resolvedItemCode}, ${line.matchConfidence}, ${line.matchNote}, ${line.processed ? null : line.notProcessedReason}, ${raw.inputOrder})
        RETURNING id`;
      prLineIds.set(raw.inputOrder, row.id);
    }

    const [runRow] = await tx<{ id: string }[]>`
      INSERT INTO processing_runs (batch_id, policy_version_id, policy_version, as_of, status, summary, created_by)
      VALUES (${batch.id}, ${policy.id}, ${policy.policy.version}, ${asOf}, 'READY', ${tx.json(run.summary)}, ${createdBy})
      RETURNING id`;

    for (const requirement of run.requirements) {
      const first = requirement.lines[0];
      const [reqRow] = await tx<{ id: string }[]>`
        INSERT INTO requirements (run_id, group_id, item_code, item_description, plant, first_pr_no, first_pr_line, first_created_at, need_by_date, is_emergency, quantity, valuation_price, po_unit_price, group_value_inr, decision, route, supplier_id, contract_id, po_id, suggested_supplier_ids, reason, evidence, clause, matched_rule, requires_approval, status)
        VALUES (${runRow.id}, ${requirement.groupId}, ${requirement.itemCode}, ${requirement.item?.description ?? first.description}, ${requirement.plant}, ${first.prNo}, ${first.prLine}, ${first.createdAtIso.replace("T", " ").slice(0, 19)}, ${first.needByDateIso || null}, ${requirement.emergency}, ${requirement.quantity}, ${requirement.valuationPrice}, ${requirement.poUnitPrice}, ${requirement.groupValueExact === null ? null : Math.round(requirement.groupValueExact * 100) / 100}, ${requirement.decision}, ${requirement.route}, ${requirement.supplierId || null}, ${requirement.contractId || null}, ${requirement.poId || null}, ${requirement.suggestions.join(";")}, ${requirement.reason}, ${tx.json(requirement.evidence)}, ${requirement.clause || null}, ${requirement.matchedRule || null}, ${requirement.requiresApproval || null}, 'PENDING')
        RETURNING id`;
      for (const line of requirement.lines) {
        const prLineId = prLineIds.get(line.inputOrder);
        if (prLineId) {
          await tx`INSERT INTO requirement_lines (requirement_id, pr_line_id) VALUES (${reqRow.id}, ${prLineId}) ON CONFLICT DO NOTHING`;
        }
      }
    }
    return { runId: runRow.id, batchId: batch.id };
  });
}

export class CsvValidationError extends Error {
  details: string[];
  constructor(details: string[]) {
    super(details[0] ?? "Invalid CSV");
    this.details = details;
  }
}

export async function createRunFromCsv(params: {
  csvText: string;
  filename: string;
  source?: "UPLOAD" | "SAMPLE";
  policyVersion?: string;
  asOf?: string;
  createdBy: string;
}): Promise<{ runId: string; batchId: string; summary: ProcessResult["summary"] }> {
  const parsed = parsePrCsv(params.csvText);
  if (parsed.errors.length > 0) throw new CsvValidationError(parsed.errors);
  if (parsed.lines.length === 0) throw new CsvValidationError(["The CSV contains no data rows."]);
  const asOf = params.asOf ?? new Date().toISOString();
  const policyRecord = await getPolicyRecord(params.policyVersion, asOf.slice(0, 10));
  if (params.policyVersion && !policyRecord.id) {
    throw new CsvValidationError([`Policy version ${params.policyVersion} was not found.`]);
  }
  const data = await getEngineData();
  const result = processBatch(parsed.lines, data, { policy: policyRecord.policy });
  const persisted = await persistRun({
    filename: params.filename,
    source: params.source ?? "UPLOAD",
    rawLines: parsed.lines,
    run: result,
    policy: policyRecord,
    asOf,
    createdBy: params.createdBy,
  });
  return { ...persisted, summary: result.summary };
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  const rows = await sql`
    SELECT r.*, b.filename, b.source, r.as_of::text, r.created_at::text
    FROM processing_runs r JOIN pr_batches b ON b.id = r.batch_id
    WHERE r.id = ${runId} LIMIT 1`;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: text(row.id),
    batchId: text(row.batch_id),
    filename: text(row.filename),
    source: text(row.source),
    policyVersion: text(row.policy_version),
    policyVersionId: row.policy_version_id ? text(row.policy_version_id) : null,
    asOf: timestampText(row.as_of),
    status: text(row.status),
    createdAt: timestampText(row.created_at),
    createdBy: row.created_by ? text(row.created_by) : null,
    summary: parseJson<Record<string, unknown>>(row.summary, {}),
  };
}

export async function listRuns(limit = 20): Promise<RunRecord[]> {
  const rows = await sql`
    SELECT r.*, b.filename, b.source, r.as_of::text, r.created_at::text
    FROM processing_runs r JOIN pr_batches b ON b.id = r.batch_id
    ORDER BY r.created_at DESC LIMIT ${limit}`;
  return rows.map((row) => ({
    id: text(row.id),
    batchId: text(row.batch_id),
    filename: text(row.filename),
    source: text(row.source),
    policyVersion: text(row.policy_version),
    policyVersionId: row.policy_version_id ? text(row.policy_version_id) : null,
    asOf: timestampText(row.as_of),
    status: text(row.status),
    createdAt: timestampText(row.created_at),
    createdBy: row.created_by ? text(row.created_by) : null,
    summary: parseJson<Record<string, unknown>>(row.summary, {}),
  }));
}

export async function getLatestRun(): Promise<RunRecord | null> {
  const rows = await sql`SELECT id FROM processing_runs ORDER BY created_at DESC LIMIT 1`;
  return rows.length > 0 ? getRun(text(rows[0].id)) : null;
}

export async function getRunRows(runId: string): Promise<DecisionRow[]> {
  const run = await getRun(runId);
  if (!run) return [];
  const rows = await sql`
    SELECT l.pr_no, l.pr_line, l.input_order, l.resolved_item_code, l.validation_error,
           r.id AS req_id, r.group_id, r.item_code AS req_item_code, r.po_id, r.decision, r.route,
           r.supplier_id, r.po_unit_price::text, r.group_value_inr::text, r.suggested_supplier_ids,
           r.reason AS req_reason, r.clause, r.matched_rule,
           (SELECT count(*)::int FROM requirement_lines rl2 WHERE rl2.requirement_id = r.id) AS line_count
    FROM pr_lines l
    JOIN pr_batches b ON b.id = l.batch_id
    JOIN processing_runs run ON run.batch_id = b.id AND run.id = ${runId}
    LEFT JOIN requirement_lines rl ON rl.pr_line_id = l.id
    LEFT JOIN requirements r ON r.id = rl.requirement_id
    ORDER BY l.input_order`;
  return rows.map((row) => {
    if (!row.req_id) {
      return {
        pr_no: text(row.pr_no),
        pr_line: num(row.pr_line),
        resolved_item_code: text(row.resolved_item_code),
        group_id: "",
        po_id: "",
        decision: "NOT_PROCESSED",
        route: "NOT_PROCESSED",
        supplier_id: "",
        unit_price: "",
        group_value_inr: "",
        suggested_supplier_ids: "",
        policy_version: run.policyVersion,
        reason: text(row.validation_error) || "Not processed.",
      };
    }
    const lineCount = num(row.line_count);
    let reason = text(row.req_reason);
    if (lineCount > 1) reason += ` | 2.2: clubbed ${lineCount} lines into ${text(row.group_id)}`;
    if (row.po_id) reason += ` | 7: planned ${text(row.po_id)}`;
    return {
      pr_no: text(row.pr_no),
      pr_line: num(row.pr_line),
      resolved_item_code: text(row.req_item_code) || text(row.resolved_item_code),
      group_id: text(row.group_id),
      po_id: text(row.po_id),
      decision: text(row.decision) as DecisionRow["decision"],
      route: text(row.route) as DecisionRow["route"],
      supplier_id: text(row.supplier_id),
      unit_price: row.po_unit_price === null ? "" : roundRupee(num(row.po_unit_price)),
      group_value_inr: row.group_value_inr === null ? "" : roundRupee(num(row.group_value_inr)),
      suggested_supplier_ids: text(row.suggested_supplier_ids),
      policy_version: run.policyVersion,
      reason,
    };
  });
}

export async function getRequirements(runId: string): Promise<RequirementView[]> {
  const rows = await sql`
    SELECT r.*, s.name AS supplier_name, po.po_number AS approved_po_number,
           (SELECT count(*)::int FROM requirement_lines rl WHERE rl.requirement_id = r.id) AS line_count
    FROM requirements r
    LEFT JOIN suppliers s ON s.supplier_id = r.supplier_id
    LEFT JOIN purchase_orders po ON po.id = r.approved_po_id
    WHERE r.run_id = ${runId}
    ORDER BY r.first_created_at, r.group_id`;
  const lineRows = await sql`
    SELECT rl.requirement_id, l.*
    FROM requirement_lines rl
    JOIN pr_lines l ON l.id = rl.pr_line_id
    JOIN requirements r ON r.id = rl.requirement_id
    WHERE r.run_id = ${runId}
    ORDER BY l.input_order`;
  const linesByReq = new Map<string, RequirementLineView[]>();
  for (const row of lineRows) {
    const list = linesByReq.get(text(row.requirement_id)) ?? [];
    list.push({
      id: text(row.id),
      pr_no: text(row.pr_no),
      pr_line: num(row.pr_line),
      created_at: timestampText(row.created_at),
      requester: text(row.requester),
      department: text(row.department),
      plant: text(row.plant),
      description: text(row.description),
      quantity: num(row.quantity),
      uom: text(row.uom),
      estimated_unit_price: row.estimated_unit_price === null ? null : num(row.estimated_unit_price),
      need_by_date: dateText(row.need_by_date),
      urgency: text(row.urgency),
      resolved_item_code: text(row.resolved_item_code),
      match_confidence: num(row.match_confidence),
      match_note: text(row.match_note),
      validation_error: row.validation_error ? text(row.validation_error) : null,
    });
    linesByReq.set(text(row.requirement_id), list);
  }
  return rows.map((row) => ({
    id: text(row.id),
    run_id: text(row.run_id),
    group_id: text(row.group_id),
    item_code: text(row.item_code),
    item_description: text(row.item_description),
    plant: text(row.plant),
    first_pr_no: text(row.first_pr_no),
    first_pr_line: num(row.first_pr_line),
    first_created_at: timestampText(row.first_created_at),
    need_by_date: dateText(row.need_by_date),
    is_emergency: Boolean(row.is_emergency),
    quantity: num(row.quantity),
    valuation_price: row.valuation_price === null ? null : num(row.valuation_price),
    po_unit_price: row.po_unit_price === null ? null : num(row.po_unit_price),
    group_value_inr: row.group_value_inr === null ? null : num(row.group_value_inr),
    decision: text(row.decision),
    route: text(row.route),
    supplier_id: row.supplier_id ? text(row.supplier_id) : null,
    supplier_name: row.supplier_name ? text(row.supplier_name) : null,
    contract_id: row.contract_id ? text(row.contract_id) : null,
    po_id: row.po_id ? text(row.po_id) : null,
    suggested_supplier_ids: text(row.suggested_supplier_ids),
    reason: text(row.reason),
    evidence: parseJson<Record<string, unknown>>(row.evidence, {}),
    clause: row.clause ? text(row.clause) : null,
    matched_rule: row.matched_rule ? text(row.matched_rule) : null,
    requires_approval: row.requires_approval ? text(row.requires_approval) : null,
    status: text(row.status),
    approved_po_id: row.approved_po_id ? text(row.approved_po_id) : null,
    approved_po_number: row.approved_po_number ? text(row.approved_po_number) : null,
    override_reason: row.override_reason ? text(row.override_reason) : null,
    original_decision: row.original_decision
      ? parseJson<Record<string, unknown>>(row.original_decision, {})
      : null,
    created_at: timestampText(row.created_at),
    lines: linesByReq.get(text(row.id)) ?? [],
  }));
}

export async function getRequirement(id: string): Promise<RequirementView | null> {
  const rows = await sql`SELECT run_id FROM requirements WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0) return null;
  const requirements = await getRequirements(text(rows[0].run_id));
  return requirements.find((requirement) => requirement.id === id) ?? null;
}

export interface AuditEventView {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  comment: string | null;
  created_at: string;
}

async function audit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  event: {
    actor: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    before?: unknown;
    after?: unknown;
    comment?: string | null;
  },
) {
  await tx`INSERT INTO audit_events (actor, action, entity_type, entity_id, summary, before, after, comment)
    VALUES (${event.actor}, ${event.action}, ${event.entityType}, ${event.entityId ?? null}, ${event.summary}, ${event.before ? tx.json(event.before) : null}, ${event.after ? tx.json(event.after) : null}, ${event.comment ?? null})`;
}

export async function approveRequirement(id: string, actor: string): Promise<{ poNumber?: string; sourcingEventId?: string }> {
  return sql.begin(async (tx) => {
    const [req] = await tx`SELECT * FROM requirements WHERE id = ${id} FOR UPDATE`;
    if (!req) throw new Error("Requirement not found");
    if (text(req.status) === "APPROVED") throw new Error("Requirement is already approved");
    const route = text(req.route);
    const poRoutes = new Set(["CONTRACT_PO", "EMERGENCY_PO", "SPOT_PO"]);
    if (poRoutes.has(route)) {
      const poNumber = text(req.po_id) || `PO-OVR-${text(req.group_id)}`;
      const [existingPo] = await tx`SELECT id FROM purchase_orders WHERE run_id = ${req.run_id} AND po_number = ${poNumber} LIMIT 1`;
      let poId = existingPo ? text(existingPo.id) : "";
      if (!poId) {
        const [created] = await tx`INSERT INTO purchase_orders (po_number, run_id, supplier_id, plant, route, anchor_at, total_value, status, created_by)
          VALUES (${poNumber}, ${req.run_id}, ${req.supplier_id}, ${req.plant}, ${route}, ${req.first_created_at}, 0, 'APPROVED', ${actor})
          RETURNING id`;
        poId = text(created.id);
      }
      const siblings = await tx`SELECT * FROM requirements WHERE run_id = ${req.run_id} AND po_id = ${poNumber} AND status = 'PENDING'`;
      const group = siblings.length > 0 ? siblings : [req];
      let total = 0;
      for (const item of group) {
        const [already] = await tx`SELECT id FROM po_lines WHERE po_id = ${poId} AND requirement_id = ${item.id} LIMIT 1`;
        if (already) continue;
        const qty = num(item.quantity);
        const unit = num(item.po_unit_price ?? item.valuation_price);
        const value = Math.round(qty * unit * 100) / 100;
        total += value;
        await tx`INSERT INTO po_lines (po_id, requirement_id, item_code, quantity, unit_price, value_inr, contract_id)
          VALUES (${poId}, ${item.id}, ${item.item_code}, ${qty}, ${unit}, ${value}, ${item.contract_id})`;
        await tx`UPDATE requirements SET status = 'APPROVED', approved_po_id = ${poId} WHERE id = ${item.id}`;
        await audit(tx, {
          actor,
          action: "APPROVE",
          entityType: "REQUIREMENT",
          entityId: text(item.id),
          summary: `Approved ${poNumber} for ${text(item.item_code)} (${route})`,
          after: { poNumber, route, value },
        });
      }
      await tx`UPDATE purchase_orders SET total_value = ${total} WHERE id = ${poId}`;
      return { poNumber };
    }

    const [event] = await tx`INSERT INTO sourcing_events (requirement_id, route, invited_supplier_ids, status, created_by)
      VALUES (${req.id}, ${route}, ${req.suggested_supplier_ids}, 'OPEN', ${actor})
      RETURNING id`;
    await tx`UPDATE requirements SET status = 'APPROVED' WHERE id = ${req.id}`;
    await audit(tx, {
      actor,
      action: "APPROVE",
      entityType: "REQUIREMENT",
      entityId: text(req.id),
      summary: `Created ${route} sourcing event for ${text(req.item_code)}`,
      after: { route, invited: text(req.suggested_supplier_ids) },
    });
    return { sourcingEventId: text(event.id) };
  });
}

export async function overrideRequirement(
  id: string,
  input: { actor: string; route: string; supplierId?: string; unitPrice?: number | null; comment: string },
): Promise<void> {
  if (!input.comment.trim()) throw new Error("A written reason is required for an override");
  await sql.begin(async (tx) => {
    const [req] = await tx`SELECT * FROM requirements WHERE id = ${id} FOR UPDATE`;
    if (!req) throw new Error("Requirement not found");
    if (text(req.status) === "APPROVED") throw new Error("Approved requirements cannot be overridden; reopen the PO first");
    const route = input.route;
    const decision = ["CONTRACT_PO", "EMERGENCY_PO", "SPOT_PO"].includes(route) ? "PO" : "SOURCING_REQUEST";
    const before = {
      route: text(req.route),
      decision: text(req.decision),
      supplier_id: req.supplier_id ? text(req.supplier_id) : null,
      unit_price: req.po_unit_price ? num(req.po_unit_price) : null,
    };
    await tx`UPDATE requirements SET route = ${route}, decision = ${decision},
      supplier_id = ${input.supplierId || null}, po_unit_price = ${input.unitPrice ?? null},
      status = 'PENDING', override_reason = ${input.comment},
      original_decision = COALESCE(original_decision, ${tx.json(before)})
      WHERE id = ${id}`;
    await audit(tx, {
      actor: input.actor,
      action: "OVERRIDE",
      entityType: "REQUIREMENT",
      entityId: id,
      summary: `Overrode ${text(req.group_id)} from ${text(req.route)} to ${route}`,
      before,
      after: { route, decision, supplierId: input.supplierId ?? null, unitPrice: input.unitPrice ?? null },
      comment: input.comment,
    });
  });
}

export async function listAudit(limit = 100): Promise<AuditEventView[]> {
  const rows = await sql`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((row) => ({
    id: text(row.id),
    actor: text(row.actor),
    action: text(row.action),
    entity_type: text(row.entity_type),
    entity_id: row.entity_id ? text(row.entity_id) : null,
    summary: text(row.summary),
    comment: row.comment ? text(row.comment) : null,
    created_at: timestampText(row.created_at),
  }));
}

export async function listAuditForEntity(entityType: string, entityId: string): Promise<AuditEventView[]> {
  const rows = await sql`SELECT * FROM audit_events WHERE entity_type = ${entityType} AND entity_id = ${entityId} ORDER BY created_at DESC`;
  return rows.map((row) => ({
    id: text(row.id),
    actor: text(row.actor),
    action: text(row.action),
    entity_type: text(row.entity_type),
    entity_id: row.entity_id ? text(row.entity_id) : null,
    summary: text(row.summary),
    comment: row.comment ? text(row.comment) : null,
    created_at: timestampText(row.created_at),
  }));
}

export interface ContractView {
  contract_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_status: string;
  start_date: string;
  end_date: string;
  value_cap: number;
  consumed_value: number;
  app_consumed: number;
  consumed_total: number;
  remaining: number;
  source: string;
  lines: Array<{ item_code: string; description: string; uom: string; rate: number }>;
}

export async function listContracts(): Promise<ContractView[]> {
  const rows = await sql`
    SELECT c.*, s.name AS supplier_name, s.status AS supplier_status,
      COALESCE((SELECT SUM(pl.value_inr) FROM po_lines pl JOIN purchase_orders po ON po.id = pl.po_id WHERE pl.contract_id = c.contract_id AND po.status = 'APPROVED'), 0)::text AS app_consumed
    FROM contracts c LEFT JOIN suppliers s ON s.supplier_id = c.supplier_id
    ORDER BY c.contract_id`;
  const lines = await sql`SELECT contract_id, item_code, description, uom, rate::text FROM contract_lines ORDER BY item_code`;
  const byContract = new Map<string, ContractView["lines"]>();
  for (const line of lines) {
    const list = byContract.get(text(line.contract_id)) ?? [];
    list.push({ item_code: text(line.item_code), description: text(line.description), uom: text(line.uom), rate: num(line.rate) });
    byContract.set(text(line.contract_id), list);
  }
  return rows.map((row) => {
    const cap = num(row.value_cap);
    const consumed = num(row.consumed_value);
    const app = num(row.app_consumed);
    return {
      contract_id: text(row.contract_id),
      supplier_id: text(row.supplier_id),
      supplier_name: text(row.supplier_name),
      supplier_status: text(row.supplier_status),
      start_date: dateText(row.start_date),
      end_date: dateText(row.end_date),
      value_cap: cap,
      consumed_value: consumed,
      app_consumed: app,
      consumed_total: consumed + app,
      remaining: cap - consumed - app,
      source: text(row.source),
      lines: byContract.get(text(row.contract_id)) ?? [],
    };
  });
}

export async function addContract(input: {
  contractId: string;
  supplierId: string;
  supplierName?: string;
  startDate: string;
  endDate: string;
  valueCap: number;
  consumedValue?: number;
  source?: string;
  actor: string;
  lines: Array<{ itemCode: string; description?: string; uom?: string; rate: number }>;
}): Promise<void> {
  if (!input.contractId.trim()) throw new Error("contract_id is required");
  if (!input.supplierId.trim()) throw new Error("supplier_id is required");
  if (!input.startDate || !input.endDate) throw new Error("start and end dates are required");
  if (!(input.valueCap > 0)) throw new Error("value_cap must be positive");
  if (input.lines.length === 0) throw new Error("at least one contract line is required");
  await sql.begin(async (tx) => {
    const [supplier] = await tx`SELECT name FROM suppliers WHERE supplier_id = ${input.supplierId} LIMIT 1`;
    if (!supplier) throw new Error("Unknown supplier");
    await tx`INSERT INTO contracts (contract_id, supplier_id, supplier_name, start_date, end_date, value_cap, consumed_value, source)
      VALUES (${input.contractId}, ${input.supplierId}, ${input.supplierName || text(supplier.name)}, ${input.startDate}, ${input.endDate}, ${input.valueCap}, ${input.consumedValue ?? 0}, ${input.source ?? "MANUAL"})
      ON CONFLICT (contract_id) DO UPDATE SET supplier_id = EXCLUDED.supplier_id, supplier_name = EXCLUDED.supplier_name, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, value_cap = EXCLUDED.value_cap, consumed_value = EXCLUDED.consumed_value, source = EXCLUDED.source`;
    await tx`DELETE FROM contract_lines WHERE contract_id = ${input.contractId}`;
    for (const line of input.lines) {
      const [item] = await tx`SELECT description, uom FROM items WHERE item_code = ${line.itemCode} LIMIT 1`;
      await tx`INSERT INTO contract_lines (contract_id, item_code, description, uom, rate)
        VALUES (${input.contractId}, ${line.itemCode}, ${line.description || (item ? text(item.description) : line.itemCode)}, ${line.uom || (item ? text(item.uom) : "")}, ${line.rate})`;
    }
    await audit(tx, {
      actor: input.actor,
      action: "UPSERT",
      entityType: "CONTRACT",
      entityId: input.contractId,
      summary: `Added/updated contract ${input.contractId} with ${input.lines.length} lines`,
      after: { ...input, actor: undefined },
    });
  });
}

export interface PreferredRow {
  item_code: string;
  item_description: string;
  category: string;
  rank: number;
  supplier_id: string;
  supplier_name: string;
  reference_price: number | null;
  score: number;
  po_count: number;
  recency: number;
  contract: number;
  on_time: number;
  quality: number;
  components: Record<string, unknown>;
}

export async function getPreferredList(asOf: string, itemCode?: string): Promise<PreferredRow[]> {
  const policy = await getPolicyRecord(undefined, asOf);
  const data = await getEngineData();
  const items = itemCode ? data.items.filter((item) => item.itemCode === itemCode) : data.items;
  const rows: PreferredRow[] = [];
  for (const item of items) {
    const scores = preferredSupplierScores(data, item.itemCode, asOf, policy.policy);
    scores.forEach((score, index) => {
      const supplier = data.suppliers.find((candidate) => candidate.supplierId === score.supplierId);
      rows.push({
        item_code: item.itemCode,
        item_description: item.description,
        category: item.category,
        rank: index + 1,
        supplier_id: score.supplierId,
        supplier_name: supplier?.name ?? score.supplierId,
        reference_price: score.referencePrice,
        score: score.score,
        po_count: score.poCount,
        recency: score.recency,
        contract: score.contract,
        on_time: score.onTime,
        quality: score.quality,
        components: { lastPoDate: score.lastPoDate, contracts: score.contracts, basis: score.referenceBasis },
      });
    });
  }
  return rows;
}

export async function getChatContext(): Promise<{ data: EngineData; policy: PolicyRecord }> {
  const [data, policy] = await Promise.all([getEngineData(), getPolicyRecord()]);
  return { data, policy };
}

export async function insertPolicyDraft(
  policy: Policy,
  options: { actor: string; label?: string; diffSummary?: unknown; sourceDocumentId?: string | null },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO policy_versions (policy_id, version, effective_from, status, parameters, rules, label, source_document_id, diff_summary, approved_by)
    VALUES (${policy.policy_id}, ${policy.version}, ${policy.effective_from}, 'draft', ${sql.json(policy.parameters)}, ${sql.json(policy.rules)}, ${options.label ?? "Draft amendment"}, ${options.sourceDocumentId ?? null}, ${options.diffSummary ? sql.json(options.diffSummary) : null}, ${options.actor})
    RETURNING id`;
  return rows[0].id;
}

export async function updatePolicyDraft(
  id: string,
  policy: Policy,
  options: { actor: string; label?: string; diffSummary?: unknown },
): Promise<void> {
  const [existing] = await sql`SELECT status FROM policy_versions WHERE id = ${id} LIMIT 1`;
  if (!existing) throw new Error("Policy version not found");
  if (text(existing.status) !== "draft") throw new Error("Only draft versions can be edited");
  await sql`UPDATE policy_versions SET version = ${policy.version}, effective_from = ${policy.effective_from},
    parameters = ${sql.json(policy.parameters)}, rules = ${sql.json(policy.rules)},
    label = COALESCE(${options.label ?? null}, label), diff_summary = ${options.diffSummary ? sql.json(options.diffSummary) : null}
    WHERE id = ${id}`;
  await sql`INSERT INTO audit_events (actor, action, entity_type, entity_id, summary, after)
    VALUES (${options.actor}, 'EDIT', 'POLICY', ${id}, ${`Edited draft policy ${policy.version}`}, ${sql.json(policy)})`;
}

export async function approvePolicyVersion(
  id: string,
  options: { actor: string; effectiveFrom: string; note?: string },
): Promise<{ status: string }> {
  const [existing] = await sql`SELECT * FROM policy_versions WHERE id = ${id} LIMIT 1`;
  if (!existing) throw new Error("Policy version not found");
  const policy = policyFromRow(existing);
  const errors = (await import("../engine/policy")).validatePolicy(policy);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const status = options.effectiveFrom <= new Date().toISOString().slice(0, 10) ? "active" : "scheduled";
  await sql.begin(async (tx) => {
    if (status === "active") {
      await tx`UPDATE policy_versions SET status = 'superseded' WHERE status = 'active' AND id <> ${id}`;
    }
    await tx`UPDATE policy_versions SET status = ${status}, effective_from = ${options.effectiveFrom},
      approved_by = ${options.actor}, approved_at = now() WHERE id = ${id}`;
    await audit(tx, {
      actor: options.actor,
      action: "APPROVE",
      entityType: "POLICY",
      entityId: id,
      summary: `Approved policy ${policy.version} effective ${options.effectiveFrom} (${status})`,
      after: { version: policy.version, effectiveFrom: options.effectiveFrom, status },
      comment: options.note ?? null,
    });
  });
  return { status };
}

export async function getBatchRawLines(batchId: string): Promise<RawPRLine[]> {
  const rows = await sql`
    SELECT pr_no, pr_line, created_at::text, requester, department, plant, raw_item_code, description,
           quantity::text, uom, estimated_unit_price::text, need_by_date::text, urgency, input_order
    FROM pr_lines WHERE batch_id = ${batchId} ORDER BY input_order`;
  return rows.map((row) => ({
    prNo: text(row.pr_no),
    prLine: num(row.pr_line),
    createdAt: timestampText(row.created_at),
    requester: text(row.requester),
    department: text(row.department),
    plant: text(row.plant),
    itemCode: text(row.raw_item_code),
    description: text(row.description),
    quantity: num(row.quantity),
    uom: text(row.uom),
    estimatedUnitPrice: row.estimated_unit_price === null ? null : num(row.estimated_unit_price),
    needByDate: dateText(row.need_by_date),
    urgency: text(row.urgency),
    inputOrder: num(row.input_order),
  }));
}

export async function getRunRawLines(runId: string): Promise<RawPRLine[]> {
  const [run] = await sql`SELECT batch_id FROM processing_runs WHERE id = ${runId} LIMIT 1`;
  if (!run) return [];
  return getBatchRawLines(text(run.batch_id));
}

export async function createDocument(input: {
  kind: string;
  filename: string;
  mime?: string;
  bytes?: Uint8Array | null;
  text?: string | null;
  parsed?: unknown;
  uploadedBy: string;
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO documents (kind, filename, mime, bytes, text_content, parsed, uploaded_by)
    VALUES (${input.kind}, ${input.filename}, ${input.mime ?? null}, ${input.bytes ?? null}, ${input.text ?? null}, ${input.parsed ? sql.json(input.parsed) : null}, ${input.uploadedBy})
    RETURNING id`;
  return row.id;
}

export async function getDashboardData() {
  const [latest, contracts, audit] = await Promise.all([getLatestRun(), listContracts(), listAudit(8)]);
  return { latest, contracts, audit };
}
