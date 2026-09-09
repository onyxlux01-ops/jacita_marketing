"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createContentSeries } from "@/app/(app)/app/actions/content-studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SocialPlatform } from "@/lib/types";

export function SeriesForm({ organisationId }: { organisationId: string }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [platform, setPlatform] = useState<string>("none");
  const [rules, setRules] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createContentSeries({
        organisationId,
        name,
        description,
        frequency,
        preferredPlatform:
          platform === "none" ? null : (platform as SocialPlatform),
        contentRules: rules,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Series created");
        setName("");
        setDescription("");
        setRules("");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="jacita-panel space-y-4 rounded-xl p-5">
      <div>
        <p className="jacita-label">New series</p>
        <h2 className="mt-1 font-heading text-lg font-semibold">
          Create a content series
        </h2>
      </div>
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hair Tip Tuesday"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v ?? "weekly")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Biweekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Preferred platform</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v ?? "none")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Any</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Content rules</Label>
        <Textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={3}
          placeholder="Keep tips practical. Always end with a soft CTA."
        />
      </div>
      <Button type="submit" disabled={pending || !organisationId}>
        Create series
      </Button>
    </form>
  );
}
