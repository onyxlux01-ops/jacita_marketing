/*
 * Procedural pose library for the studio characters. A pose is a flat array of
 * joint values so poses can be cross-faded cheaply every frame without
 * allocating. All angles are radians in "intuitive" terms (positive arm/leg =
 * forward, positive knee/elbow = bend); the rig converts them to rotations.
 */

export const J = {
  bob: 0,
  hips: 1,
  lean: 2,
  twist: 3,
  tilt: 4,
  nod: 5,
  turn: 6,
  headTilt: 7,
  lArm: 8,
  lOut: 9,
  lElbow: 10,
  rArm: 11,
  rOut: 12,
  rElbow: 13,
  lLeg: 14,
  lKnee: 15,
  rLeg: 16,
  rKnee: 17,
  mouth: 18,
  brow: 19,
  lTwist: 20,
  rTwist: 21,
} as const;
export const POSE_SIZE = 22;
export type Pose = Float32Array;

export type Action =
  | "sit_idle"
  | "sit_type"
  | "sit_read"
  | "sit_write"
  | "sit_compare"
  | "sit_slump"
  | "sit_think"
  | "stand_idle"
  | "stand_point"
  | "stand_arrange"
  | "stand_sort"
  | "stand_check"
  | "stand_wait"
  | "stand_flag"
  | "stand_celebrate"
  | "stand_give"
  | "stand_receive"
  | "stand_carry"
  | "stand_stamp"
  | "walk"
  | "walk_carry";

export const SEATED = new Set<Action>([
  "sit_idle",
  "sit_type",
  "sit_read",
  "sit_write",
  "sit_compare",
  "sit_slump",
  "sit_think",
]);

export const STAND_HIPS = 0.38;
export const SIT_HIPS = 0.275;
export const STRIDE_AMPLITUDE = 0.42;
/** Distance covered by one full gait cycle; derived from leg length so feet plant without sliding. */
export const STRIDE = 4 * STAND_HIPS * Math.sin(STRIDE_AMPLITUDE) * 0.92;

export function createPose(): Pose {
  return new Float32Array(POSE_SIZE);
}

function stand(p: Pose, t: number) {
  p.fill(0);
  p[J.hips] = STAND_HIPS;
  p[J.lOut] = 0.12;
  p[J.rOut] = 0.12;
  p[J.lElbow] = 0.18;
  p[J.rElbow] = 0.18;
  p[J.mouth] = 0.4;
  // Breathing.
  p[J.bob] = Math.sin(t * 1.9) * 0.004;
  p[J.lean] = 0.02 + Math.sin(t * 1.9) * 0.01;
}

function sit(p: Pose, t: number) {
  p.fill(0);
  p[J.hips] = SIT_HIPS;
  p[J.lLeg] = 1.45;
  p[J.rLeg] = 1.45;
  p[J.lKnee] = 1.5;
  p[J.rKnee] = 1.5;
  p[J.lOut] = 0.1;
  p[J.rOut] = 0.1;
  p[J.mouth] = 0.4;
  p[J.lean] = 0.08 + Math.sin(t * 1.8) * 0.012;
  // Forearms resting on the desk.
  p[J.lArm] = 0.45;
  p[J.rArm] = 0.45;
  p[J.lElbow] = 1.0;
  p[J.rElbow] = 1.0;
}

const wave = (t: number, f: number, phase = 0) => Math.sin(t * f + phase);
/** 0..1 pulse that is 1 for `duty` of every `period` seconds. */
const every = (t: number, period: number, duty: number, offset = 0) =>
  ((t + offset) % period) / period < duty ? 1 : 0;

