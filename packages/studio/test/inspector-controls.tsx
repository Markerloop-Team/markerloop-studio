// Inspector control set (SDL-952, EP-189) — render tests against the BUILT
// dist, same recipe as run.tsx (node:assert + tsx, exit code is the verdict).
//
//   pnpm --filter @markerloop/studio build && pnpm --filter @markerloop/studio test
//
// Pinned: the grey/blue rule (a value at its default is grey; a set one is a
// #008ed0 FILL with white text, never blue text with a blue border — owner,
// 1 Nov 2026; a switch is blue when on, with no grey default look) on every
// control; Row geometry (84 px label, ≥ 44 px); ScaleSelect
// drawing each step at its own size; "+" / "Add to theme" opening a popover
// and handing {name, value} to onAddToTheme.
import { installLayoutStubs } from "./dom";

import assert from "node:assert/strict";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import * as studio from "@markerloop/studio";

const {
  INSPECTOR_COLORS,
  INSPECTOR_STATE_ATTR,
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

// --- the rule ---------------------------------------------------------------

test("inspector: value state — absent or equal to the default is grey, anything else is set", () => {
  assert.equal(inspectorValueState(undefined, "column"), "default");
  assert.equal(inspectorValueState("column", "column"), "default");
  assert.equal(inspectorValueState(3, "3"), "default", "numbers and strings compare by text");
  assert.equal(inspectorValueState("row", "column"), "set");
  assert.equal(inspectorValueState(false, true), "set");
  assert.equal(inspectorValueState("x", undefined), "set");
  assert.deepEqual({ ...INSPECTOR_COLORS }, { default: "var(--muted-foreground, #71717a)", set: "#008ed0", onSet: "#ffffff" });
  assert.deepEqual(inspectorFill("set"), { backgroundColor: "#008ed0", color: "#ffffff", borderColor: "#008ed0", boxShadow: "none" });
  assert.deepEqual(inspectorFill("default"), {});
});

test("inspector: Segmented — pressed segment grey at the default, a #008ed0 fill with white text when set", async () => {
  const options = [
    { value: "column", label: "Column" },
    { value: "row", label: "Row" },
  ] as const;
  for (const [value, want] of [[undefined, "default"], ["column", "default"], ["row", "set"]] as const) {
    const m = await mount(<InspectorSegmented label="Direction" options={options} value={value} defaultValue="column" onChange={noop} />);
    const group = m.host.querySelector('[data-inspector-control="segmented"]');
    assert.equal(stateOf(group), want, `value=${value}`);
    const pressed = m.host.querySelector('[data-state="on"]') as HTMLElement;
    assert.ok(pressed, "a pressed segment");
    assert.equal(pressed.textContent, value === "row" ? "Row" : "Column");
    if (want === "set") assertSetFill(pressed, `value=${value}`);
    else assertDefaultLook(pressed, `value=${value}`);
    // The unpressed segment is grey in both states.
    const other = m.host.querySelector('[data-state="off"]') as HTMLElement;
    assertDefaultLook(other, "unpressed");
    await m.unmount();
  }
});

test("inspector: Segmented — a click reports the value, a click on the pressed one reports nothing", async () => {
  const seen: string[] = [];
  const m = await mount(
    <InspectorSegmented
      label="Direction"
      options={[{ value: "column", label: "Column" }, { value: "row", label: "Row" }]}
      defaultValue="column"
      onChange={(v) => seen.push(v)}
    />,
  );
  const [col, row] = Array.from(m.host.querySelectorAll("button"));
  await click(row!);
  await click(col!);
  assert.deepEqual(seen, ["row"]);
  await m.unmount();
});

test("inspector: Toggle — on is #008ed0 whether set or default, off is the border grey; no grey 'default' look", async () => {
  const cases: Array<[boolean | undefined, boolean, "default" | "set"]> = [
    [undefined, false, "default"],
    [true, true, "default"],
    [true, false, "set"],
    [false, true, "set"],
  ];
  for (const [value, def, want] of cases) {
    const m = await mount(<InspectorToggle label="Wrap" value={value} defaultValue={def} onChange={noop} />);
    const sw = m.host.querySelector('[data-inspector-control="toggle"]') as HTMLElement;
    assert.equal(stateOf(sw), want, `value=${value} default=${def}`);
    const checked = (value ?? def) === true;
    assert.equal(sw.getAttribute("data-state"), checked ? "checked" : "unchecked");
    if (checked) {
      assert.ok(isSetColour(sw.style.backgroundColor), `on: track ${sw.style.backgroundColor} must be #008ed0`);
    } else {
      assert.ok(sw.style.backgroundColor.includes("--border"), `off: track ${sw.style.backgroundColor} must be the border grey`);
      assert.ok(!isSetColour(sw.style.boxShadow), `off: no blue ring (${sw.style.boxShadow})`);
    }
    assert.ok(!isDefaultColour(sw.style.backgroundColor), "no grey 'default' track");
    await m.unmount();
  }
});

test("inspector: ThemeColorRow — the picked swatch rings grey at the default, #008ed0 when set; + is last", async () => {
  const colors = [
    { id: "surface", name: "Surface", color: "#ffffff" },
    { id: "muted", name: "Muted", color: "#f4f4f5" },
    { id: "primary", name: "Primary", color: "#7c2d12" },
  ];
  for (const [value, want] of [[undefined, "default"], ["primary", "set"]] as const) {
    const m = await mount(<InspectorThemeColorRow label="Fill" colors={colors} value={value} defaultValue="surface" onChange={noop} onAddToTheme={noop} />);
    const pressed = m.host.querySelector('[aria-pressed="true"]') as HTMLElement;
    assert.equal(pressed.getAttribute("aria-label"), value === "primary" ? "Primary" : "Surface");
    assert.equal(stateOf(pressed), want);
    const ring = pressed.style.boxShadow;
    assert.ok(want === "set" ? isSetColour(ring) : isDefaultColour(ring), `ring ${ring}`);
    const buttons = Array.from(m.host.querySelectorAll('[data-inspector-control="theme-colors"] > button'));
    assert.equal(buttons.length, 4);
    assert.equal(buttons.at(-1)!.getAttribute("aria-label"), "Add to theme");
    assert.equal((buttons[0] as HTMLElement).style.width, "26px");
    await m.unmount();
  }
});

test("inspector: ThemeColorRow — + opens the popover and hands {name, value} to onAddToTheme", async () => {
  const added: Array<{ name: string; value: string }> = [];
  const m = await mount(
    <InspectorThemeColorRow label="Fill" colors={[{ id: "surface", name: "Surface", color: "#fff" }]} onChange={noop} onAddToTheme={(e) => added.push(e)} />,
  );
  assert.equal(document.querySelector('[data-inspector-popover="add"]'), null, "closed before the click");
  await click(m.host.querySelector("[data-inspector-add]")!);
  const pop = document.querySelector('[data-inspector-popover="add"]');
  assert.ok(pop, "the popover opened");
  await type(pop.querySelector("[data-inspector-add-name]") as HTMLInputElement, "Brand accent");
  await type(pop.querySelector("[data-inspector-add-value]") as HTMLInputElement, "#112233");
  await click(pop.querySelector("[data-inspector-add-submit]")!);
  assert.deepEqual(added, [{ name: "Brand accent", value: "#112233" }]);
  assert.equal(document.querySelector('[data-inspector-popover="add"]'), null, "closed after adding");
  await m.unmount();
});

test("inspector: Row — label column is 84 px, the row at least 44 px", async () => {
  const m = await mount(
    <InspectorSection title="Layout">
      <InspectorRow label="Direction" hint={<InspectorInfoHint>How children flow</InspectorInfoHint>}>
        <span>control</span>
      </InspectorRow>
    </InspectorSection>,
  );
  const row = m.host.querySelector("[data-inspector-row]") as HTMLElement;
  assert.match(row.style.gridTemplateColumns, /^84px\b/);
  assert.equal(row.style.minHeight, "44px");
  assert.equal(row.style.display, "grid");
  const label = row.querySelector("label") as HTMLElement;
  assert.ok(isDefaultColour(label.style.color), "the label is grey");
  const title = m.host.querySelector("[data-inspector-section-title]") as HTMLElement;
  assert.equal(title.textContent, "Layout");
  assert.equal(title.style.textTransform, "uppercase");
  assert.ok(row.querySelector('[data-inspector-info][aria-label="More info"]'), "the ⓘ sits by the label");
  await m.unmount();
});

const SPACE = [
  { id: "0", size: 0 },
  { id: "XS", size: 4 },
  { id: "S", size: 8 },
  { id: "M", size: 16 },
  { id: "L", size: 24 },
  { id: "XL", size: 40 },
];
const TEXT = [
  { id: "caption", name: "Caption", size: 12 },
  { id: "body", name: "Body", size: 16 },
  { id: "h2", name: "Heading 2", size: 28, weight: 600 },
  { id: "display", name: "Display", size: 48, weight: 700 },
];

test("inspector: ScaleSelect — trigger grey at the default, a #008ed0 fill with white text when set", async () => {
  for (const [value, want] of [[undefined, "default"], ["M", "default"], ["L", "set"]] as const) {
    const m = await mount(<InspectorScaleSelect label="Gap" kind="space" steps={SPACE} value={value} defaultValue="M" onChange={noop} />);
    const trigger = m.host.querySelector('[data-inspector-control="scale-select"]') as HTMLElement;
    assert.equal(stateOf(trigger), want);
    if (want === "set") assertSetFill(trigger, `value=${value}`);
    else assertDefaultLook(trigger, `value=${value}`);
    assert.ok(trigger.textContent!.startsWith(value ?? "M"));
    await m.unmount();
  }
});

test("inspector: ScaleSelect — every spacing step is a bar of its own width", async () => {
  const m = await mount(<InspectorScaleSelect label="Gap" kind="space" steps={SPACE} defaultValue="M" onChange={noop} />);
  await click(m.host.querySelector('[data-inspector-control="scale-select"]')!);
  const options = Array.from(document.querySelectorAll('[data-inspector-popover="scale"] [role="option"]'));
  assert.equal(options.length, SPACE.length);
  const widths = options.map((o) => (o.querySelector('[data-scale-preview="bar"]') as HTMLElement).style.width);
  assert.deepEqual(widths, SPACE.map((s) => `${Math.max(2, s.size * 1.9)}px`));
  assert.equal(new Set(widths).size, widths.length, "no two steps drawn alike");
  assert.equal(options.find((o) => o.getAttribute("aria-selected") === "true")?.getAttribute("data-scale-step"), "M");
  await m.unmount();
});

test("inspector: ScaleSelect — every text step is text of its own size (compressed above 24), and a pick reports it", async () => {
  const picked: string[] = [];
  const m = await mount(<InspectorScaleSelect label="Size" kind="text" steps={TEXT} defaultValue="body" onChange={(v) => picked.push(v)} />);
  await click(m.host.querySelector('[data-inspector-control="scale-select"]')!);
  const options = Array.from(document.querySelectorAll('[data-inspector-popover="scale"] [role="option"]'));
  const previews = options.map((o) => o.querySelector('[data-scale-preview="text"]') as HTMLElement);
  assert.deepEqual(previews.map((p) => p.style.fontSize), ["12px", "16px", "25px", "30px"]);
  assert.deepEqual(previews.map((p) => p.textContent), ["Caption", "Body", "Heading 2", "Display"]);
  assert.equal(previews[2]!.style.fontWeight, "600");
  await click(options[2]!);
  assert.deepEqual(picked, ["h2"]);
  assert.equal(document.querySelector('[data-inspector-popover="scale"]'), null, "closed after the pick");
  await m.unmount();
});

test("inspector: ScaleSelect — Add to theme asks name and value and hands them to onAddToTheme", async () => {
  const added: Array<{ name: string; value: number }> = [];
  const m = await mount(<InspectorScaleSelect label="Gap" kind="space" steps={SPACE} defaultValue="M" onChange={noop} note="Sizes come from the theme" onAddToTheme={(e) => added.push(e)} />);
  await click(m.host.querySelector('[data-inspector-control="scale-select"]')!);
  const add = document.querySelector('[data-inspector-popover="scale"] [data-inspector-add]');
  assert.ok(add, "the list offers Add to theme");
  await click(add);
  const form = document.querySelector('[data-inspector-popover="scale"] [data-inspector-add-form]');
  assert.ok(form, "the add form replaced the list");
  await type(form.querySelector("[data-inspector-add-name]") as HTMLInputElement, "XXL");
  await type(form.querySelector("[data-inspector-add-value]") as HTMLInputElement, "56");
  await click(form.querySelector("[data-inspector-add-submit]")!);
  assert.deepEqual(added, [{ name: "XXL", value: 56 }]);
  await m.unmount();
});

test("inspector: ScaleSelect — steps above the threshold keep distinct, ordered sizes", async () => {
  const steps = [
    { id: "body", name: "Body", size: 16 },
    { id: "h3", name: "Heading 3", size: 30 },
    { id: "h1", name: "Heading 1", size: 36 },
    { id: "display", name: "Display", size: 48 },
  ];
  const m = await mount(<InspectorScaleSelect label="Text size" kind="text" steps={steps} defaultValue="body" onChange={noop} />);
  await click(m.host.querySelector('[data-inspector-control="scale-select"]')!);
  const sizes = Array.from(document.querySelectorAll('[data-inspector-popover="scale"] [data-scale-preview="text"]')).map((p) =>
    parseFloat((p as HTMLElement).style.fontSize),
  );
  assert.equal(sizes.length, 4);
  assert.equal(new Set(sizes).size, 4, `distinct: ${sizes.join(", ")}`);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i]! > sizes[i - 1]!, `ordered: ${sizes.join(", ")}`);
  assert.equal(sizes[0], 16, "below the threshold drawn as is");
  await m.unmount();
});

