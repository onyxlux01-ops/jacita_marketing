/**
 * Integration test runner (LOCAL Supabase only).
 *
 *   npm run db:start && npm run db:reset
 *   npm run test:integration            # all suites
 *   npm run test:integration -- roles   # suites whose file name matches
 *
 * Calls real server actions / library functions against the local database
 * with providers (Meta, TikTok) mocked. See ./hooks.mjs for the mock map.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "tests");
const filters = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.mts"))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort();

if (!files.length) {
  console.error(`No integration suites match: ${filters.join(", ")}`);
  process.exit(1);
}

for (const file of files) {
  await import(pathToFileURL(join(dir, file)).href);
}
