import { getPreferredList } from "@/db/queries";
import { csvDownload, jsonError } from "@/lib/api";
import { preferredRowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asOf = url.searchParams.get("as_of") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return jsonError("as_of must be YYYY-MM-DD");
  const item = url.searchParams.get("item") ?? undefined;
  const rows = await getPreferredList(asOf, item);
  return csvDownload(preferredRowsToCsv(rows), `preferred_suppliers_${asOf}.csv`);
}
