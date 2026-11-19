export function jsonError(message: string, status = 400, details?: unknown): Response {
  return Response.json(
    { error: { message, details: details ?? null } },
    { status },
  );
}

export async function readCsvRequest(request: Request): Promise<{ text: string; filename: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Upload a CSV file in the 'file' field.");
    if (file.size > 10 * 1024 * 1024) throw new Error("CSV is larger than 10 MB.");
    return { text: await file.text(), filename: file.name || "batch.csv" };
  }
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { csv?: string; filename?: string };
    if (!body.csv) throw new Error("JSON body must contain a 'csv' string.");
    return { text: body.csv, filename: body.filename ?? "batch.csv" };
  }
  const text = await request.text();
  if (!text.trim()) throw new Error("Request body is empty.");
  if (text.length > 10 * 1024 * 1024) throw new Error("CSV is larger than 10 MB.");
  return { text, filename: "batch.csv" };
}

export function csvDownload(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const details = (error as { details?: unknown })?.details;
  return jsonError(message, 400, details);
}
