import {
  DEFAULT_POLICY,
  clonePolicy,
} from "./default-policy";
import { ItemMatcher } from "./normalize";
import {
  addDays,
  dateDiffDays,
  formatMoney,
  hoursBetween,
  parseDateOnly,
  parseTimestamp,
  roundRupee,
  timestampIso,
  toPaise,
} from "./money";
import {
  evaluateRules,
  numericParam,
  objectParam,
  resolveSuggestCount,
  stringParam,
} from "./policy";
import type {
  Contract,
  DecisionRow,
  EngineData,
  Item,
  NormalizedPRLine,
  Policy,
  PreferredSupplierScore,
  ProcessResult,
  ProcessSummary,
  PurchaseOrderResult,
  RawPRLine,
  RequirementResult,
  Route,
  Supplier,
} from "./types";

interface RunContract extends Contract {
  consumedByBatchPaise: number;
  usedByGroups: string[];
}

interface InternalRequirement {
  groupId: string;
  itemCode: string;
  item: Item | null;
  plant: string;
  lines: NormalizedPRLine[];
  createdAt: Date;
  createdAtIso: string;
  needByDate: string;
  isNew: boolean;
  emergency: boolean;
  quantity: number;
  valuationPrice: number | null;
  poUnitPrice: number | null;
  groupValueExact: number | null;
  decision: RequirementResult["decision"];
  route: Route;
  supplierId: string;
  contractId: string;
  suggestions: string[];
  reason: string;
  poId: string;
  preferred: PreferredSupplierScore[];
  matchedRule: string;
  clause: string;
  requiresApproval: string;
  evidence: Record<string, unknown>;
}

interface ContractState {
  applicable: RunContract[];
  usable: Array<{ contract: RunContract; rate: number; remainingPaise: number }>;
  minApplicableRate: number | null;
}

export interface ProcessOptions {
  policy?: Policy;
  commitments?: Record<string, number>;
  asOf?: string;
}

const UOM_ALIASES: Record<string, string> = {
  NO: "NOS",
  NUMBER: "NOS",
  NUMBERS: "NOS",
  NOS: "NOS",
  PAIRS: "PAIR",
  PAIR: "PAIR",
  KGS: "KG",
  KG: "KG",
  M: "MTR",
  MTR: "MTR",
  MTRS: "MTR",
  L: "LTR",
  LTR: "LTR",
  LTRS: "LTR",
  BRL: "BRL",
  BARREL: "BRL",
  BKT: "BKT",
  BUCKET: "BKT",
  ROL: "ROL",
  ROLL: "ROL",
  ROLLS: "ROL",
  SET: "SET",
  SETS: "SET",
  JOB: "JOB",
  JOBS: "JOB",
  MON: "MON",
  MONTH: "MON",
  MONTHS: "MON",
  QTR: "QTR",
  QUARTER: "QTR",
  QUARTERS: "QTR",
  CYL: "CYL",
  CYLINDER: "CYL",
  CYLINDERS: "CYL",
  REAM: "REAM",
  REAMS: "REAM",
};

function normalizeUom(value: string): string {
  const v = String(value ?? "").trim().toUpperCase();
  return UOM_ALIASES[v] ?? v;
}

function latestPo(
  data: EngineData,
  itemCode: string,
  asOf: string,
  days: number,
  options: { supplierId?: string; activeOnly?: boolean; suppliers?: Supplier[] } = {},
) {
  const start = addDays(asOf, -days);
  const active = new Set(
    (options.suppliers ?? data.suppliers).filter((s) => s.status === "Active").map((s) => s.supplierId),
  );
  const pool = data.poHistory.filter(
    (po) =>
      po.itemCode === itemCode &&
      (!options.supplierId || po.supplierId === options.supplierId) &&
      po.poDate >= start &&
      po.poDate <= asOf &&
      (!options.activeOnly || active.has(po.supplierId)),
  );
  pool.sort((a, b) => a.poDate.localeCompare(b.poDate) || Number(a.poNumber) - Number(b.poNumber));
  return pool.length > 0 ? pool[pool.length - 1] : null;
}

function isActive(data: EngineData, supplierId: string): boolean {
  return data.suppliers.some((s) => s.supplierId === supplierId && s.status === "Active");
}

function supplierFor(data: EngineData, supplierId: string): Supplier | undefined {
  return data.suppliers.find((s) => s.supplierId === supplierId);
}

function emptyContractState(): ContractState {
  return { applicable: [], usable: [], minApplicableRate: null };
}

