export type ParsedDraft = {
  description?: string;
  quantity?: number;
  uom?: string;
  plant?: string;
  needByDate?: string;
  urgency?: string;
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function iso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function removeDatePhrases(text: string): { cleaned: string; date?: string } {
  let cleaned = text;
  const isoMatch = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(cleaned);
  if (isoMatch) {
    cleaned = cleaned.replace(isoMatch[0], " ");
    return { cleaned, date: isoMatch[1] };
  }
  const byMatch = /\b(?:by|on|before)\s+(\d{1,2})\s+([A-Za-z]+)(?:\s+(20\d{2}))?/i.exec(cleaned);
  if (byMatch) {
    const month = MONTHS[byMatch[2].toLowerCase()];
    if (month) {
      const year = byMatch[3] ? Number(byMatch[3]) : new Date().getFullYear();
      const date = `${year}-${String(month).padStart(2, "0")}-${byMatch[1].padStart(2, "0")}`;
      cleaned = cleaned.replace(byMatch[0], " ");
      return { cleaned, date };
    }
  }
  const nextFriday = /\bnext\s+friday\b/i.exec(cleaned);
  if (nextFriday) {
    const now = new Date();
    const day = now.getDay();
    let add = (5 - day + 7) % 7;
    if (add === 0) add = 7;
    const target = new Date(now);
    target.setDate(now.getDate() + add);
    cleaned = cleaned.replace(nextFriday[0], " ");
    return { cleaned, date: iso(target) };
  }
  const tomorrow = /\btomorrow\b/i.exec(cleaned);
  if (tomorrow) {
    const target = new Date();
    target.setDate(target.getDate() + 1);
    cleaned = cleaned.replace(tomorrow[0], " ");
    return { cleaned, date: iso(target) };
  }
  return { cleaned };
}

export function parseDraft(text: string): ParsedDraft {
  const draft: ParsedDraft = {};
  const lower = text.toLowerCase();
  if (/\bchakan\b|\bchk1\b/.test(lower)) draft.plant = "CHK1";
  else if (/\bbhosari\b|\bpun1\b|\bpune\b/.test(lower)) draft.plant = "PUN1";
  if (/\bemergency\b/.test(lower)) draft.urgency = "Emergency";
  if (/\bnormal\b/.test(lower) && !draft.urgency) draft.urgency = "Normal";

  const { cleaned, date } = removeDatePhrases(text);
  if (date) draft.needByDate = date;

  const qtyMatch = /(?:need|want|order|raise|require|buy)\s+(\d[\d,]{0,6})\b|^\s*(\d[\d,]{0,6})\b/i.exec(cleaned);
  let withoutQty = cleaned;
  if (qtyMatch) {
    const raw = qtyMatch[1] ?? qtyMatch[2];
    const value = Number(raw.replace(/,/g, ""));
    if (value > 0) {
      draft.quantity = value;
      withoutQty = cleaned.replace(qtyMatch[0], " ");
    }
  }
  const unitMatch = /\b(nos|pcs|pair|pairs|kg|kgs|ltr|ltrs|mtr|mtrs|roll|rolls|set|sets|job|jobs|cyl|ream|reams|box|boxes)\b/i.exec(text);
  if (unitMatch) {
    const map: Record<string, string> = {
      nos: "NOS", pcs: "NOS", pair: "PAIR", pairs: "PAIR", kg: "KG", kgs: "KG", ltr: "LTR", ltrs: "LTR",
      mtr: "MTR", mtrs: "MTR", roll: "ROL", rolls: "ROL", set: "SET", sets: "SET", job: "JOB", jobs: "JOB",
      cyl: "CYL", ream: "REAM", reams: "REAM", box: "BOX", boxes: "BOX",
    };
    draft.uom = map[unitMatch[1].toLowerCase()];
  }

  const query = withoutQty
    .replace(/\b(?:need|needs|please|want|require|required|order|buy|raise|create|for|by|on|before|the|a|an|and|to|at|of|my|we|i|chakan|chk1|bhosari|pun1|pune)\b/gi, " ")
    .replace(/\b(?:normal|emergency|urgent|asap|nos|pcs|pair|pairs|kg|kgs|ltr|ltrs|mtr|mtrs|roll|rolls|set|sets|job|jobs|cyl|ream|reams|box|boxes)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (query) draft.description = query;
  return draft;
}

export function extractPrice(text: string): number | undefined {
  const match = /(?:₹|INR|Rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)/i.exec(text);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
