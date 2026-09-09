import { SocialAccountsPanel } from "./social-accounts-panel";
import { PublishHistory } from "./publish-history";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSocialAdapter } from "@/lib/social/registry";
import {
  oauthRedirectChecklist,
  verifyMetaCredentials,
} from "@/lib/social/meta-status";
import type { ConnectionStatus, SocialPlatform } from "@/lib/types";

const PLATFORMS: SocialPlatform[] = ["instagram", "facebook", "tiktok"];

export default async function SocialAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { error, connected } = await searchParams;
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);
  const metaStatus = await verifyMetaCredentials();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirects = oauthRedirectChecklist(appUrl);

  let accounts: Array<{
    id: string;
    platform: SocialPlatform;
    connection_status: ConnectionStatus;
    account_name: string | null;
    account_handle: string | null;
    profile_image_url: string | null;
    last_error: string | null;
    configured: boolean;
    availablePages: Array<{ id: string; name: string }>;
  }> = PLATFORMS.map((platform) => ({
    id: "",
    platform,
    connection_status: "not_connected",
    account_name: null,
    account_handle: null,
    profile_image_url: null,
    last_error: null,
    configured: getSocialAdapter(platform).isConfigured(),
    availablePages: [],
  }));

  let logs: Array<{
    id: string;
    platform: SocialPlatform;
    status: string;
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
    external_post_id: string | null;
    content_id: string | null;
    social_account_id: string | null;
  }> = [];

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const [{ data }, { data: logData }] = await Promise.all([
        supabase
          .from("social_accounts")
          .select(
            "id, platform, connection_status, account_name, account_handle, profile_image_url, last_error, metadata"
          )
          .eq("organisation_id", active.id),
        supabase
          .from("social_publish_logs")
          .select(
            "id, platform, status, started_at, completed_at, error_message, external_post_id, content_id, social_account_id"
          )
          .eq("organisation_id", active.id)
          .order("started_at", { ascending: false })
          .limit(20),
      ]);

      const rows = data ?? [];
      accounts = PLATFORMS.map((platform) => {
        const row = rows.find((r) => r.platform === platform);
        const meta = (row?.metadata || {}) as {
          available_pages?: Array<{ id: string; name: string }>;
        };
        const configured = getSocialAdapter(platform).isConfigured();
        const metaBlocked =
          (platform === "instagram" || platform === "facebook") &&
          !metaStatus.ok;
        return {
          id: row?.id ?? "",
          platform,
          connection_status:
            (row?.connection_status as ConnectionStatus) ?? "not_connected",
          account_name: row?.account_name ?? null,
          account_handle: row?.account_handle ?? null,
          profile_image_url: row?.profile_image_url ?? null,
          last_error: row?.last_error ?? null,
          configured: configured && !metaBlocked,
          availablePages: meta.available_pages ?? [],
        };
      });
      logs = (logData as typeof logs) ?? [];
    } catch {
      // keep defaults
    }
  }

  return (
    <div className="jacita-page jacita-enter max-w-3xl space-y-8">
      <header>
        <p className="jacita-label">Channels</p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          Social Accounts
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect Instagram, Facebook, and TikTok for{" "}
          {active?.name ?? "your business"}. Publishing stays under this
          business only.
        </p>
        {error ? (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {connected ? (
          <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary capitalize">
            {connected} connected
          </p>
        ) : null}
      </header>

      <section
        className={
          metaStatus.ok
            ? "rounded-xl border border-border/70 bg-card px-4 py-4"
            : "rounded-xl border border-amber-300/80 bg-amber-50/60 px-4 py-4"
        }
      >
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Meta API (Instagram + Facebook)
        </p>
        {metaStatus.ok ? (
          <div className="mt-2 space-y-2 text-sm">
            <p>
              Connected to Meta app{" "}
              <span className="font-medium">
                {metaStatus.appName || metaStatus.appId}
              </span>
              . You can connect Instagram or Facebook below.
            </p>
            <p className="text-muted-foreground">
              Meta will not save <code className="font-mono text-xs">http://</code>{" "}
              redirect URIs (HTTPS is enforced). While the app is in{" "}
              <strong>Development</strong> mode,{" "}
              <code className="font-mono text-xs">localhost</code> redirects are
              usually allowed automatically — try Connect. If Meta blocks the
              redirect, use an HTTPS tunnel (e.g. ngrok) and set{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_APP_URL</code> to
              that URL.
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            <p className="font-medium text-amber-950">
              Meta App ID / Secret are present but Meta rejected them.
            </p>
            <p className="text-amber-900/90">{metaStatus.reason}</p>
            <ol className="list-decimal space-y-1 pl-5 text-amber-950/90">
              <li>
                Open{" "}
                <a
                  className="font-medium underline"
                  href={`https://developers.facebook.com/apps/${metaStatus.appId || ""}/settings/basic/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Meta app settings
                </a>
              </li>
              <li>
                Click <strong>Show</strong> next to App Secret and copy it again
                into <code className="font-mono text-xs">META_APP_SECRET</code>{" "}
                in <code className="font-mono text-xs">.env.local</code>
              </li>
              <li>
                Under Facebook Login → Settings, add these Exact OAuth Redirect
                URIs:
              </li>
            </ol>
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 font-mono text-xs">
              {redirects.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
            <p className="text-xs text-amber-900/80">
              Restart the Next.js server after updating the secret.
            </p>
          </div>
        )}
      </section>

      {active ? (
        <SocialAccountsPanel
          organisationId={active.id}
          organisationName={active.name}
          accounts={accounts}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select or create a business to connect social accounts.
        </p>
      )}

      {active ? <PublishHistory logs={logs} /> : null}
    </div>
  );
}
