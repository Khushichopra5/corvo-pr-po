import { getEngineData, getPolicyRecord, getRequirements, persistRun } from "@/db/queries";
import { processBatch } from "@/engine/process";
import type { RawPRLine } from "@/engine/types";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { sql } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowLocal(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      itemCode?: string;
      description?: string;
      quantity?: number;
      uom?: string;
      plant?: string;
      needByDate?: string;
      urgency?: string;
      estimatedUnitPrice?: number | null;
      requester?: string;
      department?: string;
    };
    if (!body.description || !body.quantity || !body.plant || !body.needByDate) {
      return jsonError("description, quantity, plant and needByDate are required");
    }
    if (!(body.quantity > 0)) return jsonError("Quantity must be positive");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.needByDate)) return jsonError("needByDate must be YYYY-MM-DD");
    const [countRow] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM pr_batches WHERE source = 'CHAT'`;
    const prNo = `PR-26-${String(176 + countRow.count).padStart(5, "0")}`;
    const data = await getEngineData();
    const item = body.itemCode ? data.items.find((candidate) => candidate.itemCode === body.itemCode) : null;
    const line: RawPRLine = {
      prNo,
      prLine: 1,
      createdAt: nowLocal(),
      requester: body.requester || user.name,
      department: body.department || "Unspecified",
      plant: body.plant,
      itemCode: body.itemCode ?? "",
      description: body.description,
      quantity: Number(body.quantity),
      uom: body.uom || item?.uom || "",
      estimatedUnitPrice: body.estimatedUnitPrice ?? null,
      needByDate: body.needByDate,
      urgency: body.urgency || "Normal",
      inputOrder: 0,
    };
    const policy = await getPolicyRecord();
    const result = processBatch([line], data, { policy: policy.policy });
    const persisted = await persistRun({
      filename: `chat-${prNo}.csv`,
      source: "CHAT",
      rawLines: [line],
      run: result,
      policy,
      asOf: new Date().toISOString(),
      createdBy: user.id,
    });
    const requirements = await getRequirements(persisted.runId);
    return Response.json({
      run_id: persisted.runId,
      pr_no: prNo,
      row: result.rows[0],
      requirement: requirements[0] ?? null,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create the PR");
  }
}
