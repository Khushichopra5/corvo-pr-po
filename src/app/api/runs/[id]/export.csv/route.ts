import { getRun, getRunRows } from "@/db/queries";
import { csvDownload, jsonError } from "@/lib/api";
import { decisionRowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = await getRun(id);
  if (!run) return jsonError("Run not found", 404);
  const rows = await getRunRows(id);
  return csvDownload(
    decisionRowsToCsv(rows),
    `decisions_${run.policyVersion}_${id.slice(0, 8)}.csv`,
  );
}
