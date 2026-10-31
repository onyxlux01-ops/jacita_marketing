"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { StationId, StationState } from "@/lib/studio/types";
import { SEATED } from "./poses";
import type { Director } from "./director";
import {
  Board,
  Chair,
  CoffeeTable,
  Desk,
  FloorLamp,
  Keyboard,
  Laptop,
  Monitor,
  Mug,
  Papers,
  Plant,
  Printer,
  RoundTable,
  Rug,
  Shelf,
  SideTable,
  Sofa,
  WaterCooler,
} from "./furniture";
import { FLOOR, LAYOUT, PALETTE, ROUTES, WALLS, laneOffset, type V2 } from "./layout";
import { box, glow, matte, ring, toon } from "./materials";
import {
  analyticsBoardTexture,
  brandBoardTexture,
  calendarBoardTexture,
  creativeBoardTexture,
  dashTexture,
  reviewBoardTexture,
  screenTexture,
  woodTexture,
} from "./textures";

export function OfficeShell() {
  const floor = useMemo(() => {
    const tex = woodTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(5, 3.4);
    return tex;
  }, []);
  const w = FLOOR.maxX - FLOOR.minX;
  const d = FLOOR.maxZ - FLOOR.minZ;
  const wallMat = matte(PALETTE.ivory, 0.9);
  const trim = matte(PALETTE.navy, 0.6);
  return (
    <group>
      {/* Plinth the office sits on, like a model on a table. */}
      <mesh geometry={box(w + 0.5, 0.3, d + 0.5, 0.08)} material={matte(PALETTE.navyDeep, 0.7)} position={[0, -0.15, 0]} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floor} roughness={0.78} />
      </mesh>
      {/* Corridor runner. */}
      <mesh geometry={box(w - 1, 0.008, 2.3, 0.004)} material={matte("#e6dcc6", 0.95)} position={[0, 0.004, -0.27]} receiveShadow />
      {WALLS.map((wall, i) => {
        const [x1, z1] = wall.from;
        const [x2, z2] = wall.to;
        const len = Math.hypot(x2 - x1, z2 - z1);
        const t = wall.thickness ?? 0.12;
        const angle = Math.atan2(x2 - x1, z2 - z1);
        return (
          <group key={i} position={[(x1 + x2) / 2, 0, (z1 + z2) / 2]} rotation={[0, angle, 0]}>
            <mesh geometry={box(t, wall.height, len + t, 0.02)} material={wallMat} position={[0, wall.height / 2, 0]} castShadow receiveShadow />
            <mesh geometry={box(t + 0.02, 0.035, len + t + 0.02, 0.01)} material={trim} position={[0, wall.height + 0.012, 0]} />
          </group>
        );
      })}
      {/* Back-wall details: windows, sign, clock. */}
      {[-6.6, -3.9, 3.9, 6.6].map((x) => (
        <group key={x} position={[x, 0.68, FLOOR.minZ + 0.075]}>
          <mesh geometry={box(1.1, 0.5, 0.02)} material={matte(PALETTE.navy, 0.4)} />
          <mesh geometry={box(1.02, 0.42, 0.02)} material={glow("#bcd6e6")} position={[0, 0, 0.012]} />
          <mesh geometry={box(0.025, 0.42, 0.03)} material={matte(PALETTE.ivory)} position={[0, 0, 0.02]} />
        </group>
      ))}
      <group position={[0, 0.78, FLOOR.minZ + 0.08]}>
        <mesh geometry={box(1.6, 0.4, 0.04, 0.02)} material={matte(PALETTE.navy, 0.5)} />
        <mesh geometry={box(1.5, 0.05, 0.02)} material={glow(PALETTE.gold)} position={[0, -0.12, 0.025]} />
        <JacitaSign />
      </group>
      <group position={[1.9, 0.82, FLOOR.minZ + 0.08]}>
        <mesh geometry={new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24)} material={matte(PALETTE.ivory)} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={box(0.012, 0.11, 0.01)} material={matte(PALETTE.navy)} position={[0, 0.04, 0.02]} />
        <mesh geometry={box(0.08, 0.012, 0.01)} material={matte(PALETTE.navy)} position={[0.03, 0, 0.02]} />
      </group>
      {/* Meeting area and lounge between the bottom rooms. */}
      <Rug position={[0, 0, 2.35]} size={[2.6, 1.9]} color="#d9c9a5" />
      <RoundTable position={[0, 0, 2.35]} radius={0.5} />
      <Rug position={[0, 0, 4.4]} size={[3.2, 1.3]} color="#2c3c63" />
      <Sofa position={[-0.55, 0, 4.7]} rotation={0} color="#31456f" />
      <CoffeeTable position={[0.2, 0, 4.1]} />
      <Plant position={[1.75, 0, 4.7]} variant={1} />
      <FloorLamp position={[-1.85, 0, 4.85]} />
      <WaterCooler position={[2.35, 0, 1.45]} />
      <Plant position={[-2.4, 0, 1.45]} variant={0} />
      {/* Corners and corridor greenery. */}
      <Plant position={[-7.6, 0, -0.3]} variant={1} scale={1.1} />
      <Plant position={[7.6, 0, -0.3]} variant={0} scale={1.1} />
      <Plant position={[-2.95, 0, -4.9]} variant={2} />
      <Plant position={[2.4, 0, -4.9]} variant={1} />
      <Plant position={[7.6, 0, 4.85]} variant={2} />
      <Plant position={[-7.6, 0, 4.85]} variant={1} />
      <Shelf position={[-1.6, 0, FLOOR.minZ + 0.22]} width={1.0} />
      <Shelf position={[-7.0, 0, -1.95]} width={1.0} />
      <Shelf position={[7.0, 0, 4.85]} width={1.2} />
      <Shelf position={[-7.0, 0, 4.85]} width={1.2} />
    </group>
  );
}

