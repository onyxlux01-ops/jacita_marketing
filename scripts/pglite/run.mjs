// Runs every scripts/pglite/*.test.mjs with node:test. See db.mjs for scope.
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort()
  .map((f) => join(dir, f));

const stream = run({ files, concurrency: 1 });
stream.on("test:fail", () => {
  process.exitCode = 1;
});
stream.compose(spec).pipe(process.stdout);
