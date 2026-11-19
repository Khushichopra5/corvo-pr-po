export type Route =
  | "CONTRACT_PO"
  | "EMERGENCY_PO"
  | "SPOT_PO"
  | "RFQ"
  | "RFP"
  | "CAPEX_SOURCING"
  | "NEW_ITEM_SOURCING"
  | "NOT_PROCESSED";

export type Decision = "PO" | "SOURCING_REQUEST" | "NOT_PROCESSED";

export type SupplierStatus = "Active" | "Blocked" | "Inactive";

export interface Plant {
  code: string;
  name: string;
}

export interface Item {
  itemCode: string;
  description: string;
  uom: string;
  category: string;
  itemType: string;
  standardPrice: number;
}

export interface Supplier {
  supplierId: string;
  name: string;
  city: string;
  categories: string[];
  status: SupplierStatus;
  onTimePct: number;
  qualityRating: number;
}

export interface PoHistoryRow {
  poNumber: string;
  poDate: string;
  supplierId: string;
  itemCode: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  plant: string;
  deliveredOnTime: boolean;
}

export interface Contract {
  contractId: string;
  supplierId: string;
  supplierName: string;
  startDate: string;
  endDate: string;
  valueCap: number;
  consumedValue: number;
  source: "REGISTER" | "PDF";
  rates: Record<string, number>;
}

export interface EngineData {
  plants: Plant[];
  items: Item[];
  suppliers: Supplier[];
  poHistory: PoHistoryRow[];
  contracts: Contract[];
}

export interface RawPRLine {
  prNo: string;
  prLine: number;
  createdAt: string;
  requester: string;
  department: string;
  plant: string;
  itemCode: string;
  description: string;
  quantity: number;
  uom: string;
  estimatedUnitPrice: number | null;
  needByDate: string;
  urgency: string;
  inputOrder: number;
  validationError?: string;
}

export interface NormalizedPRLine extends RawPRLine {
  resolvedItemCode: string;
  matchedItem: Item | null;
  matchConfidence: number;
  matchNote: string;
  processed: boolean;
  notProcessedReason: string;
  createdAtIso: string;
  needByDateIso: string;
  quantityValue: number;
}

export type ConditionOperator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "between"
  | "exists"
  | "contains";

export interface ParamRef {
  param: string;
}

export type ConditionValue = string | number | boolean | null | ParamRef | Array<string | number>;

export interface RuleCondition {
  all?: RuleCondition[];
  any?: RuleCondition[];
  not?: RuleCondition;
  fact?: string;
  op?: ConditionOperator;
  value?: ConditionValue;
}

export interface RuleOutcome {
  decision: Decision;
  route: Route;
  supplier?: "CONTRACT" | "PREFERRED_RANK_1" | "NONE";
  price?: "CONTRACT_RATE" | "REFERENCE_PRICE" | "NONE";
  suggest_count?: number | ParamRef;
  requires_approval?: string;
}

export interface PolicyRule {
  id: string;
  clause: string;
  priority: number;
  enabled?: boolean;
  label?: string;
  when: RuleCondition;
  then: RuleOutcome;
  reason_template?: string;
}

export interface SupplierGuard {
  excludeStatuses: string[];
}

export interface Policy {
  schema_version: string;
  policy_id: string;
  version: string;
  effective_from: string;
  status: "draft" | "approved" | "active" | "scheduled" | "superseded";
  currency: string;
  plants: string[];
  supplier_guard: SupplierGuard;
  parameters: Record<string, unknown>;
  rules: PolicyRule[];
}

export interface PreferredSupplierScore {
  supplierId: string;
  poCount: number;
  recency: number;
  contract: number;
  lastPoNumber: string | null;
  lastPoDate: string | null;
  contracts: string[];
  score: number;
  onTime: number;
  quality: number;
  referencePrice: number | null;
  referenceBasis: string;
}

export interface RequirementResult {
  groupId: string;
  itemCode: string;
  item: Item | null;
  plant: string;
  lines: NormalizedPRLine[];
  createdAt: string;
  needByDate: string;
  isNew: boolean;
  emergency: boolean;
  quantity: number;
  valuationPrice: number | null;
  poUnitPrice: number | null;
  groupValueExact: number | null;
  decision: Decision;
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

export interface PurchaseOrderResult {
  poId: string;
  supplierId: string;
  plant: string;
  route: Route;
  firstCreatedAt: string;
  requirements: RequirementResult[];
  valueExact: number;
}

export interface DecisionRow {
  pr_no: string;
  pr_line: number;
  resolved_item_code: string;
  group_id: string;
  po_id: string;
  decision: Decision | "";
  route: Route;
  supplier_id: string;
  unit_price: number | "";
  group_value_inr: number | "";
  suggested_supplier_ids: string;
  policy_version: string;
  reason: string;
}

export interface ProcessSummary {
  policy_version: string;
  total_pr_lines: number;
  processed_lines: number;
  not_processed_lines: number;
  not_processed: Array<{
    pr_no: string;
    pr_line: number;
    item_code: string;
    description: string;
    quantity: number;
    plant: string;
    reason: string;
  }>;
  total_requirements: number;
  total_pos: number;
  sourcing_events: number;
  new_item_requirements: number;
  new_item_lines: number;
  new_items: Array<{
    pr_no: string;
    pr_line: number;
    description: string;
    quantity: number;
    estimated_unit_price: number | null;
    group_id: string;
  }>;
  route_counts_lines: Record<string, number>;
  route_counts_requirements: Record<string, number>;
  po_route_counts: Record<string, number>;
  contract_po_requirements: number;
  contract_po_lines: number;
  consolidated_pos: number;
  consolidated_po_ids: string[];
  multi_line_requirements: number;
  clubbed_lines: number;
  multi_requirement_pos: Array<{
    po_id: string;
    supplier_id: string;
    plant: string;
    route: Route;
    groups: string[];
    value: number;
  }>;
  contract_consumption: Array<{
    contract_id: string;
    supplier_id: string;
    supplier_status: string;
    source: string;
    start: string;
    end: string;
    value_cap: number;
    consumed_initial: number;
    consumed_by_batch: number;
    consumed_final: number;
    remaining_final: number;
    used_by_groups: string[];
  }>;
  unmatched_new: Array<{
    pr_no: string;
    pr_line: number;
    description: string;
    best_confidence: number;
    match_note: string;
  }>;
  total_requirement_value: number;
  po_requirement_value: number;
  po_award_value: number;
}

export interface ProcessResult {
  rows: DecisionRow[];
  requirements: RequirementResult[];
  pos: PurchaseOrderResult[];
  summary: ProcessSummary;
  normalizedLines: NormalizedPRLine[];
}
