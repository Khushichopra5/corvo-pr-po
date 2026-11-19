import { DEFAULT_POLICY, clonePolicy } from "@/engine/default-policy";
import { validatePolicy } from "@/engine/policy";
import type { Policy, PolicyRule, RuleCondition } from "@/engine/types";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nextMinorVersion(version: string): string {
  const match = /^(\d+)\.(\d+)/.exec(version);
  if (!match) return "5.1";
  return `${match[1]}.${Number(match[2]) + 1}`;
}

export function extractEffectiveDate(text: string): string | null {
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text);
  if (iso) return iso[1];
  const long = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i.exec(text);
  if (long) {
    const month = MONTHS[long[2].toLowerCase()];
    return `${long[3]}-${pad(month)}-${pad(Number(long[1]))}`;
  }
  const short = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(20\d{2})\b/i.exec(text);
  if (short) {
    const month = MONTHS[short[2].toLowerCase()];
    return `${short[3]}-${pad(month)}-${pad(Number(short[1]))}`;
  }
  return null;
}

function amountFromMatch(raw: string, unit?: string): number {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  if (!unit) return n;
  const u = unit.toLowerCase();
  if (u === "lakh" || u === "lakhs" || u === "lac" || u === "lacs" || u === "l") return Math.round(n * 100000);
  if (u === "crore" || u === "cr") return Math.round(n * 10000000);
  return n;
}

