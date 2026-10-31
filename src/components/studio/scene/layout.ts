import type { StationId } from "@/lib/studio/types";

/** [x, z] on the office floor, in metres. +z points towards the camera. */
export type V2 = readonly [number, number];
/** heading 0 faces +z (the camera); π/2 faces +x. */
export type Spot = { pos: V2; heading: number };

export const FLOOR = { minX: -8, maxX: 8, minZ: -5.25, maxZ: 5.25 };
export const TOP_WALL_Z = -1.6;
export const BOTTOM_WALL_Z = 1.05;
export const INNER_DOOR: V2 = [2.7, -2.65];

export const PALETTE = {
  navy: "#1f2c4d",
  navyDeep: "#141d33",
  ivory: "#f3ecdd",
  ivoryWarm: "#e9dfca",
  gold: "#c9a24a",
  goldSoft: "#dcc283",
  wood: "#b98a5a",
  woodDark: "#7c5434",
  woodLight: "#d4ad7f",
  sage: "#8aa58a",
  plum: "#7a5a7c",
  coral: "#e07a5f",
  teal: "#2ac2a8",
  status: {
    idle: "#8b9297",
    working: "#2ac2a8",
    waiting: "#e2a83c",
    scheduled: "#6ea8e6",
    blocked: "#e5534b",
    attention: "#b58bd8",
    done: "#47c27a",
  },
};

export type StationLayout = {
  id: StationId;
  origin: V2;
  /** Which side of the desk the agent leaves by (+1 = east). */
  side: 1 | -1;
  rug: string;
  seat: Spot;
  board: Spot;
  sideSpot: Spot;
  pass: Spot;
  /** Where the receiving agent stands to take a handover. */
  receive: Spot;
  boardPos: V2;
  sideTable: V2;
  inbox: V2;
};

function station(
  id: StationId,
  origin: V2,
  side: 1 | -1,
  rug: string,
): StationLayout {
  const [x, z] = origin;
  const bx = x - side * 0.2;
  return {
    id,
    origin,
    side,
    rug,
    seat: { pos: [x, z - 0.58], heading: 0 },
    receive: { pos: [x, z - 0.5], heading: 0 },
    board: { pos: [bx, z - 1.12], heading: Math.PI },
    sideSpot: { pos: [x - side * 0.98, z - 0.5], heading: -side * (Math.PI / 2) },
    pass: { pos: [x, z + 0.58], heading: Math.PI },
    boardPos: [bx, z - 1.62],
    sideTable: [x - side * 1.5, z - 0.5],
    inbox: [x + side * 0.42, z + 0.12],
  };
}

export const LAYOUT: Record<StationId, StationLayout> = {
  brief: station("brief", [-5.4, -3.2], 1, "#2b3a63"),
  content: station("content", [0, -3.2], 1, "#a8853f"),
  review: station("review", [5.4, -3.2], -1, "#5f7d67"),
  publishing: station("publishing", [5.4, 2.9], -1, "#2f6f6a"),
  analytics: station("analytics", [-5.4, 2.9], 1, "#6b4e6e"),
};

const EAST_LANE = -0.85;
const WEST_LANE = 0.3;

/**
 * Predefined walking routes between stations, from the sender's seat to the
 * receiver's pass point. They follow corridors and doorways so nobody walks
 * through furniture or walls. Returns use the same route reversed.
 */
export const ROUTES: Record<string, V2[]> = {
  "brief>content": [
    [-5.4, -3.78], [-4.35, -3.78], [-4.35, TOP_WALL_Z], [-4.35, EAST_LANE],
    [-1.05, EAST_LANE], [-1.05, TOP_WALL_Z], [-1.05, -2.62], [0, -2.62],
  ],
  "content>review": [
    [0, -3.78], [1.05, -3.78], [1.05, TOP_WALL_Z], [1.05, EAST_LANE],
    [4.35, EAST_LANE], [4.35, TOP_WALL_Z], [4.35, -2.62], [5.4, -2.62],
  ],
  // The revision path is deliberately distinct: back through the inner doorway.
  "review>content": [
    [5.4, -3.78], [4.35, -3.78], [4.35, -2.62], INNER_DOOR, [1.05, -2.62], [0, -2.62],
  ],
  "review>publishing": [
    [5.4, -3.78], [4.35, -3.78], [4.35, TOP_WALL_Z], [4.35, BOTTOM_WALL_Z],
    [4.35, 3.48], [5.4, 3.48],
  ],
  "publishing>analytics": [
    [5.4, 2.32], [4.35, 2.32], [4.35, BOTTOM_WALL_Z], [4.35, WEST_LANE],
    [-4.35, WEST_LANE], [-4.35, BOTTOM_WALL_Z], [-4.35, 3.48], [-5.4, 3.48],
  ],
  "analytics>brief": [
    [-5.4, 2.32], [-4.35, 2.32], [-4.35, BOTTOM_WALL_Z], [-4.35, TOP_WALL_Z],
    [-4.35, -2.62], [-5.4, -2.62],
  ],
};

