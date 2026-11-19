import { getEngineData } from "@/db/queries";
import { ItemMatcher } from "@/engine/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 5), 1), 10);
  if (!query) return Response.json({ items: [] });
  const data = await getEngineData();
  const matcher = new ItemMatcher(data.items);
  const items = matcher.search(query, limit).map((entry) => ({
    itemCode: entry.item.itemCode,
    description: entry.item.description,
    uom: entry.item.uom,
    category: entry.item.category,
    itemType: entry.item.itemType,
    standardPrice: entry.item.standardPrice,
    confidence: entry.confidence,
  }));
  return Response.json({ items });
}