function contractStateFor(
  req: InternalRequirement,
  data: EngineData,
  contracts: RunContract[],
): ContractState {
  if (!req.itemCode || req.itemCode === "NEW") return emptyContractState();
  const asOf = req.createdAtIso.slice(0, 10);
  const applicable = contracts.filter(
    (contract) =>
      contract.rates[req.itemCode] !== undefined &&
      contract.startDate <= asOf &&
      asOf <= contract.endDate &&
      isActive(data, contract.supplierId),
  );
  const usable: Array<{ contract: RunContract; rate: number; remainingPaise: number }> = [];
  for (const contract of applicable) {
    const rate = contract.rates[req.itemCode];
    const addPaise = Math.round(req.quantity * rate * 100);
    const remainingPaise =
      toPaise(contract.valueCap) -
      toPaise(contract.consumedValue) -
      contract.consumedByBatchPaise;
    if (addPaise <= remainingPaise) usable.push({ contract, rate, remainingPaise });
  }
  usable.sort(
    (a, b) =>
      a.rate - b.rate ||
      a.contract.endDate.localeCompare(b.contract.endDate) ||
      b.remainingPaise - a.remainingPaise ||
      a.contract.contractId.localeCompare(b.contract.contractId),
  );
  const minApplicableRate =
    applicable.length > 0
      ? Math.min(...applicable.map((contract) => contract.rates[req.itemCode]))
      : null;
  return { applicable, usable, minApplicableRate };
}

function fallbackPrice(
  data: EngineData,
  item: Item | null,
  itemCode: string,
  asOf: string,
  policy: Policy,
): { price: number; basis: string; po: ReturnType<typeof latestPo> } {
  const lookback = numericParam(policy, "valuation_po_lookback_days", 365);
  const filter = stringParam(policy, "valuation_po_supplier_filter", "any");
  const po = latestPo(data, itemCode, asOf, lookback, {
    activeOnly: filter === "active_only",
    suppliers: data.suppliers,
  });
  if (po) {
    return {
      price: po.unitPrice,
      basis: `3.1(b): latest PO ${po.poNumber} (${po.poDate}, ${po.supplierId}) at ${formatMoney(po.unitPrice)}`,
      po,
    };
  }
  const standard = item?.standardPrice ?? 0;
  return {
    price: standard,
    basis: `3.1(c): item standard price ${formatMoney(standard)}`,
    po: null,
  };
}

function recencyWeight(days: number | null, policy: Policy): number {
  if (days === null) return 0;
  const fast = numericParam(policy, "recency_fast_days", 90);
  const medium = numericParam(policy, "recency_medium_days", 365);
  if (days <= fast) return 1;
  if (days <= medium) return 0.5;
  return 0;
}

function rankingWeights(policy: Policy): {
  frequency: number;
  recency: number;
  contract: number;
  delivery: number;
  quality: number;
} {
  const fallback = { frequency: 0.4, recency: 0.3, contract: 0.15, delivery: 0.075, quality: 0.075 };
  return objectParam(policy, "ranking_weights", fallback);
}

function referencePrice(
  data: EngineData,
  supplierId: string,
  itemCode: string,
  asOf: string,
  policy: Policy,
): { price: number; basis: string } {
  const lookback = numericParam(policy, "preferred_po_lookback_days", 548);
  const po = latestPo(data, itemCode, asOf, lookback, { supplierId, suppliers: data.suppliers });
  if (po) return { price: po.unitPrice, basis: `PO ${po.poNumber} dated ${po.poDate}` };
  const held = data.contracts
    .filter((contract) => contract.supplierId === supplierId && contract.rates[itemCode] !== undefined && contract.startDate <= asOf)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.contractId.localeCompare(b.contractId));
  if (held.length > 0) {
    const contract = held[held.length - 1];
    return { price: contract.rates[itemCode], basis: `contract ${contract.contractId} rate` };
  }
  const fallback = fallbackPrice(data, data.items.find((i) => i.itemCode === itemCode) ?? null, itemCode, asOf, policy);
  return { price: fallback.price, basis: "fallback valuation price" };
}

