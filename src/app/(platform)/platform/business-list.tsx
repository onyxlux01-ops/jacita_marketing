"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { toggleOrganisationDisabled } from "@/app/(app)/app/actions/org";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Business = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  business_category: string | null;
  created_at: string;
};

export function PlatformBusinessList({
  businesses,
}: {
  businesses: Business[];
}) {
  const [pending, startTransition] = useTransition();

  if (businesses.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No businesses found.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Disabled</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {businesses.map((b) => {
          const disabled = b.status === "disabled";
          return (
            <TableRow key={b.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.slug}</p>
                </div>
              </TableCell>
              <TableCell>{b.business_category || "—"}</TableCell>
              <TableCell className="capitalize">{b.plan}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {b.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Switch
                  checked={disabled}
                  disabled={pending}
                  onCheckedChange={(checked) => {
                    startTransition(async () => {
                      const res = await toggleOrganisationDisabled(b.id, checked);
                      if (res.error) toast.error(res.error);
                      else toast.success(checked ? "Disabled" : "Enabled");
                    });
                  }}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