/** Write the target pose for `action` at time `t` (seconds since it began). */
export function evaluate(action: Action, t: number, gait: number, p: Pose) {
  switch (action) {
    case "sit_idle": {
      sit(p, t);
      p[J.turn] = Math.sin(t * 0.35) * 0.35;
      p[J.nod] = -0.08 + wave(t, 0.5) * 0.04;
      p[J.lArm] = 0.3;
      p[J.lElbow] = 0.9;
      // Occasional sip from the mug in the right hand.
      const sip = every(t, 7, 0.25, 2);
      p[J.rArm] = sip ? 1.0 : 0.4;
      p[J.rElbow] = sip ? 1.95 : 1.0;
      p[J.nod] = sip ? -0.15 : p[J.nod];
      break;
    }
    case "sit_type": {
      sit(p, t);
      p[J.lean] = 0.12;
      p[J.nod] = -0.04 + wave(t, 0.7) * 0.03;
      p[J.turn] = wave(t, 0.25) * 0.12;
      p[J.lArm] = 0.62 + Math.max(0, wave(t, 14)) * 0.07;
      p[J.rArm] = 0.62 + Math.max(0, wave(t, 14, Math.PI)) * 0.07;
      p[J.lElbow] = 1.05;
      p[J.rElbow] = 1.05;
      p[J.lOut] = 0.02;
      p[J.rOut] = 0.02;
      p[J.lTwist] = -0.3;
      p[J.rTwist] = 0.3;
      p[J.mouth] = 0.15;
      p[J.brow] = -0.2;
      break;
    }
    case "sit_read": {
      sit(p, t);
      p[J.lean] = 0.08;
      p[J.nod] = 0.1;
      p[J.lArm] = 0.75;
      p[J.rArm] = 0.75;
      p[J.lElbow] = 1.45;
      p[J.rElbow] = 1.45;
      p[J.lOut] = 0.0;
      p[J.rOut] = 0.0;
      // Turning a page every few seconds.
      const turn = every(t, 5, 0.18, 1);
      p[J.rOut] = turn ? -0.35 : 0;
      p[J.rArm] = turn ? 0.95 : 0.75;
      p[J.turn] = turn ? 0.15 : wave(t, 0.4) * 0.06;
      p[J.mouth] = 0.2;
      break;
    }
    case "sit_write": {
      sit(p, t);
      p[J.lean] = 0.1;
      p[J.nod] = 0.08;
      p[J.lArm] = 0.8;
      p[J.lElbow] = 1.35;
      p[J.lOut] = 0.05;
      p[J.rArm] = 0.7 + wave(t, 6) * 0.04;
      p[J.rElbow] = 1.35 + wave(t, 9) * 0.06;
      p[J.rOut] = -0.08 + wave(t, 3) * 0.05;
      p[J.headTilt] = 0.08;
      p[J.mouth] = 0.25;
      break;
    }
    case "sit_compare": {
      sit(p, t);
      p[J.lean] = 0.18;
      const side = wave(t, 0.9) > 0 ? 1 : -1;
      p[J.turn] = side * 0.38;
      p[J.nod] = 0.06;
      p[J.lArm] = 0.6;
      p[J.rArm] = 0.6;
      p[J.lElbow] = 1.1;
      p[J.rElbow] = 1.1;
      p[J.lOut] = 0.22;
      p[J.rOut] = 0.22;
      p[J.brow] = -0.3;
      p[J.mouth] = 0;
      break;
    }
    case "sit_think": {
      sit(p, t);
      p[J.lean] = 0.05;
      p[J.nod] = -0.12;
      p[J.turn] = 0.25;
      p[J.rArm] = 1.25;
      p[J.rElbow] = 2.2;
      p[J.rOut] = 0.05;
      p[J.headTilt] = 0.12;
      p[J.mouth] = 0.1;
      break;
    }
    case "sit_slump": {
      sit(p, t);
      p[J.lean] = 0.32;
      p[J.nod] = 0.45 + wave(t, 1.2) * 0.04;
      p[J.turn] = wave(t, 2.4) * 0.18;
      p[J.rArm] = 2.3;
      p[J.rElbow] = 2.3;
      p[J.rOut] = 0.35;
      p[J.lArm] = 0.35;
      p[J.lElbow] = 0.6;
      p[J.mouth] = -0.8;
      p[J.brow] = 0.6;
      break;
    }
    case "stand_idle": {
      stand(p, t);
      p[J.turn] = Math.sin(t * 0.4) * 0.2;
      break;
    }
    case "stand_point": {
      stand(p, t);
      const point = every(t, 3.2, 0.6);
      p[J.rArm] = point ? 2.25 : 1.4;
      p[J.rOut] = point ? 0.25 : 0.1;
      p[J.rElbow] = point ? 0.12 : 0.9;
      p[J.lArm] = -0.15;
      p[J.lOut] = 0.5;
      p[J.lElbow] = 1.9;
      p[J.nod] = -0.25;
      p[J.turn] = point ? 0.1 : -0.4;
      p[J.mouth] = point ? 0.8 : 0.5;
      break;
    }
    case "stand_arrange": {
      stand(p, t);
      const reach = wave(t, 2.2);
      p[J.lArm] = 1.9 + reach * 0.25;
      p[J.rArm] = 1.9 - reach * 0.25;
      p[J.lOut] = 0.35 + reach * 0.2;
      p[J.rOut] = 0.35 - reach * 0.2;
      p[J.lElbow] = 0.5;
      p[J.rElbow] = 0.5;
      p[J.nod] = -0.3;
      p[J.turn] = reach * 0.15;
      p[J.twist] = reach * 0.08;
      break;
    }
    case "stand_sort": {
      stand(p, t);
      p[J.lean] = 0.3;
      p[J.nod] = 0.35;
      const cycle = wave(t, 3.1);
      p[J.lArm] = 0.95 + cycle * 0.2;
      p[J.rArm] = 0.95 - cycle * 0.2;
      p[J.lElbow] = 0.85;
      p[J.rElbow] = 0.85;
      p[J.lOut] = 0.05 + Math.max(0, cycle) * 0.3;
      p[J.rOut] = 0.05 + Math.max(0, -cycle) * 0.3;
      p[J.twist] = cycle * 0.12;
      p[J.turn] = cycle * 0.25;
      break;
    }
    case "stand_check": {
      stand(p, t);
      p[J.nod] = 0.35;
      p[J.lArm] = 0.9;
      p[J.lElbow] = 1.5;
      p[J.lOut] = -0.1;
      const tick = every(t, 1.4, 0.3);
      p[J.rArm] = 0.95 + tick * 0.12;
      p[J.rElbow] = 1.55 - tick * 0.2;
      p[J.rOut] = -0.12;
      p[J.mouth] = 0.3;
      break;
    }
    case "stand_wait": {
      stand(p, t);
      // Arms folded, foot tapping, glancing up at the camera.
      p[J.lArm] = 0.55;
      p[J.rArm] = 0.55;
      p[J.lElbow] = 2.15;
      p[J.rElbow] = 2.15;
      p[J.lOut] = 0.2;
      p[J.rOut] = 0.2;
      p[J.lTwist] = 0.9;
      p[J.rTwist] = -0.9;
      p[J.rLeg] = Math.max(0, wave(t, 7)) * 0.12;
      p[J.nod] = -0.25;
      p[J.turn] = Math.sin(t * 0.5) * 0.25;
      p[J.headTilt] = 0.1;
      p[J.mouth] = 0.05;
      break;
    }
    case "stand_flag": {
      stand(p, t);
      p[J.rArm] = 2.9;
      p[J.rOut] = 0.3 + wave(t, 6) * 0.25;
      p[J.rElbow] = 0.25;
      p[J.lArm] = 0.6;
      p[J.lElbow] = 1.6;
      p[J.nod] = -0.3;
      p[J.mouth] = 0.9;
      p[J.brow] = 0.5;
      break;
    }
    case "stand_celebrate": {
      stand(p, t);
      const hop = Math.max(0, wave(t, 7));
      p[J.bob] = hop * 0.06;
      p[J.lArm] = 2.7;
      p[J.rArm] = 2.7;
      p[J.lOut] = 0.5;
      p[J.rOut] = 0.5;
      p[J.lElbow] = 0.3;
      p[J.rElbow] = 0.3;
      p[J.nod] = -0.35;
      p[J.mouth] = 1;
      p[J.brow] = 0.6;
      p[J.lKnee] = hop * 0.3;
      p[J.rKnee] = hop * 0.3;
      break;
    }
    case "stand_give":
    case "stand_receive": {
      stand(p, t);
      p[J.lean] = 0.2;
      p[J.lArm] = 1.35;
      p[J.rArm] = 1.35;
      p[J.lElbow] = 0.35;
      p[J.rElbow] = 0.35;
      p[J.lOut] = 0.05;
      p[J.rOut] = 0.05;
      p[J.nod] = 0.2;
      p[J.mouth] = 0.9;
      break;
    }
    case "stand_carry": {
      stand(p, t);
      p[J.lArm] = 0.8;
      p[J.rArm] = 0.8;
      p[J.lElbow] = 1.3;
      p[J.rElbow] = 1.3;
      p[J.lOut] = -0.05;
      p[J.rOut] = -0.05;
      p[J.nod] = 0.15;
      break;
    }
    case "stand_stamp": {
      stand(p, t);
      p[J.lean] = 0.25;
      p[J.nod] = 0.35;
      const press = every(t, 1.6, 0.35);
      p[J.rArm] = press ? 0.9 : 1.6;
      p[J.rElbow] = press ? 0.6 : 1.4;
      p[J.lArm] = 0.6;
      p[J.lElbow] = 1.0;
      p[J.mouth] = press ? 0.9 : 0.4;
      break;
    }
    case "walk":
    case "walk_carry": {
      p.fill(0);
      p[J.hips] = STAND_HIPS;
      const s = Math.sin(gait);
      p[J.lLeg] = s * STRIDE_AMPLITUDE;
      p[J.rLeg] = -s * STRIDE_AMPLITUDE;
      // Bend the knee of the swinging leg only.
      p[J.lKnee] = Math.max(0, Math.cos(gait)) * 0.75 + 0.05;
      p[J.rKnee] = Math.max(0, -Math.cos(gait)) * 0.75 + 0.05;
      p[J.bob] = Math.abs(Math.cos(gait)) * 0.022 - 0.01;
      p[J.lean] = 0.07;
      p[J.twist] = s * 0.07;
      p[J.mouth] = 0.5;
      if (action === "walk_carry") {
        p[J.lArm] = 0.8;
        p[J.rArm] = 0.8;
        p[J.lElbow] = 1.3;
        p[J.rElbow] = 1.3;
        p[J.lOut] = -0.05;
        p[J.rOut] = -0.05;
        p[J.nod] = 0.12;
      } else {
        p[J.lArm] = -s * 0.45;
        p[J.rArm] = s * 0.45;
        p[J.lElbow] = 0.35;
        p[J.rElbow] = 0.35;
        p[J.lOut] = 0.1;
        p[J.rOut] = 0.1;
      }
      break;
    }
  }
}

/** Which held prop is visible for an action. */
export function heldProp(action: Action): "doc" | "pen" | "tablet" | "mug" | "stamp" | null {
  switch (action) {
    case "sit_read":
    case "sit_write":
      return "doc";
    case "stand_check":
      return "tablet";
    case "sit_idle":
      return "mug";
    case "stand_stamp":
      return "stamp";
    default:
      return null;
  }
}
