// Apply Jacita foundation migration to a remote Postgres (Supabase).
// Usage:
//   $env:SUPABASE_DB_PASSWORD = "your-db-password"
//   npm run db:push:remote
//
// Or:
//   npm run db:push:remote -- "your-db-password"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const projectRef = "ukftazmyipptppirfflr";
const password =
  process.argv[2] ||
  process.env.SUPABASE_DB_PASSWORD ||
  process.env.POSTGRES_PASSWORD;

if (!password) {
  console.error(
    "Missing database password.\n" +
      "Get it from Supabase → Project Settings → Database → Database password.\n" +
      'Then run: npm run db:push:remote -- "your-password"'
  );
  process.exit(1);
}

const migrationPath = path.join(
  root,
  "supabase/migrations/20260904022929_multi_tenant_foundation.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

const fallbackUrls = [
  process.env.DATABASE_URL,
  `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`,
].filter(Boolean);

async function connectWithFallback() {
  let lastError;
  for (const url of fallbackUrls) {
    const client = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastError = err;
      await client.end().catch(() => {});
    }
  }
  throw lastError;
}

async function main() {
  console.log(`Connecting to ${projectRef}…`);
  const client = await connectWithFallback();
  try {
    console.log("Applying multi_tenant_foundation migration…");
    await client.query(sql);
    console.log("Migration applied successfully.");
    const { rows } = await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('organisations','users','content','brand_profiles')
       order by table_name`
    );
    console.log(
      "Verified tables:",
      rows.map((r) => r.table_name).join(", ") || "(none)"
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
