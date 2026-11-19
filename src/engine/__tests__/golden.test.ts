import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, clonePolicy } from "../default-policy";
import { kitDir, loadSampleLines, loadSeedData } from "../load-data";
import { processBatch } from "../process";
import { validatePolicy } from "../policy";

const fixture = process.env.ORACLE_CSV ?? path.join(process.cwd(), "tests", "fixtures", "decisions_v5.csv");
const hasKit =
  fs.existsSync(path.join(kitDir(), "master_data", "item_master.csv")) &&
  fs.existsSync(path.join(kitDir(), "pr_batches", "sample_pr_batch.csv"));
const available = hasKit && fs.existsSync(fixture);

const golden = available
  ? (() => {
      const data = loadSeedData();
      const lines = loadSampleLines();
      return {
        data,
        lines,
        result: processBatch(lines, data, { policy: DEFAULT_POLICY }),
        expected: Papa.parse<Record<string, string>>(fs.readFileSync(fixture, "utf8").replace(/^\uFEFF/, ""), {
          header: true,
          skipEmptyLines: true,
        }).data,
      };
    })()
  : null;

const describeGolden = available ? describe : describe.skip;
const itWithData = available ? it : it.skip;

const columns = [
  "resolved_item_code",
  "group_id",
  "po_id",
  "decision",
  "route",
  "supplier_id",
  "unit_price",
  "group_value_inr",
  "suggested_supplier_ids",
  "policy_version",
] as const;

describeGolden("policy v5.0 golden decisions", () => {
  it("matches the independent oracle on every one of the 186 rows", () => {
    const { result, expected } = golden!;
    expect(result.rows).toHaveLength(expected.length);
    const actualByKey = new Map(result.rows.map((row) => [`${row.pr_no}|${row.pr_line}`, row] as [string, (typeof result.rows)[number]]));
    for (const expectedRow of expected) {
      const actual = actualByKey.get(`${expectedRow.pr_no}|${expectedRow.pr_line}`);
      expect(actual, `missing row ${expectedRow.pr_no}/${expectedRow.pr_line}`).toBeDefined();
      for (const column of columns) {
        expect(
          String((actual as unknown as Record<string, unknown>)[column] ?? ""),
          `${expectedRow.pr_no}/${expectedRow.pr_line} ${column}`,
        ).toBe(String(expectedRow[column] ?? ""));
      }
    }
  });

  it("produces the audited route and PO counts", () => {
    expect(golden!.result.summary).toMatchObject({
      total_pr_lines: 186,
      processed_lines: 184,
      not_processed_lines: 2,
      total_requirements: 149,
      total_pos: 82,
      sourcing_events: 55,
      new_item_requirements: 2,
      contract_po_requirements: 30,
      contract_po_lines: 33,
      consolidated_pos: 10,
      multi_line_requirements: 23,
      clubbed_lines: 58,
    });
    expect(golden!.result.summary.route_counts_requirements).toMatchObject({
      CONTRACT_PO: 30,
      SPOT_PO: 58,
      RFQ: 39,
      RFP: 4,
      EMERGENCY_PO: 6,
      CAPEX_SOURCING: 10,
      NEW_ITEM_SOURCING: 2,
    });
  });

  it("consumes the right contract ceilings", () => {
    const consumption = Object.fromEntries(
      golden!.result.summary.contract_consumption.map((row) => [row.contract_id, row.consumed_by_batch]),
    );
    expect(consumption["RC-2025-011"]).toBeCloseTo(609870.75, 2);
    expect(consumption["RC-2025-014"]).toBeCloseTo(417699.8, 2);
    expect(consumption["RC-2026-002"]).toBeCloseTo(22242, 2);
    expect(consumption["RC-2026-007"]).toBeCloseTo(740213.55, 2);
    expect(consumption["RC-2026-009"]).toBeCloseTo(155870, 2);
    expect(consumption["RC-2026-012"]).toBeCloseTo(356927.2, 2);
    expect(consumption["RC-2026-013"]).toBeCloseTo(497579.7, 2);
    expect(consumption["RC-2026-015"]).toBeCloseTo(0, 2);
    expect(consumption["RC-2026-031"]).toBeCloseTo(531775.91, 2);
    expect(consumption["RC-2026-033"]).toBeCloseTo(0, 2);
    expect(consumption["RC-2026-005"]).toBeCloseTo(0, 2);
  });

  it("keeps valuation and award price separate for worked example 6", () => {
    const row = golden!.result.rows.find((candidate) => candidate.pr_no === "PR-26-00106");
    expect(row).toMatchObject({
      route: "SPOT_PO",
      supplier_id: "S027",
      unit_price: 22,
      group_value_inr: 156170,
    });
  });

  it("keeps G0022 below the spot threshold using 3.1 value, not the award", () => {
    const row = golden!.result.rows.find((candidate) => candidate.pr_no === "PR-26-00027");
    expect(row?.route).toBe("SPOT_PO");
    expect(row?.group_value_inr).toBe(190576);
    expect(row?.unit_price).toBe(1500);
  });

  it("never awards or suggests a blocked/inactive supplier", () => {
    const blocked = new Set(["S004", "S008", "S011", "S031", "S034"]);
    for (const row of golden!.result.rows) {
      if (row.supplier_id) expect(blocked.has(row.supplier_id)).toBe(false);
      for (const id of row.suggested_supplier_ids.split(";").filter(Boolean)) {
        expect(blocked.has(id)).toBe(false);
      }
    }
  });
});