function preferredSuppliers(
  data: EngineData,
  itemCode: string,
  asOf: string,
  policy: Policy,
): PreferredSupplierScore[] {
  const lookback = numericParam(policy, "preferred_po_lookback_days", 548);
  const cap = numericParam(policy, "frequency_cap", 3);
  const weights = rankingWeights(policy);
  const rows: PreferredSupplierScore[] = [];

  for (const supplier of data.suppliers) {
    if (supplier.status !== "Active") continue;
    const pos = data.poHistory.filter(
      (po) =>
        po.itemCode === itemCode &&
        po.supplierId === supplier.supplierId &&
        po.poDate >= addDays(asOf, -lookback) &&
        po.poDate <= asOf,
    );
    const held = data.contracts.filter(
      (contract) =>
        contract.supplierId === supplier.supplierId &&
        contract.rates[itemCode] !== undefined &&
        contract.startDate <= asOf,
    );
    if (pos.length === 0 && held.length === 0) continue;

    pos.sort((a, b) => a.poDate.localeCompare(b.poDate) || Number(a.poNumber) - Number(b.poNumber));
    const last = pos.length > 0 ? pos[pos.length - 1] : null;
    const recency = recencyWeight(last ? dateDiffDays(asOf, last.poDate) : null, policy);
    const contractFlag = held.length > 0 ? 1 : 0;
    const frequency = Math.min(pos.length, cap) / cap;
    const score =
      weights.frequency * frequency +
      weights.recency * recency +
      weights.contract * contractFlag +
      weights.delivery * (supplier.onTimePct / 100) +
      weights.quality * (supplier.qualityRating / 5);
    const ref = referencePrice(data, supplier.supplierId, itemCode, asOf, policy);
    rows.push({
      supplierId: supplier.supplierId,
      poCount: pos.length,
      recency,
      contract: contractFlag,
      lastPoNumber: last?.poNumber ?? null,
      lastPoDate: last?.poDate ?? null,
      contracts: held.map((contract) => contract.contractId),
      score,
      onTime: supplier.onTimePct,
      quality: supplier.qualityRating,
      referencePrice: ref.price,
      referenceBasis: ref.basis,
    });
  }

  rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.poCount - a.poCount ||
      b.recency - a.recency ||
      b.contract - a.contract ||
      b.quality - a.quality ||
      b.onTime - a.onTime ||
      a.supplierId.localeCompare(b.supplierId),
  );
  return rows;
}

function suggestionList(
  data: EngineData,
  itemCode: string,
  asOf: string,
  count: number,
  policy: Policy,
): string[] {
  if (!itemCode || itemCode === "NEW") return [];
  const preferred = preferredSuppliers(data, itemCode, asOf, policy).map((row) => row.supplierId);
  const out = preferred.slice(0, count);
  if (out.length >= count) return out;
  const item = data.items.find((i) => i.itemCode === itemCode);
  if (!item) return out;
  const candidates = data.suppliers
    .filter(
      (supplier) =>
        supplier.status === "Active" &&
        !out.includes(supplier.supplierId) &&
        supplier.categories.includes(item.category),
    )
    .map((supplier) => ({
      supplierId: supplier.supplierId,
      score: 0.5 * (supplier.onTimePct / 100) + 0.5 * (supplier.qualityRating / 5),
    }))
    .sort((a, b) => b.score - a.score || a.supplierId.localeCompare(b.supplierId));
  for (const candidate of candidates) {
    if (out.length >= count) break;
    out.push(candidate.supplierId);
  }
  return out;
}

function normalizeLine(
  raw: RawPRLine,
  data: EngineData,
  matcher: ItemMatcher,
): NormalizedPRLine {
  const createdAtIso = timestampIso(raw.createdAt);
  const needByDateIso = parseDateOnly(raw.needByDate);
  const quantityValue = Number(raw.quantity);
  const matched = matcher.match(raw.itemCode, raw.description);
  const resolvedItemCode = matched.item?.itemCode ?? "NEW";
  const line: NormalizedPRLine = {
    ...raw,
    createdAtIso,
    needByDateIso,
    quantityValue,
    resolvedItemCode,
    matchedItem: matched.item,
    matchConfidence: matched.confidence,
    matchNote: matched.note,
    processed: true,
    notProcessedReason: "",
  };

  const reasons: string[] = [];
  if (!raw.prNo || !Number.isFinite(raw.prLine) || raw.prLine <= 0) {
    reasons.push("pr_no/pr_line is missing or invalid");
  }
  if (!createdAtIso) reasons.push("created_at is missing or invalid; cannot order/group/consolidate");
  if (!needByDateIso) reasons.push("need_by_date is missing or invalid; cannot club");
  if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
    reasons.push(`quantity ${Number.isFinite(quantityValue) ? quantityValue : raw.quantity} is not positive; zero-value requirements are outside policy v5.0`);
  }
  if (!raw.plant || !data.plants.some((plant) => plant.code === raw.plant)) {
    reasons.push(`plant ${JSON.stringify(raw.plant)} is not a Corvo plant (policy v5.0 applies to ${data.plants.map((p) => p.code).join(", ")} only)`);
  }
  if (!raw.itemCode && !raw.description) {
    reasons.push("no item code or description was supplied");
  }
  const rawUom = normalizeUom(raw.uom);
  const masterUom = matched.item ? normalizeUom(matched.item.uom) : "";
  if (rawUom && masterUom && rawUom !== masterUom) {
    reasons.push(`UOM ${raw.uom} does not match item master UOM ${matched.item?.uom}; no conversion is defined`);
  }

  if (reasons.length > 0) {
    line.processed = false;
    line.notProcessedReason = reasons.join("; ");
  }
  if (!raw.uom && matched.item) line.uom = matched.item.uom;
  if (!raw.urgency) line.urgency = "Normal";
  return line;
}

