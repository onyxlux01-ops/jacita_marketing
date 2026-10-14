// Loaded first by register.mjs: pulls in .env.test and refuses anything that
// is not the local Supabase stack. Never reads .env.local.
import { loadLocalTestEnv } from "../lib/assert-local-db.mjs";

loadLocalTestEnv(".env.test");

// Integration tests exercise real server code with providers mocked; make sure
// no real provider or simulation path is accidentally enabled.
process.env.PUBLISHING_SIMULATION = "false";
