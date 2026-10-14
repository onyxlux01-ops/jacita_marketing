// Module resolution hooks for the integration runner.
//
// Real application modules are loaded unchanged; only framework/request
// plumbing (next/*, server-only, the cookie-bound Supabase server client) and
// external providers (social adapters, Meta Graph fetch, OpenAI) are swapped for the
// mocks in ./mocks. Everything that touches the database is real.
//
// Synchronous hooks (module.registerHooks) so they apply to both `import` and
// `require` — tsx compiles the app's .ts files as CommonJS in this package.
const mocks = new URL("./mocks/", import.meta.url);

const MAP = {
  "server-only": "empty.mjs",
  "next/cache": "next-cache.mjs",
  "next/headers": "next-headers.mjs",
  "next/navigation": "next-navigation.mjs",
  "@/lib/supabase/server": "supabase-server.ts",
  "@/lib/social/registry": "social-registry.ts",
  "@/lib/social/meta-client": "meta-client.ts",
  // OpenAI (text + images): AI SDK mock models; nothing leaves the machine.
  "@ai-sdk/openai": "ai-openai.ts",
};

export function resolve(specifier, context, nextResolve) {
  const target = MAP[specifier];
  if (target) {
    return { url: new URL(target, mocks).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
