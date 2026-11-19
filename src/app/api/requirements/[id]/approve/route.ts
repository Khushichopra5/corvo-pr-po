import { approveRequirement, getRequirement } from "@/db/queries";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const existing = await getRequirement(id);
    if (!existing) return jsonError("Requirement not found", 404);
    const user = await getCurrentUser();
    const result = await approveRequirement(id, user.id);
    return Response.json({ ok: true, ...result, requirement: await getRequirement(id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not approve the requirement");
  }
}
