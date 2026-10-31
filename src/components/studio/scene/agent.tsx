"use client";

import { useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { StationId } from "@/lib/studio/types";
import type { Bubble, Director } from "./director";
import {
  blobShadow,
  box,
  capsule,
  circle,
  cone,
  cylinder,
  dome,
  sphere,
  toon,
  torus,
} from "./materials";
import { createPose, evaluate, heldProp, J } from "./poses";
import { bubbleTexture } from "./textures";

type HairStyle = "bun" | "curly" | "long" | "spiky" | "fade";
type Outfit = "blazer" | "sweater" | "cardigan" | "polo" | "vest";
type Accessory = "earrings" | "headphones" | "glasses" | "headset" | "lanyard";

export type Look = {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  outfit: Outfit;
  top: string;
  accent: string;
  sleeve: string;
  forearm: string;
  pants: string;
  shoes: string;
  accessories: Accessory[];
  prop: string;
};

/** Original Jacita studio cast. */
export const LOOKS: Record<StationId, Look> = {
  brief: {
    skin: "#7a4a32",
    hair: "#1d1410",
    hairStyle: "bun",
    outfit: "blazer",
    top: "#25355e",
    accent: "#c9a24a",
    sleeve: "#25355e",
    forearm: "#25355e",
    pants: "#3a3f4b",
    shoes: "#2a1d17",
    accessories: ["earrings"],
    prop: "#f3ecdd",
  },
  content: {
    skin: "#f1c6a2",
    hair: "#b4562c",
    hairStyle: "curly",
    outfit: "sweater",
    top: "#d7a23e",
    accent: "#f3ecdd",
    sleeve: "#d7a23e",
    forearm: "#d7a23e",
    pants: "#46597a",
    shoes: "#efe9dd",
    accessories: ["headphones"],
    prop: "#2a3346",
  },
  review: {
    skin: "#b47c56",
    hair: "#1f1712",
    hairStyle: "long",
    outfit: "cardigan",
    top: "#7f9d80",
    accent: "#f1e8d6",
    sleeve: "#f1e8d6",
    forearm: "#f1e8d6",
    pants: "#2c3446",
    shoes: "#6b3d2a",
    accessories: ["glasses"],
    prop: "#f3ecdd",
  },
  publishing: {
    skin: "#e8bd93",
    hair: "#161616",
    hairStyle: "spiky",
    outfit: "polo",
    top: "#3c8c84",
    accent: "#f3ecdd",
    sleeve: "#3c8c84",
    forearm: "#e8bd93",
    pants: "#c3b292",
    shoes: "#3b2a20",
    accessories: ["headset"],
    prop: "#2a3346",
  },
  analytics: {
    skin: "#4f3124",
    hair: "#100c0a",
    hairStyle: "fade",
    outfit: "vest",
    top: "#f4f0e7",
    accent: "#1f2c4d",
    sleeve: "#f4f0e7",
    forearm: "#4f3124",
    pants: "#2b2f3a",
    shoes: "#18181a",
    accessories: ["lanyard"],
    prop: "#1f2c4d",
  },
};

function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

function Hair({ look }: { look: Look }) {
  const m = toon(look.hair);
  const cap = (
    <mesh geometry={dome(0.172, look.hairStyle === "fade" ? 0.36 : 0.5)} material={m} rotation={[-0.32, 0, 0]} position={[0, 0.006, -0.008]} castShadow />
  );
  switch (look.hairStyle) {
    case "bun":
      return (
        <group>
          {cap}
          <mesh geometry={sphere(0.078)} material={m} position={[0, 0.17, -0.07]} castShadow />
          <mesh geometry={torus(0.05, 0.014)} material={toon(LOOKS.brief.accent)} position={[0, 0.125, -0.06]} rotation={[1.2, 0, 0]} />
        </group>
      );
    case "curly": {
      const curls: Array<[number, number, number]> = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const ring = i % 2 ? 0.12 : 0.15;
        curls.push([Math.cos(a) * ring, 0.1 + (i % 3) * 0.02, Math.sin(a) * ring - 0.02]);
      }
      curls.push([0, 0.17, -0.01], [0.05, 0.15, 0.06], [-0.06, 0.15, 0.05]);
      return (
        <group>
          {cap}
          {curls.map((p, i) => (
            <mesh key={i} geometry={sphere(0.058, 10, 8)} material={m} position={p} castShadow />
          ))}
        </group>
      );
    }
    case "long":
      return (
        <group>
          {cap}
          <mesh geometry={box(0.3, 0.32, 0.09, 0.04)} material={m} position={[0, -0.06, -0.1]} castShadow />
          <mesh geometry={box(0.06, 0.26, 0.08, 0.03)} material={m} position={[0.145, -0.07, 0.01]} />
          <mesh geometry={box(0.06, 0.26, 0.08, 0.03)} material={m} position={[-0.145, -0.07, 0.01]} />
        </group>
      );
    case "spiky": {
      const spikes: Array<[number, number, number, number, number]> = [
        [0, 0.17, 0.02, 0, 0],
        [0.07, 0.15, 0.04, -0.2, -0.5],
        [-0.07, 0.15, 0.04, -0.2, 0.5],
        [0.03, 0.15, -0.08, 0.5, -0.2],
        [-0.04, 0.15, -0.08, 0.5, 0.3],
        [0.1, 0.1, -0.04, 0.3, -0.9],
        [-0.1, 0.1, -0.04, 0.3, 0.9],
        [0, 0.13, 0.1, -0.7, 0],
      ];
      return (
        <group>
          {cap}
          {spikes.map(([x, y, z, rx, rz], i) => (
            <mesh key={i} geometry={cone(0.045, 0.1, 6)} material={m} position={[x, y, z]} rotation={[rx, 0, rz]} castShadow />
          ))}
        </group>
      );
    }
    case "fade":
      return (
        <group>
          {cap}
          <mesh geometry={sphere(0.062, 12, 8)} material={m} position={[0, -0.125, 0.095]} scale={[1.25, 0.8, 0.8]} />
          <mesh geometry={box(0.075, 0.02, 0.025, 0.008)} material={m} position={[0, -0.05, 0.152]} />
          <mesh geometry={box(0.025, 0.09, 0.05, 0.01)} material={m} position={[0.135, -0.07, 0.06]} rotation={[0, 0.5, 0]} />
          <mesh geometry={box(0.025, 0.09, 0.05, 0.01)} material={m} position={[-0.135, -0.07, 0.06]} rotation={[0, -0.5, 0]} />
        </group>
      );
  }
}

