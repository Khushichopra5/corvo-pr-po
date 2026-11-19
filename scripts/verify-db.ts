import "dotenv/config";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://corvo:corvo@localhost:5433/corvo";
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, ssl: url.includes("sslmode=require") ? "require" : false });
  const [row] = await sql<
    {
      items: number;
      suppliers: number;
      pos: number;
      contracts: number;
      policies: number;
      runs: number;
      requirements: number;
      lines: number;
    }[]
  >`SELECT
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM suppliers) AS suppliers,
      (SELECT count(*)::int FROM po_history) AS pos,
      (SELECT count(*)::int FROM contracts) AS contracts,
      (SELECT count(*)::int FROM policy_versions) AS policies,
      (SELECT count(*)::int FROM processing_runs) AS runs,
      (SELECT count(*)::int FROM requirements r JOIN processing_runs run ON run.id = r.run_id JOIN pr_batches b ON b.id = run.batch_id WHERE b.source = 'SAMPLE') AS requirements,
      (SELECT count(*)::int FROM pr_lines l JOIN pr_batches b ON b.id = l.batch_id WHERE b.source = 'SAMPLE') AS lines`;
  console.log(row);
  const bad: string[] = [];
  if (row.items !== 73) bad.push(`items: expected 73, got ${row.items}`);
  if (row.suppliers !== 48) bad.push(`suppliers: expected 48, got ${row.suppliers}`);
  if (row.pos !== 468) bad.push(`PO history: expected 468, got ${row.pos}`);
  if (row.contracts < 12) bad.push(`contracts: expected at least 12, got ${row.contracts}`);
  if (row.policies < 1) bad.push("no policy versions");
  if (row.runs < 1) bad.push("no processing runs");
  if (row.requirements !== 149) bad.push(`sample requirements: expected 149, got ${row.requirements}`);
  if (row.lines !== 186) bad.push(`sample lines: expected 186, got ${row.lines}`);
  if (bad.length > 0) {
    console.error("Seed mismatch:", bad);
    process.exitCode = 1;
  } else {
    console.log("Seed verified: 73 items, 48 suppliers, 468 POs, 12+ contracts, policy + sample run 149/186.");
  }
  await sql.end();
}

main();
