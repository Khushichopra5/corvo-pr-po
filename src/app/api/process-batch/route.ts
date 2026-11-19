import { createRunFromCsv, getRunRows, CsvValidationError } from "@/db/queries";
import { getCurrentUser } from "@/lib/auth";
import { csvDownload, errorResponse, jsonError, readCsvRequest } from "@/lib/api";
import { decisionRowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { text, filename } = await readCsvRequest(request);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";
    const policyVersion = url.searchParams.get("policy_version") ?? undefined;
    const asOf = url.searchParams.get("as_of") ?? undefined;
    const user = await getCurrentUser();
    const created = await createRunFromCsv({
      csvText: text,
      filename,
      source: "UPLOAD",
      policyVersion,
      asOf,
      createdBy: user.id,
    });
    const rows = await getRunRows(created.runId);
    if (format === "csv") {
      return csvDownload(
        decisionRowsToCsv(rows),
        `decisions_${created.summary.policy_version}_${created.runId.slice(0, 8)}.csv`,
      );
    }
    return Response.json({
      run_id: created.runId,
      policy_version: created.summary.policy_version,
      summary: created.summary,
      rows,
    });
  } catch (error) {
    if (error instanceof CsvValidationError) return jsonError(error.message, 400, error.details);
    return errorResponse(error);
  }
}
