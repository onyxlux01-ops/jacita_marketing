"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  approveMetaAdAction,
  rejectMetaAdAction,
  discoverMetaAdAccounts,
  saveAdvertisingLimits,
} from "@/app/(app)/app/actions/meta-ads";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MetaSurfaceSnapshot = {
  organisationId: string;
  instagram: { connected: boolean; name: string | null };
  facebook: {
    connected: boolean;
    name: string | null;
    hasAdsScopes?: boolean;
  };
  adAccount:
    | { connected: true; id: string; name: string | null; externalId: string; currency: string | null }
    | { connected: false };
  advertising: {
    mode: string;
    emergencyStopped: boolean;
    dailySpendLimitCents: number;
    maxActiveCampaigns: number;
    activeCampaigns: number;
    spend7d: number;
    pendingApprovals: Array<{
      id: string;
      action_type: string;
      status: string;
      payload: unknown;
      created_at: string;
    }>;
  };
};

function ConnDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-2 rounded-full",
        ok ? "bg-emerald-500" : "bg-muted-foreground/35"
      )}
      aria-hidden
    />
  );
}

export function MetaConnectionsPanel({
  surface,
}: {
  surface: MetaSurfaceSnapshot;
}) {
  const [pending, startTransition] = useTransition();
  const ads = surface.advertising;

  return (
    <section className="rounded-2xl border border-border/70 bg-card px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="jacita-label">Meta</p>
          <h3 className="mt-1 font-heading text-lg font-semibold tracking-tight">
            Connections
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Scoped to the active business only. Tokens never leave the server.
          </p>
        </div>
        <Link
          href="/app/social"
          className="text-sm font-medium text-primary hover:underline"
        >
          Manage
        </Link>
      </div>

      <ul className="mt-5 space-y-2.5 text-sm">
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <ConnDot ok={surface.instagram.connected} />
            Instagram
          </span>
          <span className="text-muted-foreground">
            {surface.instagram.connected
              ? surface.instagram.name || "Connected"
              : "Not connected"}
          </span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <ConnDot ok={surface.facebook.connected} />
            Facebook
          </span>
          <span className="text-muted-foreground">
            {surface.facebook.connected
              ? surface.facebook.name || "Connected"
              : "Not connected"}
          </span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <ConnDot
              ok={Boolean(
                surface.facebook.connected && surface.facebook.hasAdsScopes
              )}
            />
            Ads permissions
          </span>
          <span className="text-muted-foreground">
            {!surface.facebook.connected
              ? "Connect Facebook first"
              : surface.facebook.hasAdsScopes
                ? "Granted"
                : "Reconnect Facebook"}
          </span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <ConnDot ok={surface.adAccount.connected} />
            Ad account
          </span>
          <span className="text-muted-foreground">
            {surface.adAccount.connected
              ? surface.adAccount.name || surface.adAccount.externalId
              : "Not connected"}
          </span>
        </li>
      </ul>

      <div className="mt-6 border-t border-border/60 pt-5">
        <p className="jacita-label">Advertising</p>
        {surface.facebook.connected && !surface.facebook.hasAdsScopes ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Facebook is connected for organic posting, but this token does not
            include ads permissions. Reconnect Facebook on{" "}
            <Link href="/app/social" className="font-medium text-primary hover:underline">
              Social
            </Link>{" "}
            and approve <span className="font-medium">ads_read</span> +{" "}
            <span className="font-medium">ads_management</span> (App Review may
            be required for live users).
          </p>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1 font-medium">
              {ads.emergencyStopped
                ? "Emergency stop"
                : ads.mode === "off"
                  ? "Off"
                  : "Approval required"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Active campaigns</dt>
            <dd className="mt-1 font-heading text-lg font-semibold">
              {ads.activeCampaigns}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spend (7d)</dt>
            <dd className="mt-1 font-heading text-lg font-semibold">
              {ads.spend7d > 0 ? ads.spend7d.toFixed(2) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Daily limit</dt>
            <dd className="mt-1 font-medium">
              {ads.dailySpendLimitCents > 0
                ? `${(ads.dailySpendLimitCents / 100).toFixed(0)} ${
                    surface.adAccount.connected
                      ? surface.adAccount.currency || ""
                      : ""
                  }`
                : "Not set"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !surface.facebook.connected}
            onClick={() => {
              startTransition(async () => {
                const res = await discoverMetaAdAccounts(surface.organisationId);
                if ("error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success(
                  "Ad account discovery proposed — approve it below to run."
                );
              });
            }}
          >
            Discover ad accounts
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await saveAdvertisingLimits({
                  organisationId: surface.organisationId,
                  dailySpendLimitCents: Math.max(
                    ads.dailySpendLimitCents,
                    5000
                  ),
                  maxActiveCampaigns: ads.maxActiveCampaigns || 5,
                  mode: "approval",
                  emergencyStopped: false,
                });
                if ("error" in res && res.error) toast.error(res.error);
                else toast.success("Advertising limits saved (approval mode)");
              });
            }}
          >
            Enable approval mode
          </Button>
          {ads.emergencyStopped ? null : (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const res = await saveAdvertisingLimits({
                    organisationId: surface.organisationId,
                    dailySpendLimitCents: ads.dailySpendLimitCents,
                    maxActiveCampaigns: ads.maxActiveCampaigns,
                    emergencyStopped: true,
                  });
                  if ("error" in res && res.error) toast.error(res.error);
                  else toast.success("Advertising emergency stop activated");
                });
              }}
            >
              Emergency stop ads
            </Button>
          )}
        </div>

        {ads.pendingApprovals.length ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Pending ad approvals
            </p>
            {ads.pendingApprovals.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.action_type}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Proposed {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await approveMetaAdAction({
                          organisationId: surface.organisationId,
                          actionId: a.id,
                        });
                        if ("error" in res && res.error) toast.error(res.error);
                        else toast.success("Ad action executed");
                      });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await rejectMetaAdAction({
                          organisationId: surface.organisationId,
                          actionId: a.id,
                        });
                        if ("error" in res && res.error) toast.error(res.error);
                        else toast.success("Rejected");
                      });
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            AI can propose ad actions, but nothing mutates Meta until a human
            approves. Autopilot ad spend is disabled.
          </p>
        )}
      </div>
    </section>
  );
}
