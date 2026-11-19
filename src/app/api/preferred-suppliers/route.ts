import { getPreferredList } from "@/db/queries";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asOf = url.searchParams.get("as_of") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return jsonError("as_of must be YYYY-MM-DD");
  const item = url.searchParams.get("item") ?? undefined;
  const rows = await getPreferredList(asOf, item);
  return Response.json({ as_of: asOf, rows });
}