describe("policy as data", () => {
  it("validates the default policy", () => {
    expect(validatePolicy(DEFAULT_POLICY)).toEqual([]);
  });

  itWithData("changes routes when the spot limit changes, without code changes", () => {
    const amended = clonePolicy(DEFAULT_POLICY);
    amended.version = "5.1-test";
    amended.parameters.spot_po_max_inr = 150000;
    const run = processBatch(golden!.lines, golden!.data, { policy: amended });
    const baseSpot = golden!.result.summary.route_counts_requirements.SPOT_PO ?? 0;
    const amendedSpot = run.summary.route_counts_requirements.SPOT_PO ?? 0;
    expect(amendedSpot).toBeLessThan(baseSpot);
    expect(run.summary.policy_version).toBe("5.1-test");
  });

  itWithData("adds a Chakan-specific RFP rule without code changes", () => {
    const amended = clonePolicy(DEFAULT_POLICY);
    amended.version = "5.2-test";
    amended.rules.push({
      id: "R-CHK1-8L-RFP",
      clause: "5.5a",
      priority: 45,
      enabled: true,
      label: "Chakan 8L RFP",
      when: {
        all: [
          { fact: "requirement.plant", op: "eq", value: "CHK1" },
          { fact: "requirement.value", op: "gte", value: 800000 },
          { fact: "requirement.value", op: "lt", value: { param: "rfq_max_inr" } },
        ],
      },
      then: {
        decision: "SOURCING_REQUEST",
        route: "RFP",
        supplier: "NONE",
        price: "NONE",
        suggest_count: { param: "rfp_suggestions" },
      },
    });
    const run = processBatch(golden!.lines, golden!.data, { policy: amended });
    expect((run.summary.route_counts_requirements.RFP ?? 0)).toBeGreaterThan(
      golden!.result.summary.route_counts_requirements.RFP ?? 0,
    );
    expect(run.summary.policy_version).toBe("5.2-test");
  });

  it("rejects duplicate priorities", () => {
    const invalid = clonePolicy(DEFAULT_POLICY);
    invalid.rules[1].priority = invalid.rules[0].priority;
    expect(validatePolicy(invalid).some((error) => error.includes("duplicate priority"))).toBe(true);
  });
});