test("inspector: Select — trigger grey at the default, a #008ed0 fill with white text when set", async () => {
  const options = [
    { value: "everyone", label: "Everyone" },
    { value: "members", label: "Members" },
  ];
  for (const [value, want] of [[undefined, "default"], ["members", "set"]] as const) {
    const m = await mount(<InspectorSelect label="Visible to" options={options} value={value} defaultValue="everyone" onChange={noop} />);
    const trigger = m.host.querySelector('[data-inspector-control="select"]') as HTMLElement;
    assert.equal(stateOf(trigger), want);
    if (want === "set") assertSetFill(trigger, `value=${value}`);
    else assertDefaultLook(trigger, `value=${value}`);
    assert.equal(trigger.textContent, value === "members" ? "Members" : "Everyone");
    await m.unmount();
  }
});

test("inspector: regression — no set control is blue text with a blue border on white (owner, 1 Nov 2026)", async () => {
  const m = await mount(
    <div>
      <InspectorSegmented label="Direction" options={[{ value: "column", label: "Column" }, { value: "row", label: "Row" }]} value="row" defaultValue="column" onChange={noop} />
      <InspectorScaleSelect label="Gap" kind="space" steps={SPACE} value="L" defaultValue="M" onChange={noop} />
      <InspectorSelect label="Visible to" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} value="b" defaultValue="a" onChange={noop} />
    </div>,
  );
  const shown = [
    m.host.querySelector('[data-inspector-control="segmented"] [data-state="on"]'),
    m.host.querySelector('[data-inspector-control="scale-select"]'),
    m.host.querySelector('[data-inspector-control="select"]'),
  ] as HTMLElement[];
  assert.equal(shown.filter(Boolean).length, 3);
  for (const el of shown) {
    assert.equal(stateOf(el), "set");
    const oldLook = isSetColour(el.style.color) && !isSetColour(el.style.backgroundColor);
    assert.ok(!oldLook, `${el.getAttribute("data-inspector-control") ?? "segment"}: blue text on white is the old look`);
    assertSetFill(el, el.getAttribute("data-inspector-control") ?? "segment");
    // The focus ring must draw a line: the kit's outline-none zeroes the style.
    assert.match(el.className, /focus-visible:outline-solid/, "focus ring has a style");
  }
  await m.unmount();
});

