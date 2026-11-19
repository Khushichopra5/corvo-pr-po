import { jsonError } from "@/lib/api";
import { extractContractPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Upload a signed contract PDF in the 'file' field.");
    if (file.size > 10 * 1024 * 1024) return jsonError("PDF is larger than 10 MB", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const draft = await extractContractPdf(bytes);
    return Response.json(draft);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not extract the contract PDF");
  }
}