function JacitaSign() {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1f2c4d";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#e9d9a6";
    ctx.font = "800 64px Manrope, ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JACITA", 256, 58);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={[0, 0.03, 0.022]}>
      <planeGeometry args={[1.3, 0.32]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

const BOARD_TEXTURES: Record<StationId, () => THREE.Texture> = {
  brief: brandBoardTexture,
  content: creativeBoardTexture,
  review: reviewBoardTexture,
  publishing: calendarBoardTexture,
  analytics: analyticsBoardTexture,
};

function DeskProps({ id }: { id: StationId }) {
  const y = 0.423;
  switch (id) {
    case "brief":
      return (
        <>
          <Laptop position={[0.12, y, 0.02]} rotation={-0.25} />
          <Papers position={[-0.48, y, -0.05]} count={4} />
          <Mug position={[0.6, y, -0.18]} color={PALETTE.gold} />
          <mesh geometry={box(0.18, 0.012, 0.24, 0.005)} material={toon(PALETTE.woodDark)} position={[-0.25, y + 0.006, 0.12]} rotation={[0, 0.3, 0]} />
        </>
      );
    // Monitors sit at the desk corners, angled at the chair, so the person
    // behind the desk stays visible from the camera.
    case "content":
      return (
        <>
          <Monitor position={[-0.5, y, 0.08]} rotation={-0.6} screen={screenTexture("content")} />
          <Keyboard position={[0, y + 0.008, -0.12]} />
          <mesh geometry={box(0.22, 0.012, 0.16, 0.01)} material={toon("#1d2230")} position={[-0.38, y + 0.006, -0.2]} rotation={[0, 0.3, 0]} />
          <Mug position={[0.62, y, -0.2]} />
        </>
      );
    case "review":
      return (
        <>
          <Monitor position={[0.5, y, 0.08]} rotation={0.6} screen={screenTexture("review")} />
          <Papers position={[-0.12, y, -0.16]} count={4} />
          <Papers position={[0.2, y, -0.2]} count={2} color="#e8f3ea" />
          <mesh geometry={box(0.1, 0.02, 0.07, 0.008)} material={toon("#3fa36a")} position={[-0.6, y + 0.01, -0.2]} />
        </>
      );
    case "publishing":
      return (
        <>
          <Monitor position={[0.5, y, 0.08]} rotation={0.6} screen={screenTexture("publishing")} />
          <Keyboard position={[0, y + 0.008, -0.12]} />
          <group position={[-0.6, y, -0.14]} rotation={[0, 0.4, 0]}>
            <mesh geometry={box(0.2, 0.16, 0.08, 0.01)} material={toon(PALETTE.ivory)} position={[0, 0.08, 0]} rotation={[-0.25, 0, 0]} />
            <mesh geometry={box(0.2, 0.04, 0.085, 0.01)} material={toon(PALETTE.coral)} position={[0, 0.14, 0.012]} rotation={[-0.25, 0, 0]} />
          </group>
          <Mug position={[0.3, y, -0.22]} color={PALETTE.teal} />
        </>
      );
    case "analytics":
      return (
        <>
          <Monitor position={[-0.5, y, 0.08]} rotation={-0.6} screen={screenTexture("analytics")} />
          <Keyboard position={[0, y + 0.008, -0.12]} />
          <Papers position={[0.62, y, -0.16]} count={2} color="#efe3fa" />
        </>
      );
  }
}

function SideProps({ id }: { id: StationId }) {
  switch (id) {
    case "brief":
      // Incoming assets waiting to be sorted.
      return (
        <SideTable position={[0, 0, 0]}>
          {[PALETTE.coral, "#6ea8e6", PALETTE.gold, "#5f7d67", PALETTE.plum].map((c, i) => (
            <mesh key={i} geometry={box(0.13, 0.008, 0.1, 0.004)} material={toon(c)} position={[-0.2 + (i % 3) * 0.17, 0.405 + i * 0.002, -0.1 + Math.floor(i / 3) * 0.17]} rotation={[0, i * 0.4 - 0.5, 0]} />
          ))}
          <mesh geometry={box(0.22, 0.1, 0.16, 0.01)} material={toon(PALETTE.woodDark)} position={[0.18, 0.45, 0.12]} />
        </SideTable>
      );
    case "content":
      return (
        <SideTable position={[0, 0, 0]}>
          <Printer position={[0, 0.4, 0]} />
        </SideTable>
      );
    case "review":
      // Two framed previews to compare.
      return (
        <SideTable position={[0, 0, 0]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.15, 0.4, 0]} rotation={[-0.25, 0, 0]}>
              <mesh geometry={box(0.2, 0.26, 0.02, 0.008)} material={toon(PALETTE.navy)} position={[0, 0.13, 0]} />
              <mesh geometry={box(0.17, 0.22, 0.005)} material={toon(s > 0 ? "#a9cfe0" : "#f2d29b")} position={[0, 0.13, 0.012]} />
            </group>
          ))}
        </SideTable>
      );
    case "publishing":
      // Dispatch tray with outgoing envelopes.
      return (
        <SideTable position={[0, 0, 0]}>
          <mesh geometry={box(0.36, 0.06, 0.26, 0.01)} material={toon(PALETTE.navy)} position={[0, 0.43, 0]} />
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={box(0.24, 0.012, 0.16, 0.004)} material={toon(PALETTE.ivory)} position={[0, 0.465 + i * 0.014, 0]} rotation={[0, i * 0.15, 0]} />
          ))}
        </SideTable>
      );
    case "analytics":
      // Lead inbox: enquiry cards and a phone.
      return (
        <SideTable position={[0, 0, 0]}>
          <mesh geometry={box(0.3, 0.05, 0.22, 0.01)} material={toon(PALETTE.plum)} position={[-0.1, 0.43, 0]} />
          {[0, 1].map((i) => (
            <mesh key={i} geometry={box(0.2, 0.012, 0.14, 0.004)} material={toon("#efe3fa")} position={[-0.1, 0.46 + i * 0.014, 0]} rotation={[0, i * 0.2, 0]} />
          ))}
          <mesh geometry={box(0.09, 0.02, 0.17, 0.012)} material={toon("#1d2230")} position={[0.18, 0.41, 0.02]} />
        </SideTable>
      );
  }
}

