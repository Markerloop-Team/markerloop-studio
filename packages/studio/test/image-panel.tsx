// Image panel (SDL-956, EP-190) — render tests against the BUILT dist, same
// recipe and helpers as inspector-controls.tsx (node:assert + tsx).
//
// Pinned: every control of the prototype is drawn
// (docs/component-studio-step3-image-2026-11-01/prototype.html), the grey /
// blue-fill rule on each (SDL-952), Fit only in a cropping frame, the focus
// point set by a click on the thumbnail, Replace (Files, link), reset of the
// set values back to the grey default, and the engine key names it writes.
import { installLayoutStubs } from "./dom";

import assert from "node:assert/strict";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import * as studio from "@markerloop/studio";

const {
  INSPECTOR_COLORS,
  INSPECTOR_STATE_ATTR,
  ImageInspectorPanel,
  IMAGE_PANEL_DEFAULTS,
  IMAGE_SHAPE_OPTIONS,
  focusFromClick,
  imageDefaultWidth,
  imageFileName,
  imageShapeChoices,
  InspectorInfoHint,
  InspectorRow,
  InspectorScaleSelect,
  InspectorSection,
  InspectorSegmented,
  InspectorSelect,
  InspectorThemeColorRow,
  InspectorToggle,
  inspectorFill,
  inspectorValueState,
} = studio;

installLayoutStubs(window);
// Globals dom.ts does not lift: Radix's focus scope walks with NodeFilter, the
// Switch and Select look for an enclosing form, portals use DocumentFragment.
for (const key of ["NodeFilter", "HTMLFormElement", "HTMLInputElement", "HTMLButtonElement", "HTMLSelectElement", "DocumentFragment", "DOMRect"]) {
  const g = globalThis as Record<string, unknown>;
  const w = window as unknown as Record<string, unknown>;
  if (g[key] === undefined && w[key] !== undefined) Object.defineProperty(g, key, { value: w[key], configurable: true, writable: true });
}
// Radix Popper measures through these; jsdom lacks them.
const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
const test = (name: string, fn: Test["fn"]) => tests.push({ name, fn });

const SET_RGB = "rgb(0, 142, 208)";

/** jsdom keeps a colour as written or as rgb(); compare both spellings of the set colour. */
function isSetColour(value: string): boolean {
  const v = value.replace(/\s+/g, " ").toLowerCase();
  return v.includes(INSPECTOR_COLORS.set) || v.includes(SET_RGB);
}
function isWhite(value: string): boolean {
  const v = value.replace(/\s+/g, "").toLowerCase();
  return v === "#ffffff" || v === "#fff" || v === "white" || v === "rgb(255,255,255)";
}
/** A set value: blue fill, white text, no blue text on white. */
function assertSetFill(el: HTMLElement, what: string): void {
  assert.ok(isSetColour(el.style.backgroundColor), `${what}: fill ${el.style.backgroundColor || "(none)"} — a set value is a #008ed0 fill`);
  assert.ok(isWhite(el.style.color), `${what}: text ${el.style.color} — white on the fill`);
  assert.ok(!isSetColour(el.style.color), `${what}: blue text is the old look`);
}
/** A default value: grey text, no blue fill. */
function assertDefaultLook(el: HTMLElement, what: string): void {
  assert.ok(isDefaultColour(el.style.color), `${what}: text ${el.style.color} — grey at the default`);
  assert.ok(!isSetColour(el.style.backgroundColor), `${what}: no blue fill at the default`);
  assert.ok(!isSetColour(el.style.borderColor || el.style.border), `${what}: no blue border at the default`);
}
function isDefaultColour(value: string): boolean {
  return value.includes("--muted-foreground") || value.includes("113, 113, 122") || value.toLowerCase().includes("#71717a");
}

