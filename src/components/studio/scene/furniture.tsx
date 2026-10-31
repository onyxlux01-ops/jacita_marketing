"use client";

import type { ReactNode } from "react";
import * as THREE from "three";
import { PALETTE } from "./layout";
import { blobShadow, box, circle, cone, cylinder, glow, matte, sphere, toon } from "./materials";

/* Reusable, low-poly office furniture in the Jacita palette. */

type P = { position?: [number, number, number]; rotation?: number; children?: ReactNode };

export function Desk({ position, rotation = 0, children, width = 1.5, depth = 0.7 }: P & { width?: number; depth?: number }) {
  const top = matte(PALETTE.woodLight, 0.6);
  const leg = matte(PALETTE.navy, 0.5);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={box(width, 0.045, depth, 0.015)} material={top} position={[0, 0.4, 0]} castShadow receiveShadow />
      <mesh geometry={box(width - 0.06, 0.24, 0.02)} material={matte(PALETTE.ivoryWarm)} position={[0, 0.25, depth / 2 - 0.04]} castShadow />
      {[1, -1].map((sx) => (
        <mesh key={sx} geometry={box(0.04, 0.38, depth - 0.08)} material={leg} position={[sx * (width / 2 - 0.05), 0.19, 0]} castShadow />
      ))}
      <mesh geometry={circle(Math.max(width, depth) * 0.62, 24)} material={blobShadow()} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} scale={[1, depth / width + 0.2, 1]} />
      {children}
    </group>
  );
}

export function Chair({ color = PALETTE.navy }: { color?: string }) {
  const fabric = toon(color);
  const metal = matte("#3a3f4b", 0.4);
  return (
    <group>
      <mesh geometry={box(0.36, 0.06, 0.34, 0.03)} material={fabric} position={[0, 0.235, 0]} castShadow />
      <mesh geometry={box(0.34, 0.34, 0.06, 0.03)} material={fabric} position={[0, 0.44, -0.18]} rotation={[-0.1, 0, 0]} castShadow />
      <mesh geometry={cylinder(0.025, 0.025, 0.18, 8)} material={metal} position={[0, 0.12, 0]} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} geometry={box(0.025, 0.02, 0.2)} material={metal} position={[Math.sin(a) * 0.09, 0.03, Math.cos(a) * 0.09]} rotation={[0, a, 0]} />
        );
      })}
    </group>
  );
}

export function Monitor({ position, rotation = 0, screen }: P & { screen?: THREE.Texture }) {
  const frame = matte("#1d2230", 0.45);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={box(0.16, 0.012, 0.1)} material={frame} position={[0, 0.006, 0]} />
      <mesh geometry={box(0.03, 0.14, 0.03)} material={frame} position={[0, 0.07, -0.01]} />
      <mesh geometry={box(0.5, 0.31, 0.03, 0.012)} material={frame} position={[0, 0.27, 0]} castShadow />
      {screen && (
        <mesh position={[0, 0.27, -0.017]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.46, 0.27]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function Laptop({ position, rotation = 0 }: P) {
  const shell = matte("#c9ccd2", 0.35);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={box(0.34, 0.015, 0.24, 0.006)} material={shell} position={[0, 0.008, 0]} />
      <mesh geometry={box(0.34, 0.22, 0.012, 0.006)} material={shell} position={[0, 0.115, 0.115]} rotation={[0.25, 0, 0]} />
      <mesh geometry={circle(0.025, 16)} material={glow("#f3ecdd")} position={[0, 0.12, 0.124]} rotation={[0.25, 0, 0]} />
    </group>
  );
}

export function Keyboard({ position }: P) {
  return <mesh geometry={box(0.34, 0.015, 0.11, 0.006)} material={matte("#e8e3d8", 0.5)} position={position} />;
}

export function Papers({ position, count = 3, color = "#fbf7ee", rotation = 0 }: P & { count?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} geometry={box(0.2, 0.006, 0.27)} material={matte(i === count - 1 ? color : "#f3ecdd", 0.9)} position={[i * 0.008, i * 0.007, -i * 0.006]} rotation={[0, i * 0.12 - 0.1, 0]} />
      ))}
    </group>
  );
}

