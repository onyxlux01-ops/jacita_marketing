"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import { GlassSocialObject } from "./glass-social-object";
import { DESKTOP_OBJECTS, MOBILE_OBJECTS } from "./hero-objects";
import type { PointerNorm } from "./use-hero-environment";

type SceneProps = {
  isMobile: boolean;
  isTablet: boolean;
  reducedMotion: boolean;
  visible: boolean;
  pointer: PointerNorm;
  tilt: PointerNorm;
};

function StudioFloor() {
  return (
    <group position={[0, -2.25, 0]}>
      {/* Soft reflective stage */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 14]} />
        <meshPhysicalMaterial
          color="#f4f6f9"
          roughness={0.22}
          metalness={0.08}
          clearcoat={0.55}
          clearcoatRoughness={0.35}
          transparent
          opacity={0.72}
          envMapIntensity={0.65}
        />
      </mesh>
      {/* Faint caustic-like colour wash under the cluster */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.4, 0.01, 0.2]}>
        <circleGeometry args={[2.8, 48]} />
        <meshBasicMaterial
          color="#dce8f5"
          transparent
          opacity={0.18}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.6, 0.012, -0.4]}>
        <circleGeometry args={[1.6, 40]} />
        <meshBasicMaterial
          color="#f0dde6"
          transparent
          opacity={0.12}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ParallaxRig({
  pointer,
  tilt,
  reducedMotion,
  children,
}: {
  pointer: PointerNorm;
  tilt: PointerNorm;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const current = useRef({ x: 0, y: 0 });

  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return;
    const dt = Math.min(delta, 0.033);
    const tx = (pointer.x + tilt.x * 0.5) * 0.08;
    const ty = (pointer.y + tilt.y * 0.5) * 0.05;
    current.current.x += (tx - current.current.x) * Math.min(1, dt * 4);
    current.current.y += (ty - current.current.y) * Math.min(1, dt * 4);
    group.current.rotation.y = current.current.x;
    group.current.rotation.x = -current.current.y;
  });

  return <group ref={group}>{children}</group>;
}

function SceneContents({
  isMobile,
  isTablet,
  reducedMotion,
  pointer,
  tilt,
}: Omit<SceneProps, "visible">) {
  const objects = isMobile ? MOBILE_OBJECTS : DESKTOP_OBJECTS;
  const influence = isMobile ? 0.35 : isTablet ? 0.55 : 1;

  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <ambientLight intensity={0.72} />
      <directionalLight position={[5, 9, 4]} intensity={1.35} castShadow={false} />
      <directionalLight
        position={[-4, 5, 2]}
        intensity={0.45}
        color="#f2f6ff"
      />
      <directionalLight
        position={[2, 3, -5]}
        intensity={0.28}
        color="#fff4ef"
      />
      <hemisphereLight args={["#ffffff", "#cfd5de", 0.5]} />

      <Suspense fallback={null}>
        <Environment preset="studio" environmentIntensity={0.85} />
      </Suspense>

      <ParallaxRig
        pointer={pointer}
        tilt={tilt}
        reducedMotion={reducedMotion}
      >
        {objects.map((config) => (
          <GlassSocialObject
            key={config.id}
            config={config}
            pointer={pointer}
            tilt={tilt}
            reducedMotion={reducedMotion}
            isMobile={isMobile}
            influence={influence}
          />
        ))}
      </ParallaxRig>

      <StudioFloor />
      <ContactShadows
        position={[0, -2.22, 0]}
        opacity={0.38}
        scale={18}
        blur={3.6}
        far={7}
        resolution={isMobile ? 256 : 1024}
        color="#12151c"
      />
      <ContactShadows
        position={[0, -2.21, 0]}
        opacity={0.14}
        scale={12}
        blur={1.3}
        far={4}
        resolution={isMobile ? 128 : 512}
        color="#1a2030"
      />
    </>
  );
}

export default function HeroScene({
  isMobile,
  isTablet,
  reducedMotion,
  visible,
  pointer,
  tilt,
}: SceneProps) {
  return (
    <div className="absolute inset-0">
      <Canvas
        aria-hidden
        dpr={isMobile ? [1, 1.25] : [1, 1.85]}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: isMobile ? "low-power" : "high-performance",
        }}
        camera={{
          position: isMobile ? [0, 0.1, 7.4] : [0, 0.08, 8.4],
          fov: isMobile ? 40 : 34,
          near: 0.1,
          far: 40,
        }}
        frameloop={visible ? "always" : "demand"}
        style={{ pointerEvents: "none" }}
      >
        <Suspense fallback={null}>
          <SceneContents
            isMobile={isMobile}
            isTablet={isTablet}
            reducedMotion={reducedMotion}
            pointer={pointer}
            tilt={tilt}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
