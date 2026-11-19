import { getPolicyById } from "@/db/queries";
import type { Policy } from "@/engine/types";
import { getCurrentUser } from "@/lib/auth";
import { isUuid, jsonError } from "@/lib/api";
import { savePolicyDraft } from "@/lib/policy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Policy version not found", 404);
  const record = await getPolicyById(id);
  if (!record) return jsonError("Policy version not found", 404);
  return Response.json(record);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return jsonError("Policy version not found", 404);
    const user = await getCurrentUser();
    const body = (await request.json()) as { policy?: Policy; label?: string };
    if (!body.policy) return jsonError("policy is required");
    await savePolicyDraft(id, body.policy, user.id, body.label);
    const record = await getPolicyById(id);
    return Response.json(record);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save the policy draft");
  }
}