export function Mug({ position, color = PALETTE.ivory }: P & { color?: string }) {
  return (
    <group position={position}>
      <mesh geometry={cylinder(0.035, 0.03, 0.08, 12)} material={toon(color)} position={[0, 0.04, 0]} />
      <mesh geometry={circle(0.03, 12)} material={matte("#4a2c1c")} position={[0, 0.079, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

/** Freestanding easel board facing the camera. */
export function Board({ position, map, width = 1.05, height = 0.79 }: P & { map: THREE.Texture; width?: number; height?: number }) {
  const legs = matte(PALETTE.woodDark, 0.6);
  return (
    <group position={position}>
      <group position={[0, 0.48 + height / 2, 0]} rotation={[-0.12, 0, 0]}>
        <mesh geometry={box(width + 0.06, height + 0.06, 0.04, 0.012)} material={matte(PALETTE.navy, 0.5)} castShadow />
        <mesh position={[0, 0, 0.022]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial map={map} roughness={0.8} />
        </mesh>
        <mesh geometry={box(width * 0.9, 0.03, 0.06)} material={legs} position={[0, -height / 2 - 0.04, 0.03]} />
      </group>
      {[1, -1].map((s) => (
        <mesh key={s} geometry={box(0.035, 0.95, 0.035)} material={legs} position={[s * (width / 2 - 0.05), 0.47, -0.02]} rotation={[-0.12, 0, s * 0.03]} castShadow />
      ))}
      <mesh geometry={box(0.035, 0.98, 0.035)} material={legs} position={[0, 0.48, -0.22]} rotation={[0.25, 0, 0]} />
    </group>
  );
}

export function SideTable({ position, children, width = 0.62, depth = 0.5 }: P & { width?: number; depth?: number }) {
  return (
    <group position={position}>
      <mesh geometry={box(width, 0.04, depth, 0.012)} material={matte(PALETTE.wood, 0.6)} position={[0, 0.38, 0]} castShadow receiveShadow />
      <mesh geometry={box(width - 0.06, 0.34, depth - 0.06)} material={matte(PALETTE.ivoryWarm, 0.8)} position={[0, 0.18, 0]} castShadow />
      {children}
    </group>
  );
}

export function Plant({ position, scale = 1, variant = 0 }: P & { scale?: number; variant?: number }) {
  const leaf = toon(variant % 2 ? "#5f8f5a" : "#4e7d55");
  const leaf2 = toon(variant % 2 ? "#79a86f" : "#6a9b63");
  return (
    <group position={position} scale={scale}>
      <mesh geometry={cylinder(0.13, 0.1, 0.24, 14)} material={toon(variant % 3 === 2 ? PALETTE.navy : "#d9cbb0")} position={[0, 0.12, 0]} castShadow />
      <mesh geometry={circle(0.12, 14)} material={matte("#4a3424")} position={[0, 0.235, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      {variant % 2 === 0 ? (
        <>
          <mesh geometry={sphere(0.17, 12, 10)} material={leaf} position={[0, 0.42, 0]} castShadow />
          <mesh geometry={sphere(0.12, 10, 8)} material={leaf2} position={[0.1, 0.55, 0.04]} castShadow />
          <mesh geometry={sphere(0.11, 10, 8)} material={leaf2} position={[-0.09, 0.52, -0.05]} castShadow />
        </>
      ) : (
        [0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} geometry={cone(0.05, 0.42, 5)} material={i % 2 ? leaf : leaf2} position={[Math.sin(a) * 0.05, 0.42, Math.cos(a) * 0.05]} rotation={[Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]} castShadow />
          );
        })
      )}
      <mesh geometry={circle(0.22, 16)} material={blobShadow()} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} />
    </group>
  );
}

export function Shelf({ position, rotation = 0, width = 1.1 }: P & { width?: number }) {
  const colors = [PALETTE.navy, PALETTE.gold, "#5f7d67", PALETTE.coral, PALETTE.plum, "#f3ecdd"];
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={box(width, 0.9, 0.3, 0.01)} material={matte(PALETTE.wood, 0.65)} position={[0, 0.45, 0]} castShadow />
      {[0.3, 0.6].map((y) => (
        <group key={y}>
          <mesh geometry={box(width - 0.06, 0.02, 0.27)} material={matte(PALETTE.woodLight)} position={[0, y, 0.02]} />
          {Array.from({ length: Math.floor(width / 0.09) }, (_, i) => (
            <mesh key={i} geometry={box(0.06, 0.2 + ((i * 7) % 5) * 0.012, 0.2)} material={toon(colors[(i + y * 10) % colors.length])} position={[-width / 2 + 0.08 + i * 0.085, y + 0.11, 0.04]} />
          ))}
        </group>
      ))}
    </group>
  );
}

export function Sofa({ position, rotation = 0, color = PALETTE.navy }: P & { color?: string }) {
  const fabric = toon(color);
  const cushion = toon("#2c3c63");
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={box(1.5, 0.22, 0.62, 0.08)} material={fabric} position={[0, 0.16, 0]} castShadow />
      <mesh geometry={box(1.5, 0.42, 0.16, 0.07)} material={fabric} position={[0, 0.33, -0.25]} castShadow />
      {[1, -1].map((s) => (
        <mesh key={s} geometry={box(0.16, 0.34, 0.62, 0.07)} material={fabric} position={[s * 0.72, 0.24, 0]} castShadow />
      ))}
      {[1, -1].map((s) => (
        <mesh key={s} geometry={box(0.64, 0.08, 0.48, 0.04)} material={cushion} position={[s * 0.33, 0.3, 0.04]} />
      ))}
      <mesh geometry={box(0.22, 0.2, 0.08, 0.04)} material={toon(PALETTE.gold)} position={[-0.45, 0.42, -0.12]} rotation={[-0.2, 0.2, 0.1]} />
      <mesh geometry={circle(0.9, 24)} material={blobShadow()} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} scale={[1, 0.5, 1]} />
    </group>
  );
}

