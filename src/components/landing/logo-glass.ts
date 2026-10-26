import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type LogoPose = { x: number; y: number; angle: number; vx: number; vy: number; w: number; h: number };

const RESOLUTION = 384, PAD = 3;
const DEPTH = 0.24, BEVEL = 0.022;
// How far the brand colour is lifted toward white so the solid reads as tinted glass, not plastic.
const FROST = 0.32;

/**
 * Renders each sticker-wall logo as an extruded glass solid on one shared WebGL canvas.
 * The DOM tiles stay in place as the physics hit targets; only their artwork is hidden.
 */
export function startLogoGlass(wall: HTMLElement) {
  const hero = wall.closest<HTMLElement>(".hero")!;
  const tiles = Array.from(wall.querySelectorAll<HTMLElement>(".social-logo"));
  const canvas = document.createElement("canvas");
  canvas.className = "logo-glass";
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  wall.prepend(canvas);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  const key = new THREE.DirectionalLight("#ffffff", 1.4);
  key.position.set(-0.6, 1, 1.2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);
  const backdrop = createBackdrop(renderer);
  scene.add(backdrop);

  const meshes: (THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial> | null)[] = tiles.map(() => null);
  let poses: LogoPose[] = [];
  let offset = { x: 0, y: 0 }, width = 1, height = 1, disposed = false, visible = true, lastSync = 0;
  // Logos turn slightly toward the pointer while it is over the page.
  const pointer = { x: 0, y: 0, focus: 0, targetX: 0, targetY: 0, targetFocus: 0 };
  let tiltFrame = 0;

  function measure() {
    const heroRect = hero.getBoundingClientRect(), wallRect = wall.getBoundingClientRect();
    offset = { x: wallRect.left - heroRect.left, y: wallRect.top - heroRect.top };
    canvas.style.left = `${-offset.x}px`;
    canvas.style.top = `${-offset.y}px`;
  }
  function fit() {
    width = Math.max(1, hero.clientWidth); height = Math.max(1, hero.clientHeight);
    measure();
    renderer.setSize(width, height, false);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    camera.aspect = width / height;
    camera.position.set(0, 0, height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    backdrop.scale.set(width * 1.2, height * 1.2, 1);
    render();
  }
  function render() {
    if (disposed || !visible) return;
    const clamp = THREE.MathUtils.clamp;
    poses.forEach((pose, i) => {
      const mesh = meshes[i];
      if (!mesh) return;
      const x = pose.x + offset.x, y = pose.y + offset.y;
      mesh.position.set(x - width / 2, height / 2 - y, 0);
      mesh.scale.setScalar(Math.max(pose.w, pose.h));
      const lookX = clamp((pointer.x - x) / width * 1.6, -0.45, 0.45) * pointer.focus;
      const lookY = clamp((pointer.y - y) / height * 1.6, -0.45, 0.45) * pointer.focus;
      mesh.rotation.set(
        clamp(lookY + pose.vy * 0.012, -0.7, 0.7),
        clamp(lookX + pose.vx * 0.03, -0.7, 0.7),
        -pose.angle,
      );
    });
    renderer.render(scene, camera);
  }

  function sync(next: LogoPose[]) {
    poses = next; lastSync = performance.now();
    measure(); render();
  }

  function ease() {
    tiltFrame = 0;
    pointer.x += (pointer.targetX - pointer.x) * 0.14;
    pointer.y += (pointer.targetY - pointer.y) * 0.14;
    pointer.focus += (pointer.targetFocus - pointer.focus) * 0.1;
    // While the physics loop is painting, it renders the new tilt on its own frame.
    if (performance.now() - lastSync > 40) render();
    const settled = Math.abs(pointer.targetX - pointer.x) < 0.5 && Math.abs(pointer.targetY - pointer.y) < 0.5
      && Math.abs(pointer.targetFocus - pointer.focus) < 0.005;
    if (!settled && visible) tiltFrame = requestAnimationFrame(ease);
  }
  function move(event: PointerEvent) {
    if (!visible) return;
    const rect = hero.getBoundingClientRect();
    pointer.targetX = event.clientX - rect.left; pointer.targetY = event.clientY - rect.top;
    if (!pointer.focus) { pointer.x = pointer.targetX; pointer.y = pointer.targetY; }
    pointer.targetFocus = 1;
    if (!tiltFrame) tiltFrame = requestAnimationFrame(ease);
  }
  function leave() {
    pointer.targetFocus = 0;
    if (!tiltFrame) tiltFrame = requestAnimationFrame(ease);
  }

  tiles.forEach((tile, i) => {
    void buildLogo(tile, renderer).then((mesh) => {
      if (disposed) { disposeMesh(mesh); return; }
      meshes[i] = mesh; scene.add(mesh);
      render();
      tile.classList.add("is-glass");
    }).catch(() => { /* That tile keeps its flat artwork. */ });
  });

  const resize = new ResizeObserver(fit);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; render(); });
  resize.observe(hero); resize.observe(wall); intersection.observe(hero);
  window.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  window.addEventListener("blur", leave);
  fit();

  return {
    sync,
    dispose() {
      disposed = true; cancelAnimationFrame(tiltFrame);
      resize.disconnect(); intersection.disconnect();
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      meshes.forEach(mesh => mesh && disposeMesh(mesh));
      tiles.forEach(tile => tile.classList.remove("is-glass"));
      backdrop.geometry.dispose(); backdrop.material.map?.dispose(); backdrop.material.dispose();
      scene.environment?.dispose(); pmrem.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}

function disposeMesh(mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial>) {
  mesh.geometry.dispose(); mesh.material.map?.dispose(); mesh.material.dispose();
}

/** An icy sky that only the glass sees: it is drawn into the transmission pass, never onto the page. */
function createBackdrop(renderer: THREE.WebGLRenderer) {
  const sky = document.createElement("canvas");
  sky.width = sky.height = 256;
  const ctx = sky.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#9cc8ff"); gradient.addColorStop(0.55, "#dcecff"); gradient.addColorStop(1, "#ffffff");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  // Alternating bright and blue cloud blobs give the refraction something to bend.
  [[40, 70, 60, 1], [150, 50, 80, 0], [220, 120, 50, 1], [90, 170, 70, 0], [190, 210, 60, 1], [20, 220, 45, 0]].forEach(([x, y, r, light]) => {
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, light ? "rgba(255,255,255,0.95)" : "rgba(84,150,240,0.55)");
    blob.addColorStop(1, light ? "rgba(255,255,255,0)" : "rgba(84,150,240,0)");
    ctx.fillStyle = blob; ctx.fillRect(0, 0, 256, 256);
  });
  const texture = new THREE.CanvasTexture(sky);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  plane.position.z = -120;
  plane.onBeforeRender = () => {
    const transmissionPass = renderer.getRenderTarget() !== null;
    material.colorWrite = transmissionPass; material.depthWrite = transmissionPass;
  };
  return plane;
}

