import { sql } from "@/db/client";
import { getLatestRun, getPolicyRecord } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [counts] = await sql<
    { items: number; suppliers: number; pos: number; contracts: number; policies: number; runs: number }[]
  >`SELECT
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM suppliers) AS suppliers,
      (SELECT count(*)::int FROM po_history) AS pos,
      (SELECT count(*)::int FROM contracts) AS contracts,
      (SELECT count(*)::int FROM policy_versions) AS policies,
      (SELECT count(*)::int FROM processing_runs) AS runs`;
  const [policy, latest] = await Promise.all([getPolicyRecord(), getLatestRun()]);
  return Response.json({
    ok: true,
    counts,
    active_policy: policy.policy.version,
    latest_run: latest?.id ?? null,
    db: Boolean(counts),
  });
}
