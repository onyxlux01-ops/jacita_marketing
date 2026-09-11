"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function MediaCategoryTabs({
  categories,
  current,
}: {
  categories: readonly string[];
  current: string;
}) {
  return (
    <Tabs value={current}>
      <TabsList className="h-auto w-full max-w-full justify-start overflow-x-auto">
        {categories.map((c) => {
          const href =
            c === "All"
              ? "/app/media"
              : `/app/media?category=${encodeURIComponent(c)}`;
          return (
            <TabsTrigger key={c} value={c} asChild className="px-3.5">
              <Link href={href}>{c}</Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