async function mount(node: React.ReactNode): Promise<{ host: HTMLElement; root: Root; unmount: () => Promise<void> }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    root,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" } as PointerEventInit));
    el.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" } as PointerEventInit));
    el.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true, button: 0 }));
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, button: 0 }));
  });
}

/** Sets an input's value the way React hears it. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

const stateOf = (el: Element | null) => el?.getAttribute(INSPECTOR_STATE_ATTR);
const noop = () => {};

type Patch = Record<string, unknown>;
const SRC = "https://files.example/ws/pumpkin-raf.jpg";
const FILES = [
  { id: "f1", name: "pumpkin-raf.jpg", src: SRC },
  { id: "f2", name: "huila-beans.jpg", src: "https://files.example/ws/huila-beans.jpg" },
];
const VIS = [
  { value: "everyone", label: "Everyone" },
  { value: "members", label: "Signed in" },
];

/** A controlled host: holds the props, applies patches, records them. */
function Host({ initial, log }: { initial: Patch; log: Patch[] }) {
  const [v, setV] = React.useState<Patch>(initial);
  return (
    <ImageInspectorPanel
      value={v}
      files={FILES}
      visibility={{ value: v.vis as string | undefined, defaultValue: "everyone", options: VIS, onChange: (vis) => setV((p) => ({ ...p, vis })) }}
      onChange={(patch) => {
        log.push(patch);
        setV((p) => {
          const next: Patch = { ...p, ...patch };
          for (const [k, val] of Object.entries(patch)) if (val === undefined) delete next[k];
          return next;
        });
      }}
    />
  );
}

const q = (root: ParentNode, sel: string) => {
  const el = root.querySelector(sel);
  assert.ok(el, `missing ${sel}`);
  return el as HTMLElement;
};
const segment = (host: HTMLElement, group: string, label: string) => {
  const g = q(host, `[aria-label="${group}"][data-inspector-control="segmented"]`);
  const b = [...g.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") ?? x.textContent ?? "").trim() === label);
  assert.ok(b, `segment ${group}/${label}`);
  return b as HTMLElement;
};
const rowLabels = (host: HTMLElement) =>
  [...host.querySelectorAll("[data-inspector-row] label")].map((l) => l.textContent?.trim()).filter(Boolean);

test("image panel: engine defaults and shape names", () => {
  assert.deepEqual({ ...IMAGE_PANEL_DEFAULTS, focus: { ...IMAGE_PANEL_DEFAULTS.focus } }, {
    aspect: "auto",
    fit: "cover",
    radius: "none",
    border: false,
    shadow: false,
    focus: { x: 50, y: 50 },
  });
  assert.deepEqual(IMAGE_SHAPE_OPTIONS.map((o) => o.label), ["Original", "16:9", "3:2", "4:3", "Square", "3:4", "9:16"]);
  // Offered: the engine's four (owner, 13 Oct 2026); a stored other one stays listed.
  assert.deepEqual(imageShapeChoices(undefined).map((o) => o.value), ["auto", "16 / 9", "4 / 3", "1 / 1"]);
  assert.deepEqual(imageShapeChoices("3 / 2").map((o) => o.value), ["auto", "16 / 9", "3 / 2", "4 / 3", "1 / 1"]);
  // Width default follows what the engine draws without the key.
  assert.equal(imageDefaultWidth(undefined), "hug");
  assert.equal(imageDefaultWidth("auto"), "hug");
  assert.equal(imageDefaultWidth("16 / 9"), "fill");
  assert.equal(imageFileName(SRC), "pumpkin-raf.jpg");
  assert.equal(imageFileName("https://x/y/a%20b.png?w=1"), "a b.png");
  assert.equal(imageFileName(undefined), "No picture");
  assert.equal(imageFileName("https://x/z", [{ id: "1", name: "named.jpg", src: "https://x/z" }]), "named.jpg");
  assert.deepEqual(focusFromClick(30, 54, { left: 0, top: 0, width: 96, height: 72 }), { x: 31, y: 75 });
  assert.deepEqual(focusFromClick(-10, 500, { left: 0, top: 0, width: 96, height: 72 }), { x: 0, y: 100 }, "clamped to 0-100");
});

test("image panel: an untouched picture — every row of the prototype, all grey, no Fit in the Original frame", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC, alt: "" }} log={log} />);
  const labels = rowLabels(m.host);
  for (const want of ["Alt text", "Shape", "Width", "Corners", "Border", "Shadow", "Visibility"]) assert.ok(labels.includes(want), `row ${want} in ${labels}`);
  assert.ok(!labels.includes("Fit"), "Fit is only drawn when the frame crops");
  assert.equal(q(m.host, "[data-image-file-name]").textContent, "pumpkin-raf.jpg");
  assert.ok(q(m.host, "[data-image-replace]").textContent?.includes("Replace"));
  assert.ok(m.host.querySelector('[aria-label="About alt text"]'), "ⓘ after Alt text");
  const shape = q(m.host, '[data-inspector-control="shape"]');
  assert.equal(stateOf(shape), "default");
  assertDefaultLook(shape, "Shape at Original");
  assert.ok(shape.querySelector('[data-image-shape="auto"]'), "Shape trigger draws the frame");
  for (const g of ["Width", "Corners"]) assertDefaultLook(q(m.host, `[aria-label="${g}"] [data-state="on"]`), g);
  assert.equal(q(m.host, '[aria-label="Width"] [data-state="on"]').textContent, "Hug", "Original without width draws hug — the grey default");
  assert.equal(stateOf(q(m.host, '[aria-label="Border"]')), "default");
  assert.equal(stateOf(q(m.host, '[aria-label="Visibility"]')), "default");
  assert.equal(m.host.querySelector("[data-image-focus-dot]"), null, "no focus dot in an Original frame");
  assert.equal(log.length, 0);
  await m.unmount();
});