function lineMatchesRequirement(line: NormalizedPRLine, req: InternalRequirement, policy: Policy): boolean {
  if (req.isNew || req.itemCode !== line.resolvedItemCode || req.plant !== line.plant) return false;
  if (!req.createdAtIso || !line.createdAtIso) return false;
  const createdDays = Math.abs(dateDiffDays(line.createdAtIso, req.createdAtIso));
  if (createdDays > numericParam(policy, "clubbing_created_days", 14)) return false;
  const needDays = Math.abs(dateDiffDays(line.needByDateIso, req.needByDate));
  return needDays <= numericParam(policy, "clubbing_need_by_days", 7);
}

function newRequirement(line: NormalizedPRLine, index: number): InternalRequirement {
  return {
    groupId: `G${String(index + 1).padStart(4, "0")}`,
    itemCode: line.resolvedItemCode,
    item: line.matchedItem,
    plant: line.plant,
    lines: [line],
    createdAt: parseTimestamp(line.createdAtIso) ?? new Date(0),
    createdAtIso: line.createdAtIso,
    needByDate: line.needByDateIso,
    isNew: line.resolvedItemCode === "NEW",
    emergency: line.urgency.toLowerCase() === "emergency",
    quantity: line.quantityValue,
    valuationPrice: null,
    poUnitPrice: null,
    groupValueExact: null,
    decision: "SOURCING_REQUEST",
    route: "RFQ",
    supplierId: "",
    contractId: "",
    suggestions: [],
    reason: "",
    poId: "",
    preferred: [],
    matchedRule: "",
    clause: "",
    requiresApproval: "",
    evidence: {},
  };
}

function lineRef(line: NormalizedPRLine): string {
  return `${line.prNo}/${line.prLine}`;
}

function buildLineReason(req: InternalRequirement, line: NormalizedPRLine, pos: PurchaseOrderResult[]): string {
  const parts = [req.reason];
  if (req.lines.length > 1) {
    parts.push(
      `2.2: clubbed ${req.lines.length} lines into ${req.groupId} (same item ${req.itemCode}, plant ${req.plant}, within 14 calendar days and need-by +/-7 days; first line ${lineRef(req.lines[0])}); lines: ${req.lines.map(lineRef).join(", ")}`,
    );
  }
  if (req.poId) {
    const po = pos.find((candidate) => candidate.poId === req.poId);
    const others = po?.requirements.filter((candidate) => candidate.groupId !== req.groupId).map((candidate) => candidate.groupId) ?? [];
    if (others.length > 0) {
      parts.push(`7.1: consolidated on ${req.poId} with ${others.join(", ")} (same supplier/plant/route, within 24h of PO first requirement)`);
    } else {
      parts.push(`7.2: first requirement on ${req.poId}`);
    }
  }
  if (!line.itemCode && !req.isNew) parts.push(`1.1: ${line.matchNote}`);
  if (!line.itemCode && req.isNew) parts.push(`1.2: ${line.matchNote}`);
  return parts.join(" | ");
}