export function RoundTable({ position, radius = 0.55, seats = 4 }: P & { radius?: number; seats?: number }) {
  return (
    <group position={position}>
      <mesh geometry={cylinder(radius, radius, 0.05, 32)} material={matte(PALETTE.woodLight, 0.55)} position={[0, 0.4, 0]} castShadow receiveShadow />
      <mesh geometry={cylinder(0.05, 0.08, 0.38, 10)} material={matte(PALETTE.navy)} position={[0, 0.19, 0]} />
      <mesh geometry={cylinder(0.22, 0.22, 0.02, 20)} material={matte(PALETTE.navy)} position={[0, 0.01, 0]} />
      {Array.from({ length: seats }, (_, i) => {
        const a = (i / seats) * Math.PI * 2 + Math.PI / seats;
        return (
          <group key={i} position={[Math.sin(a) * (radius + 0.3), 0, Math.cos(a) * (radius + 0.3)]} rotation={[0, a + Math.PI, 0]}>
            <Chair color={i % 2 ? PALETTE.gold : "#2c3c63"} />
          </group>
        );
      })}
      <mesh geometry={circle(radius + 0.5, 28)} material={blobShadow()} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} />
    </group>
  );
}

export function CoffeeTable({ position }: P) {
  return (
    <group position={position}>
      <mesh geometry={box(0.8, 0.04, 0.42, 0.015)} material={matte(PALETTE.woodDark, 0.6)} position={[0, 0.24, 0]} castShadow />
      {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z], i) => (
        <mesh key={i} geometry={box(0.03, 0.22, 0.03)} material={matte(PALETTE.navy)} position={[x * 0.36, 0.11, z * 0.17]} />
      ))}
      <Mug position={[0.2, 0.26, 0.05]} color={PALETTE.gold} />
      <Mug position={[-0.12, 0.26, -0.06]} />
      <mesh geometry={box(0.22, 0.02, 0.16, 0.005)} material={toon(PALETTE.coral)} position={[0, 0.27, 0.06]} rotation={[0, 0.3, 0]} />
    </group>
  );
}

export function WaterCooler({ position }: P) {
  return (
    <group position={position}>
      <mesh geometry={box(0.3, 0.5, 0.3, 0.04)} material={toon(PALETTE.ivory)} position={[0, 0.25, 0]} castShadow />
      <mesh geometry={cylinder(0.12, 0.12, 0.3, 16)} material={new THREE.MeshStandardMaterial({ color: "#9fd3e6", transparent: true, opacity: 0.75, roughness: 0.1 })} position={[0, 0.66, 0]} />
      <mesh geometry={box(0.06, 0.04, 0.04)} material={toon(PALETTE.coral)} position={[0.06, 0.38, 0.16]} />
      <mesh geometry={box(0.06, 0.04, 0.04)} material={toon("#6ea8e6")} position={[-0.06, 0.38, 0.16]} />
    </group>
  );
}

export function FloorLamp({ position }: P) {
  return (
    <group position={position}>
      <mesh geometry={cylinder(0.12, 0.14, 0.03, 16)} material={matte(PALETTE.navy)} position={[0, 0.015, 0]} />
      <mesh geometry={cylinder(0.015, 0.015, 1.0, 8)} material={matte(PALETTE.gold, 0.4)} position={[0, 0.5, 0]} />
      <mesh geometry={cylinder(0.12, 0.2, 0.22, 16)} material={toon("#f5e7c4")} position={[0, 1.05, 0]} castShadow />
    </group>
  );
}

export function Rug({ position, size, color, rotation = 0 }: P & { size: [number, number]; color: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={box(size[0], 0.012, size[1], 0.005)} material={matte(color, 0.95)} position={[0, 0.006, 0]} receiveShadow />
      <mesh geometry={box(size[0] - 0.16, 0.014, size[1] - 0.16, 0.004)} material={matte(new THREE.Color(color).offsetHSL(0, 0, 0.06).getStyle(), 0.95)} position={[0, 0.008, 0]} receiveShadow />
    </group>
  );
}

export function Printer({ position }: P) {
  return (
    <group position={position}>
      <mesh geometry={box(0.42, 0.18, 0.32, 0.03)} material={toon("#e8e3d8")} position={[0, 0.09, 0]} castShadow />
      <mesh geometry={box(0.36, 0.02, 0.12)} material={toon("#2c3346")} position={[0, 0.17, 0.06]} />
      <mesh geometry={box(0.24, 0.005, 0.18)} material={matte("#fbf7ee")} position={[0, 0.2, -0.02]} rotation={[-0.3, 0, 0]} />
    </group>
  );
}