function findUpperBound(text: string, lower: number): number | null {
  const range = /(?:or more|and above)\s*(?:but\s*)?(?:below|under|less\s+than)\s*(?:₹|INR|Rs\.?)?\s*([\d][\d,]*(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|L|crore|cr)?/i.exec(text);
  if (range) {
    const value = amountFromMatch(range[1], range[2]);
    if (value > lower) return value;
  }
  const between = /between\s*(?:₹|INR|Rs\.?)?\s*([\d][\d,]*(?:\.\d+)?)\s*(?:and|to)\s*(?:₹|INR|Rs\.?)?\s*([\d][\d,]*(?:\.\d+)?)/i.exec(text);
  if (between) {
    const value = amountFromMatch(between[2]);
    if (value > lower) return value;
  }
  return null;
}

function findAmountNear(text: string, keyword: string): number | null {
  const lower = text.toLowerCase();
  let index = lower.indexOf(keyword.toLowerCase());
  while (index >= 0) {
    const window = text.slice(index, Math.min(text.length, index + 180));
    const pattern = /(?:₹|INR|Rs\.?)?\s*([\d][\d,]*(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|L|crore|cr)?/gi;
    let match: RegExpExecArray | null;
    const values: number[] = [];
    while ((match = pattern.exec(window)) !== null) {
      const value = amountFromMatch(match[1], match[2]);
      const hasCurrencyOrComma = /₹|INR|Rs\.?/i.test(match[0]) || match[1].includes(",");
      if (!hasCurrencyOrComma && value >= 1900 && value <= 2100) continue;
      if (value >= 1000) values.push(value);
    }
    if (values.length > 0) {
      // "replace X with Y" / "from X to Y" means Y is the new value.
      // The word "replace" often appears just before the keyword, so inspect
      // a small context before the keyword too.
      const context = text.slice(Math.max(0, index - 100), Math.min(text.length, index + 220));
      const replacement = /\b(?:replace|from)\b/i.test(context);
      const marker = /\b(?:with|to)\b/i.exec(window);
      if (replacement && marker) {
        const after = window.slice(marker.index + marker[0].length);
        const candidate = /(?:₹|INR|Rs\.?)?\s*([\d][\d,]*(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|L|crore|cr)?/i.exec(after);
        if (candidate) {
          const value = amountFromMatch(candidate[1], candidate[2]);
          if (value >= 1000) return value;
        }
      }
      return values[0];
    }
    index = lower.indexOf(keyword.toLowerCase(), index + keyword.length);
  }
  return null;
}

function ensureRule(policy: Policy, rule: PolicyRule): void {
  const index = policy.rules.findIndex((candidate) => candidate.id === rule.id);
  if (index >= 0) policy.rules[index] = rule;
  else policy.rules.push(rule);
}

export interface PolicyChange {
  kind: "parameter" | "rule-added" | "rule-removed" | "rule-changed" | "version" | "effective-date";
  label: string;
  before?: unknown;
  after?: unknown;
}

export interface PolicyDraftResult {
  draft: Policy;
  changes: PolicyChange[];
  warnings: string[];
  errors: string[];
  extractedText: string;
}

export function diffPolicies(before: Policy, after: Policy): PolicyChange[] {
  const changes: PolicyChange[] = [];
  if (before.version !== after.version) {
    changes.push({ kind: "version", label: "Version", before: before.version, after: after.version });
  }
  if (before.effective_from !== after.effective_from) {
    changes.push({
      kind: "effective-date",
      label: "Effective date",
      before: before.effective_from,
      after: after.effective_from,
    });
  }
  const keys = new Set([...Object.keys(before.parameters), ...Object.keys(after.parameters)]);
  for (const key of [...keys].sort()) {
    const oldValue = before.parameters[key];
    const newValue = after.parameters[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        kind: "parameter",
        label: key,
        before: oldValue,
        after: newValue,
      });
    }
  }
  const oldRules = new Map(before.rules.map((rule) => [rule.id, rule]));
  const newRules = new Map(after.rules.map((rule) => [rule.id, rule]));
  for (const [id, rule] of newRules) {
    const oldRule = oldRules.get(id);
    if (!oldRule) changes.push({ kind: "rule-added", label: `${id} (${rule.clause})`, after: rule });
    else if (JSON.stringify(oldRule) !== JSON.stringify(rule)) {
      changes.push({ kind: "rule-changed", label: `${id} (${rule.clause})`, before: oldRule, after: rule });
    }
  }
  for (const [id, rule] of oldRules) {
    if (!newRules.has(id)) changes.push({ kind: "rule-removed", label: `${id} (${rule.clause})`, before: rule });
  }
  return changes;
}

export function plainLanguageChanges(changes: PolicyChange[]): string[] {
  return changes.map((change) => {
    if (change.kind === "parameter") {
      return `${humanParameter(change.label)}: ${formatValue(change.before)} → ${formatValue(change.after)}.`;
    }
    if (change.kind === "rule-added") {
      const rule = change.after as PolicyRule;
      return `New rule ${rule.id} (clause ${rule.clause}, priority ${rule.priority}) routes matching requirements to ${rule.then.route}.`;
    }
    if (change.kind === "rule-removed") {
      const rule = change.before as PolicyRule;
      return `Rule ${rule.id} (clause ${rule.clause}) is removed.`;
    }
    if (change.kind === "rule-changed") {
      const rule = change.after as PolicyRule;
      return `Rule ${rule.id} (clause ${rule.clause}) changes; it now routes matching requirements to ${rule.then.route}.`;
    }
    if (change.kind === "version") return `Version changes from ${String(change.before)} to ${String(change.after)}.`;
    return `Effective date changes from ${String(change.before)} to ${String(change.after)}.`;
  });
}

function humanParameter(key: string): string {
  const labels: Record<string, string> = {
    spot_po_max_inr: "Spot PO limit",
    emergency_po_max_inr: "Emergency PO limit",
    rfq_max_inr: "RFQ/RFP threshold",
    rfq_suggestions: "RFQ suggestion count",
    rfp_suggestions: "RFP suggestion count",
    capex_suggestions: "Capex suggestion count",
    consolidation_hours: "PO consolidation window (hours)",
    clubbing_created_days: "Clubbing window (days)",
    clubbing_need_by_days: "Need-by tolerance (days)",
    valuation_po_lookback_days: "Valuation PO lookback (days)",
    preferred_po_lookback_days: "Preferred-list PO lookback (days)",
    frequency_cap: "Ranking frequency cap",
  };
  return labels[key] ?? key.replaceAll("_", " ");
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString("en-IN");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function extractPolicyDraft(text: string, current: Policy = DEFAULT_POLICY): PolicyDraftResult {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.includes('"rules"')) {
    try {
      const parsed = JSON.parse(trimmed) as Policy;
      const draft: Policy = {
        ...clonePolicy(current),
        ...parsed,
        status: "draft",
        parameters: parsed.parameters ?? current.parameters,
        rules: parsed.rules ?? current.rules,
      };
      const errors = validatePolicy(draft);
      return {
        draft,
        changes: diffPolicies(current, draft),
        warnings: errors,
        errors,
        extractedText: text,
      };
    } catch (error) {
      return {
        draft: { ...clonePolicy(current), status: "draft" },
        changes: [],
        warnings: [`The pasted JSON could not be parsed: ${(error as Error).message}`],
        errors: ["Invalid JSON"],
        extractedText: text,
      };
    }
  }

  const looksLikeFullPolicy =
    /1\.1[\s\S]{0,160}Every PR line/i.test(text) &&
    /8\.1[\s\S]{0,160}Every decision/i.test(text);
  if (looksLikeFullPolicy) {
    const draft = clonePolicy(current);
    draft.version = nextMinorVersion(current.version);
    draft.status = "draft";
    draft.effective_from = extractEffectiveDate(text) ?? today();
    return {
      draft,
      changes: [],
      warnings: [
        "This looks like a full policy document, not a short amendment. No values were guessed; review and edit the structured parameters/rules before approval.",
      ],
      errors: [],
      extractedText: text,
    };
  }

  const draft = clonePolicy(current);
  draft.version = nextMinorVersion(current.version);
  draft.status = "draft";
  draft.effective_from = extractEffectiveDate(text) ?? today();
  const warnings: string[] = [];
  const lower = text.toLowerCase();

  if (lower.includes("spot")) {
    const value = findAmountNear(text, "spot");
    if (value) draft.parameters.spot_po_max_inr = value;
  }
  if (lower.includes("emergency")) {
    const value = findAmountNear(text, "emergency");
    if (value) draft.parameters.emergency_po_max_inr = value;
  }
  if (lower.includes("consolidat")) {
    const match = /(\d{1,3})\s*(?:hours|hrs)/i.exec(text);
    if (match) draft.parameters.consolidation_hours = Number(match[1]);
  }
  if (lower.includes("club")) {
    const match = /(\d{1,2})\s*(?:calendar\s*)?days/i.exec(text);
    if (match) draft.parameters.clubbing_created_days = Number(match[1]);
  }

  const plantMatch = /\b(CHK1|Chakan|PUN1|Bhosari)\b/i.exec(text);
  if (plantMatch) {
    const plant = /chakan|chk1/i.test(plantMatch[1]) ? "CHK1" : "PUN1";
    const route = /\bRFP\b/i.test(text) ? "RFP" : /\bRFQ\b/i.test(text) ? "RFQ" : /\bSPOT_PO\b/i.test(text) ? "SPOT_PO" : "";
    const amount = findAmountNear(text, plantMatch[1]);
    const upper = amount ? findUpperBound(text, amount) : null;
    if (route && amount) {
      const suggest = route === "RFP" ? { param: "rfp_suggestions" } : route === "RFQ" ? { param: "rfq_suggestions" } : undefined;
      const conditions: RuleCondition[] = [
        { fact: "requirement.plant", op: "eq", value: plant },
        { fact: "requirement.value", op: "gte", value: amount },
      ];
      if (upper) conditions.push({ fact: "requirement.value", op: "lt", value: upper });
      ensureRule(draft, {
        id: `R-${plant}-${amount}-${upper ?? "PLUS"}-${route}`,
        clause: "5.5a",
        priority: 45,
        enabled: true,
        label: `${plant} ${formatValue(amount)}${upper ? `-${formatValue(upper)}` : "+"} ${route} rule`,
        when: { all: conditions },
        then: {
          decision: route === "SPOT_PO" ? "PO" : "SOURCING_REQUEST",
          route: route as PolicyRule["then"]["route"],
          supplier: route === "SPOT_PO" ? "PREFERRED_RANK_1" : "NONE",
          price: route === "SPOT_PO" ? "REFERENCE_PRICE" : "NONE",
          suggest_count: suggest,
        },
      });
    } else if (route && !amount) {
      warnings.push("A plant-specific rule was mentioned but no threshold amount could be read. Use the structured editor.");
    }
  }

  const categories = [
    "Office & IT",
    "Safety & PPE",
    "Electrical Spares",
    "Steel & Metals",
    "Fasteners",
    "Packaging",
    "Lubricants",
    "Facility Services",
    "Testing & Calibration",
    "Capital Equipment",
  ];
  const category = categories.find((candidate) => lower.includes(candidate.toLowerCase()));
  const categoryRoute = /\bRFP\b/i.test(text) ? "RFP" : /\bRFQ\b/i.test(text) ? "RFQ" : "";
  if (category && categoryRoute) {
    ensureRule(draft, {
      id: `R-CAT-${category.replace(/[^A-Z0-9]+/gi, "-").toUpperCase()}-${categoryRoute}`,
      clause: "5.5b",
      priority: 46,
      enabled: true,
      label: `${category} ${categoryRoute} rule`,
      when: { fact: "item.category", op: "eq", value: category },
      then: {
        decision: "SOURCING_REQUEST",
        route: categoryRoute as PolicyRule["then"]["route"],
        supplier: "NONE",
        price: "NONE",
        suggest_count: categoryRoute === "RFP" ? { param: "rfp_suggestions" } : { param: "rfq_suggestions" },
      },
    });
  }

  const changes = diffPolicies(current, draft);
  if (changes.length === 0) {
    warnings.push("No supported change was detected. Use the structured editor to add the amendment.");
  }
  const errors = validatePolicy(draft);
  return { draft, changes, warnings, errors, extractedText: text };
}

export function policyRuleSummary(rule: PolicyRule): string {
  const when = rule.when.fact
    ? `${rule.when.fact} ${rule.when.op ?? ""} ${JSON.stringify(rule.when.value ?? "")}`
    : JSON.stringify(rule.when);
  return `If ${when} → ${rule.then.route}${rule.then.suggest_count ? ` (${JSON.stringify(rule.then.suggest_count)})` : ""}`;
}
