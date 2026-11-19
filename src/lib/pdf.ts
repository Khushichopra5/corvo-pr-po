export interface ContractLineDraft {
  itemCode: string;
  description: string;
  uom: string;
  rate: number;
}

export interface ContractDraft {
  contractId: string;
  supplierId: string;
  supplierName: string;
  startDate: string;
  endDate: string;
  valueCap: number;
  lines: ContractLineDraft[];
  confidence: number;
  warnings: string[];
  text: string;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean);
    pages.push(strings.join(" "));
  }
  return pages.join("\n\n").trim();
}

function firstMatch(text: string, pattern: RegExp): string {
  return pattern.exec(text)?.[1]?.trim() ?? "";
}

export function parseContractText(text: string): ContractDraft {
  const warnings: string[] = [];
  const contractId = firstMatch(text, /\b(RC-\d{4}-\d{3})\b/);
  const supplierId = firstMatch(text, /Supplier ID\s*(S\d+)/i);
  const supplierName = firstMatch(text, /and\s+(.+?),\s*[A-Za-z ]*\(Supplier ID/i) ||
    firstMatch(text, /between Corvo Engineering Pvt Ltd[\s\S]*?and\s+([A-Za-z0-9 &.-]+?)\s*\(/i);
  const startDate = firstMatch(text, /valid from\s*(\d{4}-\d{2}-\d{2})\s*to/i);
  const endDate = firstMatch(text, /valid from\s*\d{4}-\d{2}-\d{2}\s*to\s*(\d{4}-\d{2}-\d{2})/i);
  const ceilingText = firstMatch(text, /not exceed\s+INR\s*([\d,]+)/i);
  const valueCap = Number(ceilingText.replace(/,/g, "")) || 0;

  const lines: ContractLineDraft[] = [];
  const linePattern =
    /\b(ITM-\d{4})\s+(.+?)\s+(NOS|KG|LTR|MTR|CYL|PAIR|SET|ROL|BKT|BRL|JOB|MON|QTR|REAM)\s+([\d,]+\.\d{2})\b/g;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(text)) !== null) {
    lines.push({
      itemCode: match[1],
      description: match[2].replace(/\s+/g, " ").trim(),
      uom: match[3],
      rate: Number(match[4].replace(/,/g, "")),
    });
  }

  if (!contractId) warnings.push("Contract number was not found.");
  if (!supplierId) warnings.push("Supplier ID was not found.");
  if (!startDate || !endDate) warnings.push("Contract term dates were not found.");
  if (!valueCap) warnings.push("Value ceiling was not found.");
  if (lines.length === 0) warnings.push("No Schedule A item/rate lines were found.");

  const found = [contractId, supplierId, startDate, endDate, valueCap, lines.length].filter(Boolean).length;
  return {
    contractId,
    supplierId,
    supplierName,
    startDate,
    endDate,
    valueCap,
    lines,
    confidence: Math.round((found / 6) * 100) / 100,
    warnings,
    text,
  };
}

export async function extractContractPdf(bytes: Uint8Array): Promise<ContractDraft> {
  const text = await extractPdfText(bytes);
  if (!text.trim()) {
    throw new Error("No text could be extracted from this PDF. It may be scanned; enter the contract manually.");
  }
  return parseContractText(text);
}