/** Reads a tile's SVG artwork, traces its silhouette and extrudes it into a unit-sized glass solid. */
async function buildLogo(tile: HTMLElement, renderer: THREE.WebGLRenderer) {
  const svg = tile.querySelector("svg")!, image = svg.querySelector("image")!;
  const { x, y, width, height } = svg.viewBox.baseVal;
  const source = new Image();
  source.src = image.getAttribute("href")!;
  await source.decode();
  const k = source.naturalWidth / Number(image.getAttribute("width"));
  const scale = RESOLUTION / Math.max(width, height);
  const w = Math.round(width * scale) + PAD * 2, h = Math.round(height * scale) + PAD * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (image.hasAttribute("clip-path")) {
    ctx.beginPath(); ctx.roundRect(PAD, PAD, width * scale, height * scale, 55 * scale); ctx.clip();
  }
  ctx.drawImage(source, x * k, y * k, width * k, height * k, PAD, PAD, width * scale, height * scale);
  const pixels = ctx.getImageData(0, 0, w, h);
  const data = pixels.data, alpha = new Float32Array(w * h);
  const whiteKey = image.hasAttribute("filter");
  for (let i = 0; i < w * h; i++) {
    let a = data[i * 4 + 3] / 255;
    // Same white key as the SVG filter used by the flat artwork.
    if (whiteKey) a *= THREE.MathUtils.clamp((3 - (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 255) * 1.15 - 0.1, 0, 1);
    alpha[i] = a;
  }
  bleedColors(data, alpha, w, h);
  ctx.putImageData(pixels, 0, 0);

  const loops = traceContours(alpha, w, h)
    .map(loop => simplify(loop, 0.45))
    .filter(loop => loop.length >= 3 && Math.abs(area(loop)) > 14);
  if (!loops.length) throw new Error("empty logo");
  const toUnit = ([px, py]: number[]) => new THREE.Vector2((px - w / 2) / RESOLUTION, (h / 2 - py) / RESOLUTION);
  const depths = loops.map((loop, i) => loops.filter((other, j) => j !== i && contains(other, loop[0])).length);
  const shapes = new Map<number, THREE.Shape>();
  loops.forEach((loop, i) => { if (depths[i] % 2 === 0) shapes.set(i, new THREE.Shape(loop.map(toUnit))); });
  loops.forEach((loop, i) => {
    if (depths[i] % 2 === 0) return;
    const parent = [...shapes.keys()]
      .filter(j => depths[j] === depths[i] - 1 && contains(loops[j], loop[0]))
      .sort((a, b) => Math.abs(area(loops[a])) - Math.abs(area(loops[b])))[0];
    if (parent !== undefined) shapes.get(parent)!.holes.push(new THREE.Path(loop.map(toUnit)));
  });

  const uv = (vertices: number[], index: number) =>
    new THREE.Vector2(vertices[index * 3] * RESOLUTION / w + 0.5, vertices[index * 3 + 1] * RESOLUTION / h + 0.5);
  const geometry = new THREE.ExtrudeGeometry([...shapes.values()], {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL * 2, bevelSize: BEVEL, bevelOffset: -BEVEL, bevelSegments: 4,
    UVGenerator: {
      generateTopUV: (_, vertices, a, b, c) => [uv(vertices, a), uv(vertices, b), uv(vertices, c)],
      generateSideWallUV: (_, vertices, a, b, c, d) => [uv(vertices, a), uv(vertices, b), uv(vertices, c), uv(vertices, d)],
    },
  });
  geometry.translate(0, 0, -DEPTH / 2);
  geometry.computeVertexNormals();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Brand colour tints the light passing through; white artwork reads as clear glass.
  const material = new THREE.MeshPhysicalMaterial({
    map, emissiveMap: map, emissive: "#ffffff", emissiveIntensity: 0.08,
    transmission: 1, thickness: 0.8, ior: 1.5, roughness: 0.06, dispersion: 5,
    clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.35, iridescenceIOR: 1.3,
    specularIntensity: 1, envMapIntensity: 1.5,
  });
  return new THREE.Mesh(geometry, material);
}

/** Spreads edge colours into transparent pixels so bevels and sides never sample black. */
function bleedColors(data: Uint8ClampedArray, alpha: Float32Array, w: number, h: number) {
  let known = Uint8Array.from(alpha, a => (a > 0.5 ? 1 : 0));
  for (let pass = 0; pass < 8; pass++) {
    const next = known.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (known[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= w * h || !known[j] || Math.abs((j % w) - x) > 1) continue;
        r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
      }
      if (!n) continue;
      data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; next[i] = 1;
    }
    known = next;
  }
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] += (255 - data[i * 4 + c]) * FROST;
    data[i * 4 + 3] = 255;
  }
}

