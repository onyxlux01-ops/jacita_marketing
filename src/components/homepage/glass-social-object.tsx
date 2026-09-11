"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { GlassObjectConfig } from "./hero-objects";
import type { PointerNorm } from "./use-hero-environment";

type Props = {
  config: GlassObjectConfig;
  pointer: PointerNorm;
  tilt: PointerNorm;
  reducedMotion: boolean;
  isMobile: boolean;
  influence: number;
};

function springStep(
  current: number,
  target: number,
  velocity: { v: number },
  dt: number,
  stiffness = 14,
  damping = 12
) {
  const force = (target - current) * stiffness;
  velocity.v += force * dt;
  velocity.v *= Math.exp(-damping * dt);
  return current + velocity.v * dt;
}

function useLogoTextures(src: string, enabled: boolean) {
  const [maps, setMaps] = useState<{
    primary: THREE.Texture;
    ghost: THREE.Texture;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let objectUrl: string | null = null;

    const load = async () => {
      try {
        const res = await fetch(src);
        let svg = await res.text();
        if (!/\swidth=/.test(svg)) {
          svg = svg.replace(/<svg\b/, '<svg width="512" height="512"');
        }
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.decoding = "async";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("logo decode failed"));
          img.src = objectUrl!;
        });
        if (disposed) return;

        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const pad = size * 0.1;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);

        const primary = new THREE.CanvasTexture(canvas);
        primary.colorSpace = THREE.SRGBColorSpace;
        primary.anisotropy = 8;
        primary.needsUpdate = true;
        const ghost = primary.clone();
        ghost.needsUpdate = true;
        setMaps({ primary, ghost });
      } catch {
        if (!disposed) setMaps(null);
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    };

    void load();
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, enabled]);

  useEffect(
    () => () => {
      maps?.primary.dispose();
      maps?.ghost.dispose();
    },
    [maps]
  );

  return maps;
}