export function routeFor(from: StationId, to: StationId) {
  return ROUTES[`${from}>${to}`] ?? null;
}

/**
 * Offset the interior of a route to the walker's right so two people walking
 * opposite ways along the same corridor keep apart. Endpoints stay exact.
 */
export function laneOffset(path: V2[], amount = 0.17): V2[] {
  if (path.length < 3) return path;
  const normals = path.slice(1).map((p, i) => {
    const dx = p[0] - path[i][0];
    const dz = p[1] - path[i][1];
    const len = Math.hypot(dx, dz) || 1;
    return [-dz / len, dx / len] as const;
  });
  return path.map((p, i) => {
    if (i === 0 || i === path.length - 1) return p;
    const a = normals[i - 1];
    const b = normals[i];
    return [p[0] + (a[0] + b[0]) * 0.5 * amount, p[1] + (a[1] + b[1]) * 0.5 * amount] as const;
  });
}

export const WALLS: Array<{ from: V2; to: V2; height: number; thickness?: number }> = [
  // Outer shell (front wall is a low cutaway lip).
  { from: [FLOOR.minX, FLOOR.minZ], to: [FLOOR.maxX, FLOOR.minZ], height: 1.15 },
  { from: [FLOOR.minX, FLOOR.minZ], to: [FLOOR.minX, FLOOR.maxZ], height: 0.55 },
  { from: [FLOOR.maxX, FLOOR.minZ], to: [FLOOR.maxX, FLOOR.maxZ], height: 0.55 },
  { from: [FLOOR.minX, FLOOR.maxZ], to: [FLOOR.maxX, FLOOR.maxZ], height: 0.1 },
  // Partitions between the top rooms (with the revision doorway on the right).
  { from: [-2.7, FLOOR.minZ], to: [-2.7, TOP_WALL_Z], height: 0.42 },
  { from: [2.7, FLOOR.minZ], to: [2.7, INNER_DOOR[1] - 0.42], height: 0.42 },
  { from: [2.7, INNER_DOOR[1] + 0.42], to: [2.7, TOP_WALL_Z], height: 0.42 },
  // Top rooms' corridor walls, broken by doorways.
  { from: [FLOOR.minX, TOP_WALL_Z], to: [-4.75, TOP_WALL_Z], height: 0.26 },
  { from: [-3.95, TOP_WALL_Z], to: [-1.45, TOP_WALL_Z], height: 0.26 },
  { from: [-0.65, TOP_WALL_Z], to: [0.65, TOP_WALL_Z], height: 0.26 },
  { from: [1.45, TOP_WALL_Z], to: [3.95, TOP_WALL_Z], height: 0.26 },
  { from: [4.75, TOP_WALL_Z], to: [FLOOR.maxX, TOP_WALL_Z], height: 0.26 },
  // Bottom rooms' corridor walls.
  { from: [FLOOR.minX, BOTTOM_WALL_Z], to: [-4.75, BOTTOM_WALL_Z], height: 0.26 },
  { from: [-3.95, BOTTOM_WALL_Z], to: [-2.9, BOTTOM_WALL_Z], height: 0.26 },
  { from: [2.9, BOTTOM_WALL_Z], to: [3.95, BOTTOM_WALL_Z], height: 0.26 },
  { from: [4.75, BOTTOM_WALL_Z], to: [FLOOR.maxX, BOTTOM_WALL_Z], height: 0.26 },
  // Low dividers either side of the meeting area and lounge.
  { from: [-2.9, BOTTOM_WALL_Z], to: [-2.9, 4.2], height: 0.22 },
  { from: [2.9, BOTTOM_WALL_Z], to: [2.9, 4.2], height: 0.22 },
];
