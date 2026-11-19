"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  Gauge,
  Landmark,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { DemoUser } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/chat", label: "Raise a request", icon: Bot },
  { href: "/inbox", label: "Decision inbox", icon: ClipboardList },
  { href: "/import", label: "Batch import", icon: FileSpreadsheet },
  { href: "/policy", label: "Policy", icon: ScrollText },
  { href: "/contracts", label: "Contracts", icon: Landmark },
  { href: "/suppliers", label: "Preferred suppliers", icon: Users },
  { href: "/audit", label: "Audit trail", icon: Activity },
];

export function Sidebar({ user, users }: { user: DemoUser; users: DemoUser[] }) {
  const pathname = usePathname();
  const router = useRouter();

  async function switchUser(userId: string) {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    router.refresh();
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-lg bg-slate-900 text-sm font-black text-white">C</div>
        <div>
          <div className="text-sm font-bold tracking-[0.18em] text-slate-950">CORVO</div>
          <div className="text-[11px] font-medium text-slate-500">PR → PO control tower</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${active ? "nav-link-active" : ""}`}>
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-2 px-2">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span className="text-xs font-semibold text-slate-600">Demo workspace</span>
        </div>
        <select className="input text-xs" value={user.id} onChange={(event) => switchUser(event.target.value)}>
          {users.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <div className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
          <Building2 className="size-3" />
          PUN1 Bhosari · CHK1 Chakan
        </div>
      </div>
    </aside>
  );
}
