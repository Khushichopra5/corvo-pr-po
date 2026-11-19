import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://corvo:corvo@localhost:5433/corvo";
const sql = postgres(url, {
  max: 1,
  prepare: false,
  onnotice: () => {},
  ssl: url.includes("sslmode=require") ? "require" : false,
});

async function main() {
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`Applying ${file}... `);
    await sql.unsafe(text);
    console.log("ok");
  }
  console.log("Migrations complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
