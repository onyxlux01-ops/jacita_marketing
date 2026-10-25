import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real controller with deterministic input and animation frames.
class Events {
  listeners = new Map();
  addEventListener(type, callback, options) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
    if (type.startsWith("pointer")) assert.equal(options.passive, true);
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }
  emit(type, event = {}) {
    for (const callback of this.listeners.get(type) ?? []) callback(event);
  }
  count() {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}
const host = new Events();
const document = new Events();
const preference = new Events();
preference.matches = false;
host.matchMedia = () => preference;
const frames = new Map();
let frameId = 0;
host.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
host.cancelAnimationFrame = (id) => frames.delete(id);
function flush() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback());
}
function eye(left, top) {
  const values = new Map();
  return {
    rect: { left, top, width: 28, height: 28 },
    style: {
      setProperty: (key, value) => values.set(key, value),
      removeProperty: (key) => values.delete(key),
    },
    values,
    getBoundingClientRect() {
      return this.rect;
    },
  };
}
const eyes = [eye(0, 0), eye(32, 0), eye(100, 200), eye(132, 200)];
const source = readFileSync(
  new URL("../src/components/landing/eye-tracking.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {}, window: host, document };
vm.runInNewContext(compiled, context);
const start = () =>
  context.exports.startEyeTracking({ querySelectorAll: () => eyes });
const offset = (index = 0) =>
  ["--px", "--py"].map((key) => parseFloat(eyes[index].values.get(key) ?? "0"));
const centered = () =>
  eyes.forEach((_, index) => assert.deepEqual(offset(index), [0, 0]));
const pointer = (pointerType, pointerId, clientX, clientY) => ({
  pointerType,
  pointerId,
  clientX,
  clientY,
});
let cleanup = start();

host.emit("pointermove", pointer("mouse", 1, 500, 100));
host.emit("pointermove", pointer("mouse", 1, 600, 120));
assert.equal(frames.size, 1, "coalesce movement into one frame");
flush();
eyes.forEach((_, index) => assert.ok(Math.hypot(...offset(index)) <= 6.000001));
assert.ok(offset(0)[1] > 0 && offset(2)[1] < 0, "each eye uses its own centre");
eyes[0].rect.top = 300;
host.emit("scroll");
flush();
assert.ok(offset()[1] < 0, "scroll recalculates eye geometry");
host.emit("resize");
assert.equal(frames.size, 1);
flush();
host.emit("pointerout", { pointerType: "mouse", relatedTarget: null });
flush();
centered();

host.emit("pointerdown", pointer("touch", 2, 500, 500));
flush();
host.emit("pointermove", pointer("touch", 2, -500, 500));
flush();
assert.ok(offset()[0] < 0, "active finger movement is followed");
host.emit("pointerdown", pointer("touch", 3, 500, 500));
flush();
const latest = offset();
host.emit("pointermove", pointer("touch", 2, -500, 0));
host.emit("pointerup", pointer("touch", 2, -500, 0));
flush();
assert.deepEqual(
  offset(),
  latest,
  "older finger cannot move or reset the eyes",
);
host.emit("pointerup", pointer("touch", 3, 500, 500));
flush();
centered();
host.emit("pointerdown", pointer("touch", 4, 500, 500));
flush();
host.emit("pointercancel", pointer("touch", 4, 500, 500));
flush();
centered();

host.emit("pointermove", pointer("mouse", 1, 500, 100));
flush();
preference.matches = true;
preference.emit("change");
flush();
centered();
host.emit("pointerdown", pointer("touch", 5, 500, 500));
host.emit("pointermove", pointer("mouse", 1, 500, 100));
assert.equal(frames.size, 0, "reduced motion ignores tracking input");
preference.matches = false;
preference.emit("change");
flush();
host.emit("pointermove", pointer("mouse", 1, 500, 100));
flush();
host.emit("blur");
flush();
centered();
host.emit("pointermove", pointer("mouse", 1, 500, 100));
flush();
document.hidden = true;
document.emit("visibilitychange");
flush();
centered();
host.emit("pointermove", pointer("mouse", 1, 500, 100));
cleanup();
assert.equal(frames.size, 0);
assert.equal(host.count() + document.count() + preference.count(), 0);
eyes.forEach((eye) => assert.equal(eye.values.size, 0));
cleanup = start();
cleanup();
assert.equal(
  host.count() + document.count() + preference.count(),
  0,
  "remount does not leak listeners",
);
console.log(
  "eye-tracking-unit: all cursor, touch, motion and lifecycle checks passed",
);
