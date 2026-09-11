export type GlassObjectConfig = {
  id: string;
  logo: string;
  glow: string;
  position: [number, number, number];
  restRotation: [number, number, number];
  scale: number;
  rotSeed: number;
  filler?: boolean;
};

export type HeroCaption = {
  id: string;
  title: string;
  line: string;
  left: string;
  top: string;
  align: "left" | "right";
};

/** Halo around centered copy — matches the reference composition. */
export const DESKTOP_OBJECTS: GlassObjectConfig[] = [
  {
    id: "instagram",
    logo: "/homepage/logos/instagram.svg",
    glow: "#E1306C",
    position: [-3.2, 1.55, 0.55],
    restRotation: [-0.28, 0.38, 0.1],
    scale: 1.08,
    rotSeed: 0.4,
  },
  {
    id: "facebook",
    logo: "/homepage/logos/facebook.svg",
    glow: "#1877F2",
    position: [3.25, 1.65, 0.35],
    restRotation: [-0.22, -0.32, -0.08],
    scale: 1.06,
    rotSeed: 1.2,
  },
  {
    id: "canva",
    logo: "/homepage/logos/canva.svg",
    glow: "#00C4CC",
    position: [-3.35, -0.05, 0.2],
    restRotation: [0.08, 0.42, -0.06],
    scale: 0.92,
    rotSeed: 2.8,
  },
  {
    id: "tiktok",
    logo: "/homepage/logos/tiktok.svg",
    glow: "#FE2C55",
    position: [3.3, 0.12, 0.7],
    restRotation: [0.16, -0.28, 0.08],
    scale: 0.96,
    rotSeed: 2.1,
  },
  {
    id: "threads",
    logo: "/homepage/logos/threads.svg",
    glow: "#222222",
    position: [-1.85, -1.55, 0.85],
    restRotation: [0.32, 0.45, 0.12],
    scale: 0.9,
    rotSeed: 3.5,
  },
  {
    id: "meta",
    logo: "/homepage/logos/meta.svg",
    glow: "#0668E1",
    position: [2.55, -1.5, 0.5],
    restRotation: [0.18, -0.4, 0.1],
    scale: 0.94,
    rotSeed: 4.2,
  },
  {
    id: "filler-a",
    logo: "/homepage/logos/instagram.svg",
    glow: "#d4d8e0",
    position: [-4.4, 0.85, -1.9],
    restRotation: [0.3, -0.5, 0.2],
    scale: 0.28,
    rotSeed: 5.1,
    filler: true,
  },
  {
    id: "filler-b",
    logo: "/homepage/logos/meta.svg",
    glow: "#c8ced8",
    position: [4.55, 0.95, -1.7],
    restRotation: [-0.35, 0.45, -0.15],
    scale: 0.26,
    rotSeed: 6.0,
    filler: true,
  },
  {
    id: "filler-c",
    logo: "/homepage/logos/facebook.svg",
    glow: "#d0d5de",
    position: [0.15, 2.15, -2.1],
    restRotation: [0.4, 0.2, -0.1],
    scale: 0.22,
    rotSeed: 6.8,
    filler: true,
  },
  {
    id: "filler-d",
    logo: "/homepage/logos/tiktok.svg",
    glow: "#cfd3db",
    position: [-2.4, -2.05, -1.6],
    restRotation: [-0.2, 0.55, 0.15],
    scale: 0.24,
    rotSeed: 7.4,
    filler: true,
  },
  {
    id: "filler-e",
    logo: "/homepage/logos/canva.svg",
    glow: "#d8dce4",
    position: [4.1, -1.85, -1.4],
    restRotation: [0.25, -0.35, 0.12],
    scale: 0.2,
    rotSeed: 8.1,
    filler: true,
  },
];

export const MOBILE_OBJECTS: GlassObjectConfig[] = [
  {
    id: "instagram",
    logo: "/homepage/logos/instagram.svg",
    glow: "#E1306C",
    position: [-1.45, 1.7, 0.35],
    restRotation: [-0.16, 0.28, 0.06],
    scale: 0.7,
    rotSeed: 0.4,
  },
  {
    id: "facebook",
    logo: "/homepage/logos/facebook.svg",
    glow: "#1877F2",
    position: [1.5, 1.65, 0.15],
    restRotation: [-0.12, -0.22, -0.05],
    scale: 0.66,
    rotSeed: 1.2,
  },
  {
    id: "tiktok",
    logo: "/homepage/logos/tiktok.svg",
    glow: "#FE2C55",
    position: [1.45, -1.45, 0.45],
    restRotation: [0.16, -0.18, 0.06],
    scale: 0.64,
    rotSeed: 2.1,
  },
  {
    id: "canva",
    logo: "/homepage/logos/canva.svg",
    glow: "#00C4CC",
    position: [-1.5, -1.4, 0.2],
    restRotation: [0.1, 0.3, -0.05],
    scale: 0.6,
    rotSeed: 2.8,
  },
];

export const HERO_CAPTIONS: HeroCaption[] = [
  {
    id: "instagram",
    title: "Instagram",
    line: "Create. Engage. Grow.",
    left: "5.5%",
    top: "24%",
    align: "left",
  },
  {
    id: "canva",
    title: "Canva",
    line: "Design at scale.",
    left: "5.5%",
    top: "54%",
    align: "left",
  },
  {
    id: "threads",
    title: "Threads",
    line: "Build community.",
    left: "22%",
    top: "82%",
    align: "left",
  },
  {
    id: "facebook",
    title: "Facebook",
    line: "Reach more people.",
    left: "82%",
    top: "22%",
    align: "left",
  },
  {
    id: "tiktok",
    title: "TikTok",
    line: "Turn ideas into momentum.",
    left: "84%",
    top: "52%",
    align: "left",
  },
  {
    id: "meta",
    title: "Meta Ads",
    line: "Smarter ads. Bigger results.",
    left: "78%",
    top: "80%",
    align: "left",
  },
];
