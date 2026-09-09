"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  inviteTeamMember,
  removeTeamMember,
  revokeInvite,
  updateMemberRole,
  deleteOrganisation,
} from "@/app/(app)/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORG_ROLE_LABELS, ORG_ROLES } from "@/lib/org/constants";
import type { OrgRole } from "@/lib/database.types";
import { useState } from "react";

type Member = {
  id: string;
  role: OrgRole;
  user_id: string;
  full_name: string | null;
  email?: string | null;
  isSelf: boolean;
};

type Invite = {
  id: string;
  email: string;
  role: OrgRole;
  status: string;
  expires_at: string;
};

export function TeamPanel({
  organisationId,
  members,
  invites,
  canManage,
}: {
  organisationId: string;
  members: Member[];
  invites: Invite[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("staff");

  if (!canManage) {
    return (
      <section className="jacita-panel rounded-2xl p-5 sm:p-6">
        <p className="jacita-label">Team</p>
        <h2 className="mt-2 font-heading text-lg font-semibold">Team members</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {members.map((m) => (
            <li key={m.id}>
              {m.full_name || "Member"} · {ORG_ROLE_LABELS[m.role]}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="jacita-panel space-y-5 rounded-2xl p-5 sm:p-6">
      <div>
        <p className="jacita-label">Team</p>
        <h2 className="mt-2 font-heading text-lg font-semibold">Team members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owners invite users. Managers can run marketing. Staff have limited
          access.
        </p>
      </div>

      <ul className="divide-y divide-border/70">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {m.full_name || "Team member"}
                {m.isSelf ? " (you)" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {ORG_ROLE_LABELS[m.role]}
              </p>
            </div>
            {!m.isSelf && m.role !== "owner" ? (
              <div className="flex gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  defaultValue={m.role}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.value as OrgRole;
                    startTransition(async () => {
                      const res = await updateMemberRole({
                        organisationId,
                        membershipId: m.id,
                        role: next,
                      });
                      if (res.error) toast.error(res.error);
                      else toast.success("Role updated");
                    });
                  }}
                >
                  {ORG_ROLES.filter((r) => r !== "owner").map((r) => (
                    <option key={r} value={r}>
                      {ORG_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await removeTeamMember({
                        organisationId,
                        membershipId: m.id,
                      });
                      if (res.error) toast.error(res.error);
                      else toast.success("Member removed");
                    });
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-2">
          <Label htmlFor="invite_email">Invite by email</Label>
          <Input
            id="invite_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@business.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite_role">Role</Label>
          <select
            id="invite_role"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRole)}
          >
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button
            disabled={pending || !email}
            onClick={() => {
              startTransition(async () => {
                const res = await inviteTeamMember({
                  organisationId,
                  email,
                  role,
                });
                if (res.error) toast.error(res.error);
                else {
                  toast.success(res.message || "Invite sent");
                  setEmail("");
                }
              });
            }}
          >
            Invite
          </Button>
        </div>
      </div>

      {invites.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Pending invites
          </p>
          <ul className="mt-2 space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  {inv.email} · {ORG_ROLE_LABELS[inv.role]}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await revokeInvite({
                        organisationId,
                        inviteId: inv.id,
                      });
                      toast.success("Invite revoked");
                    });
                  }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function DangerZone({
  organisationId,
  organisationName,
  canDelete,
}: {
  organisationId: string;
  organisationName: string;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmName, setConfirmName] = useState("");

  if (!canDelete) return null;

  return (
    <section className="jacita-panel space-y-4 rounded-2xl border-destructive/30 p-5 sm:p-6">
      <div>
        <p className="jacita-label text-destructive">Danger zone</p>
        <h2 className="mt-2 font-heading text-lg font-semibold">
          Delete this business
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This will permanently remove the business, content, media, campaigns
          and associated data. Type the business name to confirm.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm_name">Type “{organisationName}”</Label>
        <Input
          id="confirm_name"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
        />
      </div>
      <Button
        variant="destructive"
        disabled={pending || confirmName.trim() !== organisationName.trim()}
        onClick={() => {
          if (
            !window.confirm(
              `Delete this business?\n\nThis will permanently remove ${organisationName} and all related data.`
            )
          ) {
            return;
          }
          startTransition(async () => {
            const res = await deleteOrganisation({
              organisationId,
              confirmName,
            });
            if (res?.error) toast.error(res.error);
          });
        }}
      >
        Delete business
      </Button>
    </section>
  );
}