export function GlassSocialObject({
  config,
  pointer,
  tilt,
  reducedMotion,
  isMobile,
  influence,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const logoStack = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const vel = useRef({ x: { v: 0 }, y: { v: 0 }, z: { v: 0 } });
  const pos = useRef({
    x: config.position[0],
    y: config.position[1],
    z: config.position[2],
  });

  const isFiller = !!config.filler;
  const maps = useLogoTextures(config.logo, !isFiller);
  const texture = maps?.primary ?? null;
  const ghostMap = maps?.ghost ?? null;

  const depth = isFiller ? 0.45 : isMobile ? 0.55 : 0.78;
  const half = depth / 2;
  const boxSize = isFiller ? 0.95 : 1.08;
  const glowHex = config.glow;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.033);
    const t = state.clock.elapsedTime;
    const [rx, ry, rz] = config.restRotation;

    const restX = config.position[0];
    const restY = config.position[1];
    const restZ = config.position[2];

    if (reducedMotion) {
      g.position.set(restX, restY, restZ);
      g.rotation.set(rx, ry, rz);
      return;
    }

    const amp = isFiller ? 0.6 : 1;
    const floatY = Math.sin(t * 0.4 + config.rotSeed) * 0.05 * amp;
    const floatX = Math.cos(t * 0.28 + config.rotSeed) * 0.028 * amp;

    const px = pointer.x + tilt.x * 0.45;
    const py = pointer.y + tilt.y * 0.45;
    const inf = influence * (isFiller ? 0.45 : 1);

    const targetX = restX + floatX + px * 0.12 * inf;
    const targetY = restY + floatY + py * 0.1 * inf;
    const targetZ = restZ + px * 0.04 * inf;

    pos.current.x = springStep(pos.current.x, targetX, vel.current.x, dt);
    pos.current.y = springStep(pos.current.y, targetY, vel.current.y, dt);
    pos.current.z = springStep(pos.current.z, targetZ, vel.current.z, dt, 10, 10);

    g.position.set(pos.current.x, pos.current.y, pos.current.z);
    g.rotation.set(
      rx + py * 0.06 * inf + Math.sin(t * 0.22 + config.rotSeed) * 0.03,
      ry + px * 0.08 * inf + Math.cos(t * 0.18 + config.rotSeed) * 0.035,
      rz + Math.sin(t * 0.15 + config.rotSeed) * 0.02
    );

    if (logoStack.current) {
      logoStack.current.position.z =
        Math.sin(t * 0.35 + config.rotSeed) * 0.012;
    }
    if (light.current) {
      light.current.intensity =
        (isFiller ? 0.12 : 0.55) +
        Math.sin(t * 0.5 + config.rotSeed) * 0.06;
    }
  });

  return (
    <group ref={group} scale={config.scale} position={config.position}>
      <pointLight
        ref={light}
        color={glowHex}
        intensity={isFiller ? 0.12 : 0.55}
        distance={isFiller ? 2 : 3.8}
        decay={2}
        position={[0.15, 0.2, half + 0.45]}
      />
      {!isFiller && (
        <pointLight
          color={glowHex}
          intensity={0.22}
          distance={2.4}
          decay={2}
          position={[0, 0, -half * 0.3]}
        />
      )}

      {/* Soft internal colour volume */}
      {!isFiller && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshBasicMaterial
            color={glowHex}
            transparent
            opacity={0.09}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      <RoundedBox
        args={[boxSize, boxSize, depth]}
        radius={isFiller ? 0.14 : 0.18}
        smoothness={isMobile ? 4 : 8}
      >
        <MeshTransmissionMaterial
          backside
          samples={isMobile || isFiller ? 4 : 10}
          resolution={isMobile || isFiller ? 256 : 512}
          transmission={1}
          roughness={0.04}
          thickness={isFiller ? 0.45 : 0.85}
          ior={1.52}
          chromaticAberration={isFiller ? 0.01 : 0.028}
          anisotropy={0.1}
          distortion={isFiller ? 0.04 : 0.14}
          distortionScale={isFiller ? 0.1 : 0.28}
          temporalDistortion={0}
          color="#ffffff"
          attenuationColor={isFiller ? "#ffffff" : glowHex}
          attenuationDistance={isFiller ? 2.5 : 1.15}
        />
      </RoundedBox>

      {/* Specular edge catch — thin brighter shell, slightly larger */}
      <RoundedBox
        args={[boxSize * 1.015, boxSize * 1.015, depth * 1.02]}
        radius={isFiller ? 0.145 : 0.185}
        smoothness={4}
      >
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.07}
          roughness={0.02}
          metalness={0.15}
          clearcoat={1}
          clearcoatRoughness={0.04}
          depthWrite={false}
        />
      </RoundedBox>

      {!isFiller && (
        <group ref={logoStack}>
          {ghostMap && (
            <mesh position={[0, 0, -half * 0.4]} renderOrder={1}>
              <planeGeometry args={[0.5, 0.5]} />
              <meshBasicMaterial
                map={ghostMap}
                transparent
                opacity={0.28}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          )}

          <mesh position={[0, 0, -0.04]}>
            <circleGeometry args={[0.34, 32]} />
            <meshBasicMaterial
              color={glowHex}
              transparent
              opacity={0.22}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          <mesh position={[0, 0, 0.015]}>
            <planeGeometry args={[0.56, 0.56]} />
            <meshPhysicalMaterial
              color="#fbfcfe"
              transparent
              opacity={0.28}
              roughness={0.9}
              metalness={0}
              depthWrite={false}
            />
          </mesh>

          {texture && (
            <mesh position={[0, 0, half * 0.22]} renderOrder={3}>
              <planeGeometry args={[0.54, 0.54]} />
              <meshBasicMaterial
                map={texture}
                transparent
                opacity={1}
                depthWrite={false}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}
