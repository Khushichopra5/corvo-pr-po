import type {
  ConditionValue,
  ParamRef,
  Policy,
  PolicyRule,
  RuleCondition,
  RuleOutcome,
} from "./types";

export interface RuleMatch {
  rule: PolicyRule;
  outcome: RuleOutcome;
}

function isParamRef(value: unknown): value is ParamRef {
  return Boolean(value && typeof value === "object" && "param" in value);
}

export function resolveValue(value: ConditionValue | undefined, policy: Policy): unknown {
  if (isParamRef(value)) return policy.parameters[value.param];
  return value;
}

export function numericParam(policy: Policy, name: string, fallback: number): number {
  const value = policy.parameters[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function stringParam(policy: Policy, name: string, fallback: string): string {
  const value = policy.parameters[name];
  return typeof value === "string" ? value : fallback;
}

export function booleanParam(policy: Policy, name: string, fallback: boolean): boolean {
  const value = policy.parameters[name];
  return typeof value === "boolean" ? value : fallback;
}

export function objectParam<T>(policy: Policy, name: string, fallback: T): T {
  const value = policy.parameters[name];
  return value && typeof value === "object" ? (value as T) : fallback;
}

export function resolveSuggestCount(count: RuleOutcome["suggest_count"], policy: Policy): number {
  if (typeof count === "number") return count;
  if (isParamRef(count)) {
    const resolved = policy.parameters[count.param];
    return typeof resolved === "number" ? resolved : 0;
  }
  return 0;
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return a === b;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

export function evaluateCondition(condition: RuleCondition | undefined, facts: Record<string, unknown>, policy: Policy): boolean {
  if (!condition) return true;
  if (condition.all) return condition.all.every((child) => evaluateCondition(child, facts, policy));
  if (condition.any) return condition.any.some((child) => evaluateCondition(child, facts, policy));
  if (condition.not) return !evaluateCondition(condition.not, facts, policy);
  if (!condition.fact || !condition.op) return false;

  const actual = facts[condition.fact];
  const expected = resolveValue(condition.value, policy);
  switch (condition.op) {
    case "eq":
      return same(actual, expected);
    case "neq":
      return !same(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((item) => same(actual, item));
    case "not_in":
      return Array.isArray(expected) && !expected.some((item) => same(actual, item));
    case "lt":
      return asNumber(actual) < asNumber(expected);
    case "lte":
      return asNumber(actual) <= asNumber(expected);
    case "gt":
      return asNumber(actual) > asNumber(expected);
    case "gte":
      return asNumber(actual) >= asNumber(expected);
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      const n = asNumber(actual);
      return n >= asNumber(expected[0]) && n <= asNumber(expected[1]);
    }
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "contains":
      if (Array.isArray(actual)) return actual.some((item) => same(item, expected));
      if (typeof actual === "string") return actual.includes(String(expected));
      return false;
    default:
      return false;
  }
}

export function evaluateRules(policy: Policy, facts: Record<string, unknown>): RuleMatch {
  const enabled = policy.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled !== false)
    .sort((a, b) => a.rule.priority - b.rule.priority || a.index - b.index);

  for (const { rule } of enabled) {
    if (evaluateCondition(rule.when, facts, policy)) return { rule, outcome: rule.then };
  }
  throw new Error(`No policy rule matched the requirement under policy ${policy.version}. The rule set is not exhaustive.`);
}

export function validatePolicy(policy: Policy): string[] {
  const errors: string[] = [];
  if (!policy.version) errors.push("version is required");
  if (!policy.effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(policy.effective_from)) {
    errors.push("effective_from must be YYYY-MM-DD");
  }
  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    errors.push("at least one rule is required");
  }
  const ids = new Set<string>();
  const priorities = new Set<number>();
  const routes = new Set([
    "CONTRACT_PO",
    "EMERGENCY_PO",
    "SPOT_PO",
    "RFQ",
    "RFP",
    "CAPEX_SOURCING",
    "NEW_ITEM_SOURCING",
  ]);
  for (const rule of policy.rules ?? []) {
    if (!rule.id) errors.push("rule id is required");
    if (ids.has(rule.id)) errors.push(`duplicate rule id ${rule.id}`);
    ids.add(rule.id);
    if (!Number.isFinite(rule.priority)) errors.push(`rule ${rule.id} needs a numeric priority`);
    if (priorities.has(rule.priority)) errors.push(`duplicate priority ${rule.priority}`);
    priorities.add(rule.priority);
    if (!routes.has(rule.then?.route)) errors.push(`rule ${rule.id} has an unknown route`);
    if (rule.then?.decision === "PO" && (!rule.then.supplier || !rule.then.price)) {
      errors.push(`rule ${rule.id} is a PO but lacks supplier/price strategy`);
    }
    const conditionError = validateCondition(rule.when);
    if (conditionError) errors.push(`rule ${rule.id}: ${conditionError}`);
  }
  return errors;
}

function validateCondition(condition: RuleCondition | undefined): string | null {
  if (!condition) return "empty condition";
  if (condition.all || condition.any) {
    const children = condition.all ?? condition.any ?? [];
    if (children.length === 0) return "all/any needs at least one child";
    for (const child of children) {
      const error = validateCondition(child);
      if (error) return error;
    }
    return null;
  }
  if (condition.not) return validateCondition(condition.not);
  if (!condition.fact || !condition.op) return "condition needs fact and op";
  return null;
}
