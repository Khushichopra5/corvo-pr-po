import { getRequirement, overrideRequirement } from "@/db/queries";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTES = new Set([
  "CONTRACT_PO",
  "EMERGENCY_PO",
  "SPOT_PO",
  "RFQ",
  "RFP",
  "CAPEX_SOURCING",
  "NEW_ITEM_SOURCING",
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const existing = await getRequirement(id);
    if (!existing) return jsonError("Requirement not found", 404);
    const body = (await request.json()) as {
      route?: string;
      supplierId?: string;
      unitPrice?: number | null;
      comment?: string;
    };
    if (!body.route || !ROUTES.has(body.route)) return jsonError("A valid route is required");
    if (!body.comment?.trim()) return jsonError("A written reason is required for an override");
    const user = await getCurrentUser();
    await overrideRequirement(id, {
      actor: user.id,
      route: body.route,
      supplierId: body.supplierId,
      unitPrice: body.unitPrice,
      comment: body.comment,
    });
    return Response.json({ ok: true, requirement: await getRequirement(id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not override the requirement");
  }
}
