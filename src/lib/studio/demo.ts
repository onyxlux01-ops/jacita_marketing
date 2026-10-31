import type { ContentStatus } from "@/lib/types";
import type { StudioContentItem, StudioPublication, StudioSnapshot } from "./types";

/** Never a real organisation id, so demo state cannot collide with live records. */
export const DEMO_ORGANISATION_ID = "demo-studio";

const TITLES = [
  "Spring offer reel",
  "Behind the chair carousel",
  "Weekend booking reminder",
  "Client transformation story",
  "New treatment launch",
  "Five-star review spotlight",
  "Seasonal colour guide",
  "Team introduction post",
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A local, clearly-labelled simulation of studio activity. It lives entirely in
 * memory, produces snapshots in the same shape as live data so the same
 * mapping is exercised, and is never written anywhere.
 */
export class DemoSimulator {
  private random = mulberry32(20261030);
  private items: StudioContentItem[] = [];
  private confirmed: StudioPublication[] = [];
  private serial = 0;
  private failed = 0;
  private enquiries = 3;
  private recentEnquiries = 0;

  constructor(private now = Date.now()) {
    const seed: ContentStatus[] = ["draft", "draft", "review", "review", "scheduled", "scheduled"];
    for (const status of seed) this.items.push(this.create(status, this.now - 3_600_000));
  }

  private create(status: ContentStatus, at: number): StudioContentItem {
    const title = TITLES[this.serial % TITLES.length];
    this.serial += 1;
    return {
      id: `demo-${this.serial}`,
      title: `Demo · ${title}`,
      status,
      updatedAt: new Date(at).toISOString(),
      scheduledAt: status === "scheduled" ? new Date(at + 86_400_000).toISOString() : null,
    };
  }

  /** Advance the simulation by one event. */
  step(now = Date.now()) {
    this.now = now;
    const at = new Date(now).toISOString();
    const pick = (status: ContentStatus) => this.items.find((i) => i.status === status);
    const move = (item: StudioContentItem, status: ContentStatus) => {
      item.status = status;
      item.updatedAt = at;
      item.scheduledAt = status === "scheduled" ? new Date(now + 3_600_000 * 20).toISOString() : item.scheduledAt;
    };
    const roll = this.random();
    const publishing = pick("publishing");
    const scheduled = pick("scheduled");
    const review = pick("review");
    const draft = pick("draft");
    const approved = pick("approved");
    if (publishing && roll < 0.35) {
      if (this.random() < 0.12) {
        move(publishing, "failed");
        this.failed += 1;
      } else {
        move(publishing, "published");
        this.confirmed.unshift({
          id: `demo-pub-${this.serial}-${publishing.id}`,
          contentId: publishing.id,
          platform: "instagram",
          publishedAt: at,
        });
        this.confirmed = this.confirmed.slice(0, 6);
        if (this.random() < 0.6) {
          this.enquiries += 1;
          this.recentEnquiries += 1;
        }
      }
    } else if (approved) move(approved, "scheduled");
    else if (scheduled && roll < 0.5) move(scheduled, "publishing");
    else if (review && roll < 0.75) move(review, this.random() < 0.3 ? "draft" : "approved");
    else if (draft && this.items.filter((i) => i.status === "review").length < 3) move(draft, "review");
    else this.items.unshift(this.create("draft", now));
    // Recover a failure after a while so the demo keeps flowing.
    const failedItem = pick("failed");
    if (failedItem && this.random() < 0.3) {
      move(failedItem, "scheduled");
      this.failed = Math.max(0, this.failed - 1);
    }
    if (this.recentEnquiries > 0 && this.random() < 0.25) this.recentEnquiries -= 1;
    this.items = this.items
      .filter((i) => i.status !== "published" || now - new Date(i.updatedAt).getTime() < 60_000)
      .slice(0, 12);
    if (!this.items.some((i) => i.status === "draft")) this.items.unshift(this.create("draft", now));
    return this.snapshot();
  }

  snapshot(): StudioSnapshot {
    const counts = Object.fromEntries(
      (["draft", "review", "approved", "scheduled", "publishing", "published", "failed"] as const).map(
        (s) => [s, this.items.filter((i) => i.status === s).length],
      ),
    ) as Record<ContentStatus, number>;
    const next = this.items
      .filter((i) => i.status === "scheduled" && i.scheduledAt)
      .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))[0];
    return {
      organisationId: DEMO_ORGANISATION_ID,
      businessName: "Demo studio",
      fetchedAt: new Date(this.now).toISOString(),
      demo: true,
      timezone: "Europe/London",
      counts,
      content: [...this.items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
      tasks: [],
      publishing: {
        scheduled: counts.scheduled,
        nextScheduledAt: next?.scheduledAt ?? null,
        held: 0,
        confirmed: [...this.confirmed],
      },
      setup: {
        hasLogo: true,
        mediaCount: 24,
        activeCampaigns: ["Demo · Spring bookings"],
        connectionIssues: 0,
        accounts: 2,
      },
      analytics: {
        enquiries7d: this.enquiries,
        enquiries2d: this.recentEnquiries,
        reach7d: 4_200 + this.confirmed.length * 380,
        lastMetricDate: new Date(this.now).toISOString().slice(0, 10),
        lastUpdatedAt: new Date(this.now).toISOString(),
      },
    };
  }
}
