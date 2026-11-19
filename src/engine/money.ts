export function toPaise(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function roundRupee(value: number): number {
  return Math.floor((toPaise(value) + 50) / 100);
}

export function roundTo2(value: number): number {
  return toPaise(value) / 100;
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function formatMoney(value: number, digits = 2): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatRupees(value: number): string {
  return formatMoney(value, 0);
}

export function dateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, 10);
}

export function parseDateOnly(value: string): string {
  const trimmed = String(value ?? "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return match ? match[1] : "";
}

export function parseTimestamp(value: string): Date | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const iso = trimmed.replace(" ", "T");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function timestampIso(value: string): string {
  const d = parseTimestamp(value);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function dateDiffDays(a: string, b: string): number {
  const [ay, am, ad] = a.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = b.slice(0, 10).split("-").map(Number);
  const au = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
  const bu = Date.UTC(by, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((au - bu) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function hoursBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 3_600_000;
}