export function processBatch(
  lines: RawPRLine[],
  data: EngineData,
  options: ProcessOptions = {},
): ProcessResult {
  const policy = options.policy ?? clonePolicy(DEFAULT_POLICY);
  const matcher = new ItemMatcher(data.items);
  const contracts: RunContract[] = data.contracts.map((contract) => ({
    ...contract,
    rates: { ...contract.rates },
    consumedByBatchPaise: Math.round((options.commitments?.[contract.contractId] ?? 0) * 100),
    usedByGroups: [],
  }));
  const preferredCache = new Map<string, PreferredSupplierScore[]>();

  const normalized = lines.map((line) => normalizeLine(line, data, matcher));

  // 2.2: creation time, then PR number, then line number.
  const ordered = normalized
    .filter((line) => line.processed)
    .sort(
      (a, b) =>
        a.createdAtIso.localeCompare(b.createdAtIso) ||
        a.prNo.localeCompare(b.prNo) ||
        a.prLine - b.prLine ||
        a.inputOrder - b.inputOrder,
    );

  const requirements: InternalRequirement[] = [];
  for (const line of ordered) {
    if (line.resolvedItemCode === "NEW") {
      requirements.push(newRequirement(line, requirements.length));
      continue;
    }
    const candidate = requirements.find((req) => lineMatchesRequirement(line, req, policy));
    if (candidate) {
      candidate.lines.push(line);
      candidate.quantity += line.quantityValue;
      if (line.urgency.toLowerCase() === "emergency") candidate.emergency = true;
    } else {
      requirements.push(newRequirement(line, requirements.length));
    }
  }

  const getPreferred = (itemCode: string, asOf: string): PreferredSupplierScore[] => {
    const key = `${itemCode}|${asOf}`;
    const cached = preferredCache.get(key);
    if (cached) return cached;
    const rows = preferredSuppliers(data, itemCode, asOf, policy);
    preferredCache.set(key, rows);
    return rows;
  };

  for (const req of requirements) {
    const asOf = req.createdAtIso.slice(0, 10);
    const item = req.item;
    const isCapex = item?.itemType.toLowerCase() === "capex";
    const contractState = req.isNew || isCapex ? emptyContractState() : contractStateFor(req, data, contracts);
    let valuationBasis = "";
    let valuationPrice: number | null = null;
    let groupValueExact: number | null = null;

    if (req.isNew) {
      const estimate = req.lines[0].estimatedUnitPrice;
      valuationPrice = estimate;
      groupValueExact = estimate === null ? null : req.quantity * estimate;
      valuationBasis =
        estimate === null
          ? "1.2: requester estimate missing"
          : `1.2: requester estimate ${formatMoney(estimate)}`;
    } else if (isCapex) {
      const fallback = fallbackPrice(data, item, req.itemCode, asOf, policy);
      valuationPrice = fallback.price;
      groupValueExact = req.quantity * fallback.price;
      valuationBasis = `5.1 / 3.1: ${fallback.basis}`;
    } else if (contractState.usable.length > 0) {
      valuationPrice = contractState.usable[0].rate;
      groupValueExact = req.quantity * valuationPrice;
      valuationBasis = `3.1(a): usable contract ${contractState.usable[0].contract.contractId} at ${formatMoney(valuationPrice)}`;
    } else if (contractState.applicable.length > 0 && contractState.minApplicableRate !== null) {
      valuationPrice = contractState.minApplicableRate;
      groupValueExact = req.quantity * valuationPrice;
      valuationBasis = `3.1(a): all applicable contracts lack ceiling; lowest applicable rate ${formatMoney(valuationPrice)}`;
    } else {
      const fallback = fallbackPrice(data, item, req.itemCode, asOf, policy);
      valuationPrice = fallback.price;
      groupValueExact = req.quantity * fallback.price;
      valuationBasis = fallback.basis;
    }

    req.valuationPrice = valuationPrice;
    req.groupValueExact = groupValueExact;

    const bought = latestPo(data, req.itemCode, asOf, numericParam(policy, "bought_active_lookback_days", 365), {
      activeOnly: true,
      suppliers: data.suppliers,
    });
    const latestAny = latestPo(data, req.itemCode, asOf, numericParam(policy, "valuation_po_lookback_days", 365), {
      suppliers: data.suppliers,
    });
    const preferred = req.isNew ? [] : getPreferred(req.itemCode, asOf);
    const top = preferred[0];
    const poCount365 = data.poHistory.filter(
      (po) => po.itemCode === req.itemCode && po.poDate >= addDays(asOf, -365) && po.poDate <= asOf,
    ).length;
    const poCount548 = data.poHistory.filter(
      (po) => po.itemCode === req.itemCode && po.poDate >= addDays(asOf, -548) && po.poDate <= asOf,
    ).length;

    const facts: Record<string, unknown> = {
      "item.code": item?.itemCode ?? "",
      "item.item_type": item?.itemType ?? "",
      "item.category": item?.category ?? "",
      "item.uom": item?.uom ?? "",
      "item.is_new": req.isNew,
      "item.standard_price": item?.standardPrice ?? 0,
      "requirement.value": groupValueExact ?? 0,
      "requirement.quantity": req.quantity,
      "requirement.plant": req.plant,
      "requirement.urgency": req.emergency ? "Emergency" : "Normal",
      "requirement.is_emergency": req.emergency,
      "requirement.created_at": req.createdAtIso,
      "requirement.need_by": req.needByDate,
      "requirement.department": req.lines[0].department,
      "requirement.requester": req.lines[0].requester,
      "contract.exists": contractState.applicable.length > 0,
      "contract.usable": contractState.usable.length > 0,
      "contract.count": contractState.applicable.length,
      "contract.lowest_rate": contractState.minApplicableRate ?? 0,
      "contract.selected_id": contractState.usable[0]?.contract.contractId ?? "",
      "contract.remaining_value": contractState.usable[0]
        ? Math.max(
            0,
            contractState.usable[0].contract.valueCap -
              contractState.usable[0].contract.consumedValue -
              contractState.usable[0].contract.consumedByBatchPaise / 100,
          )
        : 0,
      "contract.remaining_pct": contractState.usable[0]
        ? Math.max(
            0,
            ((contractState.usable[0].contract.valueCap -
              contractState.usable[0].contract.consumedValue -
              contractState.usable[0].contract.consumedByBatchPaise / 100) /
              contractState.usable[0].contract.valueCap) *
              100,
          )
        : 0,
      "contract.all_out_of_ceiling":
        contractState.applicable.length > 0 && contractState.usable.length === 0,
      "history.bought_active_365d": Boolean(bought),
      "history.bought_active_days": bought ? dateDiffDays(asOf, bought.poDate) : null,
      "history.last_po_date": latestAny?.poDate ?? null,
      "history.last_po_price": latestAny?.unitPrice ?? null,
      "history.po_count_365": poCount365,
      "history.po_count_548": poCount548,
      "history.preferred_count": preferred.length,
      "history.top_supplier_id": top?.supplierId ?? "",
      "history.top_reference_price": top?.referencePrice ?? null,
    };

    const match = evaluateRules(policy, facts);
    const outcome = match.outcome;
    const clause = match.rule.clause;
    req.matchedRule = match.rule.id;
    req.clause = clause;
    req.requiresApproval = outcome.requires_approval ?? "";
    req.decision = outcome.decision;
    req.route = outcome.route;
    req.preferred = preferred;

    const boughtNote = bought
      ? `bought from Active ${bought.supplierId} on ${bought.poDate} (PO ${bought.poNumber})`
      : "no purchase from an Active supplier in the last 365 days";

    if (outcome.route === "CONTRACT_PO") {
      const chosen = contractState.usable[0];
      if (!chosen) {
        throw new Error(`Policy rule ${match.rule.id} selected CONTRACT_PO without a usable contract`);
      }
      const beforePaise =
        toPaise(chosen.contract.valueCap) -
        toPaise(chosen.contract.consumedValue) -
        chosen.contract.consumedByBatchPaise;
      const addPaise = Math.round(req.quantity * chosen.rate * 100);
      chosen.contract.consumedByBatchPaise += addPaise;
      chosen.contract.usedByGroups.push(req.groupId);
      req.contractId = chosen.contract.contractId;
      req.supplierId = chosen.contract.supplierId;
      req.valuationPrice = chosen.rate;
      req.groupValueExact = req.quantity * chosen.rate;
      req.poUnitPrice = chosen.rate;
      req.reason =
        `${clause}: rate contract ${chosen.contract.contractId} (${chosen.contract.supplierId}, ${chosen.contract.startDate}..${chosen.contract.endDate}) covers ${req.itemCode} on ${asOf}; supplier Active; rate ${formatMoney(chosen.rate)}; ceiling ${formatMoney(beforePaise / 100)} + ${formatMoney(addPaise / 100)} <= ${formatMoney(chosen.contract.valueCap)}`;
    } else if (outcome.supplier === "PREFERRED_RANK_1") {
      if (!top) {
        throw new Error(`Policy rule ${match.rule.id} selected the 1st preferred supplier but the list is empty for ${req.itemCode} on ${asOf}`);
      }
      req.supplierId = top.supplierId;
      req.poUnitPrice = top.referencePrice;
      const threshold =
        outcome.route === "EMERGENCY_PO"
          ? `Emergency and value ${formatMoney(groupValueExact ?? 0)} <= ${formatMoney(numericParam(policy, "emergency_po_max_inr", 500000))}`
          : `value ${formatMoney(groupValueExact ?? 0)} < ${formatMoney(numericParam(policy, "spot_po_max_inr", 200000))}`;
      req.reason =
        `${clause}: ${threshold}; ${boughtNote}; 1st preferred ${top.supplierId} at 6.3 reference price ${formatMoney(top.referencePrice ?? 0)} (${top.referenceBasis}); valuation ${valuationBasis}`;
    } else if (outcome.route === "NEW_ITEM_SOURCING") {
      req.suggestions = [];
      req.reason =
        `1.2: no item-master match (${req.lines[0].matchNote}); new item, never clubbed (2.2); valued at ${valuationBasis.replace(/^1\.2: /, "")}; 6.4 gives no suggestions`;
    } else if (outcome.route === "CAPEX_SOURCING") {
      req.suggestions = suggestionList(data, req.itemCode, asOf, resolveSuggestCount(outcome.suggest_count, policy), policy);
      req.reason =
        `5.1: item_type Capex; sourcing before contract/value tests; valuation ${valuationBasis.replace(/^5\.1 \/ /, "")}; 6.4 suggests ${resolveSuggestCount(outcome.suggest_count, policy)}; capex approval required`;
    } else {
      const count = resolveSuggestCount(outcome.suggest_count, policy);
      req.suggestions = suggestionList(data, req.itemCode, asOf, count, policy);
      const limit =
        outcome.route === "RFQ"
          ? groupValueExact !== null && groupValueExact >= numericParam(policy, "spot_po_max_inr", 200000)
            ? `at or above ${formatMoney(numericParam(policy, "spot_po_max_inr", 200000))} and below ${formatMoney(numericParam(policy, "rfq_max_inr", 1000000))}`
            : `below ${formatMoney(numericParam(policy, "spot_po_max_inr", 200000))}, but 5.4 does not apply because there is no qualifying purchase from an Active supplier in 365 days`
          : `at or above ${formatMoney(numericParam(policy, "rfq_max_inr", 1000000))}`;
      req.reason =
        `${clause}: value ${formatMoney(groupValueExact ?? 0)} ${limit}; ${boughtNote}; valuation ${valuationBasis}; 6.4 suggests ${count}`;
    }

    req.evidence = {
      valuationBasis,
      boughtNote,
      contractState: {
        applicable: contractState.applicable.map((contract) => contract.contractId),
        usable: contractState.usable.map(({ contract, rate }) => ({ contractId: contract.contractId, rate })),
        minApplicableRate: contractState.minApplicableRate,
      },
      preferred,
      matchedRule: match.rule.id,
      clause,
      lineRefs: req.lines.map(lineRef),
    };
  }

  // 7.1–7.2: PO consolidation in requirement creation order.
  const pos: PurchaseOrderResult[] = [];
  for (const req of requirements) {
    if (req.decision !== "PO") continue;
    const hours = numericParam(policy, "consolidation_hours", 24);
    const qualifying = pos.filter(
      (po) =>
        po.supplierId === req.supplierId &&
        po.plant === req.plant &&
        po.route === req.route &&
        hoursBetween(req.createdAt, parseTimestamp(po.firstCreatedAt) ?? req.createdAt) <= hours,
    );
    if (qualifying.length > 0) {
      const po = qualifying[0];
      po.requirements.push(req as unknown as RequirementResult);
      req.poId = po.poId;
    } else {
      const po: PurchaseOrderResult = {
        poId: `PO-${String(pos.length + 1).padStart(4, "0")}`,
        supplierId: req.supplierId,
        plant: req.plant,
        route: req.route,
        firstCreatedAt: req.createdAtIso,
        requirements: [req as unknown as RequirementResult],
        valueExact: 0,
      };
      pos.push(po);
      req.poId = po.poId;
    }
  }
  for (const po of pos) {
    po.valueExact = po.requirements.reduce((sum, req) => sum + (req.groupValueExact ?? 0), 0);
  }

  const reqByLine = new Map<string, InternalRequirement>();
  for (const req of requirements) {
    for (const line of req.lines) reqByLine.set(`${line.prNo}|${line.prLine}`, req);
  }

  const rows: DecisionRow[] = normalized
    .slice()
    .sort((a, b) => a.inputOrder - b.inputOrder)
    .map((line) => {
      if (!line.processed) {
        return {
          pr_no: line.prNo,
          pr_line: line.prLine,
          resolved_item_code: line.resolvedItemCode,
          group_id: "",
          po_id: "",
          decision: "NOT_PROCESSED",
          route: "NOT_PROCESSED",
          supplier_id: "",
          unit_price: "",
          group_value_inr: "",
          suggested_supplier_ids: "",
          policy_version: policy.version,
          reason: line.notProcessedReason,
        };
      }
      const req = reqByLine.get(`${line.prNo}|${line.prLine}`);
      if (!req) throw new Error(`Internal error: no requirement for ${line.prNo}/${line.prLine}`);
      return {
        pr_no: line.prNo,
        pr_line: line.prLine,
        resolved_item_code: req.itemCode,
        group_id: req.groupId,
        po_id: req.poId,
        decision: req.decision,
        route: req.route,
        supplier_id: req.supplierId,
        unit_price: req.poUnitPrice === null ? "" : roundRupee(req.poUnitPrice),
        group_value_inr: req.groupValueExact === null ? "" : roundRupee(req.groupValueExact),
        suggested_supplier_ids: req.suggestions.join(";"),
        policy_version: policy.version,
        reason: buildLineReason(req, line, pos),
      };
    });

  const routeCountsLines: Record<string, number> = {};
  const routeCountsRequirements: Record<string, number> = {};
  for (const line of normalized) {
    const req = line.processed ? reqByLine.get(`${line.prNo}|${line.prLine}`) : null;
    const route = req?.route ?? "NOT_PROCESSED";
    routeCountsLines[route] = (routeCountsLines[route] ?? 0) + 1;
  }
  for (const req of requirements) {
    routeCountsRequirements[req.route] = (routeCountsRequirements[req.route] ?? 0) + 1;
  }
  const poRouteCounts: Record<string, number> = {};
  for (const po of pos) poRouteCounts[po.route] = (poRouteCounts[po.route] ?? 0) + 1;
  const consolidated = pos.filter((po) => po.requirements.length > 1);
  const multiLine = requirements.filter((req) => req.lines.length > 1);
  const newReqs = requirements.filter((req) => req.isNew);
  const notProcessed = normalized.filter((line) => !line.processed);
  const totalRequirementValue = requirements.reduce((sum, req) => sum + (req.groupValueExact ?? 0), 0);
  const poRequirementValue = requirements
    .filter((req) => req.decision === "PO")
    .reduce((sum, req) => sum + (req.groupValueExact ?? 0), 0);
  const poAwardValue = requirements
    .filter((req) => req.decision === "PO")
    .reduce((sum, req) => sum + req.quantity * (req.poUnitPrice ?? req.valuationPrice ?? 0), 0);

  const summary: ProcessSummary = {
    policy_version: policy.version,
    total_pr_lines: normalized.length,
    processed_lines: normalized.filter((line) => line.processed).length,
    not_processed_lines: notProcessed.length,
    not_processed: notProcessed.map((line) => ({
      pr_no: line.prNo,
      pr_line: line.prLine,
      item_code: line.resolvedItemCode,
      description: line.description,
      quantity: line.quantityValue,
      plant: line.plant,
      reason: line.notProcessedReason,
    })),
    total_requirements: requirements.length,
    total_pos: pos.length,
    sourcing_events: requirements.filter((req) => req.decision === "SOURCING_REQUEST").length,
    new_item_requirements: newReqs.length,
    new_item_lines: newReqs.reduce((sum, req) => sum + req.lines.length, 0),
    new_items: newReqs.map((req) => ({
      pr_no: req.lines[0].prNo,
      pr_line: req.lines[0].prLine,
      description: req.lines[0].description,
      quantity: req.quantity,
      estimated_unit_price: req.lines[0].estimatedUnitPrice,
      group_id: req.groupId,
    })),
    route_counts_lines: routeCountsLines,
    route_counts_requirements: routeCountsRequirements,
    po_route_counts: poRouteCounts,
    contract_po_requirements: requirements.filter((req) => req.route === "CONTRACT_PO").length,
    contract_po_lines: requirements.filter((req) => req.route === "CONTRACT_PO").reduce((sum, req) => sum + req.lines.length, 0),
    consolidated_pos: consolidated.length,
    consolidated_po_ids: consolidated.map((po) => po.poId),
    multi_line_requirements: multiLine.length,
    clubbed_lines: multiLine.reduce((sum, req) => sum + req.lines.length, 0),
    multi_requirement_pos: consolidated.map((po) => ({
      po_id: po.poId,
      supplier_id: po.supplierId,
      plant: po.plant,
      route: po.route,
      groups: po.requirements.map((req) => req.groupId),
      value: Math.round(po.valueExact * 100) / 100,
    })),
    contract_consumption: contracts.map((contract) => ({
      contract_id: contract.contractId,
      supplier_id: contract.supplierId,
      supplier_status: supplierFor(data, contract.supplierId)?.status ?? "?",
      source: contract.source,
      start: contract.startDate,
      end: contract.endDate,
      value_cap: contract.valueCap,
      consumed_initial: contract.consumedValue,
      consumed_by_batch: contract.consumedByBatchPaise / 100,
      consumed_final: contract.consumedValue + contract.consumedByBatchPaise / 100,
      remaining_final: contract.valueCap - contract.consumedValue - contract.consumedByBatchPaise / 100,
      used_by_groups: contract.usedByGroups,
    })),
    unmatched_new: newReqs.map((req) => ({
      pr_no: req.lines[0].prNo,
      pr_line: req.lines[0].prLine,
      description: req.lines[0].description,
      best_confidence: req.lines[0].matchConfidence,
      match_note: req.lines[0].matchNote,
    })),
    total_requirement_value: Math.round(totalRequirementValue * 100) / 100,
    po_requirement_value: Math.round(poRequirementValue * 100) / 100,
    po_award_value: Math.round(poAwardValue * 100) / 100,
  };

  return {
    rows,
    requirements: requirements as unknown as RequirementResult[],
    pos,
    summary,
    normalizedLines: normalized,
  };
}

