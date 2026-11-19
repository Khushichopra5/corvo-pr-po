import {
  createDocument,
  getEngineData,
  getLatestRun,
  getPolicyById,
  getPolicyRecord,
  getRunRawLines,
  getRunRows,
  insertPolicyDraft,
  updatePolicyDraft,
} from "@/db/queries";
import { processBatch } from "@/engine/process";
import type { Policy } from "@/engine/types";
import {
  diffPolicies,
  extractPolicyDraft,
  nextMinorVersion,
  plainLanguageChanges,
  type PolicyChange,
} from "@/lib/policy";

export interface DraftResult {
  id: string;
  draft: Policy;
  changes: PolicyChange[];
  plain: string[];
  warnings: string[];
  errors: string[];
  documentId: string | null;
}

async function uniqueVersion(base: string): Promise<string> {
  let version = base;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const existing = await getPolicyRecord(version);
    if (!existing.id) return version;
    version = nextMinorVersion(version);
  }
  return `${base}-${Date.now()}`;
}

export async function createPolicyDraft(input: {
  text: string;
  filename: string;
  bytes?: Uint8Array | null;
  mime?: string;
  actor: string;
}): Promise<DraftResult> {
  if (!input.text.trim()) throw new Error("The policy document has no readable text.");
  const current = await getPolicyRecord();
  const result = extractPolicyDraft(input.text, current.policy);
  result.draft.version = await uniqueVersion(result.draft.version);
  const changes = diffPolicies(current.policy, result.draft);
  const plain = plainLanguageChanges(changes);
  const documentId = await createDocument({
    kind: "POLICY",
    filename: input.filename,
    mime: input.mime,
    bytes: input.bytes ?? null,
    text: input.text,
    parsed: result.draft,
    uploadedBy: input.actor,
  });
  const id = await insertPolicyDraft(result.draft, {
    actor: input.actor,
    label: `Draft ${result.draft.version} from ${input.filename}`,
    diffSummary: { changes, plain },
    sourceDocumentId: documentId,
  });
  return {
    id,
    draft: result.draft,
    changes,
    plain,
    warnings: result.warnings,
    errors: result.errors,
    documentId,
  };
}

export async function savePolicyDraft(
  id: string,
  policy: Policy,
  actor: string,
  label?: string,
): Promise<void> {
  const current = await getPolicyById(id);
  if (!current) throw new Error("Policy draft not found");
  const changes = diffPolicies(current.policy, policy);
  await updatePolicyDraft(id, policy, {
    actor,
    label,
    diffSummary: { changes, plain: plainLanguageChanges(changes) },
  });
}

export async function previewPolicy(id: string, runId?: string): Promise<{
  runId: string;
  basePolicy: string;
  draftPolicy: string;
  changed: number;
  changedRows: Array<{ pr_no: string; pr_line: number; before: string; after: string }>;
  beforeCounts: Record<string, number>;
  afterCounts: Record<string, number>;
}> {
  const draft = await getPolicyById(id);
  if (!draft) throw new Error("Policy draft not found");
  const latestRunId = runId ?? (await getLatestRun())?.id;
  if (!latestRunId) throw new Error("No processed batch is available for a preview.");
  const baseRows = await getRunRows(latestRunId);
  const lines = await getRunRawLines(latestRunId);
  const data = await getEngineData();
  const result = processBatch(lines, data, { policy: draft.policy });
  const beforeByKey = new Map(baseRows.map((row) => [`${row.pr_no}|${row.pr_line}`, row]));
  const changedRows: Array<{ pr_no: string; pr_line: number; before: string; after: string }> = [];
  const afterCounts: Record<string, number> = {};
  for (const row of result.rows) {
    afterCounts[row.route] = (afterCounts[row.route] ?? 0) + 1;
    const before = beforeByKey.get(`${row.pr_no}|${row.pr_line}`);
    if (
      !before ||
      before.route !== row.route ||
      before.supplier_id !== row.supplier_id ||
      String(before.unit_price ?? "") !== String(row.unit_price ?? "") ||
      String(before.group_value_inr ?? "") !== String(row.group_value_inr ?? "")
    ) {
      changedRows.push({
        pr_no: row.pr_no,
        pr_line: row.pr_line,
        before: before ? `${before.route}${before.supplier_id ? ` (${before.supplier_id})` : ""}` : "—",
        after: `${row.route}${row.supplier_id ? ` (${row.supplier_id})` : ""}`,
      });
    }
  }
  const beforeCounts: Record<string, number> = {};
  for (const row of baseRows) beforeCounts[row.route] = (beforeCounts[row.route] ?? 0) + 1;
  return {
    runId: latestRunId,
    basePolicy: (await getPolicyRecord()).policy.version,
    draftPolicy: draft.policy.version,
    changed: changedRows.length,
    changedRows: changedRows.slice(0, 100),
    beforeCounts,
    afterCounts,
  };
}