/** Folders on the desk tray: a capped picture of the queue, never one per task. */
function InboxStack({ id, queue }: { id: StationId; queue: number }) {
  const [x, z] = LAYOUT[id].inbox;
  const shown = Math.min(queue, 3);
  return (
    <group position={[x, 0.423, z]}>
      <mesh geometry={box(0.3, 0.03, 0.22, 0.01)} material={toon(PALETTE.woodDark)} position={[0, 0.015, 0]} />
      {Array.from({ length: shown }, (_, i) => (
        <mesh key={i} geometry={box(0.24, 0.018, 0.17, 0.006)} material={toon(i % 2 ? PALETTE.gold : PALETTE.navy)} position={[0, 0.04 + i * 0.02, 0]} rotation={[0, (i - 1) * 0.12, 0]} />
      ))}
    </group>
  );
}

const MOOD_RING: Record<string, string> = PALETTE.status;

function StationChair({ id, director }: { id: StationId; director: Director }) {
  const ref = useRef<THREE.Group>(null);
  const seat = LAYOUT[id].seat.pos;
  useFrame(() => {
    const agent = director.agents[id];
    const near = Math.hypot(agent.x - seat[0], agent.z - seat[1]) < 0.25;
    // Tuck the chair back while its owner stands at the desk.
    const target = near && !SEATED.has(agent.action) ? -0.22 : 0;
    const g = ref.current!;
    g.position.z += (seat[1] + target - g.position.z) * (director.animated ? 0.15 : 1);
  });
  return (
    <group ref={ref} position={[seat[0], 0, seat[1]]}>
      <Chair color={id === "content" ? PALETTE.gold : PALETTE.navy} />
    </group>
  );
}

