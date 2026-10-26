import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import ts from "typescript";
import Matter from "matter-js";

class Events {
  listeners = new Map();
  addEventListener(name, callback, options) {
    if (name.startsWith("pointer")) assert.equal(options.passive, true);
    const set = this.listeners.get(name) ?? new Set(); set.add(callback); this.listeners.set(name, set);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event = {}) { for (const callback of this.listeners.get(name) ?? []) callback(event); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
const classes = () => ({ add() {}, remove() {} });
function element(w, h) {
  return { offsetWidth: w, offsetHeight: h, classList: classes(), style: { removeProperty(name) { delete this[name]; } },
    contains(target) { return target === this; }, setPointerCapture() {}, hasPointerCapture() { return false; } };
}
const sizes = JSON.parse(readFileSync(new URL("../src/components/landing/platform-logos.json", import.meta.url)));
sizes.forEach(logo => { const [w, h] = logo.ratio.split("/").map(Number); logo.ratio = w / h; });
const tiles = sizes.map(logo => element(logo.width, logo.width / logo.ratio));
const wall = new Events();
Object.assign(wall, { clientWidth: 1200, clientHeight: 200,
  closest: () => ({ classList: classes(), getBoundingClientRect: () => ({ top: -400 }) }), querySelectorAll: () => tiles,
  getBoundingClientRect: () => ({ left: 0, top: 0 }), appendChild() {} });
const host = new Events(), document = new Events();
let rippleCount = 0;
document.createElement = () => ({ style: {}, remove() {}, animate() { rippleCount++; return { cancel() {} }; } });
let engine, frameId = 0, now = 0;
const frames = new Map(), observers = [];
class Observer {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe() {} disconnect() { this.disconnected = true; }
}
const compiled = ts.transpileModule(readFileSync(new URL("../src/components/landing/logo-pile.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {}, window: host, document, performance: { now: () => now },
  require: () => ({ ...Matter, Engine: { ...Matter.Engine, create(options) { return engine = Matter.Engine.create(options); } } }),
  requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
  cancelAnimationFrame(id) { frames.delete(id); }, IntersectionObserver: Observer, ResizeObserver: Observer };
new Function(...Object.keys(context), compiled)(...Object.values(context));
function step(count) {
  for (let i = 0; i < count; i++) {
    now += 1000 / 60;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now));
  }
}
const bodies = () => Matter.Composite.allBodies(engine.world).filter(body => !body.isStatic);
const pointer = (target, x, y, id = 1) => ({ target, clientX: x, clientY: y, pointerId: id, button: 0 });
const cleanup = context.exports.startLogoPile(wall);
step(900);
assert.equal(bodies().length, 10);
for (const body of bodies()) {
  assert.ok(body.bounds.max.y < 201 && body.bounds.min.x > -2 && body.bounds.max.x < 1202, "logos settle inside common floor and walls");
}
assert.equal(frames.size, 0, "settled pile stops animation work");
wall.emit("pointerdown", pointer(wall, 600, 150)); wall.emit("pointerup", pointer(wall, 600, 150));
assert.equal(rippleCount, 1);
assert.ok(bodies().some(body => body.velocity.y < -2), "floor tap kicks nearby logos upward");
assert.equal(frames.size, 1, "floor tap wakes sleeping simulation");
step(10);
wall.emit("pointerdown", pointer(wall, 600, 150)); wall.emit("pointermove", pointer(wall, 600, 100)); wall.emit("pointerup", pointer(wall, 600, 100));
assert.equal(rippleCount, 1, "scroll gesture does not burst the pile");
wall.emit("pointerdown", pointer(tiles[0], bodies()[0].position.x, bodies()[0].position.y));
assert.equal(engine.world.constraints.length, 1);
wall.emit("pointermove", pointer(tiles[0], 200, 40)); step(20);
assert.ok(bodies()[0].position.x < 300, "grab joint follows pointer");
wall.emit("pointercancel", pointer(tiles[0], 200, 40));
assert.equal(engine.world.constraints.length, 0, "cancellation releases grab");
wall.emit("pointerdown", pointer(tiles[0], bodies()[0].position.x, bodies()[0].position.y));
wall.emit("pointermove", pointer(tiles[0], 200, -300)); step(90);
assert.ok(bodies()[0].position.y < 0, "logo can be dragged above the strip over the hero");
wall.emit("pointermove", pointer(tiles[0], 200, -2000)); step(90);
assert.ok(bodies()[0].bounds.min.y > -402, "hero top is a ceiling; logos never leave the hero");
wall.emit("pointerup", pointer(tiles[0], 200, -2000)); step(900);
assert.ok(bodies()[0].bounds.max.y < 201, "released logo falls back to the floor");
wall.clientWidth = 390; wall.clientHeight = 230;
tiles.forEach((el, i) => { el.offsetWidth = sizes[i].width * 0.62; el.offsetHeight = el.offsetWidth / sizes[i].ratio; });
observers[1].callback(); step(1200);
for (const body of bodies()) assert.ok(body.bounds.max.y < 232 && body.bounds.min.x > -2 && body.bounds.max.x < 392, "mobile resize retains every logo inside arena");
observers[0].callback([{ isIntersecting: false }]); step(1);
assert.equal(frames.size, 0, "offscreen simulation pauses");
observers[0].callback([{ isIntersecting: true }]);
cleanup();
assert.equal(frames.size, 0); assert.equal(wall.count(), 0); assert.equal(host.count(), 0); assert.equal(document.count(), 0);
assert.ok(observers.every(observer => observer.disconnected));
assert.equal(engine.world.bodies.length, 0);
assert.ok(tiles.every(el => !el.style.transform), "cleanup restores static layout");
console.log("logo-pile-unit: gravity, settling, tap, scroll, drag, cancellation, resize and cleanup checks passed");
