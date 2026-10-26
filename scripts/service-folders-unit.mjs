import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the component's real handlers, including hybrid-device touch input.
let state = [], cursor = 0, fine = true, reduced = false;
const jsx = (type, props) => ({ type, props });
const hooks = {
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = { current: initial };
    return state[index];
  },
};
const context = { exports: {}, require(name) {
  if (name === "react") return hooks;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
  if (name.endsWith("use-media-query")) return { useMediaQuery: query => query.includes("reduced-motion") ? reduced : fine };
  if (name.endsWith(".css")) return { default: {} };
  throw new Error(`Unexpected import ${name}`);
} };
const source = readFileSync(new URL("../src/components/landing/service-folders.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function("exports", "require", compiled)(context.exports, context.require);
const cards = () => { cursor = 0; return context.exports.ServiceFolders().props.children; };
const button = index => cards()[index].props.children.find(child => child.type === "button").props;
const opened = () => cards().map(card => card.props["data-open"]);
const click = (index, pointerType = "touch") => {
  button(index).onPointerDown({ pointerType });
  button(index).onClick({ detail: 1 });
};
assert.deepEqual(opened(), [false, false, false]);
cards()[0].props.onPointerEnter({ pointerType: "mouse" });
assert.deepEqual(opened(), [true, false, false]);
cards()[0].props.onPointerLeave();
assert.deepEqual(opened(), [false, false, false]);
button(1).onFocus({ currentTarget: { matches: () => true } });
assert.equal(button(1)["aria-pressed"], true);
button(1).onBlur();
assert.deepEqual(opened(), [false, false, false]);
button(0).onFocus({ currentTarget: { matches: () => true } });
cards()[1].props.onPointerEnter({ pointerType: "mouse" });
assert.deepEqual(opened(), [false, true, false], "mouse hover takes over from retained keyboard focus");
button(0).onBlur();
assert.deepEqual(opened(), [false, true, false], "old blur cannot close the newly hovered folder");
cards()[1].props.onPointerLeave();
assert.deepEqual(opened(), [false, false, false], "pointer exit cannot leave the keyboard folder pinned open");
button(0).onFocus({ currentTarget: { matches: () => true } });
click(0, "mouse");
cards()[0].props.onPointerLeave();
assert.deepEqual(opened(), [false, false, false], "clicking the previously focused folder does not pin it open");
button(0).onFocus({ currentTarget: { matches: () => true } });
cards()[0].props.onPointerMove({ pointerType: "mouse" });
cards()[0].props.onPointerLeave();
assert.deepEqual(opened(), [false, false, false], "moving an already present mouse takes over from keyboard focus");
for (let index = 0; index < 3; index++) {
  button(index).onFocus({ currentTarget: { matches: () => true } });
  const next = (index + 1) % 3;
  cards()[next].props.onPointerEnter({ pointerType: "mouse" });
  assert.deepEqual(opened(), [0, 1, 2].map(value => value === next));
  cards()[next].props.onPointerLeave();
  assert.deepEqual(opened(), [false, false, false], "all three folders close consistently after input handoff");
}
button(2).onFocus({ currentTarget: { matches: () => true } });
button(2).onClick({ detail: 0 });
assert.equal(opened()[2], false, "keyboard activation can close an already focused folder");
button(2).onClick({ detail: 0 });
assert.equal(opened()[2], true);
button(2).onKeyDown({ key: "Escape" });
assert.deepEqual(opened(), [false, false, false]);
// A touch on a hybrid device must work even while the media query reports a mouse.
click(0); assert.deepEqual(opened(), [true, false, false]);
click(1); assert.deepEqual(opened(), [false, true, false]);
click(1); assert.deepEqual(opened(), [false, false, false]);
fine = false;
cards()[0].props.onPointerEnter({ pointerType: "touch" });
assert.deepEqual(opened(), [false, false, false], "touch hover cannot open a folder");
click(2); assert.deepEqual(opened(), [false, false, true]);
// A scrolling gesture has pointerdown but no click; it leaves the selected folder alone.
button(0).onPointerDown({ pointerType: "touch" });
assert.deepEqual(opened(), [false, false, true]);
reduced = true;
assert.deepEqual(opened(), [true, true, true], "reduced motion uses the static expanded composition");
console.log("service-folders-unit: hover, focus, keyboard, touch, hybrid input, scroll and reduced-motion state checks passed");