test("image panel: set values — blue fill with white text on Shape, Fit, Width, Corners; toggles blue when on", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC, aspect: "16 / 9", fit: "contain", width: "hug", radius: "theme", border: true, shadow: true, vis: "members" }} log={log} />);
  const shape = q(m.host, '[data-inspector-control="shape"]');
  assert.equal(stateOf(shape), "set");
  assertSetFill(shape, "Shape 16:9");
  assert.ok(shape.textContent?.includes("16:9"));
  assert.ok(rowLabels(m.host).includes("Fit"), "Fit appears in a cropping frame");
  for (const [g, label] of [["Fit", "Show the whole picture"], ["Width", "Hug"], ["Corners", "Theme"]] as const) assertSetFill(segment(m.host, g, label), `${g} ${label}`);
  for (const t of ["Border", "Shadow"]) {
    const sw = q(m.host, `[aria-label="${t}"]`);
    assert.equal(stateOf(sw), "set");
    assert.ok(isSetColour(sw.style.backgroundColor), `${t} on is blue`);
  }
  assertSetFill(q(m.host, '[aria-label="Visibility"]'), "Visibility");
  await m.unmount();
});

test("image panel: focus point — a click on the thumbnail of a cropped picture writes focus {x, y}", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC, aspect: "1 / 1" }} log={log} />);
  const thumb = q(m.host, '[data-image-thumb="focus"]');
  thumb.getBoundingClientRect = () => ({ left: 0, top: 0, width: 96, height: 72, right: 96, bottom: 72, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  assert.equal(stateOf(thumb), "default");
  await act(async () => {
    thumb.dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: 1, clientX: 24, clientY: 18 }));
  });
  assert.deepEqual(log.at(-1), { focus: { x: 25, y: 25 } });
  const dot = q(m.host, "[data-image-focus-dot]");
  assert.equal(dot.style.left, "25%");
  assert.equal(dot.style.top, "25%");
  assert.equal(stateOf(q(m.host, '[data-image-thumb="focus"]')), "set");
  // Whole shows the entire picture: nothing to focus, the thumbnail opens Replace instead.
  await click(segment(m.host, "Fit", "Show the whole picture"));
  assert.deepEqual(log.at(-1), { fit: "contain" });
  assert.equal(m.host.querySelector("[data-image-focus-dot]"), null);
  assert.ok(m.host.querySelector('[data-image-thumb="source"]'));
  await m.unmount();
});

