import "dotenv/config";
import postgres from "postgres";
import { DEFAULT_POLICY } from "../src/engine/default-policy";
import { loadSampleLines, loadSeedData } from "../src/engine/load-data";
import { processBatch } from "../src/engine/process";

const url = process.env.DATABASE_URL ?? "postgres://corvo:corvo@localhost:5433/corvo";
const sql = postgres(url, {
  max: 1,
  prepare: false,
  onnotice: () => {},
  ssl: url.includes("sslmode=require") ? "require" : false,
});
const force = process.argv.includes("--force") || process.env.SEED_FORCE === "1";

function timestamp(value: string | Date): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return value ? `${value.replace("T", " ").slice(0, 19)}` : "1970-01-01 00:00:00";
}

async function main() {
  if (!force) {
    const [row] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM items`;
    if (row.count > 0) {
      console.log("Seed already present; use --force to reset.");
      return;
    }
  }

  const data = loadSeedData();
  const rawLines = loadSampleLines();
  const policy = DEFAULT_POLICY;
  const run = processBatch(rawLines, data, { policy });

  await sql.begin(async (tx) => {
    if (force) {
      await tx`TRUNCATE TABLE chat_messages, chat_sessions, audit_events, sourcing_events, po_lines, purchase_orders, requirement_lines, requirements, processing_runs, pr_lines, pr_batches, contract_lines, contracts, po_history, suppliers, items, plants, policy_versions, documents, users RESTART IDENTITY CASCADE`;
    }

    for (const plant of data.plants) {
      await tx`INSERT INTO plants (code, name) VALUES (${plant.code}, ${plant.name}) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`;
    }
    for (const item of data.items) {
      await tx`INSERT INTO items (item_code, description, uom, category, item_type, standard_price)
        VALUES (${item.itemCode}, ${item.description}, ${item.uom}, ${item.category}, ${item.itemType}, ${item.standardPrice})
        ON CONFLICT (item_code) DO UPDATE SET description = EXCLUDED.description, uom = EXCLUDED.uom, category = EXCLUDED.category, item_type = EXCLUDED.item_type, standard_price = EXCLUDED.standard_price`;
    }
    for (const supplier of data.suppliers) {
      await tx`INSERT INTO suppliers (supplier_id, name, city, categories, status, on_time_pct, quality_rating)
        VALUES (${supplier.supplierId}, ${supplier.name}, ${supplier.city}, ${supplier.categories.join(";")}, ${supplier.status}, ${supplier.onTimePct}, ${supplier.qualityRating})
        ON CONFLICT (supplier_id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, categories = EXCLUDED.categories, status = EXCLUDED.status, on_time_pct = EXCLUDED.on_time_pct, quality_rating = EXCLUDED.quality_rating`;
    }
    for (const po of data.poHistory) {
      await tx`INSERT INTO po_history (po_number, po_date, supplier_id, item_code, quantity, uom, unit_price, plant, delivered_on_time)
        VALUES (${po.poNumber}, ${po.poDate}, ${po.supplierId}, ${po.itemCode}, ${po.quantity}, ${po.uom}, ${po.unitPrice}, ${po.plant}, ${po.deliveredOnTime})`;
    }
    for (const contract of data.contracts) {
      await tx`INSERT INTO contracts (contract_id, supplier_id, supplier_name, start_date, end_date, value_cap, consumed_value, source)
        VALUES (${contract.contractId}, ${contract.supplierId}, ${contract.supplierName}, ${contract.startDate}, ${contract.endDate}, ${contract.valueCap}, ${contract.consumedValue}, ${contract.source})
        ON CONFLICT (contract_id) DO UPDATE SET supplier_id = EXCLUDED.supplier_id, supplier_name = EXCLUDED.supplier_name, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, value_cap = EXCLUDED.value_cap, consumed_value = EXCLUDED.consumed_value, source = EXCLUDED.source`;
      for (const [itemCode, rate] of Object.entries(contract.rates)) {
        const item = data.items.find((candidate) => candidate.itemCode === itemCode);
        await tx`INSERT INTO contract_lines (contract_id, item_code, description, uom, rate)
          VALUES (${contract.contractId}, ${itemCode}, ${item?.description ?? itemCode}, ${item?.uom ?? ""}, ${rate})
          ON CONFLICT (contract_id, item_code) DO UPDATE SET rate = EXCLUDED.rate`;
      }
    }

    const [policyRow] = await tx<{ id: string }[]>`
      INSERT INTO policy_versions (policy_id, version, effective_from, status, parameters, rules, label, approved_by, approved_at)
      VALUES (${policy.policy_id}, ${policy.version}, ${policy.effective_from}, 'active', ${tx.json(policy.parameters)}, ${tx.json(policy.rules)}, ${"Policy v5.0"}, ${"Seed"}, now())
      ON CONFLICT (version) DO UPDATE SET status = policy_versions.status
      RETURNING id`;
    const policyId = policyRow.id;

    for (const user of [
      { id: "requester-asha", name: "Asha (Requester)", role: "REQUESTER" },
      { id: "buyer-ravi", name: "Ravi (Buyer)", role: "BUYER" },
      { id: "admin-meera", name: "Meera (Procurement Admin)", role: "ADMIN" },
    ]) {
      await tx`INSERT INTO users (id, name, role) VALUES (${user.id}, ${user.name}, ${user.role})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role`;
    }

    const [batchRow] = await tx<{ id: string }[]>`
      INSERT INTO pr_batches (filename, source, row_count, created_by)
      VALUES ('sample_pr_batch.csv', 'SAMPLE', ${rawLines.length}, 'seed')
      RETURNING id`;
    const batchId = batchRow.id;

    const prLineIds = new Map<number, string>();
    for (let index = 0; index < rawLines.length; index += 1) {
      const raw = rawLines[index];
      const normalized = run.normalizedLines[index];
      const [lineRow] = await tx<{ id: string }[]>`
        INSERT INTO pr_lines (batch_id, pr_no, pr_line, created_at, requester, department, plant, raw_item_code, description, quantity, uom, estimated_unit_price, need_by_date, urgency, resolved_item_code, match_confidence, match_note, validation_error, input_order)
        VALUES (${batchId}, ${raw.prNo}, ${raw.prLine}, ${timestamp(raw.createdAt)}, ${raw.requester}, ${raw.department}, ${raw.plant}, ${raw.itemCode}, ${raw.description}, ${raw.quantity}, ${raw.uom || normalized.uom}, ${raw.estimatedUnitPrice}, ${raw.needByDate || null}, ${raw.urgency || "Normal"}, ${normalized.resolvedItemCode}, ${normalized.matchConfidence}, ${normalized.matchNote}, ${normalized.processed ? null : normalized.notProcessedReason}, ${raw.inputOrder})
        RETURNING id`;
      prLineIds.set(raw.inputOrder, lineRow.id);
    }

    const [runRow] = await tx<{ id: string }[]>`
      INSERT INTO processing_runs (batch_id, policy_version_id, policy_version, as_of, status, summary, created_by)
      VALUES (${batchId}, ${policyId}, ${policy.version}, now(), 'READY', ${tx.json(run.summary)}, 'seed')
      RETURNING id`;
    const runId = runRow.id;

    for (const requirement of run.requirements) {
      const first = requirement.lines[0];
      const [reqRow] = await tx<{ id: string }[]>`
        INSERT INTO requirements (run_id, group_id, item_code, item_description, plant, first_pr_no, first_pr_line, first_created_at, need_by_date, is_emergency, quantity, valuation_price, po_unit_price, group_value_inr, decision, route, supplier_id, contract_id, po_id, suggested_supplier_ids, reason, evidence, clause, matched_rule, requires_approval, status)
        VALUES (${runId}, ${requirement.groupId}, ${requirement.itemCode}, ${requirement.item?.description ?? first.description}, ${requirement.plant}, ${first.prNo}, ${first.prLine}, ${timestamp(requirement.createdAt ?? "")}, ${requirement.needByDate || null}, ${requirement.emergency}, ${requirement.quantity}, ${requirement.valuationPrice}, ${requirement.poUnitPrice}, ${requirement.groupValueExact === null ? null : Math.round(requirement.groupValueExact * 100) / 100}, ${requirement.decision}, ${requirement.route}, ${requirement.supplierId || null}, ${requirement.contractId || null}, ${requirement.poId || null}, ${requirement.suggestions.join(";")}, ${requirement.reason}, ${tx.json(requirement.evidence)}, ${requirement.clause || null}, ${requirement.matchedRule || null}, ${requirement.requiresApproval || null}, 'PENDING')
        RETURNING id`;
      for (const line of requirement.lines) {
        const prLineId = prLineIds.get(line.inputOrder);
        if (prLineId) {
          await tx`INSERT INTO requirement_lines (requirement_id, pr_line_id) VALUES (${reqRow.id}, ${prLineId}) ON CONFLICT DO NOTHING`;
        }
      }
    }
  });

  console.log(
    `Seeded ${data.items.length} items, ${data.suppliers.length} suppliers, ${data.poHistory.length} POs, ${data.contracts.length} contracts, and sample run ${run.summary.total_requirements} requirements / ${run.summary.total_pos} POs.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
