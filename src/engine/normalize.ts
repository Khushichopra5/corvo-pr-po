import type { Item } from "./types";

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bbrg\b/g, "bearing"],
  [/\bbrgs\b/g, "bearings"],
  [/\bpneu\b/g, "pneumatic"],
  [/\bhyd\b/g, "hydraulic"],
  [/\bcyl\b/g, "cylinder"],
  [/\bwelding\s+rod\b/g, "welding electrode"],
  [/\bwelding\s+rods\b/g, "welding electrode"],
];

const NOISE_TOKENS = new Set([
  "urgent",
  "repeat",
  "sample",
  "maintenance",
  "as",
  "per",
  "for",
  "the",
  "and",
  "of",
  "with",
  "please",
  "required",
  "requirement",
]);

const STOP_TOKENS = new Set(["a", "an", "the", "of", "for", "and", "with"]);

export function basicNormalise(text: string): string {
  let s = String(text ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase();
  s = s.replace(/[\u201d\u2033]/g, '"');
  s = s.replace(/(\d+(?:\.\d+)?)\s*"/g, "$1 inch ");
  s = s.replace(/"/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/&/g, " and ");
  s = s.replace(/(?<=\d)\s*[x\u00d7]\s*(?=\d)/g, " ");
  s = s.replace(/[-_/]/g, " ");
  s = s.replace(/[^a-z0-9.]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function normaliseDescription(text: string): string {
  let s = basicNormalise(text);
  for (const [pattern, replacement] of ABBREVIATIONS) s = s.replace(pattern, replacement);
  const folded: string[] = [];
  for (const token of s.split(/\s+/)) {
    if (!token || NOISE_TOKENS.has(token)) continue;
    let t = token;
    if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
    if (!STOP_TOKENS.has(t)) folded.push(t);
  }
  return folded.join(" ");
}

function tokens(text: string): Set<string> {
  return new Set(normaliseDescription(text).split(/\s+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/**
 * A difflib-style longest-common-subsequence ratio.
 * Python's SequenceMatcher is slightly different, but this captures the same
 * signal for short procurement descriptions and is deterministic.
 */
export function sequenceRatio(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const previous = new Uint16Array(b.length + 1);
  const current = new Uint16Array(b.length + 1);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] =
        a[i] === b[j]
          ? previous[j] + 1
          : Math.max(previous[j + 1], current[j]);
    }
    previous.set(current);
    current.fill(0);
  }
  return (2 * previous[b.length]) / (a.length + b.length);
}

export class ItemMatcher {
  static readonly FUZZY_MIN = 0.78;
  static readonly MARGIN_MIN = 0.04;

  private readonly items: Item[];
  private readonly byCode: Map<string, Item>;
  private readonly norm: Map<string, string>;
  private readonly tok: Map<string, Set<string>>;

  constructor(items: Item[]) {
    this.items = items;
    this.byCode = new Map(items.map((item) => [item.itemCode, item]));
    this.norm = new Map(items.map((item) => [item.itemCode, normaliseDescription(item.description)]));
    this.tok = new Map(items.map((item) => [item.itemCode, tokens(item.description)]));
  }

  search(description: string, limit = 5): Array<{ item: Item; confidence: number; note: string }> {
    const qnorm = normaliseDescription(description);
    const qtok = tokens(description);
    if (qtok.size === 0) return [];
    return this.items
      .map((item) => ({
        item,
        score: this.score(qtok, qnorm, item.itemCode),
        note: `description match for ${item.itemCode}`,
      }))
      .sort((a, b) => b.score - a.score || a.item.itemCode.localeCompare(b.item.itemCode))
      .slice(0, limit)
      .map((entry) => ({
        item: entry.item,
        confidence: Number(entry.score.toFixed(2)),
        note: entry.note,
      }));
  }

  match(itemCode: string, description: string): { item: Item | null; confidence: number; note: string } {
    const code = String(itemCode ?? "").trim();
    if (code) {
      const item = this.byCode.get(code);
      if (item) {
        const agreement = this.descriptionScore(description, code);
        let note = `item_code ${code} used as given (1.1)`;
        if (agreement < 0.45) note += `; description agreement low (${agreement.toFixed(2)})`;
        return { item, confidence: 1, note };
      }
      const fallback = this.matchDescription(description);
      if (fallback.item) {
        return {
          item: fallback.item,
          confidence: fallback.confidence,
          note: `item_code ${JSON.stringify(code)} is not in the item master; ${fallback.note}; using description match ${fallback.item.itemCode} (flagged)`,
        };
      }
      return {
        item: null,
        confidence: fallback.confidence,
        note: `item_code ${JSON.stringify(code)} is not in the item master and ${fallback.note}`,
      };
    }
    return this.matchDescription(description);
  }

  private descriptionScore(description: string, code: string): number {
    if (!description) return 1;
    return this.score(tokens(description), normaliseDescription(description), code);
  }

  private matchDescription(description: string): { item: Item | null; confidence: number; note: string } {
    const qnorm = normaliseDescription(description);
    const qtok = tokens(description);
    if (qtok.size === 0) return { item: null, confidence: 0, note: "empty description" };

    const scored = this.items
      .map((item) => ({
        score: this.score(qtok, qnorm, item.itemCode),
        code: item.itemCode,
      }))
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

    const best = scored[0];
    const second = scored[1]?.score ?? 0;
    if (best.score >= ItemMatcher.FUZZY_MIN && best.score - second >= ItemMatcher.MARGIN_MIN) {
      const item = this.byCode.get(best.code) ?? null;
      const confidence = Number(best.score.toFixed(2));
      return {
        item,
        confidence,
        note: `description ${JSON.stringify(description)} matched ${best.code} at confidence ${confidence.toFixed(2)} (next best ${second.toFixed(2)})`,
      };
    }
    return {
      item: null,
      confidence: Number(best.score.toFixed(2)),
      note: `description ${JSON.stringify(description)}: best candidate ${best.code} scored ${best.score.toFixed(2)} < threshold ${ItemMatcher.FUZZY_MIN.toFixed(2)} (next ${second.toFixed(2)})`,
    };
  }

  private score(queryTokens: Set<string>, queryNorm: string, code: string): number {
    const masterTokens = this.tok.get(code);
    const masterNorm = this.norm.get(code);
    if (!masterTokens || !masterNorm || queryTokens.size === 0 || masterTokens.size === 0) return 0;
    const same =
      queryTokens.size === masterTokens.size &&
      [...queryTokens].every((t) => masterTokens.has(t));
    if (same) return 1;

    const querySubset = [...queryTokens].every((t) => masterTokens.has(t));
    if (querySubset) {
      return 0.9 + 0.1 * (queryTokens.size / masterTokens.size);
    }
    const masterSubset = [...masterTokens].every((t) => queryTokens.has(t));
    if (masterSubset) {
      return 0.88 + 0.1 * (masterTokens.size / queryTokens.size);
    }
    const jac = jaccard(queryTokens, masterTokens);
    const seq = sequenceRatio(queryNorm, masterNorm);
    return Math.max(jac, 0.92 * seq);
  }
}
