import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/*
 * Shared materials and geometries. Every mesh in the studio draws from these
 * caches so five characters and a furnished office cost a handful of GPU
 * resources rather than hundreds.
 */

const materials = new Map<string, THREE.Material>();
const geometries = new Map<string, THREE.BufferGeometry>();

let gradient: THREE.DataTexture | null = null;
function toonGradient() {
  if (!gradient) {
    const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/** Cel-shaded material for characters and props. */
export function toon(color: string) {
  const key = `toon:${color}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    materials.set(key, m);
  }
  return m;
}

/** Soft matte material for the environment. */
export function matte(color: string, roughness = 0.85) {
  const key = `matte:${color}:${roughness}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.set(key, m);
  }
  return m;
}

export function glow(color: string, opacity = 1) {
  const key = `glow:${color}:${opacity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      toneMapped: false,
      depthWrite: opacity >= 1,
    });
    materials.set(key, m);
  }
  return m;
}

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key) as T | undefined;
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

export function box(w: number, h: number, d: number, radius = 0) {
  return cached(`box:${r(w)}:${r(h)}:${r(d)}:${r(radius)}`, () =>
    radius > 0
      ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2))
      : new THREE.BoxGeometry(w, h, d),
  );
}

export function sphere(radius: number, w = 20, h = 14) {
  return cached(`sphere:${r(radius)}:${w}:${h}`, () => new THREE.SphereGeometry(radius, w, h));
}

export function capsule(radius: number, length: number) {
  return cached(`capsule:${r(radius)}:${r(length)}`, () => new THREE.CapsuleGeometry(radius, length, 4, 10));
}

/** Top cap of a sphere — the base of every hairstyle. */
export function dome(radius: number, coverage = 0.55) {
  return cached(`dome:${r(radius)}:${r(coverage)}`, () =>
    new THREE.SphereGeometry(radius, 22, 12, 0, Math.PI * 2, 0, Math.PI * coverage),
  );
}

export function cylinder(top: number, bottom: number, height: number, segments = 16) {
  return cached(`cyl:${r(top)}:${r(bottom)}:${r(height)}:${segments}`, () =>
    new THREE.CylinderGeometry(top, bottom, height, segments),
  );
}

export function cone(radius: number, height: number, segments = 10) {
  return cached(`cone:${r(radius)}:${r(height)}:${segments}`, () => new THREE.ConeGeometry(radius, height, segments));
}

export function torus(radius: number, tube: number, arc = Math.PI * 2) {
  return cached(`torus:${r(radius)}:${r(tube)}:${r(arc)}`, () => new THREE.TorusGeometry(radius, tube, 6, 18, arc));
}

export function plane(w: number, h: number) {
  return cached(`plane:${r(w)}:${r(h)}`, () => new THREE.PlaneGeometry(w, h));
}

export function circle(radius: number, segments = 32) {
  return cached(`circle:${r(radius)}:${segments}`, () => new THREE.CircleGeometry(radius, segments));
}

export function ring(inner: number, outer: number, segments = 40) {
  return cached(`ring:${r(inner)}:${r(outer)}:${segments}`, () => new THREE.RingGeometry(inner, outer, segments));
}

/** Soft radial blob used for cheap contact shadows under people and furniture. */
let blob: THREE.Material | null = null;
export function blobShadow() {
  if (!blob) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(20,16,10,0.55)");
    g.addColorStop(1, "rgba(20,16,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    blob = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  }
  return blob;
}