/** Marching squares over the alpha field at a 0.5 threshold; returns closed loops in pixel space. */
function traceContours(alpha: Float32Array, w: number, h: number) {
  const inside = (x: number, y: number) => alpha[y * w + x] >= 0.5;
  const points = new Map<number, number[]>();
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const id = x0 === x1 ? (y0 * w + x0) * 2 + 1 : (y0 * w + x0) * 2;
    if (!points.has(id)) {
      const a0 = alpha[y0 * w + x0], a1 = alpha[y1 * w + x1];
      const t = THREE.MathUtils.clamp((0.5 - a0) / (a1 - a0 || 1), 0, 1);
      points.set(id, [x0 + (x1 - x0) * t + 0.5, y0 + (y1 - y0) * t + 0.5]);
    }
    return id;
  };
  const segments: number[][] = [];
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const code = (inside(x, y) ? 8 : 0) | (inside(x + 1, y) ? 4 : 0) | (inside(x + 1, y + 1) ? 2 : 0) | (inside(x, y + 1) ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = () => edge(x, y, x + 1, y), B = () => edge(x, y + 1, x + 1, y + 1);
    const L = () => edge(x, y, x, y + 1), R = () => edge(x + 1, y, x + 1, y + 1);
    const pairs: (() => number)[][] = ({
      1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[T, R], [L, B]], 6: [[T, B]], 7: [[T, L]],
      8: [[T, L]], 9: [[T, B]], 10: [[T, L], [R, B]], 11: [[T, R]], 12: [[L, R]], 13: [[R, B]], 14: [[L, B]],
    } as Record<number, (() => number)[][]>)[code];
    pairs.forEach(([a, b]) => segments.push([a(), b()]));
  }
  const byEdge = new Map<number, number[]>();
  segments.forEach(([a, b], i) => {
    byEdge.set(a, [...(byEdge.get(a) ?? []), i]);
    byEdge.set(b, [...(byEdge.get(b) ?? []), i]);
  });
  const used = new Uint8Array(segments.length), loops: number[][][] = [];
  segments.forEach(([start, first], s) => {
    if (used[s]) return;
    used[s] = 1;
    const loop = [points.get(start)!];
    let current = first, previous = s;
    while (current !== start) {
      loop.push(points.get(current)!);
      const next = byEdge.get(current)!.find(i => i !== previous && !used[i]);
      if (next === undefined) break;
      used[next] = 1; previous = next;
      current = segments[next][0] === current ? segments[next][1] : segments[next][0];
    }
    loops.push(loop);
  });
  return loops;
}

function simplify(loop: number[][], tolerance: number): number[][] {
  if (loop.length < 8) return loop;
  const half = Math.floor(loop.length / 2);
  return [...rdp(loop.slice(0, half + 1), tolerance).slice(0, -1), ...rdp([...loop.slice(half), loop[0]], tolerance).slice(0, -1)];
}

function rdp(points: number[][], tolerance: number): number[][] {
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / length;
    if (distance > worst) { worst = distance; index = i; }
  }
  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [...rdp(points.slice(0, index + 1), tolerance).slice(0, -1), ...rdp(points.slice(index), tolerance)];
}

function area(loop: number[][]) {
  return loop.reduce((sum, [x, y], i) => {
    const [nx, ny] = loop[(i + 1) % loop.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;
}

function contains(loop: number[][], [px, py]: number[]) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j];
    if (yi > py !== yj > py && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
