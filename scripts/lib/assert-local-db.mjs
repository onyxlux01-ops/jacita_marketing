/**
 * Localhost guard for every script that talks to a Supabase database.
 *
 * Test and reset scripts must only ever run against the local Supabase stack
 * (`supabase start`). This module throws unless the Supabase API URL (and the
 * Postgres URL, when given) points at 127.0.0.1 / localhost / ::1.
 *
 * It also refuses to read `.env.local`, which points at the live remote
 * project. Load `.env.test` instead.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function hostOf(raw, label) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`[assert-local-db] ${label} is not a valid URL: ${raw}`);
  }
  return parsed.hostname;
}

/** Throws unless `url` points at a local host. */
export function assertLocalUrl(url, label = "Supabase URL") {
  if (!url) {
    throw new Error(`[assert-local-db] ${label} is missing`);
  }
  const host = hostOf(url, label);
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `[assert-local-db] Refusing to run: ${label} host is "${host}". ` +
        "Only 127.0.0.1 / localhost are allowed (local Supabase stack)."
    );
  }
  return url;
}

/**
 * Validate the Supabase-related variables in `env` (defaults to process.env).
 * Checks NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL and SUPABASE_DB_URL when set.
 */
export function assertLocalSupabaseEnv(env = process.env) {
  const apiUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  assertLocalUrl(apiUrl, "NEXT_PUBLIC_SUPABASE_URL");
  if (env.SUPABASE_URL) assertLocalUrl(env.SUPABASE_URL, "SUPABASE_URL");
  if (env.SUPABASE_DB_URL) assertLocalUrl(env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  if (env.DATABASE_URL) assertLocalUrl(env.DATABASE_URL, "DATABASE_URL");
  return env;
}

function parseEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load `.env.test` (or another non-.env.local file), assert it is local, and
 * merge it into process.env (file values win, so a stray shell variable cannot
 * redirect the tests to a remote project). Returns the parsed values.
 */
export function loadLocalTestEnv(path = ".env.test") {
  const full = resolve(path);
  if (basename(full) === ".env.local") {
    throw new Error(
      "[assert-local-db] Refusing to load .env.local (live remote project). Use .env.test."
    );
  }
  const env = parseEnvFile(full);
  assertLocalSupabaseEnv(env);
  Object.assign(process.env, env);
  // Re-check the merged environment as well.
  assertLocalSupabaseEnv(process.env);
  return env;
}
