import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { createPolicyDraft } from "@/lib/policy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as { text?: string };
    if (!body.text?.trim()) return jsonError("Describe the policy change in text.");
    const result = await createPolicyDraft({
      text: body.text,
      filename: "policy-change-described-in-chat.txt",
      actor: user.id,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create the policy draft");
  }
}