test("inspector: ScaleSelect — set → default restores the border colour, no style-conflict warning", async () => {
  const warnings: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const m = await mount(<InspectorScaleSelect label="Gap" kind="space" steps={SPACE} value="L" defaultValue="M" onChange={noop} />);
    const trigger = () => m.host.querySelector('[data-inspector-control="scale-select"]') as HTMLElement;
    assertSetFill(trigger(), "set");
    assert.ok(isSetColour(trigger().style.borderColor), `set: border ${trigger().style.borderColor}`);
    await act(async () => m.root.render(<InspectorScaleSelect label="Gap" kind="space" steps={SPACE} value={undefined} defaultValue="M" onChange={noop} />));
    const t = trigger();
    assert.equal(stateOf(t), "default");
    assert.ok(t.style.borderColor.includes("--border"), `default: border colour ${t.style.borderColor || "(dropped)"} must be the border grey`);
    assert.equal(t.style.borderStyle, "solid");
    assert.equal(t.style.borderWidth, "1px");
    assertDefaultLook(t, "back to default");
    await m.unmount();
  } finally {
    console.error = orig;
  }
  const conflict = warnings.filter((w) => /shorthand|conflicting/i.test(w));
  assert.deepEqual(conflict, [], "React warned about mixing border shorthand and longhand");
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
console.log(`\n${selected.length - failed}/${selected.length} passed (inspector controls)`);
process.exit(failed ? 1 : 0);
