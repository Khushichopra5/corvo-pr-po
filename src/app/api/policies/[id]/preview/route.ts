import { isUuid, jsonError } from "@/lib/api";
import { previewPolicy } from "@/lib/policy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return jsonError("Policy version not found", 404);
    const body = (await request.json().catch(() => ({}))) as { runId?: string };
    return Response.json(await previewPolicy(id, body.runId));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not preview the policy");
  }
}
