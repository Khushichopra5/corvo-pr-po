import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DEMO_USERS, getCurrentUser } from "@/lib/auth";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corvo | PR → PO control tower",
  description: "Policy-driven procurement decisions for Corvo Engineering",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <Sidebar user={user} users={DEMO_USERS} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav user={user} users={DEMO_USERS} />
            <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            <footer className="border-t border-slate-200 px-6 py-4 text-[11px] text-slate-400">
              Corvo Engineering · fictional procurement workspace · policy v5.0 · values exclude GST
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