export function Station({
  id,
  state,
  selected,
  director,
  onSelect,
}: {
  id: StationId;
  state: StationState;
  selected: boolean;
  director: Director;
  onSelect: (id: StationId) => void;
}) {
  const l = LAYOUT[id];
  const [x, z] = l.origin;
  const boardMap = useMemo(() => BOARD_TEXTURES[id](), [id]);
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      <Rug position={[x - l.side * 0.25, 0, z - 0.45]} size={[3.4, 2.5]} color={l.rug} />
      {selected && (
        <mesh geometry={ring(1.95, 2.05, 48)} material={glow(PALETTE.gold, 0.85)} rotation={[-Math.PI / 2, 0, 0]} position={[x - l.side * 0.25, 0.02, z - 0.45]} scale={[1, 0.74, 1]} />
      )}
      <mesh geometry={ring(0.3, 0.36, 32)} material={glow(MOOD_RING[state.mood], 0.9)} rotation={[-Math.PI / 2, 0, 0]} position={[l.seat.pos[0], 0.018, l.seat.pos[1]]} />
      <Desk position={[x, 0, z]}>
        <DeskProps id={id} />
      </Desk>
      <InboxStack id={id} queue={state.queue} />
      <StationChair id={id} director={director} />
      <Board position={[l.boardPos[0], 0, l.boardPos[1]]} map={boardMap} />
      <group position={[l.sideTable[0], 0, l.sideTable[1]]} rotation={[0, l.side * (Math.PI / 2), 0]}>
        <SideProps id={id} />
      </group>
    </group>
  );
}

function ribbonGeometry(path: V2[], width: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let u = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, z1] = path[i];
    const [x2, z2] = path[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1e-4) continue;
    const nx = (-(z2 - z1) / len) * (width / 2);
    const nz = ((x2 - x1) / len) * (width / 2);
    const base = positions.length / 3;
    positions.push(x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz, x2 + nx, 0, z2 + nz, x2 - nx, 0, z2 - nz);
    const u2 = u + len / 0.42;
    uvs.push(u, 1, u, 0, u2, 1, u2, 0);
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    u = u2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/**
 * Floor markers for every workflow route. Chevrons point the way work travels;
 * a route lights up and its chevrons stream while someone is walking it.
 */
