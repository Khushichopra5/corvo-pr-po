import { addContract, listContracts } from "@/db/queries";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ contracts: await listContracts() });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      contractId?: string;
      supplierId?: string;
      supplierName?: string;
      startDate?: string;
      endDate?: string;
      valueCap?: number;
      consumedValue?: number;
      source?: string;
      lines?: Array<{ itemCode: string; description?: string; uom?: string; rate: number }>;
    };
    if (!body.contractId || !body.supplierId || !body.startDate || !body.endDate || !body.valueCap || !body.lines) {
      return jsonError("contractId, supplierId, startDate, endDate, valueCap and lines are required");
    }
    await addContract({
      contractId: body.contractId,
      supplierId: body.supplierId,
      supplierName: body.supplierName,
      startDate: body.startDate,
      endDate: body.endDate,
      valueCap: body.valueCap,
      consumedValue: body.consumedValue,
      source: body.source,
      actor: user.id,
      lines: body.lines,
    });
    return Response.json({ ok: true, contracts: await listContracts() });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save the contract");
  }
}
