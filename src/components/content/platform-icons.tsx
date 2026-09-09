import type { SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M14 9h3V6h-3c-1.7 0-3 1.3-3 3v2H9v3h2v7h3v-7h2.5l.5-3H14V9z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.8a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15Z" />
    </svg>
  );
}

const META: Record<
  SocialPlatform,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  instagram: { label: "Instagram", icon: InstagramIcon },
  facebook: { label: "Facebook", icon: FacebookIcon },
  tiktok: { label: "TikTok", icon: TikTokIcon },
};

export function PlatformIcons({
  platforms,
  className,
}: {
  platforms: SocialPlatform[];
  className?: string;
}) {
  const list = platforms.length ? platforms : (["instagram"] as SocialPlatform[]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {list.map((platform) => {
        const meta = META[platform];
        const Icon = meta.icon;
        return (
          <span
            key={platform}
            title={meta.label}
            className="inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
          >
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </div>
  );
}

export function PlatformPill({ platform }: { platform: SocialPlatform }) {
  const meta = META[platform];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
      <Icon className="size-3.5" />
      {meta.label}
    </span>
  );
}
