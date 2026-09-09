/**
 * Validate social / AI env readiness (no secrets printed).
 */
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "SOCIAL_TOKEN_ENCRYPTION_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "META_APP_ID",
  "META_APP_SECRET",
];

const report = { ok: true, checks: {}, redirects: {}, meta: null };

for (const k of required) {
  const v = env[k];
  report.checks[k] = Boolean(v && v.length > 0);
  if (!report.checks[k]) report.ok = false;
}

const base = (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
report.redirects = {
  facebook: `${base}/api/social/oauth/facebook/callback`,
  instagram: `${base}/api/social/oauth/instagram/callback`,
  tiktok: `${base}/api/social/oauth/tiktok/callback`,
};

report.checks.TIKTOK =
  Boolean(env.TIKTOK_CLIENT_KEY) && Boolean(env.TIKTOK_CLIENT_SECRET);

if (env.META_APP_ID && env.META_APP_SECRET) {
  const token = `${env.META_APP_ID}|${env.META_APP_SECRET}`;
  const url = `https://graph.facebook.com/v22.0/${env.META_APP_ID}?fields=id,name&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) {
      report.ok = false;
      report.meta = {
        valid: false,
        error: json.error.message,
        code: json.error.code,
      };
    } else {
      report.meta = { valid: true, id: json.id, name: json.name };
    }
  } catch (e) {
    report.ok = false;
    report.meta = { valid: false, error: e.message };
  }
}

console.log(JSON.stringify(report, null, 2));
if (!report.ok || report.meta?.valid === false) process.exitCode = 1;
