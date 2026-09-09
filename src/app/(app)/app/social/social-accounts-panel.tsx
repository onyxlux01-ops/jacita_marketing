"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  disconnectSocialAccount,
  selectFacebookPage,
} from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { PlatformPill } from "@/components/content/platform-icons";
import type { ConnectionStatus, SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  platform: SocialPlatform;
  connection_status: ConnectionStatus;
  account_name: string | null;
  account_handle: string | null;
  profile_image_url: string | null;
  last_error: string | null;
  configured: boolean;
  availablePages: Array<{ id: string; name: string }>;
};

export function SocialAccountsPanel({
  organisationId,
  organisationName,
  accounts,
}: {
  organisationId: string;
  organisationName: string;
  accounts: Account[];
}) {
  const [pending, startTransition] = useTransition();
  const byPlatform = Object.fromEntries(
    accounts.map((a) => [a.platform, a])
  ) as Partial<Record<SocialPlatform, Account>>;

  const platforms: SocialPlatform[] = ["instagram", "facebook", "tiktok"];

  function connect(platform: SocialPlatform) {
    const account = byPlatform[platform];
    if (account && !account.configured) {
      toast.error(
        `${platform[0].toUpperCase()}${platform.slice(1)} credentials are not configured on the server yet.`
      );
      return;
    }
    window.location.href = `/api/social/oauth/${platform}/start?organisation_id=${encodeURIComponent(
      organisationId
    )}`;
  }

  function disconnect(platform: SocialPlatform) {
    startTransition(async () => {
      const res = await disconnectSocialAccount({
        organisationId,
        platform,
      });
      if (res.error) toast.error(res.error);
      else toast.success("Account disconnected");
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Current business
        </p>
        <p className="mt-1 font-heading text-lg font-semibold">
          {organisationName}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Connected accounts belong only to this business.
        </p>
      </div>

      <ul className="jacita-panel divide-y divide-border/70 overflow-hidden rounded-2xl">
        {platforms.map((key) => {
          const account = byPlatform[key];
          const status = account?.connection_status ?? "not_connected";
          const connected = status === "connected";
          const label =
            status === "expired"
              ? "Expired"
              : status === "error"
                ? "Error"
                : connected
                  ? "Connected"
                  : "Not connected";

          return (
            <li key={key} className="space-y-3 px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <PlatformPill platform={key} />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {account?.account_handle ||
                        account?.account_name ||
                        "Not linked"}
                    </p>
                    {account?.last_error ? (
                      <p className="mt-1 text-xs text-destructive">
                        {account.last_error}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      connected
                        ? "bg-accent text-primary"
                        : status === "expired" || status === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        connected
                          ? "bg-primary"
                          : "bg-muted-foreground/50"
                      )}
                    />
                    {label}
                  </span>
                  {connected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        asChild
                      >
                        <Link href="/app/content?status=scheduled">Manage</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl"
                        disabled={pending}
                        onClick={() => disconnect(key)}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      disabled={pending || !organisationId}
                      onClick={() => connect(key)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
              {key === "facebook" &&
              connected &&
              (account?.availablePages?.length || 0) > 1 ? (
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <span className="text-xs text-muted-foreground">Page:</span>
                  {account!.availablePages.map((page) => (
                    <Button
                      key={page.id}
                      size="sm"
                      variant={
                        account?.account_name === page.name
                          ? "default"
                          : "outline"
                      }
                      className="h-7 rounded-lg text-xs"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await selectFacebookPage({
                            organisationId,
                            pageId: page.id,
                          });
                          if (res.error) toast.error(res.error);
                          else toast.success(`Using ${page.name}`);
                        });
                      }}
                    >
                      {page.name}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
