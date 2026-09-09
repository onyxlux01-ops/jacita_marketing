"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ServiceForm } from "./service-form";
import { ServiceDeleteButton } from "./service-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Service = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  duration_minutes: number | null;
  target_audience: string | null;
  is_featured: boolean;
  is_promotion: boolean;
  is_active: boolean;
};

export function ServiceList({
  organisationId,
  services,
}: {
  organisationId: string;
  services: Service[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border/60">
      {services.map((s) => (
        <li key={s.id} className="px-5 py-4 sm:px-6">
          {editingId === s.id ? (
            <div className="space-y-3">
              <ServiceForm
                organisationId={organisationId}
                service={s}
                onDone={() => setEditingId(null)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingId(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{s.name}</p>
                  {s.is_featured ? (
                    <Badge variant="secondary">Featured</Badge>
                  ) : null}
                  {s.is_promotion ? (
                    <Badge variant="outline">Promo</Badge>
                  ) : null}
                  {!s.is_active ? (
                    <Badge variant="destructive">Inactive</Badge>
                  ) : null}
                </div>
                {s.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {s.description}
                  </p>
                ) : null}
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {[
                    s.category,
                    s.price != null ? `£${Number(s.price).toFixed(2)}` : null,
                    s.duration_minutes != null
                      ? `${s.duration_minutes} min`
                      : null,
                    s.target_audience,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Uncategorised"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Edit service"
                  onClick={() => setEditingId(s.id)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <ServiceDeleteButton serviceId={s.id} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