export function FloorPaths({ director }: { director: Director }) {
  const routes = useMemo(
    () =>
      Object.entries(ROUTES).map(([key, path]) => {
        const revision = key === "review>content";
        const map = dashTexture(revision ? PALETTE.coral : PALETTE.gold).clone();
        map.needsUpdate = true;
        const geometry = ribbonGeometry(laneOffset(path.slice(1), revision ? -0.12 : 0.12), 0.13);
        return { key, map, geometry };
      }),
    [],
  );
  const materials = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  useFrame((_, dt) => {
    routes.forEach((r, i) => {
      const m = materials.current[i];
      if (!m) return;
      const active = director.activeRoutes.has(r.key);
      m.opacity += ((active ? 0.95 : 0.38) - m.opacity) * Math.min(1, dt * 4);
      if (active && director.animated && m.map) m.map.offset.x -= dt * 1.6;
    });
  });
  return (
    <group position={[0, 0.016, 0]}>
      {routes.map((r, i) => (
        <mesh key={r.key} geometry={r.geometry} renderOrder={1}>
          <meshBasicMaterial
            ref={(m) => void (materials.current[i] = m)}
            map={r.map}
            transparent
            opacity={0.38}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

const TOKEN_COLORS = {
  brief: PALETTE.navy,
  draft: PALETTE.gold,
  revision: PALETTE.coral,
  report: PALETTE.ivory,
};

/** The small branded folders and cards that travel between stations. */
export function Tokens({ director }: { director: Director }) {
  const refs = useRef<Array<THREE.Group | null>>([]);
  const kinds = useRef<Array<string | null>>([]);
  useFrame(() => {
    director.tokens.forEach((token, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.visible = token.active;
      if (!token.active) return;
      const holder = token.holder ? director.agents[token.holder] : null;
      if (holder) {
        g.position.copy(holder.carryPoint);
        g.rotation.y = holder.heading;
      } else g.position.copy(token.position);
      const fade = token.fadeAt ? Math.max(0, Math.min(1, (token.fadeAt - director.time) / 0.4)) : 1;
      g.scale.setScalar(fade);
      if (kinds.current[i] !== token.kind) {
        kinds.current[i] = token.kind;
        g.children.forEach((c) => (c.visible = c.name === token.kind));
      }
    });
  });
  return (
    <>
      {director.tokens.map((token, i) => (
        <group key={token.id} ref={(g) => void (refs.current[i] = g)} visible={false}>
          {(Object.keys(TOKEN_COLORS) as Array<keyof typeof TOKEN_COLORS>).map((kind) => (
            <group key={kind} name={kind} visible={false}>
              <mesh geometry={box(0.24, 0.03, 0.18, 0.008)} material={toon(TOKEN_COLORS[kind])} castShadow />
              {kind === "report" ? (
                <>
                  <mesh geometry={box(0.03, 0.01, 0.07)} material={toon(PALETTE.teal)} position={[-0.05, 0.02, 0.02]} />
                  <mesh geometry={box(0.03, 0.01, 0.11)} material={toon(PALETTE.gold)} position={[0, 0.02, 0]} />
                  <mesh geometry={box(0.03, 0.01, 0.14)} material={toon(PALETTE.navy)} position={[0.05, 0.02, -0.015]} />
                </>
              ) : (
                <>
                  <mesh geometry={box(0.08, 0.034, 0.04, 0.006)} material={toon(TOKEN_COLORS[kind])} position={[-0.06, 0.004, -0.1]} />
                  <mesh geometry={box(0.07, 0.008, 0.07, 0.01)} material={toon(kind === "brief" ? PALETTE.gold : PALETTE.ivory)} position={[0, 0.018, 0]} />
                </>
              )}
            </group>
          ))}
        </group>
      ))}
    </>
  );
}
