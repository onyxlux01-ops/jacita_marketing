// Usage: node --import ./scripts/integration/register.mjs scripts/integration/run.mts
import "./env.mjs";
import { registerHooks } from "node:module";
import { register as registerTsxEsm } from "tsx/esm/api";
import { register as registerTsxCjs } from "tsx/cjs/api";
import { resolve } from "./hooks.mjs";

// Mocks first (synchronous hooks run before tsx's), then tsx for TypeScript
// and the tsconfig "@/..." path alias, for both import and require.
registerHooks({ resolve });
registerTsxEsm();
registerTsxCjs();