test("image panel: Width default follows the frame — Fill grey in a framed picture without width", async () => {
  const m = await mount(<Host initial={{ src: SRC, aspect: "16 / 9" }} log={[]} />);
  const on = q(m.host, '[aria-label="Width"] [data-state="on"]');
  assert.equal(on.textContent, "Fill");
  assertDefaultLook(on, "Fill at a framed default");
  await m.unmount();
});

test("image panel: keyboard on the thumbnail — Enter does not move the focus, arrows move it by 5, Shift by 10", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC, aspect: "1 / 1" }} log={log} />);
  const thumb = () => q(m.host, '[data-image-thumb="focus"]');
  await act(async () => {
    thumb().dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    thumb().dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: 0, clientX: 0, clientY: 0 }));
  });
  assert.equal(log.length, 0, `Enter wrote ${JSON.stringify(log)}`);
  await act(async () => {
    thumb().dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
  });
  assert.deepEqual(log.at(-1), { focus: { x: 55, y: 50 } });
  await act(async () => {
    thumb().dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp", shiftKey: true }));
  });
  assert.deepEqual(log.at(-1), { focus: { x: 55, y: 40 } });
  await m.unmount();
});

test("image panel: Shape list draws every frame and writes aspect; Original clears it back to grey", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC }} log={log} />);
  await click(q(m.host, '[data-inspector-control="shape"]'));
  const pop = q(document, "[data-image-shape-popover]");
  const opts = [...pop.querySelectorAll("[data-image-aspect]")];
  assert.deepEqual(opts.map((o) => o.textContent?.trim()), ["Original", "16:9", "4:3", "Square"], "the offered four");
  for (const o of opts) assert.ok(o.querySelector("[data-image-shape]"), `${o.textContent} has its drawing`);
  await click(q(pop, '[data-image-aspect="4 / 3"]'));
  assert.deepEqual(log.at(-1), { aspect: "4 / 3" });
  assertSetFill(q(m.host, '[data-inspector-control="shape"]'), "Shape 4:3");
  await click(q(m.host, '[data-inspector-control="shape"]'));
  await click(q(document, '[data-image-shape-popover] [data-image-aspect="auto"]'));
  assert.deepEqual(log.at(-1), { aspect: undefined }, "Original = the default, the key is cleared");
  const shape = q(m.host, '[data-inspector-control="shape"]');
  assert.equal(stateOf(shape), "default");
  assertDefaultLook(shape, "reset to Original");
  await m.unmount();
});

test("image panel: reset — pressing the default segment and switching a toggle off go back to grey", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC, width: "fixed", fixedWidth: 320, radius: "full", border: true }} log={log} />);
  const fixed = q(m.host, '[data-inspector-control="fixed-width"]') as HTMLInputElement;
  assert.equal(fixed.value, "320");
  await type(fixed, "9000");
  await act(async () => {
    fixed.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  assert.deepEqual(log.at(-1), { fixedWidth: 4000 }, "clamped to the engine's max");
  await click(segment(m.host, "Corners", "Square"));
  assert.deepEqual(log.at(-1), { radius: "none" });
  assertDefaultLook(segment(m.host, "Corners", "Square"), "Corners back to Square");
  await click(q(m.host, '[aria-label="Border"]'));
  assert.deepEqual(log.at(-1), { border: undefined }, "off = the key is cleared");
  assert.ok(!isSetColour(q(m.host, '[aria-label="Border"]').style.backgroundColor), "Border off is not blue");
  await click(segment(m.host, "Width", "Fill"));
  assert.deepEqual(log.at(-1), { width: "fill" });
  assert.equal(m.host.querySelector('[data-inspector-control="fixed-width"]'), null, "the px field leaves with Fixed");
  await m.unmount();
});

