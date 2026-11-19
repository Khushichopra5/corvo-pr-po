import "dotenv/config";
import {
  getEngineData,
  getLatestRun,
  getPolicyRecord,
  getPreferredList,
  getRequirements,
  getRunRows,
  listContracts,
} from "../src/db/queries";

async function main() {
  const [data, policy, latest, contracts] = await Promise.all([
    getEngineData(),
    getPolicyRecord(),
    getLatestRun(),
    listContracts(),
  ]);
  console.log("engine data", {
    items: data.items.length,
    suppliers: data.suppliers.length,
    pos: data.poHistory.length,
    contracts: data.contracts.length,
  });
  console.log("policy", policy.id, policy.policy.version, policy.policy.rules.length);
  console.log("latest run", latest?.id, latest?.summary);
  if (latest) {
    const [rows, reqs] = await Promise.all([getRunRows(latest.id), getRequirements(latest.id)]);
    console.log("rows", rows.length, "reqs", reqs.length);
    console.log("first row", rows[0]);
    console.log("first req", reqs[0]?.group_id, reqs[0]?.route, reqs[0]?.reason?.slice(0, 100));
  }
  const preferred = await getPreferredList("2026-11-01", "ITM-1048");
  console.log("preferred ITM-1048", preferred.slice(0, 3).map((row) => [row.rank, row.supplier_id, row.reference_price]));
  console.log("contracts", contracts.length, contracts.find((c) => c.contract_id === "RC-2026-033"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
