import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { createPolicyDraft } from "@/lib/policy-service";
import { extractPdfText } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const form = await request.formData();
    const file = form.get("file");
    const textField = form.get("text");
    if (file instanceof File) {
      if (file.size > 10 * 1024 * 1024) return jsonError("Policy document is larger than 10 MB", 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let text = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        text = await extractPdfText(bytes);
      } else {
        text = await file.text();
      }
      const result = await createPolicyDraft({
        text,
        filename: file.name,
        bytes,
        mime: file.type,
        actor: user.id,
      });
      return Response.json(result);
    }
    if (typeof textField === "string" && textField.trim()) {
      const result = await createPolicyDraft({
        text: textField,
        filename: "pasted-policy.txt",
        actor: user.id,
      });
      return Response.json(result);
    }
    return jsonError("Upload a PDF/TXT/MD policy file or provide text.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Policy upload failed");
  }
}
