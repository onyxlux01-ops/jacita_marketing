import * as THREE from "three";
import { STATIONS } from "@/lib/studio/stations";
import type { StationId, StationMood, StationState, StudioEvent } from "@/lib/studio/types";
import { LAYOUT, laneOffset, routeFor, type Spot, type V2 } from "./layout";
import { SEATED, STRIDE, type Action } from "./poses";

/*
 * The director owns all choreography outside React. It turns station states
 * and workflow events into short, predictable scripts: work loops at each
 * desk, and walk → hand over → walk back trips along predefined routes. It
 * never reports anything back to the app; animation finishing has no effect on
 * any business record.
 */

export type SpotName = "seat" | "board" | "side";
export type Bubble = "waiting" | "scheduled" | "blocked" | "attention" | "done" | "revision" | null;
export type TokenKind = "brief" | "draft" | "revision" | "report";

type Step =
  | { kind: "act"; action: Action; dur: number; heading?: number; spot?: SpotName }
  | { kind: "walk"; path: V2[]; carry: boolean; spot?: SpotName | "away" }
  | { kind: "run"; fn: () => void }
  | { kind: "await"; test: () => boolean; action: Action; heading?: number; timeout: number };

export type AgentRuntime = {
  id: StationId;
  order: number;
  x: number;
  z: number;
  heading: number;
  action: Action;
  actionStart: number;
  actionSerial: number;
  gait: number;
  mood: StationMood;
  spot: SpotName | "away";
  steps: Step[];
  step: Step | null;
  stepStart: number;
  pathIndex: number;
  activity: number;
  trip: StudioEvent | null;
  expecting: boolean;
  flash: { bubble: Bubble; until: number } | null;
  yieldedFor: number;
  /** World position between the hands, written by the rig every frame. */
  carryPoint: THREE.Vector3;
  carrying: number | null;
};

export type TokenRuntime = {
  id: number;
  kind: TokenKind;
  active: boolean;
  holder: StationId | null;
  position: THREE.Vector3;
  flight: { from: THREE.Vector3; to: THREE.Vector3; start: number; dur: number } | null;
  fadeAt: number;
};

type Activity = Array<[SpotName, Action, number]>;

const SCRIPTS: Partial<Record<StationId, Partial<Record<StationMood, Activity>>>> = {
  brief: {
    working: [
      ["seat", "sit_write", 7],
      ["board", "stand_point", 6],
      ["side", "stand_sort", 6],
      ["seat", "sit_type", 5],
    ],
    blocked: [
      ["seat", "sit_slump", 7],
      ["board", "stand_point", 4],
    ],
  },
  content: {
    working: [
      ["seat", "sit_type", 8],
      ["board", "stand_arrange", 6],
      ["seat", "sit_compare", 5],
      ["side", "stand_check", 4],
    ],
  },
  review: {
    waiting: [
      ["seat", "sit_read", 6],
      ["seat", "sit_compare", 5],
      ["seat", "stand_wait", 6],
    ],
    working: [
      ["seat", "sit_read", 6],
      ["side", "stand_check", 5],
      ["seat", "stand_stamp", 3],
    ],
  },
  publishing: {
    scheduled: [
      ["board", "stand_arrange", 6],
      ["seat", "sit_type", 6],
      ["board", "stand_check", 4],
    ],
    working: [
      ["seat", "sit_type", 5],
      ["side", "stand_check", 5],
    ],
    waiting: [
      ["board", "stand_arrange", 5],
      ["seat", "sit_think", 6],
    ],
    done: [
      ["seat", "sit_idle", 8],
      ["board", "stand_point", 4],
    ],
  },
  analytics: {
    working: [
      ["board", "stand_point", 6],
      ["seat", "sit_type", 6],
      ["side", "stand_check", 5],
    ],
    attention: [
      ["side", "stand_flag", 3.5],
      ["side", "stand_check", 4],
      ["board", "stand_point", 4],
    ],
  },
};

const DEFAULT: Record<StationMood, Activity> = {
  idle: [
    ["seat", "sit_idle", 9],
    ["seat", "sit_think", 4],
  ],
  working: [["seat", "sit_type", 7]],
  waiting: [["seat", "sit_think", 6]],
  scheduled: [["seat", "sit_type", 6]],
  blocked: [["seat", "sit_slump", 8]],
  attention: [["seat", "stand_flag", 4]],
  done: [["seat", "sit_idle", 8]],
};

