"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { MOOD_META, STATIONS } from "@/lib/studio/stations";
import type { StationId, StationState, StudioEvent } from "@/lib/studio/types";
import { Agent, LOOKS } from "./agent";
import { Director } from "./director";
import { LAYOUT } from "./layout";
import { FloorPaths, OfficeShell, Station, Tokens } from "./office";

export type StudioSceneProps = {
  states: Record<StationId, StationState>;
  events: StudioEvent[];
  selected: StationId | null;
  onSelect: (id: StationId) => void;
  /** Characters move and hand work over. Off = representative still poses. */
  animate: boolean;
  /** The studio is on screen and the tab is visible. */
  visible: boolean;
  zoom: number;
  compact: boolean;
};

const PITCH = THREE.MathUtils.degToRad(55);
const CENTER = new THREE.Vector3(0, 0, 0.1);

function CameraRig({ zoom, focus, animate }: { zoom: number; focus: StationId | null; animate: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const target = useRef(CENTER.clone());
  const desired = useRef(new THREE.Vector3());
  const goal = useRef(new THREE.Vector3());

  useEffect(() => void invalidate(), [zoom, focus, size.width, size.height, invalidate]);

  useFrame((_, dt) => {
    const aspect = size.width / Math.max(1, size.height);
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    // Fit the whole floor plan: width directly, depth foreshortened by the pitch.
    const fitW = 8.5 / Math.tan(hHalf);
    const fitD = (5.55 * Math.sin(PITCH) + 0.9 * Math.cos(PITCH)) / Math.tan(vHalf);
    const distance = Math.max(fitW, fitD) / zoom;
    goal.current.copy(CENTER);
    if (focus && zoom > 1.01) {
      const [x, z] = LAYOUT[focus].origin;
      const k = Math.min(1, (zoom - 1) / 0.8);
      goal.current.set(CENTER.x + (x - CENTER.x) * k * 0.85, 0, CENTER.z + (z - 0.4 - CENTER.z) * k * 0.85);
    }
    const ease = animate ? 1 - Math.exp(-dt * 5) : 1;
    target.current.lerp(goal.current, ease);
    desired.current.set(
      target.current.x,
      target.current.y + Math.sin(PITCH) * distance,
      target.current.z + Math.cos(PITCH) * distance,
    );
    camera.position.lerp(desired.current, ease);
    camera.lookAt(target.current);
    if (animate && camera.position.distanceToSquared(desired.current) > 1e-5) invalidate();
  });
  return null;
}

/** Renders on demand, at a capped rate, and only while the studio is visible. */
function FrameDriver({ active, fps }: { active: boolean; fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    if (!active) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= 1000 / fps - 2) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, fps, invalidate]);
  return null;
}

function DirectorTicker({ director }: { director: Director }) {
  useFrame((_, dt) => director.update(dt));
  return null;
}

/** Feeds React props into the director and requests a frame when they change. */
function DirectorSync({
  director,
  states,
  events,
  animate,
}: {
  director: Director;
  states: StudioSceneProps["states"];
  events: StudioEvent[];
  animate: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    director.setStations(states);
    invalidate();
  }, [director, states, invalidate]);
  useEffect(() => director.enqueue(events), [director, events]);
  useEffect(() => {
    director.setAnimated(animate);
    invalidate();
  }, [director, animate, invalidate]);
  return null;
}

function StationLabels({
  states,
  selected,
  onSelect,
  compact,
}: Pick<StudioSceneProps, "states" | "selected" | "onSelect" | "compact">) {
  return (
    <>
      {STATIONS.map((s) => {
        const state = states[s.id];
        const l = LAYOUT[s.id];
        const top = l.origin[1] < 0;
        return (
          <Html
            key={s.id}
            position={[l.boardPos[0], top ? 1.55 : 1.5, l.boardPos[1]]}
            center
            zIndexRange={[30, 0]}
          >
            <button
              type="button"
              className="studio-label"
              data-compact={compact || undefined}
              aria-pressed={selected === s.id}
              data-tone={state.unknown ? "neutral" : MOOD_META[state.mood].tone}
              aria-label={`${s.name}: ${state.statusLabel}. ${state.queueLabel}. Open details.`}
              onClick={() => onSelect(s.id)}
            >
              <span className="studio-label-dot" aria-hidden />
              <span className="studio-label-name">{compact ? s.order : s.shortName}</span>
              <span className="studio-label-count">
                {state.unknown ? "—" : state.queue.toLocaleString("en-GB")}
              </span>
            </button>
          </Html>
        );
      })}
    </>
  );
}

export default function StudioScene({
  states,
  events,
  selected,
  onSelect,
  animate,
  visible,
  zoom,
  compact,
}: StudioSceneProps) {
  const [director] = useState(() => {
    const d = new Director();
    d.ignore(events);
    d.setStations(states);
    return d;
  });

  return (
    <Canvas
      className="studio-canvas"
      frameloop="demand"
      shadows={!compact}
      dpr={[1, compact ? 1.5 : 1.75]}
      camera={{ fov: 30, near: 0.5, far: 80, position: [0, 18, 12] }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onPointerMissed={() => undefined}
    >
      <color attach="background" args={["#0b1114"]} />
      <fog attach="fog" args={["#0b1114", 26, 46]} />
      <hemisphereLight args={["#fff6e6", "#3a3020", 1.25]} />
      <directionalLight
        position={[6, 14, 8]}
        intensity={1.55}
        color="#fff3dc"
        castShadow={!compact}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={2}
        shadow-camera-far={40}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-8, 6, -4]} intensity={0.35} color="#bcd0ff" />
      <DirectorTicker director={director} />
      <DirectorSync director={director} states={states} events={events} animate={animate} />
      <FrameDriver active={visible && animate} fps={compact ? 30 : 45} />
      <CameraRig zoom={zoom} focus={selected} animate={animate && visible} />
      <OfficeShell />
      <FloorPaths director={director} />
      {STATIONS.map((s) => (
        <Station
          key={s.id}
          id={s.id}
          state={states[s.id]}
          selected={selected === s.id}
          director={director}
          onSelect={onSelect}
        />
      ))}
      {STATIONS.map((s) => (
        <Agent key={s.id} id={s.id} director={director} look={LOOKS[s.id]} onSelect={onSelect} />
      ))}
      <Tokens director={director} />
      <StationLabels states={states} selected={selected} onSelect={onSelect} compact={compact} />
    </Canvas>
  );
}