export function preferredSupplierScores(
  data: EngineData,
  itemCode: string,
  asOf: string,
  policy: Policy,
): PreferredSupplierScore[] {
  return preferredSuppliers(data, itemCode, asOf, policy);
}

export function sourcingSuggestions(
  data: EngineData,
  itemCode: string,
  asOf: string,
  count: number,
  policy: Policy,
): string[] {
  return suggestionList(data, itemCode, asOf, count, policy);
}

export function itemReferencePrice(
  data: EngineData,
  supplierId: string,
  itemCode: string,
  asOf: string,
  policy: Policy,
): { price: number; basis: string } {
  return referencePrice(data, supplierId, itemCode, asOf, policy);
}

export function itemFallbackPrice(
  data: EngineData,
  itemCode: string,
  asOf: string,
  policy: Policy,
): { price: number; basis: string } {
  const item = data.items.find((candidate) => candidate.itemCode === itemCode) ?? null;
  return fallbackPrice(data, item, itemCode, asOf, policy);
}

export function totalValueAtRisk(result: ProcessResult): number {
  return result.summary.total_requirement_value;
}

export function currentPolicyVersion(policy: Policy): string {
  return policy.version;
}

export function routeLabel(route: Route): string {
  const labels: Record<Route, string> = {
    CONTRACT_PO: "Contract PO",
    EMERGENCY_PO: "Emergency PO",
    SPOT_PO: "Spot PO",
    RFQ: "RFQ",
    RFP: "RFP",
    CAPEX_SOURCING: "Capex sourcing",
    NEW_ITEM_SOURCING: "New item sourcing",
    NOT_PROCESSED: "Not processed",
  };
  return labels[route];
}