/** The representative still frame used when animation is off. */
export const STATIC_ACTION: Record<StationMood, Action> = {
  idle: "sit_idle",
  working: "sit_type",
  waiting: "sit_read",
  scheduled: "sit_type",
  blocked: "sit_slump",
  attention: "stand_flag",
  done: "sit_idle",
};

const WALK_SPEED = 0.95;
const TURN_RATE = 7;
const MAX_TRIPS = 2;
const MAX_QUEUE = 5;
const TOKEN_POOL = 4;

function angleDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Director {
  time = 0;
  animated = true;
  agents: Record<StationId, AgentRuntime>;
  tokens: TokenRuntime[];
  /** Routes walked right now, for the floor markers. */
  activeRoutes = new Map<string, number>();
  private queue: StudioEvent[] = [];
  private seen = new Set<string>();
  private moods: Record<StationId, StationMood> = {
    brief: "idle",
    content: "idle",
    review: "idle",
    publishing: "idle",
    analytics: "idle",
  };

  constructor() {
    this.agents = Object.fromEntries(
      STATIONS.map((s, i) => {
        const seat = LAYOUT[s.id].seat;
        const agent: AgentRuntime = {
          id: s.id,
          order: s.order,
          x: seat.pos[0],
          z: seat.pos[1],
          heading: seat.heading,
          action: "sit_idle",
          actionStart: -i * 1.7,
          actionSerial: 0,
          gait: 0,
          mood: "idle",
          spot: "seat",
          steps: [],
          step: null,
          stepStart: 0,
          pathIndex: 0,
          activity: i,
          trip: null,
          expecting: false,
          flash: null,
          yieldedFor: 0,
          carryPoint: new THREE.Vector3(seat.pos[0], 0.6, seat.pos[1]),
          carrying: null,
        };
        return [s.id, agent];
      }),
    ) as Record<StationId, AgentRuntime>;
    this.tokens = Array.from({ length: TOKEN_POOL }, (_, id) => ({
      id,
      kind: "draft" as TokenKind,
      active: false,
      holder: null,
      position: new THREE.Vector3(),
      flight: null,
      fadeAt: 0,
    }));
  }

  /** Mark events as already seen so a remount never replays them. */
  ignore(events: StudioEvent[]) {
    for (const e of events) this.seen.add(e.key);
  }

  enqueue(events: StudioEvent[]) {
    for (const e of events) {
      if (this.seen.has(e.key)) continue;
      this.seen.add(e.key);
      if (!this.animated) continue; // stills just show the new counts
      this.queue.push(e);
    }
    // Long absences shouldn't produce a parade: counts already show the truth.
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  setStations(states: Record<StationId, StationState>) {
    for (const id of Object.keys(states) as StationId[]) {
      const mood = states[id].mood;
      if (this.moods[id] === mood) continue;
      this.moods[id] = mood;
      const agent = this.agents[id];
      agent.mood = mood;
      agent.activity = 0;
      if (!this.animated) {
        this.setAction(agent, STATIC_ACTION[mood]);
        continue;
      }
      if (!agent.trip && !agent.expecting && agent.step?.kind === "act") {
        // Wrap up the current loop promptly so the new state shows.
        const remaining = agent.step.dur - (this.time - agent.stepStart);
        if (remaining > 1) agent.step.dur = this.time - agent.stepStart + 0.8;
        agent.steps = [];
      }
    }
  }

  setAnimated(animated: boolean) {
    this.animated = animated;
    if (animated) return;
    this.queue = [];
    this.activeRoutes.clear();
    for (const token of this.tokens) token.active = false;
    for (const agent of Object.values(this.agents)) {
      const seat = LAYOUT[agent.id].seat;
      agent.x = seat.pos[0];
      agent.z = seat.pos[1];
      agent.heading = seat.heading;
      agent.steps = [];
      agent.step = null;
      agent.trip = null;
      agent.expecting = false;
      agent.carrying = null;
      agent.spot = "seat";
      this.setAction(agent, STATIC_ACTION[agent.mood]);
    }
  }

  bubble(agent: AgentRuntime): Bubble {
    if (agent.flash && agent.flash.until > this.time) return agent.flash.bubble;
    if (agent.trip?.kind === "revision") return "revision";
    switch (agent.mood) {
      case "waiting":
      case "scheduled":
      case "blocked":
      case "attention":
      case "done":
        return agent.mood;
      default:
        return null;
    }
  }

  private setAction(agent: AgentRuntime, action: Action) {
    if (agent.action === action) return;
    agent.action = action;
    agent.actionStart = this.time;
    agent.actionSerial += 1;
  }

  private spot(id: StationId, name: SpotName): Spot {
    const l = LAYOUT[id];
    return name === "seat" ? l.seat : name === "board" ? l.board : l.sideSpot;
  }

  /** Short in-room path between two work spots that goes around the chair. */
  private podPath(agent: AgentRuntime, to: SpotName): V2[] {
    const l = LAYOUT[agent.id];
    const target = this.spot(agent.id, to).pos;
    const behind: V2 = [l.origin[0], l.origin[1] - 0.98];
    if (agent.spot === to) return [];
    const from: V2 = [agent.x, agent.z];
    if (agent.spot === "seat" || to === "seat")
      return [from, behind, target].filter(
        (p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 0.05,
      );
    return [from, behind, target];
  }

  private planActivity(agent: AgentRuntime) {
    if (agent.expecting) {
      const steps: Step[] = [];
      if (agent.spot !== "seat") steps.push({ kind: "walk", path: this.podPath(agent, "seat"), carry: false, spot: "seat" });
      steps.push({ kind: "act", action: "stand_idle", dur: 1.5, heading: 0, spot: "seat" });
      agent.steps = steps;
      return;
    }
    const script = SCRIPTS[agent.id]?.[agent.mood] ?? DEFAULT[agent.mood];
    const [spotName, action, dur] = script[agent.activity % script.length];
    agent.activity += 1;
    const steps: Step[] = [];
    if (agent.spot !== spotName) {
      const path = this.podPath(agent, spotName);
      if (path.length > 1) steps.push({ kind: "walk", path, carry: false, spot: spotName });
    }
    const spot = this.spot(agent.id, spotName);
    steps.push({ kind: "act", action, dur: dur * (0.85 + Math.random() * 0.3), heading: spot.heading, spot: spotName });
    agent.steps = steps;
  }

  private claimToken(kind: TokenKind, holder: StationId) {
    const token = this.tokens.find((t) => !t.active);
    if (!token) return null;
    token.active = true;
    token.kind = kind;
    token.holder = holder;
    token.flight = null;
    token.fadeAt = 0;
    return token;
  }

  private startTrip(event: StudioEvent) {
    const sender = this.agents[event.from];
    const receiver = this.agents[event.to];
    const route = routeFor(event.from, event.to);
    if (!route) return;
    const l = LAYOUT[event.from];
    const lead: V2[] = [];
    if (sender.spot !== "seat" || sender.step?.kind === "walk")
      lead.push([sender.x, sender.z], [l.origin[0], l.origin[1] - 0.98]);
    const outbound = laneOffset([...lead, ...(lead.length ? route.slice(1) : route)]);
    const back = laneOffset([...route].reverse());
    const kind: TokenKind =
      event.kind === "revision" ? "revision" : event.kind === "complete" ? "report" : event.from === "brief" ? "brief" : "draft";
    const routeKey = `${event.from}>${event.to}`;
    sender.trip = event;
    receiver.expecting = receiver.trip ? false : true;
    sender.steps = [];
    sender.step = null;
    const steps: Step[] = [];
    if (event.kind === "complete") {
      steps.push({ kind: "run", fn: () => (sender.flash = { bubble: "done", until: this.time + 2.6 }) });
      steps.push({ kind: "act", action: "stand_celebrate", dur: 1.8 });
    }
    steps.push(
      {
        kind: "run",
        fn: () => {
          const token = this.claimToken(kind, sender.id);
          sender.carrying = token?.id ?? null;
          this.activeRoutes.set(routeKey, (this.activeRoutes.get(routeKey) ?? 0) + 1);
        },
      },
      { kind: "act", action: "stand_carry", dur: 0.5 },
      { kind: "walk", path: outbound, carry: true, spot: "away" },
      {
        kind: "await",
        test: () =>
          !receiver.expecting ||
          receiver.trip !== null ||
          (receiver.spot === "seat" && receiver.step?.kind === "act"),
        action: "stand_carry",
        heading: Math.PI,
        timeout: 2.5,
      },
      {
        kind: "run",
        fn: () => {
          if (receiver.expecting && !receiver.trip) {
            if (receiver.step?.kind === "walk") receiver.spot = "away";
            receiver.steps = [
              ...(receiver.spot !== "seat"
                ? [{ kind: "walk" as const, path: this.podPath(receiver, "seat"), carry: false, spot: "seat" as const }]
                : []),
              { kind: "act", action: "stand_receive", dur: 1.1, heading: 0, spot: "seat" },
            ];
            receiver.step = null;
          }
        },
      },
      { kind: "act", action: "stand_give", dur: 0.45, heading: Math.PI },
      {
        kind: "run",
        fn: () => {
          const token = sender.carrying === null ? null : this.tokens[sender.carrying];
          sender.carrying = null;
          if (!token) return;
          const inbox = LAYOUT[event.to].inbox;
          const to = new THREE.Vector3(inbox[0], 0.48, inbox[1]);
          token.flight = { from: token.position.clone(), to, start: this.time, dur: 0.55 };
          token.holder = null;
          token.fadeAt = this.time + 1.6;
        },
      },
      { kind: "act", action: "stand_give", dur: 0.6, heading: Math.PI },
      {
        kind: "run",
        fn: () => {
          receiver.expecting = false;
          const n = (this.activeRoutes.get(routeKey) ?? 1) - 1;
          if (n <= 0) this.activeRoutes.delete(routeKey);
          else this.activeRoutes.set(routeKey, n);
        },
      },
      { kind: "walk", path: back, carry: false, spot: "seat" },
      {
        kind: "run",
        fn: () => {
          sender.trip = null;
          sender.activity = 0;
        },
      },
    );
    sender.steps = steps;
  }

  private react(event: StudioEvent) {
    const agent = this.agents[event.from];
    agent.steps = [];
    agent.step = null;
    if (event.kind === "scheduled") {
      agent.flash = { bubble: "scheduled", until: this.time + 4 };
      agent.steps = [
        ...(agent.spot !== "board" ? [{ kind: "walk" as const, path: this.podPath(agent, "board"), carry: false, spot: "board" as const }] : []),
        { kind: "act", action: "stand_arrange", dur: 3.5, heading: Math.PI, spot: "board" },
      ];
    } else if (event.kind === "failed") {
      agent.flash = { bubble: "blocked", until: this.time + 4 };
      agent.steps = [
        ...(agent.spot !== "seat" ? [{ kind: "walk" as const, path: this.podPath(agent, "seat"), carry: false, spot: "seat" as const }] : []),
        { kind: "act", action: "sit_slump", dur: 3.5, heading: 0, spot: "seat" },
      ];
    }
  }

  private dispatch() {
    if (!this.queue.length) return;
    const trips = Object.values(this.agents).filter((a) => a.trip).length;
    const blockedSenders = new Set<StationId>();
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i];
      const sender = this.agents[e.from];
      if (blockedSenders.has(e.from) || sender.trip || sender.expecting) {
        blockedSenders.add(e.from);
        continue;
      }
      if (e.from === e.to) {
        this.queue.splice(i--, 1);
        this.react(e);
        continue;
      }
      const receiverBusy = Object.values(this.agents).some((a) => a.trip && a.trip.to === e.to);
      if (trips >= MAX_TRIPS || receiverBusy || this.agents[e.to].trip?.to === e.from) {
        blockedSenders.add(e.from);
        continue;
      }
      this.queue.splice(i, 1);
      this.startTrip(e);
      return; // one new trip per frame keeps starts staggered
    }
  }

  private blocked(agent: AgentRuntime, dirX: number, dirZ: number) {
    for (const other of Object.values(this.agents)) {
      if (other === agent) continue;
      const dx = other.x - agent.x;
      const dz = other.z - agent.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.62 || dist < 1e-4) continue;
      const ahead = (dx * dirX + dz * dirZ) / dist;
      const lateral = Math.abs(dx * dirZ - dz * dirX);
      if (ahead > 0.3 && lateral < 0.36) return true;
    }
    return false;
  }

  private walk(agent: AgentRuntime, step: Extract<Step, { kind: "walk" }>, dt: number) {
    const path = step.path;
    while (agent.pathIndex < path.length) {
      const [tx, tz] = path[agent.pathIndex];
      if (Math.hypot(tx - agent.x, tz - agent.z) > 1e-3) break;
      agent.pathIndex += 1;
    }
    if (agent.pathIndex >= path.length) return true;
    const [tx, tz] = path[agent.pathIndex];
    const dx = tx - agent.x;
    const dz = tz - agent.z;
    const dist = Math.hypot(dx, dz);
    const delta = angleDelta(agent.heading, Math.atan2(dx, dz));
    agent.heading += Math.sign(delta) * Math.min(Math.abs(delta), TURN_RATE * dt);
    if (this.blocked(agent, dx / dist, dz / dist) && agent.yieldedFor < 1.6) {
      agent.yieldedFor += dt;
      this.setAction(agent, step.carry ? "stand_carry" : "stand_idle");
      return false;
    }
    agent.yieldedFor = 0;
    this.setAction(agent, step.carry ? "walk_carry" : "walk");
    // Slow right down while turning sharply so feet don't skate sideways.
    const align = Math.max(0.12, Math.cos(Math.min(Math.abs(delta), Math.PI / 2)));
    let remaining = WALK_SPEED * dt * align;
    while (remaining > 0 && agent.pathIndex < path.length) {
      const [px, pz] = path[agent.pathIndex];
      const sx = px - agent.x;
      const sz = pz - agent.z;
      const d = Math.hypot(sx, sz);
      const move = Math.min(d, remaining);
      if (d > 1e-6) {
        agent.x += (sx / d) * move;
        agent.z += (sz / d) * move;
      }
      agent.gait += (move / STRIDE) * Math.PI * 2;
      remaining -= move;
      if (move >= d - 1e-6) agent.pathIndex += 1;
    }
    return agent.pathIndex >= path.length;
  }

  private advance(agent: AgentRuntime, dt: number) {
    if (!agent.step) {
      if (!agent.steps.length) this.planActivity(agent);
      agent.step = agent.steps.shift() ?? null;
      agent.stepStart = this.time;
      agent.pathIndex = 0;
      if (!agent.step) return;
    }
    const step = agent.step;
    const elapsed = this.time - agent.stepStart;
    let done = false;
    switch (step.kind) {
      case "run":
        step.fn();
        done = true;
        break;
      case "walk":
        done = step.path.length < 2 || this.walk(agent, step, dt);
        if (done && step.spot) agent.spot = step.spot;
        break;
      case "act": {
        // Seated actions only happen in the chair; snap the last few millimetres.
        if (SEATED.has(step.action) && step.spot === "seat") {
          const seat = LAYOUT[agent.id].seat.pos;
          agent.x += (seat[0] - agent.x) * Math.min(1, dt * 8);
          agent.z += (seat[1] - agent.z) * Math.min(1, dt * 8);
        }
        if (step.heading !== undefined) {
          const delta = angleDelta(agent.heading, step.heading);
          agent.heading += Math.sign(delta) * Math.min(Math.abs(delta), TURN_RATE * dt);
        }
        this.setAction(agent, step.action);
        done = elapsed >= step.dur;
        break;
      }
      case "await": {
        if (step.heading !== undefined) {
          const delta = angleDelta(agent.heading, step.heading);
          agent.heading += Math.sign(delta) * Math.min(Math.abs(delta), TURN_RATE * dt);
        }
        this.setAction(agent, step.action);
        done = step.test() || elapsed > step.timeout;
        break;
      }
    }
    if (done) agent.step = null;
  }

  update(dt: number) {
    const step = Math.min(dt, 0.05);
    this.time += step;
    if (!this.animated) return;
    this.dispatch();
    for (const agent of Object.values(this.agents)) {
      // A couple of zero-time steps (runs) can resolve in the same frame.
      for (let i = 0; i < 4; i++) {
        const before = agent.step;
        this.advance(agent, step);
        if (agent.step || before?.kind !== "run") break;
      }
    }
    for (const token of this.tokens) {
      if (!token.active) continue;
      if (token.holder) {
        token.position.copy(this.agents[token.holder].carryPoint);
      } else if (token.flight) {
        const f = token.flight;
        const k = Math.min(1, (this.time - f.start) / f.dur);
        token.position.lerpVectors(f.from, f.to, k);
        token.position.y += Math.sin(k * Math.PI) * 0.25;
        if (k >= 1) token.flight = null;
      }
      if (token.fadeAt && this.time > token.fadeAt) token.active = false;
    }
  }
}
