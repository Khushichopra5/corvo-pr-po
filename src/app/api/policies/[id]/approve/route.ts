import { approvePolicyVersion, getPolicyById } from "@/db/queries";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const record = await getPolicyById(id);
    if (!record) return jsonError("Policy version not found", 404);
    const body = (await request.json()) as { effectiveFrom?: string; note?: string };
    const effectiveFrom = body.effectiveFrom ?? record.policy.effective_from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return jsonError("effectiveFrom must be YYYY-MM-DD");
    const user = await getCurrentUser();
    const result = await approvePolicyVersion(id, {
      actor: user.id,
      effectiveFrom,
      note: body.note,
    });
    return Response.json({ ...result, policy: await getPolicyById(id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not approve the policy");
  }
}