function Outfit({ look }: { look: Look }) {
  const accent = toon(look.accent);
  switch (look.outfit) {
    case "blazer":
      return (
        <group>
          <mesh geometry={box(0.1, 0.17, 0.02, 0.008)} material={toon("#f1e9d8")} position={[0, 0.2, 0.093]} />
          <mesh geometry={box(0.045, 0.2, 0.02, 0.008)} material={toon(shade(look.top, -0.06))} position={[0.055, 0.18, 0.1]} rotation={[0, 0, 0.32]} />
          <mesh geometry={box(0.045, 0.2, 0.02, 0.008)} material={toon(shade(look.top, -0.06))} position={[-0.055, 0.18, 0.1]} rotation={[0, 0, -0.32]} />
          <mesh geometry={torus(0.075, 0.03)} material={accent} position={[0, 0.315, 0.01]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={box(0.05, 0.14, 0.025, 0.01)} material={accent} position={[0.04, 0.24, 0.1]} rotation={[0, 0, -0.2]} />
        </group>
      );
    case "sweater":
      return (
        <group>
          <mesh geometry={torus(0.068, 0.018)} material={toon(shade(look.top, -0.08))} position={[0, 0.31, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={box(0.31, 0.035, 0.195, 0.015)} material={toon(shade(look.top, -0.08))} position={[0, 0.025, 0]} />
          <mesh geometry={box(0.2, 0.02, 0.01, 0.005)} material={accent} position={[0, 0.17, 0.097]} />
        </group>
      );
    case "cardigan":
      return (
        <group>
          <mesh geometry={box(0.105, 0.3, 0.022, 0.01)} material={accent} position={[0.098, 0.16, 0.092]} />
          <mesh geometry={box(0.105, 0.3, 0.022, 0.01)} material={accent} position={[-0.098, 0.16, 0.092]} />
          <mesh geometry={sphere(0.011, 8, 6)} material={toon("#7a5a3c")} position={[0.052, 0.18, 0.105]} />
          <mesh geometry={sphere(0.011, 8, 6)} material={toon("#7a5a3c")} position={[0.052, 0.11, 0.105]} />
        </group>
      );
    case "polo":
      return (
        <group>
          <mesh geometry={box(0.06, 0.025, 0.05, 0.01)} material={accent} position={[0.05, 0.305, 0.075]} rotation={[0.4, 0, -0.4]} />
          <mesh geometry={box(0.06, 0.025, 0.05, 0.01)} material={accent} position={[-0.05, 0.305, 0.075]} rotation={[0.4, 0, 0.4]} />
          <mesh geometry={box(0.03, 0.09, 0.012, 0.005)} material={toon(shade(look.top, -0.08))} position={[0, 0.25, 0.097]} />
          <mesh geometry={box(0.05, 0.035, 0.01, 0.005)} material={toon("#f3ecdd")} position={[-0.075, 0.2, 0.097]} />
        </group>
      );
    case "vest":
      return (
        <group>
          <mesh geometry={box(0.11, 0.25, 0.022, 0.01)} material={accent} position={[0.085, 0.13, 0.093]} rotation={[0, 0, 0.08]} />
          <mesh geometry={box(0.11, 0.25, 0.022, 0.01)} material={accent} position={[-0.085, 0.13, 0.093]} rotation={[0, 0, -0.08]} />
          <mesh geometry={box(0.035, 0.17, 0.015, 0.006)} material={toon("#c9a24a")} position={[0, 0.19, 0.1]} />
          <mesh geometry={box(0.29, 0.1, 0.19, 0.04)} material={accent} position={[0, 0.06, 0]} />
        </group>
      );
  }
}

function Accessories({ look }: { look: Look }) {
  const dark = toon("#1d2230");
  const gold = toon("#d6b25b");
  return (
    <>
      {look.accessories.includes("earrings") && (
        <>
          <mesh geometry={sphere(0.016, 8, 6)} material={gold} position={[0.165, -0.045, 0.01]} />
          <mesh geometry={sphere(0.016, 8, 6)} material={gold} position={[-0.165, -0.045, 0.01]} />
        </>
      )}
      {look.accessories.includes("glasses") && (
        <group position={[0, 0.005, 0.158]}>
          <mesh geometry={torus(0.036, 0.007)} material={dark} position={[0.06, 0, 0]} />
          <mesh geometry={torus(0.036, 0.007)} material={dark} position={[-0.06, 0, 0]} />
          <mesh geometry={box(0.03, 0.008, 0.008)} material={dark} />
        </group>
      )}
      {look.accessories.includes("headset") && (
        <group>
          <mesh geometry={torus(0.178, 0.012, Math.PI)} material={dark} position={[0, 0.0, 0]} />
          <mesh geometry={cylinder(0.045, 0.045, 0.04, 12)} material={dark} position={[0.172, -0.01, 0]} rotation={[0, 0, Math.PI / 2]} />
          <mesh geometry={cylinder(0.045, 0.045, 0.04, 12)} material={dark} position={[-0.172, -0.01, 0]} rotation={[0, 0, Math.PI / 2]} />
          <mesh geometry={capsule(0.008, 0.12)} material={dark} position={[-0.15, -0.07, 0.08]} rotation={[1.2, 0.4, 0]} />
          <mesh geometry={sphere(0.017, 8, 6)} material={toon("#2ac2a8")} position={[-0.11, -0.095, 0.14]} />
        </group>
      )}
    </>
  );
}

type RigState = {
  from: ReturnType<typeof createPose>;
  target: ReturnType<typeof createPose>;
  current: ReturnType<typeof createPose>;
  serial: number;
  fadeStart: number;
  bubble: Bubble;
  a: THREE.Vector3;
  b: THREE.Vector3;
  blinkOffset: number;
};

function createRigState(order: number): RigState {
  return {
    from: createPose(),
    target: createPose(),
    current: createPose(),
    serial: -1,
    fadeStart: 0,
    bubble: null,
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    // Stagger blinks so the cast never blinks in unison.
    blinkOffset: order * 0.83,
  };
}

type Props = {
  id: StationId;
  director: Director;
  look: Look;
  onSelect: (id: StationId) => void;
};

/**
 * An articulated cartoon character. Its pose is driven entirely from the
 * director inside useFrame — React renders it once and never again during
 * animation.
 */
export function Agent({ id, director, look, onSelect }: Props) {
  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lSh = useRef<THREE.Group>(null);
  const rSh = useRef<THREE.Group>(null);
  const lEl = useRef<THREE.Group>(null);
  const rEl = useRef<THREE.Group>(null);
  const lHand = useRef<THREE.Group>(null);
  const rHand = useRef<THREE.Group>(null);
  const lHip = useRef<THREE.Group>(null);
  const rHip = useRef<THREE.Group>(null);
  const lKnee = useRef<THREE.Group>(null);
  const rKnee = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const brows = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const props = useRef<Record<string, THREE.Object3D | null>>({});
  const bubble = useRef<THREE.Sprite>(null);
  const bubbleMaterial = useRef<THREE.SpriteMaterial>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const rig = useRef<RigState | null>(null);

  const skin = toon(look.skin);
  const skinShade = toon(shade(look.skin, -0.05));
  const top = toon(look.top);
  const sleeve = toon(look.sleeve);
  const forearm = toon(look.forearm);
  const pants = toon(look.pants);
  const shoes = toon(look.shoes);
  const ink = toon("#17120f");
  const white = toon("#ffffff");

  useFrame(() => {
    const agent = director.agents[id];
    rig.current ??= createRigState(agent.order);
    const s = rig.current;
    if (agent.actionSerial !== s.serial) {
      s.from.set(s.current);
      s.fadeStart = director.time;
      s.serial = agent.actionSerial;
    }
    const t = director.animated ? director.time - agent.actionStart : 1.2;
    evaluate(agent.action, t, agent.gait, s.target);
    const k = director.animated ? Math.min(1, (director.time - s.fadeStart) / 0.28) : 1;
    const w = k * k * (3 - 2 * k);
    const p = s.current;
    for (let i = 0; i < p.length; i++) p[i] = s.from[i] + (s.target[i] - s.from[i]) * w;

    root.current!.position.set(agent.x, p[J.bob], agent.z);
    root.current!.rotation.y = agent.heading;
    hips.current!.position.y = p[J.hips];
    torso.current!.rotation.set(p[J.lean], p[J.twist], p[J.tilt]);
    head.current!.rotation.set(p[J.nod], p[J.turn], p[J.headTilt]);
    lSh.current!.rotation.set(-p[J.lArm], p[J.lTwist], p[J.lOut]);
    rSh.current!.rotation.set(-p[J.rArm], p[J.rTwist], -p[J.rOut]);
    lEl.current!.rotation.x = -p[J.lElbow];
    rEl.current!.rotation.x = -p[J.rElbow];
    lHip.current!.rotation.x = -p[J.lLeg];
    rHip.current!.rotation.x = -p[J.rLeg];
    lKnee.current!.rotation.x = p[J.lKnee];
    rKnee.current!.rotation.x = p[J.rKnee];

    const m = p[J.mouth];
    mouth.current!.rotation.z = m >= 0 ? Math.PI : 0;
    mouth.current!.scale.y = 0.25 + Math.abs(m) * 0.75;
    mouth.current!.position.y = -0.068 + (m >= 0 ? 0.008 : -0.012) * Math.abs(m);
    brows.current!.position.y = 0.062 + p[J.brow] * 0.012;
    brows.current!.children[0].rotation.z = -0.12 - p[J.brow] * 0.25;
    brows.current!.children[1].rotation.z = 0.12 + p[J.brow] * 0.25;
    const blink = director.animated && (director.time + s.blinkOffset) % 4.2 < 0.13;
    eyes.current!.scale.y = blink ? 0.12 : 1;

    const held = heldProp(agent.action);
    for (const [name, obj] of Object.entries(props.current))
      if (obj) obj.visible = name === held;

    // Where a carried folder sits: between the hands, a touch forward.
    lHand.current!.getWorldPosition(s.a);
    rHand.current!.getWorldPosition(s.b);
    agent.carryPoint
      .addVectors(s.a, s.b)
      .multiplyScalar(0.5)
      .add(s.b.set(Math.sin(agent.heading) * 0.05, 0.04, Math.cos(agent.heading) * 0.05));

    const kind = director.bubble(agent);
    if (kind !== s.bubble) {
      s.bubble = kind;
      if (kind) {
        bubbleMaterial.current!.map = bubbleTexture(kind);
        bubbleMaterial.current!.needsUpdate = true;
      }
    }
    const sprite = bubble.current!;
    sprite.visible = kind !== null;
    sprite.position.set(agent.x, 1.42 + (director.animated ? Math.sin(director.time * 2.2) * 0.03 : 0), agent.z);
    shadow.current!.position.set(agent.x, 0.012, agent.z);
  });

  const select = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(id);
  };

  const arm = (side: 1 | -1) => (
    <group ref={side === 1 ? lSh : rSh} position={[side * 0.178, 0.285, 0]}>
      <mesh geometry={sphere(0.05, 12, 10)} material={sleeve} castShadow />
      <mesh geometry={capsule(0.044, 0.09)} material={sleeve} position={[0, -0.075, 0]} castShadow />
      <group ref={side === 1 ? lEl : rEl} position={[0, -0.15, 0]}>
        <mesh geometry={capsule(0.039, 0.08)} material={forearm} position={[0, -0.065, 0]} castShadow />
        <group ref={side === 1 ? lHand : rHand} position={[0, -0.135, 0]}>
          <mesh geometry={sphere(0.046, 12, 10)} material={skin} position={[0, -0.02, 0.005]} scale={[0.9, 1, 0.8]} castShadow />
          <mesh geometry={sphere(0.018, 8, 6)} material={skin} position={[-side * 0.035, -0.005, 0.02]} />
          {side === 1 ? (
            <>
              <group ref={(o) => void (props.current.doc = o)} position={[0, -0.04, 0.07]} rotation={[-1.25, 0, 0]}>
                <mesh geometry={box(0.17, 0.22, 0.012, 0.006)} material={toon(id === "brief" ? "#8a5a35" : look.prop)} />
                <mesh geometry={box(0.14, 0.17, 0.004)} material={toon("#fbf7ee")} position={[0, -0.01, 0.008]} />
                <mesh geometry={box(0.05, 0.018, 0.01)} material={toon("#c9a24a")} position={[0, 0.1, 0.01]} />
              </group>
              <group ref={(o) => void (props.current.tablet = o)} position={[0, -0.04, 0.07]} rotation={[-1.1, 0, 0]}>
                <mesh geometry={box(0.19, 0.14, 0.012, 0.01)} material={toon("#1d2230")} />
                <mesh geometry={box(0.165, 0.115, 0.004)} material={toon("#9fe3d6")} position={[0, 0, 0.008]} />
              </group>
            </>
          ) : (
            <>
              <group ref={(o) => void (props.current.mug = o)} position={[0, -0.05, 0.035]}>
                <mesh geometry={cylinder(0.035, 0.03, 0.08, 12)} material={toon("#f3ecdd")} />
                <mesh geometry={torus(0.022, 0.007)} material={toon("#f3ecdd")} position={[0.04, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
              </group>
              <group ref={(o) => void (props.current.stamp = o)} position={[0, -0.08, 0.02]}>
                <mesh geometry={cylinder(0.018, 0.022, 0.07, 10)} material={toon("#7a4a2a")} />
                <mesh geometry={box(0.07, 0.025, 0.05, 0.008)} material={toon("#3fa36a")} position={[0, -0.045, 0]} />
              </group>
            </>
          )}
        </group>
      </group>
    </group>
  );

  const leg = (side: 1 | -1) => (
    <group ref={side === 1 ? lHip : rHip} position={[side * 0.07, 0, 0]}>
      <mesh geometry={capsule(0.058, 0.06)} material={pants} position={[0, -0.08, 0]} castShadow />
      <group ref={side === 1 ? lKnee : rKnee} position={[0, -0.16, 0]}>
        <mesh geometry={capsule(0.05, 0.08)} material={pants} position={[0, -0.075, 0]} castShadow />
        <group position={[0, -0.16, 0]}>
          <mesh geometry={box(0.1, 0.065, 0.17, 0.03)} material={shoes} position={[0, -0.03, 0.035]} castShadow />
        </group>
      </group>
    </group>
  );

  return (
    <>
      <mesh ref={shadow} geometry={circle(0.26, 20)} material={blobShadow()} rotation={[-Math.PI / 2, 0, 0]} />
      <sprite ref={bubble} scale={[0.34, 0.34, 1]} renderOrder={10} visible={false}>
        <spriteMaterial ref={bubbleMaterial} transparent depthTest={false} toneMapped={false} />
      </sprite>
      <group ref={root} onClick={select} name={`agent-${id}`}>
        <group ref={hips}>
          <mesh geometry={box(0.27, 0.11, 0.18, 0.05)} material={pants} position={[0, 0.0, 0]} castShadow />
          {leg(1)}
          {leg(-1)}
          <group ref={torso} position={[0, 0.03, 0]}>
            <mesh geometry={box(0.31, 0.33, 0.19, 0.075)} material={top} position={[0, 0.16, 0]} castShadow />
            <Outfit look={look} />
            {look.accessories.includes("lanyard") && (
              <group>
                <mesh geometry={torus(0.08, 0.008, Math.PI)} material={toon("#c9a24a")} position={[0, 0.3, 0.035]} rotation={[0.3, 0, Math.PI]} />
                <mesh geometry={box(0.05, 0.065, 0.01, 0.006)} material={toon("#f3ecdd")} position={[0.06, 0.15, 0.106]} />
              </group>
            )}
            {look.accessories.includes("headphones") && (
              <group position={[0, 0.315, 0.0]}>
                <mesh geometry={torus(0.1, 0.016)} material={toon("#23304f")} rotation={[Math.PI / 2 - 0.3, 0, 0]} />
                <mesh geometry={cylinder(0.04, 0.04, 0.035, 12)} material={toon("#23304f")} position={[0.085, -0.02, 0.06]} rotation={[0.3, 0, Math.PI / 2]} />
                <mesh geometry={cylinder(0.04, 0.04, 0.035, 12)} material={toon("#23304f")} position={[-0.085, -0.02, 0.06]} rotation={[0.3, 0, Math.PI / 2]} />
              </group>
            )}
            {arm(1)}
            {arm(-1)}
            <mesh geometry={cylinder(0.045, 0.05, 0.06, 12)} material={skinShade} position={[0, 0.34, 0]} />
            <group ref={head} position={[0, 0.355, 0]}>
              <group position={[0, 0.15, 0]}>
                <mesh geometry={sphere(0.165, 24, 18)} material={skin} scale={[1, 0.95, 0.96]} castShadow />
                <mesh geometry={sphere(0.034, 10, 8)} material={skin} position={[0.162, -0.005, 0]} />
                <mesh geometry={sphere(0.034, 10, 8)} material={skin} position={[-0.162, -0.005, 0]} />
                <mesh geometry={sphere(0.019, 10, 8)} material={skinShade} position={[0, -0.022, 0.16]} />
                <mesh geometry={sphere(0.024, 10, 8)} material={toon(shade("#e88f7a", 0))} position={[0.092, -0.04, 0.128]} scale={[1, 0.6, 0.4]} />
                <mesh geometry={sphere(0.024, 10, 8)} material={toon(shade("#e88f7a", 0))} position={[-0.092, -0.04, 0.128]} scale={[1, 0.6, 0.4]} />
                <group ref={eyes} position={[0, 0.008, 0]}>
                  {[1, -1].map((side) => (
                    <group key={side} position={[side * 0.058, 0, 0.147]}>
                      <mesh geometry={sphere(0.026, 12, 10)} material={ink} scale={[1, 1.25, 0.55]} />
                      <mesh geometry={sphere(0.008, 6, 6)} material={white} position={[0.009, 0.012, 0.012]} />
                    </group>
                  ))}
                </group>
                <group ref={brows} position={[0, 0.062, 0.148]}>
                  <mesh geometry={box(0.048, 0.012, 0.012, 0.005)} material={toon(look.hair)} position={[0.06, 0, 0]} />
                  <mesh geometry={box(0.048, 0.012, 0.012, 0.005)} material={toon(look.hair)} position={[-0.06, 0, 0]} />
                </group>
                <mesh ref={mouth} geometry={torus(0.026, 0.0065, Math.PI)} material={toon("#5a2622")} position={[0, -0.068, 0.15]} rotation={[0, 0, Math.PI]} />
                <Hair look={look} />
                <Accessories look={look} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </>
  );
}
