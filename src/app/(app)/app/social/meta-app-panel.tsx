"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  removeOrgMetaAppCredentials,
  saveOrgMetaAppCredentials,
} from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Info = {
  hasOverride: boolean;
  appId: string | null;
  label: string | null;
};

export function MetaAppPanel({
  organisationId,
  organisationName,
  info,
}: {
  organisationId: string;
  organisationName: string;
  info: Info;
}) {
  const [open, setOpen] = useState(false);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [label, setLabel] = useState(info.label ?? "");
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const res = await saveOrgMetaAppCredentials({
        organisationId,
        appId,
        appSecret,
        label: label || undefined,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Meta app saved for ${organisationName}`);
        setAppSecret("");
        setOpen(false);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await removeOrgMetaAppCredentials({ organisationId });
      if (res.error) toast.error(res.error);
      else toast.success("Reverted to the shared platform app");
    });
  }

  return (
    <section className="rounded-xl border border-border/70 bg-card px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Meta app for this business
      </p>

      <div className="mt-2 space-y-1 text-sm">
        {info.hasOverride ? (
          <p>
            Using its own Meta app{" "}
            <span className="font-medium">
              {info.label || `App ${info.appId}`}
            </span>{" "}
            <span className="font-mono text-xs text-muted-foreground">
              ({info.appId})
            </span>
            . Instagram &amp; Facebook connect through this app.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Using the shared platform Meta app. Add a dedicated app below if this
            business connects a Meta account that isn&apos;t a tester on the
            shared app.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancel" : info.hasOverride ? "Replace app" : "Use a dedicated app"}
        </Button>
        {info.hasOverride ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={handleRemove}
          >
            Revert to shared app
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border/70 bg-background/50 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="meta-app-id">App ID</Label>
            <Input
              id="meta-app-id"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 1393197368918790"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-app-secret">App Secret</Label>
            <Input
              id="meta-app-secret"
              type="password"
              autoComplete="off"
              placeholder="From App settings → Basic → App Secret"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Stored encrypted. Never shown again after saving.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-app-label">Label (optional)</Label>
            <Input
              id="meta-app-label"
              autoComplete="off"
              placeholder="e.g. Precise Cleaning Social"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={pending} onClick={handleSave}>
              {pending ? "Saving…" : "Save Meta app"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
