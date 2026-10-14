// Loaded first by register.mjs: pulls in .env.test and refuses anything that
// is not the local Supabase stack. Never reads .env.local.
import { loadLocalTestEnv } from "../lib/assert-local-db.mjs";

loadLocalTestEnv(".env.test");

// Integration tests exercise real server code with providers mocked; make sure
// no real provider or simulation path is accidentally enabled.
process.env.PUBLISHING_SIMULATION = "false";

// No real network from the integration suite: only the local stack may be
// reached. A module that slips past the mock map (e.g. a dynamic import the
// resolve hook does not see) fails loudly here instead of calling a provider.
const realFetch = globalThis.fetch;
const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
globalThis.fetch = (input, init) => {
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const host = new URL(raw).hostname;
  if (!LOCAL.has(host)) {
    return Promise.reject(
      new Error(`[integration] blocked non-local fetch to ${host} (mock it in ./mocks)`)
    );
  }
  return realFetch(input, init);
};