test("image panel: Replace — a file from Files or a pasted link writes src and recentres the focus", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC, aspect: "16 / 9", focus: { x: 10, y: 90 } }} log={log} />);
  await click(q(m.host, "[data-image-replace]"));
  const pop = q(document, "[data-image-source-popover]");
  assert.equal(pop.querySelectorAll("[data-image-file]").length, 2);
  assert.ok(pop.textContent?.includes("Upload from device"));
  assert.ok(pop.textContent?.includes("Paste a link"));
  await click(q(pop, '[data-image-file="f2"]'));
  assert.deepEqual(log.at(-1), { src: FILES[1].src, focus: undefined });
  assert.equal(q(m.host, "[data-image-file-name]").textContent, "huila-beans.jpg");
  await click(q(m.host, "[data-image-replace]"));
  await click(q(document, "[data-image-source-popover] [data-image-link]"));
  const input = q(document, '[data-image-link-form] input') as HTMLInputElement;
  await type(input, "http://cdn.example/a/menu.png");
  await act(async () => {
    q(document, "[data-image-link-form]").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.ok(document.querySelector("[data-image-link-error]"), "http:// is refused, as pages-service would");
  assert.equal(log.at(-1)?.src, FILES[1].src, "nothing written for a refused link");
  await type(input, " https://cdn.example/a/menu.png ");
  await act(async () => {
    q(document, "[data-image-link-form]").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(log.at(-1), { src: "https://cdn.example/a/menu.png", focus: undefined });
  assert.equal(q(m.host, "[data-image-file-name]").textContent, "menu.png");
  await m.unmount();
});

test("image panel: previewSrc and fileName from the host draw a Files reference", async () => {
  const m = await mount(<ImageInspectorPanel value={{ src: "mlfile:0b5c6c1e-3f7e-4c64-9a52-9b8f2d1f5a10" }} previewSrc="https://cdn.example/x.png" fileName="menu.png" onChange={noop} />);
  assert.equal(q(m.host, "[data-image-file-name]").textContent, "menu.png");
  assert.ok(q(m.host, '[data-image-thumb="source"]').style.backgroundImage.includes("https://cdn.example/x.png"));
  await m.unmount();
});

test("image panel: a stored fit outside Crop / Whole is shown as it is; disabled reaches every control", async () => {
  const m = await mount(<ImageInspectorPanel value={{ src: SRC, aspect: "4 / 3", fit: "scale-down" }} disabled onChange={noop} />);
  const on = q(m.host, '[aria-label="Fit"] [data-state="on"]');
  assert.equal(on.textContent, "scale-down");
  assertSetFill(on, "stored scale-down");
  assert.ok((q(m.host, "fieldset") as HTMLFieldSetElement).disabled, "the panel's fieldset is disabled");
  await m.unmount();
});

test("image panel: Alt text writes alt", async () => {
  const log: Patch[] = [];
  const m = await mount(<Host initial={{ src: SRC }} log={log} />);
  const ta = q(m.host, "textarea") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(ta, "Pumpkin raf in a ceramic cup");
    ta.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  assert.deepEqual(log.at(-1), { alt: "Pumpkin raf in a ceramic cup" });
  await m.unmount();
});

let failed = 0;
const selected = tests.filter((x) => !process.env.TEST_ONLY || x.name.includes(process.env.TEST_ONLY));
for (const t of selected) {
  try {
    await t.fn();
    console.log(`  ok   ${t.name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${t.name}\n       ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`\n${selected.length - failed}/${selected.length} passed (image panel)`);
process.exit(failed ? 1 : 0);
