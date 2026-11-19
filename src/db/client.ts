import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://corvo:corvo@localhost:5433/corvo";

const globalForDb = globalThis as unknown as {
  corvoSql?: ReturnType<typeof postgres>;
};

export const sql =
  globalForDb.corvoSql ??
  postgres(connectionString, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: connectionString.includes("sslmode=require") ? "require" : false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.corvoSql = sql;
