import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export const ROUTE_TONES: Record<string, string> = {
  CONTRACT_PO: "bg-blue-50 text-blue-700 ring-blue-200",
  EMERGENCY_PO: "bg-rose-50 text-rose-700 ring-rose-200",
  SPOT_PO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  RFQ: "bg-amber-50 text-amber-800 ring-amber-200",
  RFP: "bg-violet-50 text-violet-700 ring-violet-200",
  CAPEX_SOURCING: "bg-slate-100 text-slate-700 ring-slate-200",
  NEW_ITEM_SOURCING: "bg-teal-50 text-teal-700 ring-teal-200",
  NOT_PROCESSED: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export const ROUTE_LABELS: Record<string, string> = {
  CONTRACT_PO: "Contract PO",
  EMERGENCY_PO: "Emergency PO",
  SPOT_PO: "Spot PO",
  RFQ: "RFQ",
  RFP: "RFP",
  CAPEX_SOURCING: "Capex sourcing",
  NEW_ITEM_SOURCING: "New item sourcing",
  NOT_PROCESSED: "Not processed",
};

export function RouteBadge({ route }: { route: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${ROUTE_TONES[route] ?? ROUTE_TONES.NOT_PROCESSED}`}>
      {ROUTE_LABELS[route] ?? route}
    </span>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "blue" | "violet";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {children ? <div className="mt-2 text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}

export function Money({ value, digits = 0 }: { value: number | null | undefined; digits?: number }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="text-slate-400">—</span>;
  return <span className="tabular-nums">₹{value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
