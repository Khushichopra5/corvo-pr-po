"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { DemoUser } from "@/lib/auth";

const LINKS = [
  ["/", "Home"],
  ["/chat", "Chat"],
  ["/inbox", "Inbox"],
  ["/import", "Import"],
  ["/policy", "Policy"],
  ["/contracts", "Contracts"],
  ["/suppliers", "Suppliers"],
  ["/audit", "Audit"],
];

export function MobileNav({ user, users }: { user: DemoUser; users: DemoUser[] }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-slate-900 text-xs font-black text-white">C</div>
          <span className="text-sm font-bold tracking-[0.16em] text-slate-950">CORVO</span>
        </div>
        <select
          className="max-w-[170px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
          value={user.id}
          onChange={async (event) => {
            await fetch("/api/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: event.target.value }),
            });
            router.refresh();
          }}
        >
          {users.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 pb-2">
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
