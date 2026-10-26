import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/components/landing/hero-clouds.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
class Events {
  listeners = new Map();
  addEventListener(name, callback) { const set = this.listeners.get(name) ?? new Set(); set.add(callback); this.listeners.set(name, set); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name) { for (const callback of this.listeners.get(name) ?? []) callback(); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
function setup(options = {}) {
  const host = new Events(), document = new Events(), preference = new Events(), canvas = new Events();
  preference.matches = options.reduced ?? false;
  host.devicePixelRatio = 3; host.matchMedia = () => preference;
  const dimensions = { clientWidth: 1440, clientHeight: 750 };
  const attributes = new Map(), resources = new Set(), frames = new Map(), observers = [], uniforms = new Map(), draws = [];
  let now = 0, id = 0, contextCalls = 0, boundProgram = null;
  const make = () => { const resource = {}; resources.add(resource); return resource; };
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8,
    createShader: make, shaderSource() {}, compileShader() {}, getShaderParameter: () => !options.compileFailure,
    createProgram: make, attachShader() {}, linkProgram() {}, getProgramParameter: () => !options.linkFailure, useProgram(program) { boundProgram = program; },
    createBuffer: make, bindBuffer() {}, bufferData() {}, getAttribLocation: () => 0, enableVertexAttribArray() {}, vertexAttribPointer() {},
    getUniformLocation: (_, name) => name, uniform1f: (name, value) => uniforms.set(name, value),
    uniform2f: (name, x, y) => uniforms.set(name, [x, y]), viewport() {}, isContextLost: () => false,
    drawArrays() { if (options.drawFailure) throw new Error("draw failure"); draws.push({ now, time: uniforms.get("uTime") }); },
    deleteBuffer: resource => resources.delete(resource), deleteProgram(resource) { assert.notEqual(boundProgram, resource, "unbind programs before deleting them"); resources.delete(resource); }, deleteShader: resource => resources.delete(resource),
  };
  Object.assign(canvas, { parentElement: dimensions, width: 1, height: 1,
    getContext() { contextCalls++; return options.unavailable ? null : gl; },
    setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name) });
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  }
  const exports = {};
  new Function("exports", "window", "document", "ResizeObserver", "IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame", "performance", compiled)(
    exports, host, document, Observer, Observer, callback => { frames.set(++id, callback); return id; }, frame => frames.delete(frame), { now: () => now },
  );
  const cleanup = exports.startHeroClouds(canvas);
  return { host, document, preference, canvas, attributes, resources, frames, observers, uniforms, draws, dimensions, cleanup,
    contexts: () => contextCalls,
    visible(value) { observers[0].callback([{ isIntersecting: value }]); },
    advance(milliseconds, step = 1000 / 120) {
      const end = now + milliseconds;
      while (now < end) { now += step; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); }
    },
  };
}
const test = setup();
assert.equal(test.contexts(), 0, "offscreen startup allocates no GPU resources");
test.visible(true); test.advance(1000);
assert.equal(test.attributes.get("data-ready"), "true");
assert.ok(test.draws.length <= 31, "rendering is capped at 30fps");
for (let i = 1; i < test.draws.length; i++) assert.ok(test.draws[i].now - test.draws[i - 1].now >= 1000 / 30 - 0.0001);
assert.ok(test.canvas.width <= 1600 && test.canvas.height <= 1200);
assert.equal(test.uniforms.get("uDetail"), 4);
test.visible(false);
assert.equal(test.frames.size, 0);
const pausedDraws = test.draws.length;
test.advance(30000); assert.equal(test.draws.length, pausedDraws);
const oldTime = test.draws.at(-1).time;
test.visible(true); test.advance(40);
assert.ok(test.draws.at(-1).time - oldTime < 0.15, "offscreen time does not jump the animation forward");
test.document.hidden = true; test.document.emit("visibilitychange");
assert.equal(test.frames.size, 0);
test.document.hidden = false; test.document.emit("visibilitychange");
assert.equal(test.frames.size, 1);
test.dimensions.clientWidth = 390; test.dimensions.clientHeight = 900; test.observers[1].callback();
assert.equal(test.canvas.width, 390); assert.equal(test.canvas.height, 900);
assert.equal(test.uniforms.get("uDetail"), 3, "mobile lowers shader detail and pixel ratio");
test.preference.matches = true; test.preference.emit("change");
assert.equal(test.frames.size, 0); assert.equal(test.resources.size, 0); assert.equal(test.attributes.has("data-ready"), false);
test.preference.matches = false; test.preference.emit("change"); test.advance(50);
assert.equal(test.attributes.get("data-ready"), "true", "motion preference can resume a fresh renderer");
test.canvas.emit("webglcontextlost");
assert.equal(test.frames.size, 0); assert.equal(test.resources.size, 0); assert.equal(test.attributes.has("data-ready"), false);
test.cleanup();
assert.ok(test.observers.every(observer => observer.disconnected));
assert.equal(test.host.count() + test.document.count() + test.preference.count() + test.canvas.count(), 0);
for (const options of [{ unavailable: true }, { compileFailure: true }, { linkFailure: true }, { drawFailure: true }]) {
  const fallback = setup(options); fallback.visible(true); fallback.advance(50);
  assert.equal(fallback.resources.size, 0); assert.equal(fallback.frames.size, 0); assert.equal(fallback.attributes.has("data-ready"), false);
  fallback.cleanup();
}
const reduced = setup({ reduced: true }); reduced.visible(true); reduced.advance(500);
assert.equal(reduced.contexts(), 0); assert.equal(reduced.frames.size, 0); reduced.cleanup();
const unmounted = setup(); unmounted.visible(true); unmounted.advance(50); unmounted.cleanup();
assert.equal(unmounted.resources.size, 0); assert.equal(unmounted.frames.size, 0); assert.equal(unmounted.attributes.has("data-ready"), false);
unmounted.advance(500); assert.equal(unmounted.frames.size, 0);
console.log("hero-clouds-unit: frame cap, resolution, pause/resume, motion preference, GPU failure and cleanup checks passed");
