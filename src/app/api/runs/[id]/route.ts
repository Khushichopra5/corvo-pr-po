import { getRequirements, getRun, getRunRows } from "@/db/queries";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = await getRun(id);
  if (!run) return jsonError("Run not found", 404);
  const [rows, requirements] = await Promise.all([getRunRows(id), getRequirements(id)]);
  return Response.json({ run, summary: run.summary, rows, requirements });
}
