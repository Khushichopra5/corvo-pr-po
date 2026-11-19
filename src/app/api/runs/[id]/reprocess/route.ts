import { createRunFromCsv, getRun, getRunRawLines } from "@/db/queries";
import { getCurrentUser } from "@/lib/auth";
import { isUuid, jsonError } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { SAMPLE_HEADERS } from "@/engine/load-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return jsonError("Run not found", 404);
    const run = await getRun(id);
    if (!run) return jsonError("Run not found", 404);
    const body = (await request.json().catch(() => ({}))) as { policyVersion?: string; asOf?: string };
    if (!body.policyVersion) return jsonError("policyVersion is required");
    const lines = await getRunRawLines(id);
    if (lines.length === 0) return jsonError("This run has no source lines to reprocess");
    const csv = toCsv(
      [...SAMPLE_HEADERS],
      lines.map((line) => [
        line.prNo,
        line.prLine,
        line.createdAt,
        line.requester,
        line.department,
        line.plant,
        line.itemCode,
        line.description,
        line.quantity,
        line.uom,
        line.estimatedUnitPrice ?? "",
        line.needByDate,
        line.urgency,
      ]),
    );
    const user = await getCurrentUser();
    const created = await createRunFromCsv({
      csvText: csv,
      filename: `reprocess-${run.filename}`,
      source: "UPLOAD",
      policyVersion: body.policyVersion,
      asOf: body.asOf,
      createdBy: user.id,
    });
    return Response.json({
      run_id: created.runId,
      policy_version: created.summary.policy_version,
      summary: created.summary,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not reprocess the batch");
  }
}
