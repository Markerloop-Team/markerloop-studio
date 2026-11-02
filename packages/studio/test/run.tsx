// Tests for @markerloop/studio (SDL-604). No framework — same recipe as
// packages/engine: node:assert + tsx, exit code is the verdict.
//
//   pnpm --filter @markerloop/studio build && pnpm --filter @markerloop/studio test
//
// They run against the BUILT dist, the code the admin will import. Three
// behaviours that broke silently in the reference are pinned here, each with a
// test that fails when the defect is planted back (recipes in README.md):
//
//   1. canvas events are heard by NATIVE listeners on the frame's document;
//   2. the overlay paints with the admin's tokens, never literal colours (EP-187);
//   3. one operation is exactly one history frame.
import { installLayoutStubs } from "./dom";

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AccordionViewElement, DataViewPropsSchema, TableViewElement, TabsViewElement, dataViewQuery, propsVersionsFromBlocks, saunaPublicShell, type SaunaSchema } from "@markerloop/engine";
import { SAUNA_NODE_ID_ATTR, SaunaRenderer } from "@markerloop/engine/react/renderer";
import * as studio from "@markerloop/studio";
import * as engine from "@markerloop/engine";
import { z } from "zod";

// Internal modules the package does not export (the admin mounts them through
// <SaunaStudio>); reached by path in dist, still the built code.
import { SaunaCanvasFrame } from "../dist/canvas-frame.js";
import { SaunaCanvasSelection, frameBox } from "../dist/canvas-selection.js";
import { OUTLINE_DRAG_ACTIVATION_DISTANCE, OUTLINE_DROP_ANIMATION, outlineDropAnimation, usePrefersReducedMotion } from "../dist/outline-drag-motion.js";

const { createStudioStore } = studio;

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
const test = (name: string, fn: Test["fn"]) => tests.push({ name, fn });

// --- fixtures --------------------------------------------------------------

function schema(): SaunaSchema {
  return {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Box", props: {}, children: ["title", "lead"] },
      title: { type: "Heading", props: { as: "h1", children: "Hello" } },
      lead: { type: "Text", props: { children: "World" } },
    },
    parents: { root: null, title: "root", lead: "root" },
  } as SaunaSchema;
}

/**
 * What a component's own React click handler saw. `link` behaves like
 * next/link (it navigates unless the event is already defaultPrevented),
 * `button` like a Radix trigger (it acts under the same condition).
 */
type ClickProbe = { link: boolean[]; button: boolean[] };

/** Stand-in for the renderer: the node-id attribute is all the canvas reads. */
function Content({ store, probe }: { store: studio.StudioStore; probe?: ClickProbe }): React.ReactNode {
  const s = React.useSyncExternalStore(store.subscribe, () => store.getState().schema);
  // Drawn the way the renderer draws it: the width variant being edited laid
  // over the base (SDL-632).
  const screen = React.useSyncExternalStore(store.subscribe, () => store.getState().view.screen);
  const text = (id: string) => {
    const node = s.nodes[id];
    return String((node ? studio.nodePropsForScreen(node, screen).children : undefined) ?? "");
  };
  return (
    <main {...{ [SAUNA_NODE_ID_ATTR]: "root" }} style={{ padding: 8 }}>
      <h1 {...{ [SAUNA_NODE_ID_ATTR]: "title" }}>{text("title")}</h1>
      <p {...{ [SAUNA_NODE_ID_ATTR]: "lead" }}>
        <span data-test="lead-inner">{text("lead")}</span>
        {probe && (
          <>
            <a href="/elsewhere" data-test="lead-link" onClick={(e) => probe.link.push(!e.defaultPrevented)}>
              go
            </a>
            <button type="button" data-test="lead-button" onClick={(e) => probe.button.push(!e.defaultPrevented)}>
              open
            </button>
          </>
        )}
      </p>
    </main>
  );
}

type Mounted = { root: Root; host: HTMLElement; frameDoc: Document; store: studio.StudioStore; attached: string[] };

/**
 * Mounts the real canvas: SaunaCanvasFrame (iframe + portal) with the
 * selection layer as its overlay — the composition the shell uses.
 */
async function mountCanvas(opts: { strict?: boolean; probe?: ClickProbe } = {}): Promise<Mounted> {
  const store = createStudioStore({ initialSchema: schema() });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const attached: string[] = [];
  const tree = (
    <SaunaCanvasFrame
      width={1280}
      overlay={(doc: Document) => {
        // Record where the layer attaches its listeners — once per document.
        const d = doc as Document & { __spied?: boolean };
        if (!d.__spied) {
          d.__spied = true;
          const orig = d.addEventListener.bind(d);
          d.addEventListener = ((type: string, ...rest: unknown[]) => {
            attached.push(type);
            return (orig as (...a: unknown[]) => void)(type, ...rest);
          }) as Document["addEventListener"];
        }
        return <SaunaCanvasSelection doc={doc} store={store} />;
      }}
    >
      <Content store={store} probe={opts.probe} />
    </SaunaCanvasFrame>
  );
  const root = createRoot(host);
  await act(async () => {
    root.render(opts.strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
  });
  // Frame attach → style transfer (a resolved promise here) → portal render.
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const iframe = host.querySelector("iframe");
  assert.ok(iframe, "canvas iframe not rendered");
  const frameDoc = iframe.contentDocument!;
  installLayoutStubs(frameDoc.defaultView!);
  assert.ok(frameDoc.querySelector(`[${SAUNA_NODE_ID_ATTR}="title"]`), "content not portalled into the frame");
  assert.ok(frameDoc.querySelector("[data-sauna-canvas-overlay]"), "overlay not portalled into the frame");
  return { root, host, frameDoc, store, attached };
}

async function unmount(m: Mounted): Promise<void> {
  await act(async () => m.root.unmount());
  m.host.remove();
}

/** Fires an event constructed in the FRAME's realm, as a real click would be. */
async function fire(target: EventTarget, doc: Document, kind: "click" | "dblclick", init: MouseEventInit = {}): Promise<void> {
  const W = doc.defaultView as unknown as { MouseEvent: typeof MouseEvent };
  await act(async () => { target.dispatchEvent(new W.MouseEvent(kind, { bubbles: true, cancelable: true, ...init })); });
}
async function key(target: EventTarget, doc: Document, keyName: string): Promise<void> {
  const W = doc.defaultView as unknown as { KeyboardEvent: typeof KeyboardEvent };
  await act(async () => { target.dispatchEvent(new W.KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true })); });
}
async function input(el: HTMLElement, doc: Document, text: string): Promise<void> {
  const W = doc.defaultView as unknown as { Event: typeof Event };
  await act(async () => {
    el.textContent = text;
    el.dispatchEvent(new W.Event("input", { bubbles: true }));
  });
}
const el = (doc: Document, id: string) => doc.querySelector<HTMLElement>(`[${SAUNA_NODE_ID_ATTR}="${id}"]`)!;

// --- 0. package surface ------------------------------------------------------

test("package: the entry exports the editor surface", () => {
  for (const name of ["SaunaStudio", "createStudioStore", "useStudioHotkeys", "useStudioAutoSave",
    "SaunaPropertiesAutoForm", "SaunaEditableOverlay", "SaunaHistoryPanel", "pushHistory", "applyUndo"]) {
    assert.equal(typeof (studio as Record<string, unknown>)[name], "function", `missing export ${name}`);
  }
});

// --- 1. native listeners on the frame's document ----------------------------

test("frame events: click inside the iframe selects the node under it", async () => {
  const m = await mountCanvas();
  try {
    // A click on a descendant of the node — the hit-test must walk up.
    await fire(m.frameDoc.querySelector('[data-test="lead-inner"]')!, m.frameDoc, "click");
    assert.equal(m.store.getState().selection.nodeId, "lead");
    // Alt-click reaches the parent.
    await fire(el(m.frameDoc, "title"), m.frameDoc, "click", { altKey: true });
    assert.equal(m.store.getState().selection.nodeId, "root");
  } finally { await unmount(m); }
});

test("frame events: listeners sit on the frame's document, not on React's root or the portal body", async () => {
  const m = await mountCanvas();
  try {
    for (const type of ["click", "pointerover", "keydown", "dblclick"]) {
      assert.ok(m.attached.includes(type), `no native "${type}" listener on the frame document (got: ${m.attached.join(", ")})`);
    }
    // A click that lands OUTSIDE the portal container (on <html> of the
    // frame) never passes through React's portal listener on <body>; only a
    // document listener hears it — and it must clear the selection.
    await act(async () => { m.store.getState().selectNode("title"); });
    await fire(m.frameDoc.documentElement, m.frameDoc, "click");
    assert.equal(m.store.getState().selection.nodeId, null, "a click on the frame outside any node did not clear the selection");
    // Esc from inside the frame clears it too.
    await act(async () => { m.store.getState().selectNode("title"); });
    await key(m.frameDoc.body, m.frameDoc, "Escape");
    assert.equal(m.store.getState().selection.nodeId, null, "Escape inside the frame did not clear the selection");
  } finally { await unmount(m); }
});

test("frame events: a click on a link selects it and never lets the link navigate (SDL-634)", async () => {
  // next/link hears the click through React's portal listener on the frame's
  // <body> — BEFORE the document-level selection listener — and navigates the
  // admin unless the event is already cancelled. Measured on the contour: a
  // click on an ActionCardLink took the whole editor to the card's href.
  const probe: ClickProbe = { link: [], button: [] };
  const m = await mountCanvas({ probe });
  try {
    await fire(m.frameDoc.querySelector('[data-test="lead-link"]')!, m.frameDoc, "click");
    assert.deepEqual(probe.link, [false], "the link's own handler saw an uncancelled click — next/link would navigate the editor away");
    assert.equal(m.store.getState().selection.nodeId, "lead", "a click on a link did not select the node around it");
    // The capture cancel is scoped to anchors: a button's own handler (a
    // Radix trigger checks defaultPrevented the same way) still acts.
    await fire(m.frameDoc.querySelector('[data-test="lead-button"]')!, m.frameDoc, "click");
    assert.deepEqual(probe.button, [true], "a button on the canvas saw a cancelled click — the anchor-only cancel spread to everything");
  } finally { await unmount(m); }
});

test("frame events: a click in the ADMIN document does not select canvas nodes", async () => {
  const m = await mountCanvas();
  try {
    await act(async () => { m.store.getState().selectNode("title"); });
    await fire(m.host, document, "click");
    assert.equal(m.store.getState().selection.nodeId, "title");
  } finally { await unmount(m); }
});

// --- 2. overlay colours are the admin's tokens, never literals (EP-187) ------
//
// Layer 5, decision 2: the selection is the layer-1 brand blue `--selection`
// (#008ed0), read from the admin token the kit's sheet scopes to
// `[data-surface]` — which the overlay root carries — and never a colour
// written into the code. jsdom drops a `var()` it cannot resolve, so the
// tokens are pinned on the exported paint and the source; the render check
// pins that no literal colour reaches the overlay and that the scope is there.

const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;

test("overlay colours: every painted colour is an admin token (--selection), never a literal", async () => {
  const { SAUNA_CANVAS_SELECTION_PAINT: paint } = await import("../dist/canvas-selection.js");
  assert.equal(paint.select, "var(--selection)", "the selection is not the layer-1 token");
  for (const [what, value] of Object.entries(paint) as Array<[string, string]>) {
    assert.ok(/var\(--[a-z-]+\)/.test(value), `${what} is not a token: "${value}"`);
    assert.ok(!LITERAL_COLOUR.test(value), `${what} carries a literal colour: "${value}"`);
  }
  assert.ok(paint.hover.includes("var(--selection)") && paint.editing.includes("var(--selection)"), "hover / editing do not derive from the selection token");

  const m = await mountCanvas();
  try {
    await act(async () => {
      m.store.getState().selectNode("title");
      m.store.getState().hoverNode("lead");
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const overlay = m.frameDoc.querySelector<HTMLElement>("[data-sauna-canvas-overlay]")!;
    assert.ok(overlay.hasAttribute("data-surface"), "the overlay does not scope the admin tokens (data-surface)");
    const badge = overlay.querySelector<HTMLElement>("[data-sauna-canvas-badge]");
    const handles = overlay.querySelectorAll<HTMLElement>("[data-sauna-canvas-handle]");
    assert.ok(overlay.querySelector('[data-sauna-canvas-marker="selected"]') && overlay.querySelector('[data-sauna-canvas-marker="hover"]') && badge && handles.length === 4, "overlay parts not rendered");
    for (const node of [overlay, ...Array.from(overlay.querySelectorAll<HTMLElement>("*"))]) {
      const style = node.getAttribute("style") ?? "";
      assert.ok(!LITERAL_COLOUR.test(style), `literal colour in overlay style: ${style}`);
    }
  } finally { await unmount(m); }
});

test("overlay colours: the frame itself declares --selection — the light admin value, resolved (EP-187)", async () => {
  // The admin's token sheet lives in the PARENT document; the overlay is
  // drawn inside the frame. Without the tokens re-declared there, every
  // var(--selection) resolves to nothing — a black frame, a bare label.
  const sheet = document.createElement("style");
  sheet.textContent =
    // (jsdom's CSSOM cannot parse @layer; the browser's nests it, which the
    // reader walks the same way as @media.)
    "@media all{[data-surface]{--primary-foreground:#fafafa;--background:#ffffff}}" +
    "[data-surface]{--brand:#008ed0;--selection:var(--brand)}" +
    ".dark [data-surface]{--brand:#2fa3da}";
  document.head.appendChild(sheet);
  const m = await mountCanvas();
  try {
    const tokens = m.frameDoc.querySelector<HTMLStyleElement>("style[data-sauna-overlay-tokens]");
    assert.ok(tokens, "the frame declares no admin tokens for the overlay — var(--selection) resolves to nothing there");
    const rule = Array.from(tokens!.sheet?.cssRules ?? []).find(
      (r) => (r as CSSStyleRule).selectorText?.includes("[data-sauna-canvas-overlay]")
    ) as CSSStyleRule | undefined;
    assert.ok(rule, `no overlay rule in: ${tokens!.textContent}`);
    const resolve = (name: string, hops = 0): string => {
      const raw = rule!.style.getPropertyValue(name).trim();
      const ref = /^var\((--[a-z-]+)\)$/.exec(raw);
      return ref && hops < 5 ? resolve(ref[1]!, hops + 1) : raw;
    };
    assert.equal(resolve("--selection").toLowerCase(), "#008ed0", "--selection does not resolve to the light brand blue inside the frame");
    assert.ok(resolve("--primary-foreground") !== "", "the label's text colour resolves to nothing inside the frame");
    const overlay = m.frameDoc.querySelector("[data-sauna-canvas-overlay]")!;
    assert.ok(overlay.matches("[data-sauna-canvas-overlay][data-surface]"), "the overlay root is not what the token rule targets");
  } finally {
    await unmount(m);
    sheet.remove();
  }
});

test("overlay colours: source guard — frame-side modules hold no literal colours", async () => {
  // The render check above only sees what jsdom keeps; this one reads the
  // sources that paint INSIDE the frame.
  for (const rel of ["src/canvas-selection.tsx", "src/canvas-text-edit.ts"]) {
    const text = await readFile(path.join(import.meta.dirname, "..", rel), "utf8");
    const code = text.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const hit = code.match(LITERAL_COLOUR);
    assert.ok(!hit, `${rel} paints with a literal colour (${hit?.[0]}) in code that renders inside the frame`);
  }
});

// --- 2b. the selection frame is drawn whole (SDL-770) ------------------------
//
// The owner, on the prod canvas: the frame of a selected Section "goes under
// the block", and the first block has no top edge. Two causes, both pinned:
// the frame was sized to the node while the frame document's preflight is
// `border-box` (shifted up-left by its stroke: top/left edges off a block at
// the document edge, bottom/right sunk 2px into the block), and nothing kept
// an edge that falls outside the document inside it. jsdom has no layout, so
// the boxes are stubbed and the test reads the geometry the layer applied.

test("frame geometry: outside the node where there is room, inset at every document edge", () => {
  const vp = { width: 1280, height: 600 };
  // Room on all four sides: the stroke sits just outside the node.
  assert.deepEqual(frameBox({ top: 200, left: 24, width: 600, height: 100 }, 2, vp), { top: 198, left: 22, width: 604, height: 104 });
  // A full-width first block: top and left/right pulled in, bottom outside —
  // over the next block, which is the boundary the author is looking at.
  assert.deepEqual(frameBox({ top: 0, left: 0, width: 1280, height: 150 }, 2, vp), { top: 0, left: 0, width: 1280, height: 152 });
  // The last block: the bottom edge pulled in to the document's end.
  assert.deepEqual(frameBox({ top: 450, left: 0, width: 1280, height: 150 }, 2, vp), { top: 448, left: 0, width: 1280, height: 152 });
  // The whole page: every side inset.
  assert.deepEqual(frameBox({ top: 0, left: 0, width: 1280, height: 600 }, 2, vp), { top: 0, left: 0, width: 1280, height: 600 });
  // Not measured yet: nothing to clamp against but the origin.
  assert.deepEqual(frameBox({ top: 0, left: 0, width: 375, height: 80 }, 1, null), { top: 0, left: 0, width: 376, height: 81 });
});

test("frame geometry: the layer draws whole frames on top of the content, and never sizes the page", async () => {
  const m = await mountCanvas();
  try {
    const box = (top: number, left: number, width: number, height: number) => () =>
      ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
    const stub = (id: string, r: () => DOMRect) =>
      Object.defineProperty(el(m.frameDoc, id), "getBoundingClientRect", { configurable: true, value: r });
    // The device viewport: 1280 wide, as tall as the document (the frame
    // grows with its content).
    const html = m.frameDoc.documentElement;
    Object.defineProperty(html, "clientWidth", { configurable: true, value: 1280 });
    Object.defineProperty(html, "clientHeight", { configurable: true, value: 300 });
    stub("root", box(0, 0, 1280, 300)); // the whole page
    stub("title", box(0, 0, 1280, 100)); // the first block, full width
    stub("lead", box(120, 24, 600, 80)); // a block with room around it
    await act(async () => { m.frameDoc.defaultView!.dispatchEvent(new (m.frameDoc.defaultView as unknown as { Event: typeof Event }).Event("resize")); });

    const overlay = m.frameDoc.querySelector<HTMLElement>("[data-sauna-canvas-overlay]")!;
    const marker = (kind: string) => overlay.querySelector<HTMLElement>(`[data-sauna-canvas-marker="${kind}"]`);
    const geometry = (node: HTMLElement | null) =>
      node && [node.style.top, node.style.left, node.style.width, node.style.height].join(" ");

    // The layer: the last thing in the frame's body, outside every node, the
    // whole viewport, clipped, topmost, transparent to the pointer.
    const content = el(m.frameDoc, "root");
    assert.ok(content.compareDocumentPosition(overlay) & 4, "the overlay is painted before the content it marks");
    assert.equal(overlay.closest(`[${SAUNA_NODE_ID_ATTR}]`), null, "the overlay sits inside a node — its stack and clip");
    assert.equal(overlay.parentElement, m.frameDoc.body, "the overlay is not a direct child of the frame's body");
    assert.deepEqual(
      [overlay.style.position, overlay.style.top, overlay.style.right, overlay.style.bottom, overlay.style.left, overlay.style.overflow, overlay.style.zIndex, overlay.style.pointerEvents],
      ["absolute", "0px", "0px", "0px", "0px", "hidden", "2147483647", "none"],
      "the overlay is not a clipped, topmost, pointer-transparent viewport layer"
    );

    // First block, full width: top, left and right inset, bottom outside.
    await act(async () => { m.store.getState().selectNode("title"); m.store.getState().hoverNode("lead"); });
    const selected = marker("selected");
    assert.equal(geometry(selected), "0px 0px 1280px 102px", "the first block's frame is not whole");
    assert.equal(selected!.style.boxSizing, "border-box", "the frame's size depends on the author's box-sizing");
    // Hover, 1px, with room: just outside the node.
    assert.equal(geometry(marker("hover")), "119px 23px 602px 82px", "the hover frame is not just outside its node");
    for (const h of Array.from(overlay.querySelectorAll<HTMLElement>("[data-sauna-canvas-handle]"))) {
      const [top, left] = [parseFloat(h.style.top), parseFloat(h.style.left)];
      assert.ok(top >= 0 && left >= 0 && left <= 1280 - 7 && top <= 300 - 7, `handle ${h.dataset.saunaCanvasHandle} off the page at ${top},${left}`);
    }
    const badge = overlay.querySelector<HTMLElement>("[data-sauna-canvas-badge]")!;
    assert.deepEqual([badge.style.top, badge.style.left], ["2px", "0px"], "the badge of the first block is not tucked inside it");

    // A block with room: the stroke sits just outside it.
    await act(async () => { m.store.getState().selectNode("lead"); });
    assert.equal(geometry(marker("selected")), "118px 22px 604px 84px", "a frame with room is not drawn just outside its node");
    assert.equal(overlay.querySelector<HTMLElement>("[data-sauna-canvas-badge]")!.style.top, "100px", "the badge is not right above the frame");

    // The whole page: inset on all four sides, nothing past the viewport.
    await act(async () => { m.store.getState().selectNode("root"); });
    assert.equal(geometry(marker("selected")), "0px 0px 1280px 300px", "the page's frame runs past the document");
  } finally { await unmount(m); }
});

test("canvas sheet: the border goes around the document, so no column or row of it is clipped (SDL-770)", async () => {
  // Acceptance on test: the sheet (overflow-hidden, 1px border) was sized to
  // the scaled document under the admin's border-box preflight, so its content
  // box was 2px narrower and shorter than the document — a 768px page shown in
  // 766px, the selection frame's right edge cut off with the last 2px.
  const m = await mountCanvas();
  try {
    const sheet = m.host.querySelector<HTMLElement>("[data-sauna-canvas-sheet]")!;
    const doc = sheet.firstElementChild as HTMLElement;
    const scale = Number(sheet.dataset.saunaCanvasScale);
    assert.equal(sheet.style.boxSizing, "content-box", "the sheet's border is taken out of the document's box");
    assert.ok(
      parseFloat(sheet.style.width) >= parseFloat(doc.style.width) * scale &&
        parseFloat(sheet.style.height) >= parseFloat(doc.style.height) * scale,
      `the sheet's content box ${sheet.style.width}×${sheet.style.height} is smaller than the scaled document`
    );
    // overflow-hidden clips to the ROUNDED padding box: a radius shaves the
    // document's corners, and the selection frame's corners and handles with them.
    assert.ok(!/\brounded\b|\brounded-/.test(sheet.className), `the clipping sheet is rounded (${sheet.className})`);
  } finally { await unmount(m); }
});

test("canvas sheet: the fit-to-width scale leaves room for the border, so the sheet fits what it is given (SDL-770)", async () => {
  // jsdom has no layout: clientWidth is 0 and the scale falls back to 1, which
  // passes with or without the border taken out. Give the workspace a width
  // narrower than the device, so the fit actually runs.
  const AVAILABLE = 1000;
  const proto = HTMLElement.prototype;
  const own = Object.getOwnPropertyDescriptor(proto, "clientWidth");
  Object.defineProperty(proto, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.firstElementChild?.hasAttribute("data-sauna-canvas-sheet") ? AVAILABLE : 0;
    },
  });
  let m: Mounted | undefined;
  try {
    m = await mountCanvas();
    const sheet = m.host.querySelector<HTMLElement>("[data-sauna-canvas-sheet]")!;
    const scale = Number(sheet.dataset.saunaCanvasScale);
    assert.ok(scale > 0 && scale < 1, `the fit did not run (scale ${scale})`);
    const border = 2 * 1; // the sheet's 1px border, both sides, outside its content box
    const outer = parseFloat(sheet.style.width) + border;
    assert.ok(outer <= AVAILABLE + 0.01, `the sheet with its border is ${outer}px in a ${AVAILABLE}px workspace`);
  } finally {
    if (m) await unmount(m);
    if (own) Object.defineProperty(proto, "clientWidth", own);
    else delete (proto as unknown as Record<string, unknown>).clientWidth;
  }
});

// --- 3. one operation = one history frame ------------------------------------

test("history: one op pushes exactly one frame; a no-op pushes none; undo/redo walk it", () => {
  const store = createStudioStore({ initialSchema: schema() });
  const s = () => store.getState();
  s().applyOp({ kind: "updateNodePropsPartial", nodeId: "title", patch: { children: "Hi" } });
  assert.equal(s().history.past.length, 1);
  s().applyOp({ kind: "updateNodePropsPartial", nodeId: "title", patch: { children: "Hi" } });
  assert.equal(s().history.past.length, 1, "a no-op op pushed a frame");
  s().applyOp({ kind: "remove", nodeId: "lead" });
  assert.equal(s().history.past.length, 2);
  s().undo();
  assert.equal(s().history.past.length, 1);
  assert.ok(s().schema.nodes.lead, "undo did not restore the removed node");
  s().redo();
  assert.equal(s().history.past.length, 2);
  assert.equal(s().schema.nodes.lead, undefined);
  // Selection and hover are not history.
  s().selectNode("title");
  s().hoverNode("title");
  assert.equal(s().history.past.length, 2);
});

test("expandRef (SDL-720): a Ref becomes a copy with its params written in — one frame, undo brings the Ref back", () => {
  const block = {
    version: 2,
    rootId: "card",
    nodes: {
      card: { type: "Box", props: {}, children: ["t", "p"] },
      t: { type: "Heading", props: { children: "Block title" } },
      p: { type: "Text", props: { children: "Block price" } },
    },
    parents: { card: null, t: "card", p: "card" },
    params: [
      { name: "title", nodeId: "t", prop: "children", type: "string" },
      { name: "price", nodeId: "p", prop: "children", type: "string", default: "Default price" },
    ],
  } as unknown as SaunaSchema;
  const page = {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Box", props: {}, children: ["ref"] },
      ref: { type: "Ref", name: "Card here", props: { blockId: "b1", params: { title: "Page title" } } },
    },
    parents: { root: null, ref: "root" },
  } as unknown as SaunaSchema;
  const store = createStudioStore({ initialSchema: page });
  const s = () => store.getState();
  s().selectNode("ref");

  // A Ref to another block is refused: no change, no frame.
  s().applyOp({ kind: "expandRef", nodeId: "ref", blockId: "other", block });
  assert.equal(s().schema, page);
  assert.equal(s().history.past.length, 0);

  s().applyOp({ kind: "expandRef", nodeId: "ref", blockId: "b1", block });
  const next = s().schema;
  assert.equal(s().history.past.length, 1, "detach is exactly one frame");
  const root = next.nodes.ref!;
  assert.equal(root.type, "Box", "the node kept its id and took the block root's type");
  assert.equal(root.name, "Card here", "the page's name for the slot survives");
  assert.equal(root.props?.blockId, undefined);
  assert.equal(root.children?.length, 2);
  const [tId, pId] = root.children!;
  assert.ok(tId !== "t" && pId !== "p", "descendants get fresh ids");
  assert.equal(next.nodes[tId!]?.props?.children, "Page title", "a set value is written into the copy");
  assert.equal(next.nodes[pId!]?.props?.children, "Default price", "an empty parameter takes the default");
  assert.equal(next.parents[tId!], "ref");
  assert.equal(s().selection.nodeId, "ref", "selection stays on the node");

  s().undo();
  assert.equal(s().schema.nodes.ref?.type, "Ref", "one undo brings the Ref back");
  assert.equal(s().schema.nodes[tId!], undefined);
});

test("history: the ring is bounded — oldest frames drop at the cap", () => {
  const store = createStudioStore({ initialSchema: schema(), historyDepth: 3 });
  for (let i = 0; i < 5; i++) {
    store.getState().applyOp({ kind: "updateNodePropsPartial", nodeId: "title", patch: { children: `v${i}` } });
  }
  assert.equal(store.getState().history.past.length, 3);
  assert.equal(store.getState().history.past[0]!.nodes.title!.props!.children, "v1");
});

test("history: an inline text edit session (StrictMode, many keystrokes) is exactly one frame", async () => {
  const m = await mountCanvas({ strict: true });
  try {
    const title = el(m.frameDoc, "title");
    await fire(title, m.frameDoc, "dblclick");
    assert.equal(title.getAttribute("contenteditable") !== null, true, "double-click did not open an editing session");
    for (const text of ["H", "He", "Hel", "Hell", "Hello!", "Hello, studio"]) await input(title, m.frameDoc, text);
    assert.equal(m.store.getState().history.past.length, 0, "keystrokes reached history before commit");
    assert.equal(m.store.getState().textDraft?.value, "Hello, studio", "draft did not track typing");
    await key(title, m.frameDoc, "Enter");
    assert.equal(m.store.getState().history.past.length, 1, "one editing session must be exactly one history frame");
    assert.equal(m.store.getState().schema.nodes.title!.props!.children, "Hello, studio");
    assert.equal(m.store.getState().textDraft, null);
    await act(async () => { m.store.getState().undo(); });
    assert.equal(m.store.getState().schema.nodes.title!.props!.children, "Hello");
    assert.equal(m.store.getState().history.past.length, 0);
  } finally { await unmount(m); }
});

/* ---------------------------------------------------- preview is a mode */

/**
 * Mounts the WHOLE shell (the composition the admin mounts), so the three
 * doors into the document — the outline, the Properties pane and Insert —
 * are the real ones and not stand-ins.
 */
async function mountStudio(preview: boolean): Promise<Mounted> {
  const store = createStudioStore({ initialSchema: schema() });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const blocks = [
    { type: "Box", displayName: "Box", meta: { allowedChildren: ["Heading", "Text"] } },
    { type: "Heading", displayName: "Heading" },
    { type: "Text", displayName: "Text" },
  ] as unknown as React.ComponentProps<typeof studio.SaunaStudio>["blocks"];
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <studio.SaunaStudio
        store={store}
        blocks={blocks}
        preview={preview}
        renderPreview={(s: SaunaSchema) => <div data-test="doc">{Object.keys(s.nodes).length}</div>}
      />
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { root, host, frameDoc: document, store, attached: [] };
}

// A DOM node must never be the `actual` of an assert.equal — compare the
// primitive `x === null` instead. Node builds the AssertionError out of the
// value it was handed, and a jsdom element drags the whole document and
// window in with it: the four assertions below used to hand over the element
// itself, and every one of them killed the process with a heap OOM (5.7 GB,
// 60 s) at the moment it was SUPPOSED to print a one-line failure. Passing
// meant nothing was ever inspected, so the trap stayed invisible until a
// planted defect made one of them fail for real — and then `test:planted`
// scored the crash as "plant caught", because it only read the exit code.
// SDL-605, 23 Sep 2026.
test("preview: the Properties pane stops being a form — every door, not just the canvas", async () => {
  const off = await mountStudio(false);
  try {
    await act(async () => { off.store.getState().selectNode("title"); });
    // Out of preview a selected node gets real controls: that is what the
    // check below is the absence of.
    assert.ok(
      off.host.querySelector('[data-sauna-panel="properties"] input, [data-sauna-panel="properties"] textarea, [data-sauna-panel="properties"] select'),
      "no editable control in Properties outside preview — the assertion below would prove nothing"
    );
    assert.equal(
      off.host.querySelector('[data-testid="properties-preview-notice"]') === null,
      true,
      "the preview notice is up outside preview"
    );
  } finally { await unmount(off); }

  const on = await mountStudio(true);
  try {
    await act(async () => { on.store.getState().selectNode("title"); });
    const panel = on.host.querySelector('[data-sauna-panel="properties"]');
    assert.ok(panel, "no Properties panel rendered in preview");
    assert.ok(
      panel!.querySelector('[data-testid="properties-preview-notice"]'),
      "preview does not say the pane is off"
    );
    assert.equal(
      panel!.querySelector("input, textarea, select") === null,
      true,
      "a selected node still has an editable Properties form in preview"
    );
  } finally { await unmount(on); }
});

test("preview: Insert is not offered and the modal is not mounted", async () => {
  const off = await mountStudio(false);
  try {
    const insert = off.host.querySelector<HTMLButtonElement>("[data-sauna-outline-insert]");
    assert.ok(insert, "no Insert control outside preview");
    assert.equal(insert!.disabled, false, "Insert is disabled outside preview — the check below would prove nothing");
  } finally { await unmount(off); }

  const on = await mountStudio(true);
  try {
    const insert = on.host.querySelector<HTMLButtonElement>("[data-sauna-outline-insert]");
    assert.equal(insert?.disabled, true, "Insert is still live in preview");
    const before = JSON.stringify(on.store.getState().schema);
    await act(async () => { insert!.click(); });
    assert.equal(
      document.querySelector('[role="dialog"]') === null,
      true,
      "the Insert modal opened in preview"
    );
    assert.equal(JSON.stringify(on.store.getState().schema), before, "the document moved in preview");
  } finally { await unmount(on); }
});

/* ------------------------------------------ outline drag: start and end */

/** A primary-button pointer event, as dnd-kit's PointerSensor requires. */
async function pointer(target: EventTarget, kind: "pointerdown" | "pointermove" | "pointerup", x: number, y: number): Promise<void> {
  const ev = new window.PointerEvent(kind, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, "isPrimary", { value: true });
  await act(async () => { target.dispatchEvent(ev); });
}

// SDL-757: a press that travels under 8px is a click (it selects the row),
// only past 8px does the outline start a drag. At the old 4px the 6px wobble
// below started a drag — the first half of this test is the one that bites.
test("outline drag: a 6px wobble stays a click, 10px starts the drag", async () => {
  assert.equal(OUTLINE_DRAG_ACTIVATION_DISTANCE, 8);
  const m = await mountStudio(false);
  try {
    const row = m.host.querySelector<HTMLElement>('[data-sauna-outline-node="title"]');
    assert.ok(row, "no outline row for the node");
    const chip = () => document.querySelector("[data-sauna-outline-drag-chip]") !== null;

    await pointer(row!, "pointerdown", 100, 100);
    await pointer(document, "pointermove", 104, 104); // ~5.7px
    assert.equal(chip(), false, "a 6px wobble started a drag — the click would be swallowed");
    await pointer(document, "pointerup", 104, 104);
    await act(async () => { row!.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
    assert.equal(m.store.getState().selection.nodeId, "title", "the short press did not select the row");

    await pointer(row!, "pointerdown", 100, 100);
    await pointer(document, "pointermove", 110, 100);
    assert.equal(chip(), true, "a 10px move did not start a drag — the check above would prove nothing");
    await pointer(document, "pointerup", 110, 100);
  } finally { await unmount(m); }
});

// SDL-757: on drop the chip flies home (~220ms) unless the system asks for
// reduced motion, and the server renders the no-motion answer.
test("outline drag: the drop animation follows prefers-reduced-motion", async () => {
  assert.equal(outlineDropAnimation(true), null, "reduced motion still animates the drop");
  const on = outlineDropAnimation(false);
  assert.ok(on !== null && typeof on === "object", "no drop animation with motion allowed");
  assert.equal((on as { duration?: number }).duration, 220);
  assert.equal(on, OUTLINE_DROP_ANIMATION);

  const { renderToString } = await import("react-dom/server");
  const Probe = () => <span>{usePrefersReducedMotion() ? "reduce" : "motion"}</span>;
  assert.match(renderToString(<Probe />), /reduce/, "the server render animates");

  const original = window.matchMedia;
  for (const reduce of [true, false]) {
    (window as { matchMedia: typeof window.matchMedia }).matchMedia = ((query: string) => ({
      ...original.call(window, query),
      matches: query === "(prefers-reduced-motion: reduce)" ? reduce : false,
    })) as typeof window.matchMedia;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<Probe />); });
      assert.equal(host.textContent, reduce ? "reduce" : "motion", `matchMedia matches=${reduce} was not honoured`);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      (window as { matchMedia: typeof window.matchMedia }).matchMedia = original;
    }
  }
});

test("preview: the outline cannot rename — the row keeps no editing door", async () => {
  const off = await mountStudio(false);
  try {
    const row = off.host.querySelector<HTMLElement>('[data-sauna-outline-node="title"]');
    assert.ok(row, "no outline row for the node");
    await act(async () => {
      row!.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    assert.ok(
      off.host.querySelector('[data-sauna-panel="outline"] input'),
      "double-click opens no rename field outside preview — the check below would prove nothing"
    );
  } finally { await unmount(off); }

  const on = await mountStudio(true);
  try {
    const row = on.host.querySelector<HTMLElement>('[data-sauna-outline-node="title"]');
    assert.ok(row, "no outline row for the node");
    const before = JSON.stringify(on.store.getState().schema);
    // F2 on the focused row is one door into rename, the double-click the
    // other; both go through the same gate, so both are tried here.
    await act(async () => {
      row!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    await act(async () => {
      row!.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    assert.equal(
      on.host.querySelector('[data-sauna-panel="outline"] input') === null,
      true,
      "a rename field opened in preview"
    );
    assert.equal(JSON.stringify(on.store.getState().schema), before, "the document moved in preview");
  } finally { await unmount(on); }
});

/* ------------------------- the nesting rule is checked at insert (SDL-634) */

// Box takes only Heading/Text/Card; CardHeader goes only into a Card.
const RULE_BLOCKS = [
  { type: "Box", displayName: "Box", meta: { allowedChildren: ["Heading", "Text", "Card"] } },
  { type: "Heading", displayName: "Heading" },
  { type: "Text", displayName: "Text" },
  { type: "Button", displayName: "Button" },
  { type: "Card", displayName: "Card" },
  { type: "CardHeader", displayName: "CardHeader", meta: { allowedParents: ["Card"] } },
] as unknown as NonNullable<React.ComponentProps<typeof studio.SaunaStudio>["blocks"]>;

function ruleSchema(): SaunaSchema {
  const s = schema();
  return {
    ...s,
    nodes: {
      ...s.nodes,
      root: { ...s.nodes.root!, children: ["title", "lead", "card", "legacy"] },
      card: { type: "Card", children: ["head"] },
      head: { type: "CardHeader" },
      // Hand-written before the rule existed: already wrong, must not spread.
      legacy: { type: "Button" },
    },
    parents: { ...s.parents, card: "root", head: "card", legacy: "root" },
  } as SaunaSchema;
}

test("insert rule: every op that puts a node under a parent is refused with a reason — tree and history untouched", () => {
  const store = createStudioStore({
    initialSchema: ruleSchema(),
    canParent: studio.parentGuardFromBlocks(RULE_BLOCKS),
  });
  const s = () => store.getState();
  const refusals: Array<[string, studio.SchemaOp, string]> = [
    ["insert panel (addChild)", { kind: "addChild", parentId: "root", child: { type: "Button" } }, "Button is not allowed in Box"],
    ["replace section (replaceNode)", { kind: "replaceNode", nodeId: "lead", child: { type: "Button" } }, "Button is not allowed in Box"],
    ["outline drop / move (reparent)", { kind: "reparent", nodeId: "head", newParentId: "root" }, "CardHeader is not allowed in Box"],
    ["duplicate / copy (duplicate)", { kind: "duplicate", nodeId: "legacy" }, "Button is not allowed in Box"],
  ];
  for (const [path, op, reason] of refusals) {
    const before = s().schema;
    const result = s().applyOp(op);
    assert.deepEqual(result, { applied: false, reason }, `${path}: not refused with a reason`);
    assert.equal(s().schema, before, `${path}: the tree changed`);
    assert.equal(s().history.past.length, 0, `${path}: a refused op pushed a history frame`);
  }
  // The same ops on legal targets go through — the refusals above are the rule, not a broken store.
  assert.deepEqual(s().applyOp({ kind: "addChild", parentId: "root", child: { type: "Text" } }), { applied: true });
  assert.deepEqual(s().applyOp({ kind: "replaceNode", nodeId: "lead", child: { type: "Heading" } }), { applied: true });
  assert.deepEqual(s().applyOp({ kind: "addChild", parentId: "card", child: { type: "CardHeader" } }), { applied: true });
  assert.deepEqual(s().applyOp({ kind: "duplicate", nodeId: "head" }), { applied: true });
  assert.equal(s().history.past.length, 4);
});

async function mountRuleStudio(selected: string): Promise<Mounted> {
  const store = createStudioStore({
    initialSchema: ruleSchema(),
    canParent: studio.parentGuardFromBlocks(RULE_BLOCKS),
  });
  store.getState().selectNode(selected);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const library = {
    hostBlockId: null,
    list: async () => [{ id: "promo", name: "Promo" }],
    load: async () => null,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <studio.SaunaStudio
        store={store}
        blocks={RULE_BLOCKS}
        componentLibrary={library}
        renderPreview={(s: SaunaSchema) => <div data-test="doc">{Object.keys(s.nodes).length}</div>}
      />
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { host.querySelector<HTMLButtonElement>("[data-sauna-outline-insert]")!.click(); });
  // Tabs again since EP-187 (layer 5, canvas flow 3): Elements | Components;
  // the author's own components are on the Components tab.
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await insertTab("components");
  assert.ok(
    document.querySelector('[data-sauna-insert-group="own"]') || document.querySelector("[data-sauna-insert-hidden-toggle]"),
    "the Insert modal shows no «Your components» group and hides nothing"
  );
  return { root, host, frameDoc: document, store, attached: [] };
}

test("insert rule: the Insert modal does not offer a component where the target refuses it", async () => {
  // Heading takes anything: the component card is live — the check below is not vacuous.
  const open = await mountRuleStudio("title");
  try {
    const card = document.querySelector<HTMLElement>('[data-sauna-insert-card="promo"]');
    assert.ok(card, "no card for the component under a target that takes anything");
    assert.equal(card!.hasAttribute("data-sauna-insert-blocked"), false, "the card is blocked where the target takes anything");
  } finally { await unmount(open); }

  // Box takes only Heading/Text/Card: a component (a Ref node) is refused.
  const shut = await mountRuleStudio("root");
  try {
    const before = JSON.stringify(shut.store.getState().schema);
    const toggle = document.querySelector<HTMLButtonElement>("[data-sauna-insert-hidden-toggle]");
    assert.ok(toggle, "the refused component is neither shown nor counted as hidden");
    await act(async () => { toggle!.click(); });
    const card = document.querySelector<HTMLElement>('[data-sauna-insert-card="promo"]');
    assert.ok(card?.hasAttribute("data-sauna-insert-blocked"), "the component is offered where the target refuses it");
    assert.ok(card!.textContent?.includes("Box accepts only Heading, Text, Card"), `no reason on the card: ${card!.textContent}`);
    await act(async () => { card!.click(); });
    assert.equal(card!.getAttribute("aria-pressed"), "false", "a refused card can be selected");
    const submit = document.querySelector<HTMLButtonElement>("[data-sauna-insert-submit]")!;
    assert.equal(submit.disabled, true, "the action is live after clicking a refused card");
    await act(async () => { submit.click(); });
    await act(async () => {
      card!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    assert.equal(JSON.stringify(shut.store.getState().schema), before, "a refused card reached the document by click, button or Enter");
  } finally { await unmount(shut); }
});

/* ------------------------------ the insert panel on icons (SDL-631) */

// The adapter's data: groups are `meta.category` in the adapter's order, one
// block names its glyph (`meta.icon`), one has no description at all — the
// card that used to come out empty.
const PANEL_BLOCKS = [
  { type: "Box", displayName: "Box", meta: { category: "Primitives", description: "A layout box." } },
  { type: "Text", displayName: "Text", meta: { category: "Primitives", description: "A paragraph or a heading." } },
  { type: "Button", displayName: "Button", meta: { category: "Primitives", icon: "MousePointerClick", description: "An action." } },
  { type: "Switch", displayName: "Switch", meta: { category: "Forms", description: "Two states: on and off." } },
  { type: "Card", displayName: "Card", meta: { category: "Widgets", description: "A surface with a header." } },
  { type: "Mystery", displayName: "Mystery", meta: { category: "Widgets" } },
] as unknown as NonNullable<React.ComponentProps<typeof studio.SaunaStudio>["blocks"]>;

/** Switch the Insert modal to its Elements | Components tab (EP-187). */
async function insertTab(id: "elements" | "components"): Promise<void> {
  const tab = document.querySelector<HTMLButtonElement>(`[data-sauna-insert-tab="${id}"]`);
  assert.ok(tab, `no «${id}» tab in the Insert modal`);
  await act(async () => { tab!.click(); });
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function mountPanel(opts: {
  blocks?: typeof PANEL_BLOCKS;
  library?: React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  tab?: "components";
} = {}): Promise<Mounted> {
  const store = createStudioStore({ initialSchema: schema() });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <studio.SaunaStudio
        store={store}
        blocks={opts.blocks ?? PANEL_BLOCKS}
        componentLibrary={opts.library}
        renderPreview={(s: SaunaSchema) => <div data-test="doc">{Object.keys(s.nodes).length}</div>}
      />
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { host.querySelector<HTMLButtonElement>("[data-sauna-outline-insert]")!.click(); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  if (opts.tab) await insertTab(opts.tab);
  return { root, host, frameDoc: document, store, attached: [] };
}

const modal = (): HTMLElement => {
  const m = document.querySelector<HTMLElement>("[data-sauna-insert-modal]");
  assert.ok(m, "the Insert modal did not open");
  return m!;
};
const cardKeys = (): string[] =>
  [...modal().querySelectorAll<HTMLElement>("[data-sauna-insert-card]")].map((c) => c.getAttribute("data-sauna-insert-card") ?? "");

async function typeSearch(text: string): Promise<void> {
  const input = modal().querySelector<HTMLInputElement>("[data-sauna-insert-search]");
  assert.ok(input, "no search field in the Insert modal");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input!, text);
    input!.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

test("insert panel: every card is an icon tile with a name and a sentence — no empty card, no live preview", async () => {
  const m = await mountPanel();
  try {
    const cards = [...modal().querySelectorAll<HTMLElement>("[data-sauna-insert-card]")];
    assert.equal(cards.length, 6, `expected all six blocks as cards, got ${cards.length}`);
    for (const card of cards) {
      const key = card.getAttribute("data-sauna-insert-card");
      assert.equal(card.tagName, "BUTTON", `card ${key} is not a real <button>`);
      assert.equal(card.querySelectorAll("[data-sauna-insert-icon] svg").length, 1, `card ${key} has no icon`);
      assert.ok(card.querySelector("[data-sauna-insert-name]")?.textContent?.trim(), `card ${key} has no name`);
      assert.ok(card.querySelector("[data-sauna-insert-note]")?.textContent?.trim(), `card ${key} is an empty card: no sentence under the name`);
    }
    assert.equal(document.querySelector("[data-sauna-insert-preview]") === null, true, "a live showcase preview is still mounted");
    // The adapter's glyph wins over the type table (`meta.icon`).
    const button = modal().querySelector('[data-sauna-insert-card="Button"] svg');
    assert.ok(button?.getAttribute("class")?.includes("mouse-pointer-click"), `Button is not drawn with the adapter's icon: ${button?.getAttribute("class")}`);
  } finally { await unmount(m); }
});

// The kit as the engine hands it over: items sorted by TYPE NAME (Accordion,
// Box, Card, Input, …), groups carrying the adapter's `order`. Arrival order
// would put Widgets first; the canvas puts Primitives 10 → Forms 20 → Widgets 30.
const ORDERED_BLOCKS = studio.blocksFromCatalog({
  catalog: {
    groups: [
      { id: "widgets", title: "Widgets", order: 30 },
      { id: "primitives", title: "Primitives", order: 10 },
      { id: "forms", title: "Forms", order: 20 },
    ],
    items: [
      { type: "Accordion", groupId: "widgets", title: "Accordion", description: "Sections that expand." },
      { type: "Box", groupId: "primitives", title: "Box", description: "A layout box." },
      { type: "Card", groupId: "widgets", title: "Card", description: "A surface." },
      { type: "Input", groupId: "forms", title: "Text input", description: "A field.", keywords: ["textbox"] },
      { type: "Switch", groupId: "forms", title: "Switch", description: "Two states." },
      { type: "Text", groupId: "primitives", title: "Text", description: "A paragraph." },
    ],
  },
} as unknown as Parameters<typeof studio.blocksFromCatalog>[0]) as unknown as typeof PANEL_BLOCKS;

test("insert panel: groups come from the adapter, sorted by its order, with a chip per group", async () => {
  const m = await mountPanel({ blocks: ORDERED_BLOCKS });
  try {
    const groups = [...modal().querySelectorAll<HTMLElement>("[data-sauna-insert-group]")].map((g) => g.getAttribute("data-sauna-insert-group"));
    assert.deepEqual(groups, ["primitives", "forms", "widgets"], `groups are not in the adapter's order: ${groups.join(",")}`);
    const inForms = [...modal().querySelectorAll('[data-sauna-insert-group="forms"] [data-sauna-insert-card]')].map((c) => c.getAttribute("data-sauna-insert-card"));
    assert.deepEqual(inForms, ["Input", "Switch"], "the adapter's Forms group is not what it holds");
    const chips = [...modal().querySelectorAll<HTMLElement>("[data-sauna-insert-group-chip]")].map((c) => c.getAttribute("data-sauna-insert-group-chip"));
    assert.deepEqual(chips, ["all", "primitives", "forms", "widgets"]);
    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-group-chip="widgets"]')!.click(); });
    assert.deepEqual(cardKeys(), ["Accordion", "Card"], "the Widgets chip does not narrow the list to its group");
    // The catalog's keywords reach the search.
    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-group-chip="all"]')!.click(); });
    await typeSearch("textbox");
    assert.deepEqual(cardKeys(), ["Input"], `the item's keywords are not searched: ${cardKeys().join(",")}`);
  } finally { await unmount(m); }
});

test("insert panel: search narrows the tiles, counts them, and says so honestly when nothing matches", async () => {
  const m = await mountPanel();
  try {
    assert.equal(modal().querySelector("[data-sauna-insert-count]") === null, true, "a count is shown before any search");
    await typeSearch("switch");
    assert.deepEqual(cardKeys(), ["Switch"], `search «switch» drew: ${cardKeys().join(",")}`);
    assert.equal(modal().querySelector("[data-sauna-insert-count]")?.textContent, "1 match");
    await typeSearch("zzz");
    assert.equal(cardKeys().length, 0);
    const none = modal().querySelector("[data-sauna-insert-empty]")?.textContent ?? "";
    assert.ok(none.includes("Nothing matches “zzz”") && none.includes("6 components"), `no honest no-match line: ${none}`);
    assert.equal(modal().querySelector("[data-sauna-insert-catalog-empty]") === null, true, "a failed search is reported as an empty catalogue");
  } finally { await unmount(m); }
});

test("insert panel: an empty catalogue says so instead of drawing a grid or chips", async () => {
  const lib = {
    hostBlockId: null,
    list: async () => [],
    load: async () => null,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const store = createStudioStore({ initialSchema: schema() });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  // The shell mounts no modal without blocks, so the empty source is a host
  // filter that lets nothing through — the PO editor's `kitFilter` path.
  const { InsertComponentModal } = (await import("../dist/shell.js")) as unknown as {
    InsertComponentModal: React.ComponentType<Record<string, unknown>>;
  };
  await act(async () => {
    root.render(
      <InsertComponentModal store={store} blocks={PANEL_BLOCKS} kitFilter={() => false} library={lib} open onOpenChange={() => undefined} />
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const m: Mounted = { root, host, frameDoc: document, store, attached: [] };
  try {
    const empty = modal().querySelector("[data-sauna-insert-catalog-empty]");
    assert.ok(empty, "no empty-catalogue state");
    assert.ok(empty!.textContent?.includes("Catalog is empty"), `wrong empty text: ${empty!.textContent}`);
    assert.equal(cardKeys().length, 0);
    assert.equal(modal().querySelector("[data-sauna-insert-groups]") === null, true, "group chips drawn over an empty catalogue");
    assert.equal(modal().querySelector<HTMLButtonElement>("[data-sauna-insert-submit]")!.disabled, true, "the action is live with nothing to insert");
  } finally { await unmount(m); }
});

test("insert panel: own components are the last group, badged with their node count; a failed source is an alert, not a hole", async () => {
  const build = {
    version: 2,
    rootId: "r",
    nodes: { r: { type: "Section", children: ["h", "b"] }, h: { type: "Heading" }, b: { type: "Button" } },
    parents: { r: null, h: "r", b: "r" },
  };
  const ok = {
    hostBlockId: null,
    list: async () => [{ id: "price", name: "Pricing card" }],
    load: async () => build,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const m = await mountPanel({ library: ok, tab: "components" });
  try {
    const groups = [...modal().querySelectorAll<HTMLElement>("[data-sauna-insert-group]")].map((g) => g.getAttribute("data-sauna-insert-group"));
    assert.equal(groups[groups.length - 1], "own", `own components are not the last group: ${groups.join(",")}`);
    const card = modal().querySelector<HTMLElement>('[data-sauna-insert-card="price"]');
    assert.ok(card?.textContent?.includes("3 nodes"), `no node badge on the build: ${card?.textContent}`);
    assert.equal(modal().querySelector('[data-sauna-insert-source="own"]')?.textContent, "Your components");
  } finally { await unmount(m); }

  const broken = {
    hostBlockId: null,
    list: async () => { throw new Error("down"); },
    load: async () => null,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const f = await mountPanel({ library: broken, tab: "components" });
  try {
    assert.ok(modal().querySelector("[data-sauna-insert-own-error]"), "a failed source is silent");
    await insertTab("elements");
    assert.equal(cardKeys().length, 6, "the kit's tiles vanished with the failed source");
  } finally { await unmount(f); }
});

test("insert panel: Elements | Components tabs (EP-187) — Elements opens first with the kit only, Components holds the workspace's own", async () => {
  const library = {
    hostBlockId: null,
    list: async () => [{ id: "price", name: "Pricing card" }],
    load: async () => null,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const m = await mountPanel({ library });
  try {
    assert.equal(modal().querySelector('[data-sauna-insert-tab="elements"]')?.getAttribute("aria-selected"), "true", "Elements is not the tab the modal opens on");
    assert.equal(cardKeys().length, 6, `Elements does not show the kit: ${cardKeys().join(",")}`);
    assert.ok(!cardKeys().includes("price"), "a Component sits among the Elements");
    await insertTab("components");
    assert.deepEqual(cardKeys(), ["price"], `Components shows something else: ${cardKeys().join(",")}`);
  } finally { await unmount(m); }
});

test("insert panel: nothing is selected on open; a click selects, the button or Enter inserts (canvas SDL-594)", async () => {
  const m = await mountPanel();
  try {
    const submit = () => modal().querySelector<HTMLButtonElement>("[data-sauna-insert-submit]")!;
    const nodes = () => Object.values(m.store.getState().schema.nodes);
    const before = nodes().length;
    assert.equal(modal().querySelector('[data-sauna-insert-card][aria-pressed="true"]') === null, true, "a tile is pre-selected on open");
    assert.equal(submit().disabled, true, "the action is live before anything is selected");
    assert.equal(submit().textContent, "Insert block");

    const card = modal().querySelector<HTMLButtonElement>('[data-sauna-insert-card="Switch"]')!;
    await act(async () => { card.click(); });
    assert.equal(nodes().length, before, "a click on a tile inserted instead of selecting");
    assert.ok(document.querySelector("[data-sauna-insert-modal]"), "a click on a tile closed the dialog");
    assert.equal(card.getAttribute("aria-pressed"), "true", "the clicked tile is not selected");
    assert.equal(submit().disabled, false);
    assert.equal(submit().textContent, "Insert “Switch”");

    await act(async () => { submit().click(); });
    assert.equal(nodes().length, before + 1, "the button did not insert");
    assert.ok(nodes().some((n) => n?.type === "Switch"), "the inserted node is not the selected Switch");
  } finally { await unmount(m); }

  const k = await mountPanel();
  try {
    const before = Object.keys(k.store.getState().schema.nodes).length;
    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-card="Card"]')!.click(); });
    const search = modal().querySelector<HTMLInputElement>("[data-sauna-insert-search]")!;
    await act(async () => {
      search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    const types = Object.values(k.store.getState().schema.nodes).map((n) => n?.type);
    assert.equal(types.length, before + 1, "Enter did not insert the selected tile");
    assert.ok(types.includes("Card"), "Enter inserted something other than the selected Card");
  } finally { await unmount(k); }
});

/* ------------------------------ compounds, parts, references (SDL-633) */

test("compound: inserting Tabs gives ONE node with all of its settings, not a tree of parts", async () => {
  const blocks = [...PANEL_BLOCKS, TabsViewElement.block] as unknown as typeof PANEL_BLOCKS;
  const m = await mountPanel({ blocks });
  try {
    const before = new Set(Object.keys(m.store.getState().schema.nodes));
    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-card="TabsView"]')!.click(); });
    await act(async () => { modal().querySelector<HTMLButtonElement>("[data-sauna-insert-submit]")!.click(); });
    const after = m.store.getState().schema.nodes;
    const fresh = Object.keys(after).filter((id) => !before.has(id));
    assert.equal(fresh.length, 1, `one insert made ${fresh.length} nodes`);
    const node = after[fresh[0]!]!;
    assert.equal(node.type, "TabsView");
    assert.deepEqual(node.props, TabsViewElement.block.meta?.initialProps, "the node does not carry the Element's settings");
    assert.notEqual(node.props, TabsViewElement.block.meta?.initialProps, "the node shares the catalogue's props object");
    assert.equal(node.children, undefined);
  } finally { await unmount(m); }
});

test("part guard: a compound part is offered only under its root — not at the target, not behind «show hidden»", async () => {
  const blocks = [
    ...PANEL_BLOCKS,
    { type: "TabsTrigger", displayName: "TabsTrigger", meta: { category: "Widgets", description: "A tab label.", partOf: "Tabs", allowedParents: ["TabsList"] } },
    { type: "DialogPortal", displayName: "DialogPortal", meta: { category: "Widgets", description: "Portal.", partOf: "Dialog", allowedParents: ["Dialog"] } },
    { type: "Tabs", displayName: "Tabs", meta: { category: "Widgets", description: "Old root.", insertable: false } },
  ] as unknown as typeof PANEL_BLOCKS;
  const m = await mountPanel({ blocks });
  try {
    const toggle = modal().querySelector<HTMLButtonElement>("[data-sauna-insert-hidden-toggle]");
    if (toggle) await act(async () => { toggle.click(); });
    const keys = cardKeys();
    for (const t of ["TabsTrigger", "DialogPortal", "Tabs"]) assert.ok(!keys.includes(t), `${t} is offered under a Box: ${keys.join(",")}`);
    assert.ok(keys.includes("Switch"), "the check is vacuous: the ordinary tiles are gone too");
  } finally { await unmount(m); }
});

test("own component: inserting it adds ONE Ref node with the block id — a reference, not a copy of its nodes", async () => {
  const build = {
    version: 2, rootId: "r",
    nodes: { r: { type: "Section", children: ["h", "b"] }, h: { type: "Heading" }, b: { type: "Button" } },
    parents: { r: null, h: "r", b: "r" },
  };
  const library = {
    hostBlockId: null,
    list: async () => [{ id: "price", name: "Pricing card" }],
    load: async () => build,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const m = await mountPanel({ tab: "components", library });
  try {
    const before = new Set(Object.keys(m.store.getState().schema.nodes));
    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-card="price"]')!.click(); });
    await act(async () => { modal().querySelector<HTMLButtonElement>("[data-sauna-insert-submit]")!.click(); });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const after = m.store.getState().schema.nodes;
    const fresh = Object.keys(after).filter((id) => !before.has(id));
    assert.equal(fresh.length, 1, `the component was inserted as ${fresh.length} nodes`);
    assert.equal(after[fresh[0]!]!.type, "Ref");
    assert.deepEqual(after[fresh[0]!]!.props, { blockId: "price" });
  } finally { await unmount(m); }
});

const keydown = async (target: Element, key: string) => {
  await act(async () => {
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

test("insert panel: Enter belongs to the search and the tiles — not to a chip, not without a selection", async () => {
  const m = await mountPanel();
  try {
    const count = () => Object.keys(m.store.getState().schema.nodes).length;
    const before = count();
    const search = modal().querySelector<HTMLInputElement>("[data-sauna-insert-search]")!;
    await keydown(search, "Enter");
    assert.equal(count(), before, "Enter with nothing selected inserted something");

    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-card="Card"]')!.click(); });
    const chip = modal().querySelector<HTMLButtonElement>('[data-sauna-insert-group-chip="forms"]')!;
    await keydown(chip, "Enter");
    assert.equal(count(), before, "Enter on a group chip inserted the selected tile");
    const close = [...modal().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Close"));
    if (close) {
      await keydown(close, "Enter");
      assert.equal(count(), before, "Enter on the close button inserted the selected tile");
    }
  } finally { await unmount(m); }
});

test("insert panel: arrows select and focus tiles; a filter that hides the selection drops it", async () => {
  const m = await mountPanel();
  try {
    const search = modal().querySelector<HTMLInputElement>("[data-sauna-insert-search]")!;
    const submit = () => modal().querySelector<HTMLButtonElement>("[data-sauna-insert-submit]")!;
    await keydown(search, "ArrowDown");
    const first = modal().querySelector<HTMLButtonElement>("[data-sauna-insert-card]")!;
    assert.equal(first.getAttribute("aria-pressed"), "true", "ArrowDown did not select the first tile");
    assert.equal(document.activeElement === first, true, "focus did not follow the arrow selection");
    await keydown(first, "ArrowDown");
    const second = modal().querySelectorAll<HTMLButtonElement>("[data-sauna-insert-card]")[1]!;
    assert.equal(second.getAttribute("aria-pressed"), "true", "the second ArrowDown did not move the selection");
    assert.equal(document.activeElement === second, true);

    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-card="Switch"]')!.click(); });
    assert.equal(submit().textContent, "Insert “Switch”");
    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-group-chip="widgets"]')!.click(); });
    assert.equal(submit().disabled, true, "the action still names a tile the chip filtered out");
    assert.equal(submit().textContent, "Insert block");
  } finally { await unmount(m); }
});

test("insert panel: an empty «Your components» library keeps its group and the way to the component editor", async () => {
  const lib = {
    hostBlockId: null,
    list: async () => [],
    load: async () => null,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const m = await mountPanel({ tab: "components", library: lib });
  try {
    const group = modal().querySelector("[data-sauna-insert-own-empty]");
    assert.ok(group, "the empty own-components group vanished");
    assert.equal(group!.querySelector('a[href="/components"]') === null, false, "no link to the component editor");
    assert.ok(modal().querySelector('[data-sauna-insert-group-chip="own"]'), "no chip for the empty own group");
  } finally { await unmount(m); }
});

test("insert panel: a Component that would nest past component_max_depth is dimmed with the limit in its reason (SDL-723)", async () => {
  const { SAUNA_COMPONENT_MAX_DEPTH } = await import("@markerloop/engine");
  const n = SAUNA_COMPONENT_MAX_DEPTH;
  const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const doc = (next?: string): SaunaSchema => ({
    version: 2,
    rootId: "root",
    nodes: next
      ? { root: { type: "Stack", children: ["r"] }, r: { type: "Ref", props: { blockId: next } } }
      : { root: { type: "Stack", children: [] } },
    parents: next ? { root: null, r: "root" } : { root: null },
  });
  // A chain of n + 1 Components: id(1) is n + 1 deep, id(2) exactly n.
  const blocks: Record<string, SaunaSchema> = {};
  for (let i = 1; i <= n + 1; i++) blocks[id(i)] = doc(i <= n ? id(i + 1) : undefined);
  const lib = {
    hostBlockId: null,
    list: async () => [
      { id: id(1), name: "Too deep" },
      { id: id(2), name: "At the limit" },
    ],
    load: async (blockId: string) => blocks[blockId] ?? null,
    libraryHref: "/components",
  } as unknown as React.ComponentProps<typeof studio.SaunaStudio>["componentLibrary"];
  const m = await mountPanel({ tab: "components", library: lib });
  try {
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const toggle = modal().querySelector<HTMLButtonElement>("[data-sauna-insert-hidden-toggle]");
    if (toggle && !toggle.hasAttribute("data-sauna-insert-hidden-open")) {
      await act(async () => { toggle.click(); });
    }
    const deep = modal().querySelector<HTMLElement>(`[data-sauna-insert-card="${id(1)}"]`);
    const ok = modal().querySelector<HTMLElement>(`[data-sauna-insert-card="${id(2)}"]`);
    assert.ok(deep, "the too-deep card is not on screen even with refused cards shown");
    assert.ok(ok, "the card at the limit is missing");
    assert.equal(deep!.hasAttribute("data-sauna-insert-blocked"), true, "the too-deep card is not dimmed");
    assert.equal(ok!.hasAttribute("data-sauna-insert-blocked"), false, "a card exactly at the limit was dimmed");
    assert.ok(deep!.textContent?.includes(`at most ${n} deep`), `the reason does not carry the limit: ${deep!.textContent}`);
    const before = Object.keys(m.store.getState().schema.nodes).length;
    await act(async () => { deep!.click(); });
    await keydown(deep!, "Enter");
    assert.equal(Object.keys(m.store.getState().schema.nodes).length, before, "a dimmed card inserted a Ref");
  } finally { await unmount(m); }
});

test("own components: editing a Component counts the Components above it when dimming for depth (SDL-723)", async () => {
  const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const doc = (next?: string): SaunaSchema => ({
    version: 2,
    rootId: "root",
    nodes: next
      ? { root: { type: "Stack", children: ["r"] }, r: { type: "Ref", props: { blockId: next } } }
      : { root: { type: "Stack", children: [] } },
    parents: next ? { root: null, r: "root" } : { root: null },
  });
  const host = id(10);
  // p1 → p2 → host above; candidate c1 → c2 → c3 (3 deep). 2 + 1 + 3 = 6 > 5.
  const lib: Record<string, SaunaSchema> = {
    [id(11)]: doc(id(12)),
    [id(12)]: doc(host),
    [host]: doc(),
    [id(1)]: doc(id(2)),
    [id(2)]: doc(id(3)),
    [id(3)]: doc(),
  };
  const load = async (b: string) => lib[b] ?? null;
  const ids = Object.keys(lib);
  const deep = await studio.saunaTooDeepComponentIds({ hostBlockId: host, schema: lib[host]!, ids, load, limit: 5 });
  assert.equal(deep.has(id(1)), true, "2 above + host + 3 below = 6 was not dimmed");
  assert.equal(deep.has(id(2)), false, "2 above + host + 2 below = 5 was dimmed");
  // Without the library (only the candidate listed) "above" is unknown → the server decides.
  const blind = await studio.saunaTooDeepComponentIds({ hostBlockId: host, schema: lib[host]!, ids: [id(1)], load, limit: 5 });
  assert.equal(blind.has(id(1)), false);
});

/* ------------------------------------------------ width variants (SDL-632) */

function screenSchema(): SaunaSchema {
  const s = schema();
  s.nodes.title = {
    ...s.nodes.title!,
    screens: { mobile: { props: { children: "Hi phone" } } },
  } as SaunaSchema["nodes"][string];
  return s;
}

async function mountScreens(): Promise<Mounted> {
  const store = createStudioStore({ initialSchema: screenSchema() });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const blocks = [
    { type: "Box", displayName: "Box", meta: { allowedChildren: ["Heading", "Text"] } },
    { type: "Heading", displayName: "Heading", staticProps: z.object({ children: z.string().optional() }) },
    { type: "Text", displayName: "Text" },
  ] as unknown as React.ComponentProps<typeof studio.SaunaStudio>["blocks"];
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <studio.SaunaStudio
        store={store}
        blocks={blocks}
        renderPreview={(s: SaunaSchema, ctx: studio.SaunaStudioRenderContext) => (
          <div data-test="doc" data-screen={ctx.screen}>{Object.keys(s.nodes).length}</div>
        )}
      />
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { store.getState().selectNode("title"); });
  return { root, host, frameDoc: document, store, attached: [] };
}

const propsInput = (m: Mounted) =>
  m.host.querySelector<HTMLInputElement>('[data-sauna-panel="properties"] input[type="text"]');

test("screens: the field shows the override at its width and the base everywhere else", async () => {
  const m = await mountScreens();
  try {
    assert.ok(propsInput(m), "no text field for the Heading — the checks below would prove nothing");
    assert.equal(propsInput(m)!.value, "Hello", "base shows the base value");
    assert.equal(m.host.querySelector("[data-sauna-override-mark]") === null, true, "a mark at the base");
    await act(async () => { m.store.getState().setScreen("mobile"); });
    assert.equal(propsInput(m)!.value, "Hi phone", "Phone shows the base instead of its override");
    assert.equal(m.host.querySelector("[data-sauna-override-mark]") === null, false, "no «Overridden» mark at Phone");
    await act(async () => { m.store.getState().setScreen("tablet"); });
    assert.equal(propsInput(m)!.value, "Hello", "Tablet (no override) does not inherit the base");
    assert.equal(m.host.querySelector("[data-sauna-override-mark]") === null, true, "a mark where nothing is overridden");
    // The variant is the canvas's too: the host render gets the screen.
    const doc = m.host.querySelector('[data-test="doc"]') ?? m.host.querySelector("iframe")?.contentDocument?.querySelector('[data-test="doc"]');
    if (doc) assert.equal(doc.getAttribute("data-screen"), "tablet", "the canvas renders another width than the form edits");
  } finally { await unmount(m); }
});

test("screens: Reset deletes the key and the emptied width — never writes an empty string", async () => {
  const m = await mountScreens();
  try {
    await act(async () => { m.store.getState().setScreen("mobile"); });
    const reset = m.host.querySelector<HTMLButtonElement>('[data-sauna-panel="properties"] [data-sauna-field-overridden] [data-sauna-override-reset]');
    assert.ok(reset, "no Reset next to the overridden field");
    await act(async () => { reset!.click(); });
    const node = m.store.getState().schema.nodes.title!;
    assert.equal(node.screens === undefined, true, `screens left behind: ${JSON.stringify(node.screens)}`);
    assert.equal(node.props?.children, "Hello", "Reset touched the base");
    assert.equal(propsInput(m)!.value, "Hello", "after Reset the field does not inherit the base");
    assert.equal(m.store.getState().history.past.length, 1, "Reset is not exactly one undo step");
    await act(async () => { m.store.getState().undo(); });
    assert.equal(m.store.getState().schema.nodes.title!.screens?.mobile?.props?.children, "Hi phone", "undo does not bring the override back");
  } finally { await unmount(m); }
});

test("screens: an edit at Phone lands in screens.mobile.props; the base and other widths stay", () => {
  const store = createStudioStore({ initialSchema: screenSchema() });
  store.getState().setScreen("mobile");
  assert.equal(store.getState().history.past.length, 0, "switching the width is not a document change");
  const op = studio.propsPatchOp(store.getState().view.screen, "lead", { children: "Short" });
  assert.equal(store.getState().applyOp(op).applied, true);
  const lead = store.getState().schema.nodes.lead!;
  assert.equal(lead.props?.children, "World", "a Phone edit wrote the base");
  assert.deepEqual(lead.screens, { mobile: { props: { children: "Short" } } });
  assert.equal(store.getState().history.past.length, 1);
  // Same value again is no frame (a field re-committing on blur).
  assert.equal(store.getState().applyOp(op).applied, false);
  // An emptied input at a width is an override to "empty" (S6): the author
  // cleared the field at Phone. Reset — not emptying — brings the base back.
  store.getState().applyOp(studio.propsPatchOp("mobile", "lead", { children: undefined }));
  assert.deepEqual(store.getState().schema.nodes.lead!.screens, { mobile: { props: { children: "" } } });
  store.getState().applyOp({ kind: "resetScreenProp", nodeId: "lead", screen: "mobile", key: "children" });
  assert.equal(store.getState().schema.nodes.lead!.screens === undefined, true);
  // The base edit is still the base.
  store.getState().applyOp(studio.propsPatchOp("base", "lead", { children: "Base" }));
  assert.equal(store.getState().schema.nodes.lead!.props?.children, "Base");
  // Device ↔ variant.
  assert.equal(studio.canvasDeviceFor("mobile", false, false), "mobile");
  assert.equal(studio.canvasDeviceFor("tablet", false, true), "tablet");
  assert.equal(studio.canvasDeviceFor("base", true, true), "desktop");
  assert.equal(studio.canvasDeviceFor("base", false, true), "mobile");
  assert.equal(studio.deviceToScreen("tablet"), "tablet");
  assert.equal(studio.deviceToScreen("desktop"), "base");
});

test("screens: an inline edit of an already overridden text at Phone opens and lands in screens.mobile.props", async () => {
  const m = await mountCanvas();
  try {
    await act(async () => {
      m.store.getState().setScreen("mobile");
      m.store.getState().applyOp(studio.propsPatchOp("mobile", "title", { children: "Hi phone" }));
    });
    const title = el(m.frameDoc, "title");
    assert.equal(title.textContent, "Hi phone", "the canvas stand-in does not draw the override");
    await fire(title, m.frameDoc, "dblclick");
    assert.equal(title.getAttribute("contenteditable") !== null, true, "double-click on an overridden text did not open an editing session");
    await input(title, m.frameDoc, "Hi again");
    await key(title, m.frameDoc, "Enter");
    const node = m.store.getState().schema.nodes.title!;
    assert.equal(node.screens?.mobile?.props?.children, "Hi again", "the edit did not land in the Phone override");
    assert.equal(node.props?.children, "Hello", "the edit wrote the base");
  } finally { await unmount(m); }
});

test("screens: only differences are stored — a blur without an edit and a value typed back to the base leave no override", () => {
  const store = createStudioStore({ initialSchema: schema() });
  store.getState().setScreen("mobile");
  // What a field commits on blur at Phone when nothing was typed: the
  // layered value, i.e. the base.
  assert.equal(store.getState().applyOp(studio.propsPatchOp("mobile", "title", { children: "Hello", as: "h1" })).applied, false);
  assert.equal(store.getState().schema.nodes.title!.screens === undefined, true, "a blur created an override");
  assert.equal(store.getState().history.past.length, 0, "a blur without an edit cost an undo step");
  // A JSON-parsed copy of the base is the base too.
  const node = store.getState().schema.nodes.title!;
  assert.equal(studio.withScreenProps(node, "mobile", { ...node.props }) === node, true, "raw JSON blur is not a no-op");
  // Type a difference, then type it back to the base: no override remains.
  store.getState().applyOp(studio.propsPatchOp("mobile", "title", { children: "Hi" }));
  assert.equal(store.getState().schema.nodes.title!.screens?.mobile?.props?.children, "Hi");
  store.getState().applyOp(studio.propsPatchOp("mobile", "title", { children: "Hello" }));
  assert.equal(store.getState().schema.nodes.title!.screens === undefined, true, "typing back to the base left an override");
});

/* ------------------------------------- visibility modes, hybrid (SDL-632 S6) */

function modeSchema(): SaunaSchema {
  return {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Box", props: {}, children: ["card", "promo"] },
      card: { type: "Box", props: {}, children: ["title", "lead"] },
      title: { type: "Heading", props: { as: "h1", children: "Hello" } },
      lead: { type: "Text", props: { children: "World" } },
      promo: { type: "Text", props: { children: "Members only" } },
    },
    parents: { root: null, card: "root", title: "card", lead: "card", promo: "root" },
  } as SaunaSchema;
}

const MODE_REGISTRY = {
  Box: (p: { children?: React.ReactNode }) => <div {...p} />,
  Heading: (p: { children?: React.ReactNode }) => <h1 {...p} />,
  Text: (p: { children?: React.ReactNode }) => <p {...p} />,
} as unknown as React.ComponentProps<typeof SaunaRenderer>["registry"];

/**
 * The whole shell with the page editor's sections (Visibility, Variants) and
 * a canvas drawn by the ENGINE's renderer under the render context the shell
 * hands out — so "preview shows a private block" is asked of real markup.
 */
async function mountModes(opts: { preview?: boolean; initial?: SaunaSchema; select?: string; noSections?: boolean; topSection?: boolean } = {}): Promise<Mounted & { audiences: string[] }> {
  const store = createStudioStore({ initialSchema: opts.initial ?? modeSchema() });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const blocks = [
    { type: "Box", displayName: "Box", meta: { allowedChildren: ["Box", "Heading", "Text"] } },
    { type: "Heading", displayName: "Heading", staticProps: z.object({ children: z.string().optional() }) },
    { type: "Text", displayName: "Text", staticProps: z.object({ children: z.string().optional() }) },
  ] as unknown as React.ComponentProps<typeof studio.SaunaStudio>["blocks"];
  const audiences: string[] = [];
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <studio.SaunaStudio
        store={store}
        blocks={blocks}
        preview={opts.preview}
        sections={
          opts.noSections
            ? undefined
            : opts.topSection
              ? [
                  ...studio.saunaBlockSections(),
                  { id: "doc-top", title: "Parameters", placement: "top", applicable: () => true, render: () => <p>params</p> },
                ]
              : studio.saunaBlockSections()
        }
        renderPreview={(s: SaunaSchema, ctx: studio.SaunaStudioRenderContext) => {
          audiences.push(ctx.audience);
          return (
            <div data-test="doc" data-audience={ctx.audience}>
              <SaunaRenderer schema={s} registry={MODE_REGISTRY} context={{ screen: ctx.screen, audience: ctx.audience }} />
            </div>
          );
        }}
      />
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  if (opts.select) await act(async () => { store.getState().selectNode(opts.select!); });
  return { root, host, frameDoc: document, store, attached: [], audiences };
}

/** The canvas document: the iframe's when the frame mounted, else the host. */
function canvasDoc(m: Mounted): ParentNode {
  const frame = m.host.querySelector("iframe");
  return frame?.contentDocument?.querySelector('[data-test="doc"]') ?? m.host.querySelector('[data-test="doc"]') ?? m.host;
}

const panel = (m: Mounted) => m.host.querySelector('[data-sauna-panel="properties"]')!;

test("params: updateParam edits label and default only; undefined removes the key (SDL-721)", () => {
  const params = [
    { name: "price", nodeId: "n1", prop: "text", type: "string" as const, label: "Price", default: "9" },
    { name: "link", nodeId: "n2", prop: "href", type: "url" as const },
  ];
  const next = studio.updateParam(params, "price", { label: "Cost", default: undefined });
  assert.deepEqual(next[0], { name: "price", nodeId: "n1", prop: "text", type: "string", label: "Cost" });
  assert.equal("default" in next[0]!, false, "an undefined default is written as a key");
  assert.equal(next[1], params[1], "another parameter was touched");
  assert.deepEqual(studio.updateParam(params, "link", { default: "https://x.test" })[1], { ...params[1], default: "https://x.test" });
  assert.deepEqual(studio.updateParam(params, "nope", { label: "x" }), params);
});

test("sections: placement top goes above Properties, the rest stay below (SDL-721)", async () => {
  const m = await mountModes({ select: "card", topSection: true });
  try {
    const order = [...panel(m).querySelectorAll("[data-sauna-section]")].map((n) => n.getAttribute("data-sauna-section"));
    assert.deepEqual(order, ["doc-top", "properties", "visibility", "variants"], `sections in the wrong order: ${order.join(", ")}`);
  } finally { await unmount(m); }
  const n = await mountModes({ topSection: true });
  try {
    const order = [...panel(n).querySelectorAll("[data-sauna-section]")].map((x) => x.getAttribute("data-sauna-section"));
    assert.deepEqual(order, ["doc-top", "properties"], `without a selection: ${order.join(", ")}`);
  } finally { await unmount(n); }
});

test("visibility: the mode switch writes a STRING, never an object; a legacy condition says it is not access control", async () => {
  const m = await mountModes({ select: "card" });
  try {
    const option = panel(m).querySelector<HTMLButtonElement>('[data-sauna-visibility-option="hybrid"]');
    assert.ok(option, "no Hybrid option in the Visibility section");
    await act(async () => { option!.click(); });
    const v = m.store.getState().schema.nodes.card!.visibility;
    assert.equal(typeof v, "string", `the switch wrote ${JSON.stringify(v)} instead of a mode string`);
    assert.equal(v, "hybrid");
    assert.equal(m.store.getState().history.past.length, 1, "a mode switch is not exactly one undo step");
    const contract = panel(m).querySelector("[data-sauna-visibility-contract]");
    assert.equal(contract?.textContent, 'visibility: "hybrid"', "the contract line does not print the stored field");
    // Section order: Properties → Visibility → Variants.
    const order = [...panel(m).querySelectorAll("[data-sauna-section]")].map((n) => n.getAttribute("data-sauna-section"));
    assert.deepEqual(order, ["properties", "visibility", "variants"], `sections in the wrong order: ${order.join(", ")}`);
  } finally { await unmount(m); }

  const legacy = modeSchema();
  legacy.nodes.card = { ...legacy.nodes.card!, visibility: { when: { op: "truthy", path: "user" } } } as SaunaSchema["nodes"][string];
  const l = await mountModes({ initial: legacy, select: "card" });
  try {
    assert.ok(panel(l).querySelector("[data-sauna-visibility-legacy-note]"), "a legacy condition is not called out");
    assert.match(panel(l).querySelector("[data-sauna-visibility-legacy-note]")!.textContent ?? "", /not access control/);
    assert.equal(panel(l).querySelector("[data-sauna-visibility-option]") === null, true, "a mode switch shown over a legacy condition");
    const replace = panel(l).querySelector<HTMLButtonElement>("[data-sauna-visibility-replace]");
    assert.ok(replace, "no «Replace with mode»");
    await act(async () => { replace!.click(); });
    // Replace with mode REMOVES the field: the block inherits the mode around
    // it rather than pinning "public" over a hybrid ancestor.
    assert.equal("visibility" in l.store.getState().schema.nodes.card!, false, "Replace with mode pinned a mode instead of inheriting");
  } finally { await unmount(l); }
});

test("hybrid: Signed in edits member.props — field shows member ?? base, Overridden + Reset once, canvas follows", async () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "hybrid" } as SaunaSchema["nodes"][string];
  const m = await mountModes({ initial, select: "title" });
  try {
    const input = () => panel(m).querySelector<HTMLInputElement>('input[type="text"]');
    assert.ok(panel(m).querySelector("[data-sauna-branch-tabs]"), "no Guests / Signed in tabs on a node under a hybrid block");
    assert.equal(input()!.value, "Hello");
    // As a member, at the base width: the edit lands in member.props.
    await act(async () => { m.store.getState().setAudience("member"); });
    assert.equal(input()!.value, "Hello", "Signed in does not fall back to the guest value");
    const target = studio.studioEditTarget(m.store.getState().schema, "title", m.store.getState().view);
    assert.equal(target.kind, "member");
    await act(async () => { m.store.getState().applyOp(studio.propsPatchOp(target, "title", { children: "Welcome back" })); });
    const title = m.store.getState().schema.nodes.title!;
    assert.equal(title.props?.children, "Hello", "a Signed in edit wrote the guest value");
    assert.deepEqual(title.member, { props: { children: "Welcome back" } });
    assert.equal(input()!.value, "Welcome back", "the field does not show the member value");
    assert.equal(panel(m).querySelectorAll("[data-sauna-override-reset]").length, 1, "not exactly one Reset for one overridden field");
    // The canvas renders for the member now.
    assert.match(canvasDoc(m).textContent ?? "", /Welcome back/, "the canvas does not draw the member branch");
    // Guests: base value, no mark.
    await act(async () => { m.store.getState().setAudience("guest"); });
    assert.equal(input()!.value, "Hello");
    assert.equal(panel(m).querySelector("[data-sauna-override-reset]") === null, true, "a Reset on the guest tab");
    assert.match(canvasDoc(m).textContent ?? "", /Hello/);
    // Reset on the member tab deletes the key and the emptied branch.
    await act(async () => { m.store.getState().setAudience("member"); });
    await act(async () => { panel(m).querySelector<HTMLButtonElement>("[data-sauna-override-reset]")!.click(); });
    assert.equal(m.store.getState().schema.nodes.title!.member === undefined, true, "Reset left a member branch behind");
  } finally { await unmount(m); }
});

test("hybrid: moving a node out from under a hybrid block drops its member in the same undo step", () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "hybrid" } as SaunaSchema["nodes"][string];
  initial.nodes.title = { ...initial.nodes.title!, member: { props: { children: "Hi member" } } } as SaunaSchema["nodes"][string];
  initial.nodes.lead = { ...initial.nodes.lead!, member: { props: { children: "Member lead" } } } as SaunaSchema["nodes"][string];
  const store = createStudioStore({ initialSchema: initial });
  // Within the hybrid block: the branch stays.
  assert.equal(store.getState().applyOp({ kind: "reparent", nodeId: "lead", newParentId: "card", index: 0 }).applied, true);
  assert.deepEqual(store.getState().schema.nodes.lead!.member, { props: { children: "Member lead" } }, "a move inside hybrid dropped member");
  // Out to the public root: the branch goes, in the move's own frame.
  const before = store.getState().history.past.length;
  assert.equal(store.getState().applyOp({ kind: "reparent", nodeId: "title", newParentId: "root", index: 0 }).applied, true);
  const s = store.getState().schema;
  assert.equal(s.parents.title, "root");
  assert.equal(s.nodes.title!.member === undefined, true, `member survived a move under a public parent: ${JSON.stringify(s.nodes.title!.member)}`);
  assert.deepEqual(s.nodes.lead!.member, { props: { children: "Member lead" } }, "a sibling left behind lost its branch");
  assert.equal(store.getState().history.past.length, before + 1, "move + member clean-up is not one undo step");
  store.getState().undo();
  assert.deepEqual(store.getState().schema.nodes.title!.member, { props: { children: "Hi member" } }, "undo did not bring the branch back");
  // A node that declares hybrid itself keeps its branch wherever it goes.
  const own = modeSchema();
  own.nodes.title = { ...own.nodes.title!, visibility: "hybrid", member: { props: { children: "Own" } } } as SaunaSchema["nodes"][string];
  assert.equal(studio.withMembersPruned(own, "title"), own, "nothing to drop must hand the schema back");
});

test("hybrid: without a Visibility section there are no Guests / Signed in tabs and edits never reach member (S7 gate)", async () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "hybrid" } as SaunaSchema["nodes"][string];
  initial.nodes.title = { ...initial.nodes.title!, member: { props: { children: "Hi member" } } } as SaunaSchema["nodes"][string];
  const m = await mountModes({ initial, select: "title", noSections: true });
  try {
    // Boolean, never the node itself: assert.equal on a jsdom element makes a
    // failure inspect the whole DOM graph and OOM-kill the run (exit 137)
    // instead of printing FAIL.
    assert.equal(panel(m).querySelector("[data-sauna-branch-tabs]") === null, true, "the member tabs are offered without the Visibility section");
    // Even a store left looking as a member edits the guest (base) value:
    // both halves of the gate — no tabs, and the edit target — must hold.
    await act(async () => { m.store.getState().setAudience("member"); });
    assert.equal(panel(m).querySelector("[data-sauna-branch-tabs]") === null, true, "the member tabs appeared once the store looked as a member");
    const input = panel(m).querySelector<HTMLInputElement>('input[type="text"]');
    assert.ok(input, "no text field for the title");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input!, "Edited");
      input!.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    const title = m.store.getState().schema.nodes.title!;
    assert.deepEqual(title.member, { props: { children: "Hi member" } }, `an edit without the Visibility section reached member: ${JSON.stringify(title.member)}`);
    assert.equal(title.props?.children, "Edited", `the edit did not land in props: ${JSON.stringify(title.props)}`);
    assert.equal(input!.value, "Edited", "the field does not show the base value it just wrote");
  } finally { await unmount(m); }
});

test("hybrid: leaving hybrid clears member across the subtree in ONE undo step", () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "hybrid", member: { props: { gap: 2 } } } as SaunaSchema["nodes"][string];
  initial.nodes.title = { ...initial.nodes.title!, member: { props: { children: "Hi member" } } } as SaunaSchema["nodes"][string];
  initial.nodes.lead = { ...initial.nodes.lead!, member: { props: { children: "Member lead" } } } as SaunaSchema["nodes"][string];
  const store = createStudioStore({ initialSchema: initial });
  assert.equal(studio.memberBranchCount(store.getState().schema, "card"), 3);
  assert.equal(store.getState().applyOp({ kind: "setVisibilityMode", nodeId: "card", mode: "public" }).applied, true);
  const s = store.getState().schema;
  // Public under a public parent is the inherited mode: the field goes.
  assert.equal("visibility" in s.nodes.card!, false, `explicit ${JSON.stringify(s.nodes.card!.visibility)} pinned where inheriting was enough`);
  for (const id of ["card", "title", "lead"]) {
    assert.equal(s.nodes[id]!.member === undefined, true, `member left on ${id} after leaving hybrid: ${JSON.stringify(s.nodes[id]!.member)}`);
  }
  assert.equal(store.getState().history.past.length, 1, "mode + member clean-up is not one undo step");
  store.getState().undo();
  const back = store.getState().schema;
  assert.equal(back.nodes.card!.visibility, "hybrid");
  assert.deepEqual(back.nodes.title!.member, { props: { children: "Hi member" } }, "undo did not bring the member values back");
  // A descendant that declares hybrid itself keeps its branch.
  const nested = modeSchema();
  nested.nodes.card = { ...nested.nodes.card!, visibility: "hybrid" } as SaunaSchema["nodes"][string];
  nested.nodes.title = { ...nested.nodes.title!, visibility: "hybrid", member: { props: { children: "Own" } } } as SaunaSchema["nodes"][string];
  const next = studio.withVisibilityMode(nested, "card", "private");
  assert.deepEqual(next.nodes.title!.member, { props: { children: "Own" } }, "a node that is hybrid itself lost its branch");
  // Same mode again: nothing changes, no frame.
  assert.equal(studio.withVisibilityMode(next, "card", "private") === next, true);
});

test("visibility: preview never shows a private block — the canvas renders for a guest", async () => {
  const initial = modeSchema();
  initial.nodes.promo = { ...initial.nodes.promo!, visibility: "private" } as SaunaSchema["nodes"][string];
  // Out of preview, with the private block selected, the author sees it.
  const edit = await mountModes({ initial, select: "promo" });
  try {
    assert.match(canvasDoc(edit).textContent ?? "", /Members only/, "editing a private block does not show it — the check below would prove nothing");
  } finally { await unmount(edit); }
  const view = await mountModes({ initial, preview: true, select: "promo" });
  try {
    await act(async () => { view.store.getState().setAudience("member"); });
    assert.equal(view.audiences.at(-1), "guest", `preview renders for ${view.audiences.at(-1)}`);
    assert.doesNotMatch(canvasDoc(view).textContent ?? "", /Members only/, "preview shows a private block");
    assert.match(canvasDoc(view).textContent ?? "", /Hello/, "preview drew nothing at all — the check above would prove nothing");
  } finally { await unmount(view); }
});

test("screens: an emptied field at Phone stays an override; a Ref's params go to the width, by name", () => {
  const store = createStudioStore({ initialSchema: schema() });
  store.getState().setScreen("mobile");
  store.getState().applyOp(studio.propsPatchOp("mobile", "title", { children: undefined }));
  const title = store.getState().schema.nodes.title!;
  assert.equal(title.props?.children, "Hello", "emptying at Phone touched the base");
  assert.equal(title.screens?.mobile?.props?.children, "", "an emptied Phone field was dropped — it behaves like Reset");
  // Ref params: only the parameter that differs is stored, at the width.
  const ref = {
    type: "Ref",
    props: { blockId: "promo", params: { title: "Base title", cta: "Buy" } },
  } as SaunaSchema["nodes"][string];
  const next = studio.withScreenPropsPatch(ref, "mobile", { params: { title: "Short", cta: "Buy" } });
  assert.deepEqual(next.props, ref.props, "a width edit of params wrote the base");
  assert.deepEqual(next.screens, { mobile: { props: { params: { title: "Short" } } } });
  assert.equal(studio.withScreenPropsPatch(ref, "mobile", { params: { title: "Base title", cta: "Buy" } }) === ref, true, "params equal to the base stored an override");
});

test("screens: one overridden field shows ONE Overridden / Reset pair, none under an internal name", async () => {
  const initial = modeSchema();
  initial.nodes.title = { ...initial.nodes.title!, screens: { mobile: { props: { children: "Hi phone" } } } } as SaunaSchema["nodes"][string];
  const m = await mountModes({ initial, select: "title" });
  try {
    await act(async () => { m.store.getState().setScreen("mobile"); });
    assert.equal(panel(m).querySelectorAll("[data-sauna-override-mark]").length, 1, "not exactly one «Overridden» mark for one field");
    assert.equal(panel(m).querySelectorAll("[data-sauna-screen-option]").length, 3, "not exactly one width switch (Variants section only)");
    const strip = panel(m).querySelector("[data-sauna-screen-overrides]");
    assert.equal(strip?.getAttribute("data-count"), "1");
    assert.doesNotMatch(strip?.textContent ?? "", /children/, "the Variants strip names the internal prop key");
  } finally { await unmount(m); }
});

test("S6 review: at a width a hybrid node is edited through guest eyes — member values never reach screens", async () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "hybrid" } as SaunaSchema["nodes"][string];
  initial.nodes.title = { ...initial.nodes.title!, member: { props: { children: "Secret member text" } } } as SaunaSchema["nodes"][string];
  const m = await mountModes({ initial, select: "title" });
  try {
    await act(async () => { m.store.getState().setAudience("member"); });
    const input = () => panel(m).querySelector<HTMLInputElement>('input[type="text"]');
    assert.equal(input()!.value, "Secret member text", "Signed in at Base does not show the member value — the check below would prove nothing");
    await act(async () => { m.store.getState().setScreen("mobile"); });
    assert.equal(input()!.value, "Hello", "at Phone the field shows the member value — its first blur writes it into screens");
    const memberTab = panel(m).querySelector<HTMLButtonElement>('[data-sauna-branch-tab="member"]');
    assert.equal(memberTab?.disabled, true, "the Signed in tab is live at a width");
    assert.ok(panel(m).querySelector("[data-sauna-branch-width-note]"), "no hint why the tab is off at a width");
    // The canvas draws what the form edits there.
    assert.equal(m.audiences.at(-1), "guest", "the canvas renders for a member at a width");
    // A blur without an edit commits the shown value: no override, no leak.
    const s0 = m.store.getState();
    s0.applyOp(studio.propsPatchOp(studio.studioEditTarget(s0.schema, "title", s0.view), "title", { children: input()!.value }));
    assert.equal(m.store.getState().schema.nodes.title!.screens === undefined, true, `member value leaked into screens: ${JSON.stringify(m.store.getState().schema.nodes.title!.screens)}`);
  } finally { await unmount(m); }
});

test("S6 review: the canvas in-place edit on a hybrid node looked at as a member lands in member.props", async () => {
  const m = await mountCanvas();
  try {
    await act(async () => {
      assert.equal(m.store.getState().applyOp({ kind: "setVisibilityMode", nodeId: "title", mode: "hybrid" }).applied, true);
      m.store.getState().setAudience("member");
    });
    const title = el(m.frameDoc, "title");
    await fire(title, m.frameDoc, "dblclick");
    assert.equal(title.getAttribute("contenteditable") !== null, true, "double-click did not open an editing session");
    await input(title, m.frameDoc, "Welcome back");
    await key(title, m.frameDoc, "Enter");
    const node = m.store.getState().schema.nodes.title!;
    assert.deepEqual(node.member, { props: { children: "Welcome back" } }, "the canvas edit did not land in the member branch");
    assert.equal(node.props?.children, "Hello", "the canvas edit as a member wrote the guest value");
  } finally { await unmount(m); }
});

test("S6 review: preview withholds Visibility and Variants — nothing in preview can change the document", async () => {
  const m = await mountModes({ preview: true, select: "card" });
  try {
    assert.equal(panel(m).querySelector("[data-sauna-visibility-option]") === null, true, "preview offers the visibility switch");
    assert.equal(panel(m).querySelector("[data-sauna-screen-option]") === null, true, "preview offers the width switch");
    assert.equal(panel(m).querySelector('[data-sauna-section="visibility"]') === null, true, "the Visibility section is drawn in preview");
  } finally { await unmount(m); }
  const live = await mountModes({ select: "card" });
  try {
    assert.ok(panel(live).querySelector("[data-sauna-visibility-option]"), "no switch outside preview — the check above would prove nothing");
  } finally { await unmount(live); }
});

test("S6 review: the root is never offered Hybrid or Private, and the store refuses it", async () => {
  const m = await mountModes({ select: "root" });
  try {
    assert.equal(panel(m).querySelector("[data-sauna-visibility-option]") === null, true, "the root is offered a mode switch (pages-service 422s a non-public root)");
    assert.ok(panel(m).querySelector("[data-sauna-visibility-root]"), "the root does not say why it has no switch");
  } finally { await unmount(m); }
  const store = createStudioStore({ initialSchema: modeSchema() });
  for (const mode of ["hybrid", "private"] as const) {
    assert.equal(store.getState().applyOp({ kind: "setVisibilityMode", nodeId: "root", mode }).applied, false, `the store wrote ${mode} on the root`);
  }
  assert.equal(store.getState().schema.nodes.root!.visibility === undefined, true);
  // Not a mode: refused, not stored.
  const bogus = { kind: "setVisibilityMode", nodeId: "card", mode: "secret" } as unknown as studio.SchemaOp;
  assert.equal(store.getState().applyOp(bogus).applied, false, "a string that is not a mode was stored");
  // member.props only where the mode in force is hybrid.
  assert.equal(store.getState().applyOp({ kind: "setMemberProps", nodeId: "title", patch: { children: "x" } }).applied, false, "member written on a public node");
  assert.equal(store.getState().history.past.length, 0);
});

test("S6 review: modes inherit — the switch shows the inherited mode, the inherited mode removes the field, the warning counts what clears", async () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "hybrid", member: { props: { gap: 2 } } } as SaunaSchema["nodes"][string];
  initial.nodes.title = { ...initial.nodes.title!, member: { props: { children: "Hi member" } } } as SaunaSchema["nodes"][string];
  const m = await mountModes({ initial, select: "title" });
  try {
    const section = () => panel(m).querySelector("[data-sauna-visibility-mode]");
    assert.equal(section()?.getAttribute("data-sauna-visibility-mode"), "hybrid", "a node under a Hybrid block reads Public");
    assert.ok(panel(m).querySelector("[data-sauna-visibility-inherited]"), "no word that the mode is inherited");
    // Leaving hybrid here would clear the title's own member branch only.
    assert.equal(panel(m).querySelector("[data-sauna-visibility-member-note]")?.getAttribute("data-sauna-visibility-member-note"), "1", "the warning does not count the one branch that would clear");
  } finally { await unmount(m); }
  // Private then Public on a node under a public parent: back to no field.
  const store = createStudioStore({ initialSchema: modeSchema() });
  store.getState().applyOp({ kind: "setVisibilityMode", nodeId: "promo", mode: "private" });
  assert.equal(store.getState().schema.nodes.promo!.visibility, "private");
  store.getState().applyOp({ kind: "setVisibilityMode", nodeId: "promo", mode: "public" });
  assert.equal("visibility" in store.getState().schema.nodes.promo!, false, "Public pinned instead of inheriting");
  // Hybrid under a hybrid block: inherited, so nothing is written.
  const h = studio.withVisibilityMode(initial, "title", "hybrid");
  assert.equal(h === initial, true, "an explicit copy of the inherited mode was written");
});

test("S6 review: clearing a non-text field at a width falls back to the base; a __proto__ key stays data", () => {
  const node = { type: "Stat", props: { count: 3, label: "Visits" } } as SaunaSchema["nodes"][string];
  // Rule: an emptied TEXT field is an override to "" (Reset is the way
  // back); an emptied field of any other kind has no empty value the props
  // schema accepts (null fails z.number().optional()), so the override goes.
  const withCount = studio.withScreenPropsPatch(node, "mobile", { count: 5 });
  assert.deepEqual(withCount.screens, { mobile: { props: { count: 5 } } });
  const cleared = studio.withScreenPropsPatch(withCount, "mobile", { count: undefined });
  assert.equal(cleared.screens === undefined, true, `a cleared number stored ${JSON.stringify(cleared.screens)}`);
  assert.deepEqual(studio.withScreenPropsPatch(node, "mobile", { label: undefined }).screens, { mobile: { props: { label: "" } } });
  const evil = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
  const out = studio.withScreenPropsPatch(node, "mobile", evil);
  const props = out.screens?.mobile?.props as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(props), Object.prototype, "a __proto__ key swapped the prototype");
  assert.equal(Object.hasOwn(props, "__proto__"), true, "a __proto__ key was dropped instead of stored as data");
});

test("S6 re-review: an explicit Private inside a Private block is kept — the enclosing block leaving Private does not open it", async () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "private" } as SaunaSchema["nodes"][string];
  initial.nodes.title = { ...initial.nodes.title!, visibility: "hybrid", props: { as: "h1", children: "Salary table" } } as SaunaSchema["nodes"][string];
  const store = createStudioStore({ initialSchema: initial });
  assert.equal(store.getState().applyOp({ kind: "setVisibilityMode", nodeId: "title", mode: "private" }).applied, true);
  assert.equal(store.getState().schema.nodes.title!.visibility, "private", "an explicit Private collapsed to inherit");
  // Public and Hybrid still collapse to what they inherit: they carry no
  // access decision (promo sits under the public root).
  const pub = studio.withVisibilityMode({ ...initial, nodes: { ...initial.nodes, promo: { ...initial.nodes.promo!, visibility: "hybrid" } } } as SaunaSchema, "promo", "public");
  assert.equal("visibility" in pub.nodes.promo!, false, "Public under a public parent pinned a copy");
  // The enclosing block leaves Private: the title must stay out of the shell.
  store.getState().applyOp({ kind: "setVisibilityMode", nodeId: "card", mode: "public" });
  const shell = JSON.stringify(saunaPublicShell(store.getState().schema));
  assert.doesNotMatch(shell, /Salary table/, "a block the author made Private reached the public shell");
  assert.match(shell, /World/, "the shell lost the public lead — the check above would prove nothing");
});

test("S6 re-review: at a width the canvas renders for a guest even with a private block selected", () => {
  assert.equal(studio.studioCanvasAudience({ preview: false, audience: "member", selectedMode: "private", screen: "mobile" }), "guest");
  assert.equal(studio.studioCanvasAudience({ preview: false, audience: "guest", selectedMode: "private", screen: "base" }), "member");
  assert.equal(studio.studioCanvasAudience({ preview: true, audience: "member", selectedMode: "private", screen: "base" }), "guest");
});

test("S6 re-review: leaving Private warns how many blocks inside become visible to guests", async () => {
  const initial = modeSchema();
  initial.nodes.card = { ...initial.nodes.card!, visibility: "private" } as SaunaSchema["nodes"][string];
  initial.nodes.lead = { ...initial.nodes.lead!, visibility: "private" } as SaunaSchema["nodes"][string];
  // title inherits Private from card; lead is Private on its own and stays closed.
  assert.equal(studio.privateRevealCount(initial, "card"), 1);
  assert.equal(studio.privateRevealCount(initial, "promo"), 0);
  const m = await mountModes({ initial, select: "card" });
  try {
    const note = panel(m).querySelector("[data-sauna-visibility-reveal-note]");
    assert.equal(note?.getAttribute("data-sauna-visibility-reveal-note"), "1", "no warning that leaving Private opens a block inside");
  } finally { await unmount(m); }
});

// --- DataView settings (SDL-642) --------------------------------------------
//
// The panel writes through the model; these pin what lands in the node's
// props, and that it is exactly what the engine's contract accepts.


const WS = "11111111-1111-4111-8111-111111111111";
const MESSAGES = "22222222-2222-4222-8222-222222222222";
const RATES = "33333333-3333-4333-8333-333333333333";
const MESSAGE_FIELDS = [
  { key: "title", name: "Title", type: "string" },
  { key: "body", name: "Body", type: "rich_text" },
  { key: "from", name: "From", type: "string" },
  { key: "needs_answer", name: "Needs answer", type: "boolean" },
  { key: "importance", name: "Importance", type: "number" },
  { key: "read_at", name: "Read at", type: "date" },
];

test("DataView settings: binding a collection writes a source and list-friendly fields, and parses", () => {
  const unbound = studio.readDataViewDraft({ fields: [], sort: { field: "created_at", direction: "desc" }, filter: [], presets: [], limit: 20 });
  assert.equal(unbound.source, undefined);
  assert.equal("source" in studio.draftToProps(unbound), false, "an unbound draft writes no source key");
  const bound = studio.bindCollection(unbound, MESSAGES, WS, MESSAGE_FIELDS);
  assert.deepEqual(bound.source, { kind: "collection", workspace_id: WS, collection_id: MESSAGES });
  assert.deepEqual(bound.fields, ["title", "from", "needs_answer", "importance"], "rich text stays in the record panel");
  const parsed = DataViewPropsSchema.safeParse(studio.draftToProps(bound));
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.equal(studio.bindCollection(bound, MESSAGES, WS, []), bound, "re-picking the bound collection changes nothing");
});

test("DataView settings (SDL-679): binding writes the collection key; re-picking the bound collection adds a missing key and nothing else", () => {
  const unbound = studio.readDataViewDraft({});
  const bound = studio.bindCollection(unbound, MESSAGES, WS, MESSAGE_FIELDS, "messages");
  assert.deepEqual(bound.source, { kind: "collection", workspace_id: WS, collection_id: MESSAGES, collection_key: "messages" });
  assert.ok(DataViewPropsSchema.safeParse(studio.draftToProps(bound)).success);
  // The key survives a read of the stored props.
  assert.equal(studio.readDataViewDraft(studio.draftToProps(bound) as Record<string, unknown>).source?.collection_key, "messages");
  const legacy = { ...bound, source: { kind: "collection" as const, workspace_id: WS, collection_id: MESSAGES }, presets: [{ id: "all", label: "All", filter: [] }] };
  const rekeyed = studio.bindCollection(legacy, MESSAGES, WS, [], "messages");
  assert.equal(rekeyed.source?.collection_key, "messages");
  assert.deepEqual(rekeyed.presets, legacy.presets, "adding the key keeps the author's presets");
  assert.equal(studio.bindCollection(bound, MESSAGES, WS, [], "messages"), bound, "same key → same draft");
});

test("DataView settings (SDL-679): withCollectionKey fills a missing key from the loaded collections and touches nothing else", () => {
  const legacy = {
    ...studio.bindCollection(studio.readDataViewDraft({}), MESSAGES, WS, MESSAGE_FIELDS),
    sort: { field: "importance", direction: "asc" as const },
    presets: [{ id: "all", label: "All", filter: [] }],
  };
  assert.equal(legacy.source?.collection_key, undefined);
  const cols = [{ id: MESSAGES, name: "Messages", key: "messages" }, { id: RATES, name: "Rates", key: "rates" }];
  const keyed = studio.withCollectionKey(legacy, cols);
  assert.deepEqual(keyed, { ...legacy, source: { ...legacy.source!, collection_key: "messages" } });
  assert.equal(studio.withCollectionKey(keyed, cols), keyed, "already keyed → same draft");
  assert.equal(studio.withCollectionKey(legacy, [{ id: RATES, name: "Rates", key: "rates" }]), legacy, "collection not listed → same draft");
  assert.equal(studio.withCollectionKey(legacy, [{ id: MESSAGES, name: "Messages" }]), legacy, "no key known → same draft");
  assert.equal(studio.withCollectionKey(studio.readDataViewDraft({}), cols).source, undefined, "unbound stays unbound");
});

test("DataView settings (SDL-679): picking a collection in the panel writes its key into the source", async () => {
  const writes: unknown[] = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const sources = {
    workspaceId: WS,
    status: "ready" as const,
    collections: [{ id: MESSAGES, name: "Messages", key: "messages" }],
    onRetry: () => {},
    loadFields: async () => MESSAGE_FIELDS,
  };
  await act(async () => root.render(<studio.DataViewSettings props={{}} sources={sources} onChange={(next) => writes.push(next)} />));
  const select = host.querySelector("select");
  assert.ok(select !== null, "the collection select is drawn");
  await act(async () => {
    select!.value = MESSAGES;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  assert.equal(writes.length, 1, `one write, got ${writes.length}`);
  assert.deepEqual((writes[0] as { source?: unknown }).source, { kind: "collection", workspace_id: WS, collection_id: MESSAGES, collection_key: "messages" });
  await act(async () => root.unmount());
  host.remove();
});

test("DataView settings (SDL-679): the panel writes the missing key itself once collections load — once, source only; not when disabled", async () => {
  const legacyProps = studio.draftToProps({
    ...studio.bindCollection(studio.readDataViewDraft({}), MESSAGES, WS, MESSAGE_FIELDS),
    presets: [{ id: "all", label: "All", filter: [] }],
  }) as Record<string, unknown>;
  const sources = (status: "loading" | "ready") => ({
    workspaceId: WS,
    status,
    collections: status === "ready" ? [{ id: MESSAGES, name: "Messages", key: "messages" }] : [],
    onRetry: () => {},
    loadFields: async () => MESSAGE_FIELDS,
  });
  for (const disabled of [false, true]) {
    const writes: unknown[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const draw = (status: "loading" | "ready") =>
      root.render(<studio.DataViewSettings props={legacyProps} sources={sources(status)} onChange={(next) => writes.push(next)} disabled={disabled} />);
    await act(async () => draw("loading"));
    assert.equal(writes.length, 0, "nothing is written before the collections load");
    await act(async () => draw("ready"));
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    if (disabled) {
      assert.equal(writes.length, 0, "a disabled panel writes nothing");
    } else {
      assert.equal(writes.length, 1, `one write, got ${writes.length}`);
      const next = studio.draftToProps(writes[0] as ReturnType<typeof studio.readDataViewDraft>) as Record<string, unknown>;
      assert.deepEqual(next, { ...legacyProps, source: { ...(legacyProps.source as object), collection_key: "messages" } });
    }
    await act(async () => root.unmount());
    host.remove();
  }
});

test("DataView settings: switching the collection drops the old conditions and presets", () => {
  let d = studio.bindCollection(studio.readDataViewDraft({}), MESSAGES, WS, MESSAGE_FIELDS);
  d = studio.addPreset(d, "Unread", { field: "read_at", op: "null", value: true })!;
  d = studio.addFilterClause(d, { field: "importance", op: "gte", value: 2 })!;
  const other = studio.bindCollection(d, RATES, WS, [{ key: "rate", name: "Rate", type: "number" }]);
  assert.deepEqual(other.presets, []);
  assert.deepEqual(other.filter, []);
  assert.deepEqual(other.fields, ["rate"]);
});

test("DataView settings: field toggles keep the collection's order", () => {
  let d = studio.bindCollection(studio.readDataViewDraft({}), MESSAGES, WS, MESSAGE_FIELDS);
  d = studio.toggleField(d, "from", false, MESSAGE_FIELDS);
  d = studio.toggleField(d, "body", true, MESSAGE_FIELDS);
  assert.deepEqual(d.fields, ["title", "body", "needs_answer", "importance"]);
});

test("DataView settings: sort options round-trip and include the timestamps", () => {
  const opts = studio.sortOptions(MESSAGE_FIELDS);
  assert.ok(opts.some((o) => o.value === "created_at:desc"));
  assert.ok(opts.some((o) => o.value === "importance:asc"));
  assert.ok(!opts.some((o) => o.field === "body"), "rich text is not a sort key");
  assert.deepEqual(studio.parseSortValue("needs_answer:asc"), { field: "needs_answer", direction: "asc" });
  assert.equal(studio.parseSortValue("title:sideways"), null);
  assert.equal(studio.sortValue({ field: "title", direction: "desc" }), "title:desc");
});

test("DataView settings: conditions are typed by their field and refused when they would clash on the wire", () => {
  const fields = MESSAGE_FIELDS;
  assert.deepEqual(studio.makeClause(fields[3], "eq", "true"), { field: "needs_answer", op: "eq", value: true });
  assert.deepEqual(studio.makeClause(fields[4], "gte", " 2 "), { field: "importance", op: "gte", value: 2 });
  assert.equal(studio.makeClause(fields[4], "gte", "two"), null, "a number field refuses text");
  assert.deepEqual(studio.makeClause(fields[5], "null", "true"), { field: "read_at", op: "null", value: true });
  assert.deepEqual(studio.makeClause(fields[0], "in", "a,b"), { field: "title", op: "in", value: "a,b" });
  assert.equal(studio.makeClause(fields[0], "eq", "   "), null);
  assert.deepEqual([...studio.opsForType("boolean")], ["eq", "ne", "null"]);
  let d = studio.bindCollection(studio.readDataViewDraft({}), MESSAGES, WS, fields);
  d = studio.addFilterClause(d, { field: "importance", op: "gte", value: 2 })!;
  assert.equal(studio.addFilterClause(d, { field: "importance", op: "gte", value: 3 }), null);
  assert.equal(studio.addPreset(d, "Important", { field: "importance", op: "gte", value: 5 }), null, "a preset may not repeat a base filter key");
  d = studio.removeFilterClause(d, 0);
  assert.deepEqual(d.filter, []);
});

test("DataView settings: the feed from scratch — Unread, All, then Needs answer — is a valid contract and query", () => {
  let d = studio.bindCollection(studio.readDataViewDraft({}), MESSAGES, WS, MESSAGE_FIELDS);
  d = studio.addPreset(d, "Unread", { field: "read_at", op: "null", value: true })!;
  d = studio.addPreset(d, "All", null)!;
  d = studio.addPreset(d, "Needs answer", { field: "needs_answer", op: "eq", value: true })!;
  assert.equal(studio.addPreset(d, "  ", null), null, "a blank tab name is refused");
  assert.deepEqual(d.presets.map((p) => p.id), ["unread", "all", "needs_answer"]);
  assert.equal(studio.clauseText(d.presets[0].filter), "read_at is empty");
  assert.equal(studio.clauseText(d.presets[1].filter), "no condition");
  assert.equal(studio.clauseText(d.presets[2].filter), "needs_answer is true");
  const parsed = DataViewPropsSchema.safeParse(studio.draftToProps(d));
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.deepEqual(dataViewQuery(parsed.data!, "needs_answer"), {
    collection_id: MESSAGES,
    sort_by: "created_at",
    sort_order: "desc",
    limit: "20",
    "filter[needs_answer][eq]": "true",
  });
  d = studio.makeDefaultPreset(d, "needs_answer");
  assert.equal(d.presets[0].id, "needs_answer", "the default tab is the first one");
  assert.equal(studio.presetIdFor("All", ["all"]), "all_2");
  assert.equal(studio.presetIdFor("Ответить", []), "otvetit", "Cyrillic is transliterated");
  d = studio.removePreset(d, "all");
  assert.deepEqual(d.presets.map((p) => p.id), ["needs_answer", "unread"]);
});

test("DataView settings: the panel lists the host's collections and one pick is one history frame", async () => {
  const dvSchema: SaunaSchema = {
    version: 2,
    rootId: "dv",
    nodes: { dv: { type: "DataView", props: { fields: [], sort: { field: "created_at", direction: "desc" }, filter: [], presets: [], limit: 20 } } },
    parents: { dv: null },
  } as SaunaSchema;
  const store = createStudioStore({ initialSchema: dvSchema });
  store.getState().selectNode("dv");
  const sources = {
    workspaceId: WS,
    status: "ready" as const,
    collections: [{ id: MESSAGES, name: "Messages" }, { id: RATES, name: "Rates" }],
    loadFields: async () => MESSAGE_FIELDS,
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={[]} dataSources={sources} bare />);
  });
  const select = host.querySelector<HTMLSelectElement>("#dv-input-collection");
  assert.ok(select, "the collection select is drawn");
  assert.deepEqual([...select.options].map((o) => o.textContent), ["— pick a collection —", "Messages", "Rates"]);
  const before = store.getState().history.past.length;
  await act(async () => {
    select.value = MESSAGES;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  const props = store.getState().schema.nodes.dv.props as Record<string, unknown>;
  assert.deepEqual(props.source, { kind: "collection", workspace_id: WS, collection_id: MESSAGES });
  assert.equal(store.getState().history.past.length, before + 1, "one pick = one frame");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(host.querySelector('[data-testid="dv-fields"]'), "the fields of the bound collection are listed");
  assert.ok(host.querySelector('[data-testid="dv-write-note"]'), "read_at declared → the write note");
  await act(async () => root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={[]} dataSources={{ ...sources, status: "loading", collections: [] }} bare />));
  assert.ok(host.querySelector('[data-testid="dv-collections-loading"]'));
  await act(async () => root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={[]} dataSources={{ ...sources, status: "error", collections: [] }} bare />));
  assert.ok(host.querySelector('[data-testid="dv-collections-error"]'));
  await act(async () => root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={[]} dataSources={{ ...sources, collections: [] }} bare />));
  assert.ok(host.querySelector('[data-testid="dv-collections-empty"]'));
  await act(async () => root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={[]} bare />));
  assert.equal(host.querySelector('[data-testid="dv-panel"]'), null, "no host sources → no DataView panel");
  act(() => root.unmount());
  host.remove();
});


test("DataView settings (review): dates must be ISO, `in` parts are trimmed", () => {
  const date = { key: "deadline", name: "Deadline", type: "date" };
  const num = { key: "importance", name: "Importance", type: "number" };
  const str = { key: "title", name: "Title", type: "string" };
  assert.deepEqual(studio.makeClause(date, "gt", "2026-09-28"), { field: "deadline", op: "gt", value: "2026-09-28" });
  assert.deepEqual(studio.makeClause(date, "lt", "2026-09-28T10:00:00Z"), { field: "deadline", op: "lt", value: "2026-09-28T10:00:00Z" });
  assert.equal(studio.makeClause(date, "eq", "tomorrow"), null, "free text on a date is refused");
  assert.equal(studio.makeClause(date, "gt", "2026-02-30"), null, "not a calendar day");
  assert.equal(studio.makeClause(date, "gt", "2026-09-28T10:00"), null, "a time without a zone is refused");
  assert.deepEqual(studio.makeClause(str, "in", " a , b ,, c "), { field: "title", op: "in", value: "a,b,c" });
  assert.equal(studio.makeClause(str, "in", " , "), null);
  assert.deepEqual(studio.makeClause(num, "in", "1, 2"), { field: "importance", op: "in", value: "1,2" });
  assert.equal(studio.makeClause(num, "in", "1, x"), null);
});

test("DataView settings (review): Cyrillic tab names get transliterated ids", () => {
  assert.equal(studio.presetIdFor("Нужен ответ", []), "nuzhen_otvet");
  assert.equal(studio.presetIdFor("Жауап қажет", []), "zhauap_qazhet");
  assert.equal(studio.presetIdFor("Все", ["vse"]), "vse_2");
  assert.equal(studio.presetIdFor("✓✓", []), "tab");
});

function dvStore() {
  const dvSchema = {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Page", children: ["dv"] },
      dv: { type: "DataView", props: { fields: [], sort: { field: "created_at", direction: "desc" }, filter: [], presets: [], limit: 20 } },
    },
    parents: { root: null, dv: "root" },
  } as unknown as SaunaSchema;
  const store = createStudioStore({ initialSchema: dvSchema });
  store.getState().selectNode("dv");
  return store;
}

async function mountDv(store: ReturnType<typeof dvStore>, sources: studio.StudioDataSources) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={[]} dataSources={sources} bare />);
  });
  const change = async (value: string) => {
    const select = host.querySelector<HTMLSelectElement>("#dv-input-collection")!;
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
  };
  const flush = async () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { host, change, flush, done: () => { act(() => root.unmount()); host.remove(); } };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("DataView settings (review): at Phone width the panel writes the BASE props, never a width override", async () => {
  const store = dvStore();
  store.getState().setScreen("mobile");
  const m = await mountDv(store, {
    workspaceId: WS, status: "ready",
    collections: [{ id: MESSAGES, name: "Messages" }],
    loadFields: async () => MESSAGE_FIELDS,
  });
  assert.ok(m.host.querySelector('[data-testid="dv-base-note"]'), "the panel says it is width-independent");
  await m.change(MESSAGES);
  await m.flush();
  const node = store.getState().schema.nodes.dv as { props?: Record<string, unknown>; screens?: Record<string, unknown> };
  assert.deepEqual((node.props ?? {}).source, { kind: "collection", workspace_id: WS, collection_id: MESSAGES });
  assert.equal(node.screens, undefined, "nothing landed in screens");
  m.done();
});

test("DataView settings (review): two quick picks — the last one wins, a stale answer is dropped", async () => {
  const store = dvStore();
  const a = deferred<typeof MESSAGE_FIELDS>();
  const b = deferred<typeof MESSAGE_FIELDS>();
  const m = await mountDv(store, {
    workspaceId: WS, status: "ready",
    collections: [{ id: MESSAGES, name: "Messages" }, { id: RATES, name: "Rates" }],
    loadFields: (id) => (id === MESSAGES ? a.promise : b.promise),
  });
  await m.change(MESSAGES);
  assert.ok(m.host.querySelector('[data-testid="dv-binding-loading"]'), "loading shown while fields load");
  assert.equal(m.host.querySelector<HTMLSelectElement>("#dv-input-collection")!.disabled, true, "select disabled while loading");
  await m.change(RATES);
  await act(async () => { b.resolve([{ key: "rate", name: "Rate", type: "number" }]); await Promise.resolve(); });
  await act(async () => { a.resolve(MESSAGE_FIELDS); await Promise.resolve(); });
  await m.flush();
  const props = store.getState().schema.nodes.dv.props as Record<string, unknown>;
  assert.deepEqual(props.source, { kind: "collection", workspace_id: WS, collection_id: RATES });
  assert.deepEqual(props.fields, ["rate"]);
  m.done();
});

test("DataView settings (review): a failed field load does not bind; a retry binds WITH the starter fields", async () => {
  const store = dvStore();
  let fail = true;
  const m = await mountDv(store, {
    workspaceId: WS, status: "ready",
    collections: [{ id: MESSAGES, name: "Messages" }],
    loadFields: async () => { if (fail) throw new Error("503"); return MESSAGE_FIELDS; },
  });
  const before = store.getState().history.past.length;
  await m.change(MESSAGES);
  await m.flush();
  assert.ok(m.host.querySelector('[data-testid="dv-binding-error"]'), "the failure is shown");
  assert.equal(store.getState().history.past.length, before, "nothing was written");
  assert.equal((store.getState().schema.nodes.dv.props as Record<string, unknown>).source, undefined);
  fail = false;
  await act(async () => { m.host.querySelector<HTMLButtonElement>('[data-testid="dv-binding-retry"]')!.click(); await Promise.resolve(); });
  await m.flush();
  const props = store.getState().schema.nodes.dv.props as Record<string, unknown>;
  assert.deepEqual(props.fields, ["title", "from", "needs_answer", "importance"]);
  assert.equal(m.host.querySelector('[data-testid="dv-binding-error"]'), null);
  m.done();
});

test("DataView settings (review): Remove and Make default name what they act on", async () => {
  const store = dvStore();
  store.getState().applyOp({
    kind: "updateNodePropsPartial",
    nodeId: "dv",
    patch: {
      source: { kind: "collection", workspace_id: WS, collection_id: MESSAGES },
      filter: [{ field: "importance", op: "gte", value: 2 }],
      presets: [{ id: "unread", label: "Unread", filter: [] }, { id: "all", label: "All", filter: [] }],
    },
  });
  const m = await mountDv(store, { workspaceId: WS, status: "ready", collections: [{ id: MESSAGES, name: "Messages" }], loadFields: async () => MESSAGE_FIELDS });
  await m.flush();
  assert.ok(m.host.querySelector('[aria-label="Remove condition importance ≥ 2"]'));
  assert.ok(m.host.querySelector('[aria-label="Make All the default tab"]'));
  m.done();
});

// --- SDL-633: list editors of the compound Elements ------------------------
// Tabs / accordion items are bound to the node's children by position: every
// structural edit in the panel must move the item AND its content child.

function tabsSchema(): SaunaSchema {
  return {
    version: 2,
    rootId: "t",
    nodes: {
      t: {
        type: "TabsView",
        props: { items: [{ label: "A", text: "a" }, { label: "B", text: "b" }], orientation: "horizontal" },
        children: ["ka", "kb"],
      },
      ka: { type: "Box", props: { tag: "content-a" }, children: ["ga"] },
      ga: { type: "Text", props: { children: "deep a" } },
      kb: { type: "Box", props: { tag: "content-b" } },
    },
    parents: { t: null, ka: "t", ga: "ka", kb: "t" },
  } as SaunaSchema;
}

async function mountCompoundForm(initial: SaunaSchema, nodeId: string) {
  const store = createStudioStore({ initialSchema: initial });
  store.getState().selectNode(nodeId);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const blocks = [TabsViewElement.block, AccordionViewElement.block, TableViewElement.block] as unknown as React.ComponentProps<typeof studio.SaunaPropertiesAutoForm>["blocks"];
  await act(async () => {
    root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={blocks} bare />);
  });
  const click = async (sel: string) => {
    const b = host.querySelector<HTMLButtonElement>(sel);
    assert.ok(b, `no control ${sel}`);
    assert.equal(b!.disabled, false, `${sel} is disabled`);
    await act(async () => { b!.click(); });
  };
  const type = async (sel: string, text: string) => {
    const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
    assert.ok(el, `no field ${sel}`);
    const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
      el!.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const done = async () => { await act(async () => root.unmount()); host.remove(); };
  return { store, host, click, type, done };
}

/** "label:content-tag" per item, read from the stored document by position. */
function headingsOverContent(s: SaunaSchema, id = "t"): string {
  const n = s.nodes[id]!;
  return (n.props!.items as { label: string }[])
    .map((it, i) => {
      const child = n.children?.[i];
      const tag = child ? (s.nodes[child]?.props?.tag as string | undefined) ?? s.nodes[child]?.type : "-";
      return `${it.label}:${tag}`;
    })
    .join(" ");
}

// --- SDL-667: the node carries its Element's props version -----------------

const VERSIONED_BLOCKS = [
  { type: "Box", displayName: "Box", propsVersion: 2, meta: { category: "Primitives", description: "A layout box." } },
  { type: "Text", displayName: "Text", meta: { category: "Primitives", description: "A paragraph or a heading." } },
  {
    type: "Card", displayName: "Card", propsVersion: 2, staticProps: z.object({ title: z.string() }),
    meta: { category: "Widgets", description: "A surface with a header.", initialProps: { title: "New card" } },
  },
] as unknown as NonNullable<React.ComponentProps<typeof studio.SaunaStudio>["blocks"]>;

function versionedSchema(): SaunaSchema {
  return {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Box", props: {}, children: ["t", "old"] },
      t: { type: "TabsView", props: { items: [{ label: "A", text: "" }], orientation: "horizontal" } },
      old: { type: "Card", props: { title: "stored before v2" } },
    },
    parents: { root: null, t: "root", old: "root" },
  } as SaunaSchema;
}

test("props version (SDL-667): the store writes the Element's version on every node it creates, only when it is not 1", () => {
  const store = createStudioStore({ initialSchema: versionedSchema(), propsVersionOf: propsVersionsFromBlocks(VERSIONED_BLOCKS) });
  const added = (child: { type: string; props?: Record<string, unknown>; propsVersion?: number }) => {
    assert.equal(store.getState().applyOp({ kind: "addChild", parentId: "root", child }).applied, true);
    return store.getState().schema.nodes[store.getState().selection.nodeId!]!;
  };
  assert.equal(added({ type: "Card", props: { title: "x" } }).propsVersion, 2, "addChild dropped the Element's version");
  const text = added({ type: "Text", props: {} });
  assert.ok(!("propsVersion" in text), `a v1 Element must write nothing: ${JSON.stringify(text)}`);
  const unknown = added({ type: "Mystery", props: {} });
  assert.ok(!("propsVersion" in unknown), "a type nobody defines has no version to write");
  // The op's own version wins: it is a statement about THESE props.
  assert.equal(added({ type: "Card", props: {}, propsVersion: 3 }).propsVersion, 3);

  assert.equal(store.getState().applyOp({ kind: "replaceNode", nodeId: "old", child: { type: "Card", props: { title: "y" } } }).applied, true);
  const replaced = store.getState().schema.nodes[store.getState().selection.nodeId!]!;
  assert.equal(replaced.propsVersion, 2, "replaceNode dropped the Element's version");

  // A copy keeps the source's contract — the stored v1 Card stays v1 when duplicated.
  const legacy = createStudioStore({ initialSchema: versionedSchema(), propsVersionOf: propsVersionsFromBlocks(VERSIONED_BLOCKS) });
  legacy.getState().applyOp({ kind: "duplicate", nodeId: "old" });
  assert.ok(!("propsVersion" in legacy.getState().schema.nodes[legacy.getState().selection.nodeId!]!), "a copy of a v1 node claimed v2");
  store.getState().applyOp({ kind: "duplicate", nodeId: store.getState().selection.nodeId! });
  assert.equal(store.getState().schema.nodes[store.getState().selection.nodeId!]!.propsVersion, 2);

  // A compound's new item gets a content child — a node like any inserted one.
  store.getState().applyOp({ kind: "compoundItems", nodeId: "t", edit: { action: "add", item: { label: "B", text: "" } } });
  const contents = store.getState().schema.nodes.t!.children!.map((id) => store.getState().schema.nodes[id]!);
  assert.equal(contents.length, 2);
  for (const c of contents) assert.equal(c.propsVersion, 2, JSON.stringify(c));

  // Without the lookup the store writes what the op says and nothing else.
  const bare = createStudioStore({ initialSchema: versionedSchema() });
  bare.getState().applyOp({ kind: "addChild", parentId: "root", child: { type: "Card", props: {} } });
  assert.ok(!("propsVersion" in bare.getState().schema.nodes[bare.getState().selection.nodeId!]!));
});

test("props version (SDL-667): the Insert modal writes the Element's version even into a host store that has no lookup", async () => {
  const m = await mountPanel({ blocks: VERSIONED_BLOCKS });
  try {
    const before = new Set(Object.keys(m.store.getState().schema.nodes));
    await act(async () => { modal().querySelector<HTMLButtonElement>('[data-sauna-insert-card="Card"]')!.click(); });
    await act(async () => { modal().querySelector<HTMLButtonElement>("[data-sauna-insert-submit]")!.click(); });
    const after = m.store.getState().schema.nodes;
    const fresh = Object.keys(after).filter((id) => !before.has(id));
    assert.equal(fresh.length, 1);
    assert.equal(after[fresh[0]!]!.propsVersion, 2, JSON.stringify(after[fresh[0]!]));
  } finally { await unmount(m); }
});

test("props version (SDL-667): the Properties form gives way to a plate when the node's schema is not the editor's", async () => {
  const initial = versionedSchema();
  initial.nodes.future = { type: "Card", propsVersion: 2, props: { title: "written at v2" } };
  initial.nodes.root!.children = [...initial.nodes.root!.children!, "future"];
  initial.parents.future = "root";
  const store = createStudioStore({ initialSchema: initial });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (blocks: typeof VERSIONED_BLOCKS) =>
    act(async () => { root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={blocks} bare />); });
  const plate = () => host.querySelector<HTMLElement>('[data-testid="properties-props-version"]');
  try {
    // The stored v1 Card under an editor whose Card is at v2.
    await act(async () => store.getState().selectNode("old"));
    await render(VERSIONED_BLOCKS);
    assert.ok(plate(), `no plate for a v1 node under a v2 editor: ${host.innerHTML.slice(0, 400)}`);
    assert.equal(plate()!.getAttribute("data-sauna-props-version-mismatch"), "Card@v1");
    assert.match(plate()!.textContent ?? "", /schema v1.*editor knows v2/i, plate()!.textContent ?? "");
    assert.equal(host.querySelectorAll("[data-sauna-prop]").length, 0, "the form is drawn under the plate");

    // The node at the editor's own version: the form, no plate.
    await act(async () => store.getState().selectNode("future"));
    assert.equal(plate(), null);
    assert.ok(host.querySelector('[data-sauna-prop="title"]'), "the v2 node lost its form");

    // An editor that is BEHIND the document: the same plate, the other way round.
    const v1Blocks = VERSIONED_BLOCKS.map((b) => ({ ...b, propsVersion: undefined })) as unknown as typeof VERSIONED_BLOCKS;
    await render(v1Blocks);
    assert.equal(plate()?.getAttribute("data-sauna-props-version-mismatch"), "Card@v2");
    assert.match(plate()!.textContent ?? "", /schema v2.*editor knows v1/i);
    assert.equal(host.querySelectorAll("[data-sauna-prop]").length, 0);
    // Nothing was written by drawing the plate.
    assert.equal(store.getState().history.past.length, 0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("compound items: the panel draws a list editor for Tabs, not the raw JSON field", async () => {
  const m = await mountCompoundForm(tabsSchema(), "t");
  try {
    const rows = m.host.querySelectorAll('[data-sauna-prop="items"]');
    assert.equal(rows.length, 1);
    assert.ok(rows[0]!.hasAttribute("data-sauna-items-editor"), "items is still the raw JSON field");
    assert.equal(m.host.querySelectorAll("[data-sauna-item]").length, 2);
    assert.deepEqual([...m.host.querySelectorAll<HTMLInputElement>("[data-sauna-item-label]")].map((i) => i.value), ["A", "B"]);
  } finally { await m.done(); }
});

test("compound items: add / rename / reorder / delete keep every heading over its own content, one frame each", async () => {
  const m = await mountCompoundForm(tabsSchema(), "t");
  const frames = () => m.store.getState().history.past.length;
  const doc = () => m.store.getState().schema;
  try {
    assert.equal(headingsOverContent(doc()), "A:content-a B:content-b");
    // Add: the new tab gets a content child of its own.
    let f = frames();
    await m.click("[data-sauna-item-add]");
    assert.equal(frames(), f + 1, "add is one frame");
    assert.equal(headingsOverContent(doc()), "A:content-a B:content-b Tab 3:Box");
    assert.equal(doc().parents[doc().nodes.t!.children![2]!], "t");
    // Rename: a heading changes, nothing moves.
    await m.type('[data-sauna-item="2"] [data-sauna-item-label]', "C");
    await m.type('[data-sauna-item="2"] [data-sauna-item-text]', "c text");
    assert.equal(headingsOverContent(doc()), "A:content-a B:content-b C:Box");
    assert.deepEqual((doc().nodes.t!.props!.items as { text: string }[]).map((i) => i.text), ["a", "b", "c text"]);
    // Reorder: A goes down, its content with it.
    f = frames();
    await m.click('[data-sauna-item="0"] [data-sauna-item-down]');
    assert.equal(frames(), f + 1, "move is one frame");
    assert.equal(headingsOverContent(doc()), "B:content-b A:content-a C:Box");
    await m.click('[data-sauna-item="2"] [data-sauna-item-up]');
    assert.equal(headingsOverContent(doc()), "B:content-b C:Box A:content-a");
    // Delete: A leaves with its content subtree; nobody's content slides under another heading.
    f = frames();
    await m.click('[data-sauna-item="2"] [data-sauna-item-remove]');
    assert.equal(frames(), f + 1, "delete is one frame");
    assert.equal(headingsOverContent(doc()), "B:content-b C:Box");
    assert.equal(doc().nodes.ka, undefined, "the deleted tab's content stays in the document");
    assert.equal(doc().nodes.ga, undefined, "with its subtree");
    await m.click('[data-sauna-item="0"] [data-sauna-item-remove]');
    assert.equal(headingsOverContent(doc()).startsWith("C:"), true, headingsOverContent(doc()));
    // The last one cannot go.
    assert.equal(m.host.querySelector<HTMLButtonElement>('[data-sauna-item="0"] [data-sauna-item-remove]')!.disabled, true);
    // Undo walks it back to the start, frame by frame.
    while (m.store.getState().history.past.length) m.store.getState().undo();
    assert.equal(headingsOverContent(doc()), "A:content-a B:content-b");
  } finally { await m.done(); }
});

test("compound items: a width or member override of items is cleared by the edit — the phone never keeps a deleted heading (SDL-633 review)", async () => {
  const s = tabsSchema();
  const items = s.nodes.t!.props!.items;
  s.nodes.t = {
    ...s.nodes.t!,
    visibility: "hybrid",
    screens: { mobile: { props: { items } }, tablet: { props: { items, orientation: "vertical" } } },
    member: { props: { items } },
  };
  const m = await mountCompoundForm(s, "t");
  const node = () => m.store.getState().schema.nodes.t!;
  try {
    assert.ok(m.host.querySelector("[data-sauna-items-base-note]"), "a stored override is not announced at the base width");
    const f = m.store.getState().history.past.length;
    await m.type('[data-sauna-item="0"] [data-sauna-item-label]', "Alpha");
    assert.equal(m.store.getState().history.past.length, f + 1, "rename + clearing the overrides is one frame");
    assert.equal(node().screens?.mobile, undefined, "rename left the phone copy of the list");
    assert.deepEqual(node().screens?.tablet, { props: { orientation: "vertical" } });
    assert.equal(node().member, undefined, "rename left the signed-in copy of the list");
    assert.equal(m.host.querySelector("[data-sauna-items-base-note]"), null, "the note outlives the override at the base width");
    // At a width the note stays: the list is edited for every width.
    await act(async () => { m.store.getState().setScreen("mobile"); });
    assert.ok(m.host.querySelector("[data-sauna-items-base-note]"));
    await m.click('[data-sauna-item="0"] [data-sauna-item-remove]');
    assert.equal(headingsOverContent(m.store.getState().schema), "B:content-b");
    assert.equal(node().screens?.mobile, undefined, "a delete at the phone width wrote a phone copy");
  } finally { await m.done(); }
});

test("compound items: an Accordion gets the same editor, and a refused move is disabled, not a silent no-op", async () => {
  const s: SaunaSchema = {
    version: 2,
    rootId: "t",
    nodes: {
      // Three items, one child: items 1 and 2 are empty (a stored document from before the editor).
      t: { type: "AccordionView", props: { items: [{ label: "Q1", text: "" }, { label: "Q2", text: "" }, { label: "Q3", text: "" }], type: "single", collapsible: true }, children: ["ka"] },
      ka: { type: "Box", props: { tag: "content-a" } },
    },
    parents: { t: null, ka: "t" },
  } as SaunaSchema;
  const m = await mountCompoundForm(s, "t");
  try {
    assert.equal(m.host.querySelectorAll("[data-sauna-item]").length, 3);
    // Moving an empty item in front of a filled one would open a hole — the engine refuses it, the button says so.
    assert.equal(m.host.querySelector<HTMLButtonElement>('[data-sauna-item="1"] [data-sauna-item-up]')!.disabled, true);
    await m.click("[data-sauna-item-add]");
    // Add filled every item's slot, so every move is allowed now.
    assert.equal(m.store.getState().schema.nodes.t!.children!.length, 4);
    assert.equal(headingsOverContent(m.store.getState().schema), "Q1:content-a Q2:Box Q3:Box Item 4:Box");
    await m.click('[data-sauna-item="1"] [data-sauna-item-up]');
    assert.equal(headingsOverContent(m.store.getState().schema), "Q2:Box Q1:content-a Q3:Box Item 4:Box");
  } finally { await m.done(); }
});

test("compound items: a move refused for a hole pushes no undo step and keeps the width override (SDL-633 review)", () => {
  const items = [{ label: "Q1", text: "" }, { label: "Q2", text: "" }, { label: "Q3", text: "" }];
  const s = {
    version: 2,
    rootId: "t",
    nodes: {
      // Three items, one child, and a phone copy of the list: the refused move must not touch any of it.
      t: { type: "AccordionView", props: { items, type: "single", collapsible: true }, children: ["ka"], screens: { mobile: { props: { items } } } },
      ka: { type: "Box", props: { tag: "content-a" } },
    },
    parents: { t: null, ka: "t" },
  } as SaunaSchema;
  const store = createStudioStore({ initialSchema: s });
  const before = store.getState().schema;
  store.getState().applyOp({ kind: "compoundItems", nodeId: "t", edit: { action: "move", from: 2, to: 0 } });
  assert.equal(store.getState().history.past.length, 0, "a refused move is an undo step that changes nothing");
  assert.equal(store.getState().schema, before, "a refused move hands the document back as it was");
  assert.deepEqual(store.getState().schema.nodes.t!.screens, { mobile: { props: { items } } }, "a refused move dropped the phone copy of the list");
});

test("table grid: columns and rows are edited as a grid — every column is one index across all rows", async () => {
  const s: SaunaSchema = {
    version: 2,
    rootId: "t",
    nodes: { t: { type: "TableView", props: { header: true, rows: [["Plan", "Price"], ["Basic", "$10"], ["Pro"]] } } },
    parents: { t: null },
  } as SaunaSchema;
  const m = await mountCompoundForm(s, "t");
  const rows = () => m.store.getState().schema.nodes.t!.props!.rows as string[][];
  try {
    assert.ok(m.host.querySelector('[data-sauna-prop="rows"][data-sauna-table-editor]'), "rows is still the raw JSON field");
    assert.deepEqual([...m.host.querySelectorAll<HTMLInputElement>("[data-sauna-col-name]")].map((i) => i.value), ["Plan", "Price"]);
    await m.type('[data-sauna-col="1"] [data-sauna-col-name]', "Cost");
    assert.deepEqual(rows(), [["Plan", "Cost"], ["Basic", "$10"], ["Pro", ""]], "rename writes the header cell and squares a ragged grid");
    await m.click("[data-sauna-col-add]");
    await m.type('[data-sauna-col="2"] [data-sauna-col-name]', "Seats");
    await m.type('[data-sauna-cell="0:2"]', "1");
    assert.deepEqual(rows(), [["Plan", "Cost", "Seats"], ["Basic", "$10", "1"], ["Pro", "", ""]]);
    await m.click('[data-sauna-col="2"] [data-sauna-col-left]');
    assert.deepEqual(rows(), [["Plan", "Seats", "Cost"], ["Basic", "1", "$10"], ["Pro", "", ""]], "a column moves with its cells");
    await m.click('[data-sauna-col="0"] [data-sauna-col-remove]');
    assert.deepEqual(rows(), [["Seats", "Cost"], ["1", "$10"], ["", ""]], "a column leaves with its cells");
    await m.click("[data-sauna-row-add]");
    await m.type('[data-sauna-cell="2:1"]', "$99");
    await m.click('[data-sauna-row="2"] [data-sauna-row-up]');
    assert.deepEqual(rows(), [["Seats", "Cost"], ["1", "$10"], ["", "$99"], ["", ""]]);
    await m.click('[data-sauna-row="0"] [data-sauna-row-remove]');
    assert.deepEqual(rows(), [["Seats", "Cost"], ["", "$99"], ["", ""]], "the header row is not a body row");
    // The header row is never offered as a row to move or delete.
    assert.equal(m.host.querySelector<HTMLButtonElement>('[data-sauna-row="0"] [data-sauna-row-up]')!.disabled, true);
    assert.equal(TableViewElement.schema.safeParse(m.store.getState().schema.nodes.t!.props).success, true);
  } finally { await m.done(); }
});

test("table model: pure edits stay within the caps and never mutate the input", () => {
  const g = [["a", "b"], ["c", "d"]];
  const frozen = JSON.stringify(g);
  assert.deepEqual(studio.removeTableColumn(g, 0), [["b"], ["d"]]);
  assert.deepEqual(studio.moveTableRow(g, 1, 0), [["c", "d"], ["a", "b"]]);
  assert.equal(studio.removeTableColumn([["x"]], 0).length, 1, "the last column stays");
  assert.equal(studio.removeTableRow([["x"]], 0).length, 1, "the last row stays");
  const wide = [Array.from({ length: studio.TABLE_MAX_COLUMNS }, () => "")];
  assert.equal(studio.addTableColumn(wide), wide, "no 13th column");
  assert.deepEqual(studio.readTableGrid([["a"], ["b", "c"]]), [["a", ""], ["b", "c"]]);
  assert.equal(JSON.stringify(g), frozen);
});

// --- SDL-633: per-node error boundary for stored orphan parts --------------
// A REAL render (react-dom/client in jsdom): renderToStaticMarkup does not run
// error boundaries, so a server-render test would pass with or without one.

test("node boundary: a stored orphan part draws a selectable plate, its siblings still render, an edit retries it", () => {
  // Own process with a time limit — see test/node-boundary.tsx. Paths from
  // this file, not the cwd, so the suite runs from any directory.
  const here = import.meta.dirname;
  const r = spawnSync("pnpm", ["exec", "tsx", "--tsconfig", path.join(here, "tsconfig.json"), path.join(here, "node-boundary.tsx")], {
    cwd: path.join(here, ".."),
    encoding: "utf8",
    timeout: 60_000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // node-boundary times its own steps (5 s each); this limit only catches a hang outside them.
  if (r.error || r.signal) assert.fail(`node-boundary did not finish in 60 s (${r.signal ?? r.error?.message}) — a hang outside its timed steps`);
  assert.equal(r.status, 0, out.split("\n").filter((l) => l.includes("node-boundary")).join(" ") || out.slice(-400));
});

// --- the shared pages catalog (SDL-678) -----------------------------------
//
// `@markerloop/studio/catalog` is the ONE assembled registry the admin's
// editor and the workspace site render with. Its frozen names hold for any
// host's `dataView`, and `renderPublishedPage` is the site's server entry.

const PUBLISHED_BODY = {
  version: 2,
  rootId: "root",
  nodes: {
    root: { type: "Page", props: {}, children: ["sec"] },
    sec: { type: "Section", props: { background: "muted", align: "center", padding: "lg" }, children: ["h", "img", "gone", "orphan", "after"] },
    h: { type: "Text", props: { level: "h1", text: "Published hello" } },
    img: { type: "Image", props: { src: "mlfile:11111111-2222-3333-4444-555555555555", alt: "cover" } },
    gone: { type: "NoSuchComponent", props: {} },
    // Stored outside its Tabs, as a part could be before SDL-633: Radix throws.
    orphan: { type: "TabsList", props: {} },
    after: { type: "Text", props: { text: "AFTER THE ORPHAN" } },
  },
  parents: { root: null, sec: "root", h: "sec", img: "sec", gone: "sec", orphan: "sec", after: "sec" },
};

test("catalog: every frozen name resolves in the assembled registry, with and without a host DataView", async () => {
  const catalog = await import("@markerloop/studio/catalog");
  const HostDataView = () => React.createElement("div", { "data-test": "host-data-view" });
  const sets = {
    default: catalog.PAGES_REGISTRY,
    host: catalog.createPagesElementSet({ dataView: HostDataView }).registry,
  };
  for (const [name, registry] of Object.entries(sets)) {
    const missing = catalog.FROZEN_REGISTRY_TYPES.filter((t) => {
      const v = registry[t] as unknown;
      return !(typeof v === "function" || (typeof v === "object" && v !== null));
    });
    assert.deepEqual(missing, [], `${name} registry lost frozen names`);
  }
  assert.equal(new Set(catalog.FROZEN_REGISTRY_TYPES).size, catalog.FROZEN_REGISTRY_TYPES.length, "the frozen list has no duplicates");
  // The host decides only what draws DataView: every other name is drawn
  // by the very same component in both sets.
  const differ = Object.keys(sets.default).filter((t) => sets.host[t] !== sets.default[t]);
  assert.deepEqual(differ, ["DataView"], "a host's set differs from the default in DataView only");
  assert.equal(sets.host.DataView, HostDataView);
  const { DataView } = await import("@markerloop/engine/react");
  assert.equal(sets.default.DataView, DataView, "without a host provider DataView is the engine's frame");
  assert.equal(catalog.PAGES_BLOCKS.length, catalog.createPagesElementSet({ dataView: HostDataView }).blocks.length);
});

test("renderPublishedPage: the body through the one registry, never editable, files resolved, a lost type visible", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(
    renderPublishedPage(PUBLISHED_BODY, { "11111111-2222-3333-4444-555555555555": "https://cdn.example/cover.png" })
  );
  assert.ok(html.includes('data-pages-primitive="page"'), "Page is drawn by the catalog's Page");
  // SDL-769: the root holds the page to the viewport — clip, not hidden
  // (hidden would make it the scroll container of every sticky inside).
  const pageTag = /<div data-pages-primitive="page"[^>]*>/.exec(html)?.[0] ?? "";
  assert.match(pageTag, /max-width:100%/, pageTag);
  assert.match(pageTag, /min-width:0/, pageTag);
  assert.match(pageTag, /overflow-x:clip/, pageTag);
  assert.ok(!/overflow(-x)?:hidden/.test(pageTag), `the root must not be a scroll container: ${pageTag}`);
  assert.ok(html.includes('data-background="muted"'), "Section is drawn by the catalog's Section");
  assert.ok(html.includes("Published hello"), "the Text primitive rendered");
  assert.ok(html.includes('src="https://cdn.example/cover.png"'), "an mlfile: ref resolves through `files`");
  assert.ok(html.includes('data-sauna-unknown-type="NoSuchComponent"'), "an unknown type draws its placeholder, not nothing");
  assert.ok(!html.includes(SAUNA_NODE_ID_ATTR), "a visitor's page carries no editor node ids");
  // No file map → the ref is dropped, never leaked as `mlfile:` into src.
  const bare = renderToStaticMarkup(renderPublishedPage(PUBLISHED_BODY));
  assert.ok(!bare.includes("mlfile:"), "an unresolved file ref is not written into the page");
  assert.throws(() => renderPublishedPage({ nodes: {} }), /not a valid schema/);
});

test("props version (SDL-667): the published page draws a plate for a node its build cannot read, the rest as before", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = structuredClone(PUBLISHED_BODY) as unknown as SaunaSchema;
  // Written by an editor whose Text is at v2; this build's Text is at v1.
  body.nodes.h!.propsVersion = 2;
  const html = renderToStaticMarkup(renderPublishedPage(body));
  assert.ok(html.includes('data-sauna-unknown-props-version="Text@v2"'), html.slice(0, 600));
  assert.ok(!html.includes("Published hello"), "props of another contract reached the component");
  assert.ok(html.includes("AFTER THE ORPHAN"), "the plate took its siblings with it");
  // An explicit 1 is the same contract as an absent field.
  body.nodes.h!.propsVersion = 1;
  assert.ok(renderToStaticMarkup(renderPublishedPage(body)).includes("Published hello"));
});

// --- Components on the published page (SDL-722) ---------------------------
//
// pages-service's public answer carries `blocks`: the Components the page's
// `Ref` nodes point at, nested ones on the top level too, frozen by the
// publication. The site hands the field to `renderPublishedPage` as it came.

const BLOCK_CARD = "aaaaaaaa-1111-4222-8333-444444444444";
const BLOCK_BADGE = "bbbbbbbb-1111-4222-8333-444444444444";
const BLOCK_GONE = "cccccccc-1111-4222-8333-444444444444";

const REF_PAGE_BODY = {
  version: 2,
  rootId: "root",
  nodes: {
    root: { type: "Page", props: {}, children: ["sec"] },
    sec: { type: "Section", props: {}, children: ["card", "plain", "gone", "after"] },
    card: { type: "Ref", props: { blockId: BLOCK_CARD, params: { title: "Title from the page" } } },
    // No values: the block's own defaults.
    plain: { type: "Ref", props: { blockId: BLOCK_CARD } },
    gone: { type: "Ref", props: { blockId: BLOCK_GONE } },
    after: { type: "Text", props: { text: "AFTER THE REFS" } },
  },
  parents: { root: null, sec: "root", card: "sec", plain: "sec", gone: "sec", after: "sec" },
};

/** The answer's `blocks` field: the card, and the badge the card references — flat. */
const REF_PAGE_BLOCKS = {
  [BLOCK_CARD]: {
    version: 3,
    schema: {
      version: 2,
      rootId: "c1",
      nodes: {
        c1: { type: "Section", props: { background: "muted" }, children: ["c2", "c3"] },
        c2: { type: "Text", props: { level: "h2", text: "Card default title" } },
        c3: { type: "Ref", props: { blockId: BLOCK_BADGE, params: { label: "Badge from the card" } } },
      },
      parents: { c1: null, c2: "c1", c3: "c1" },
      params: [{ name: "title", nodeId: "c2", prop: "text", type: "text", default: "Card default title" }],
    },
  },
  [BLOCK_BADGE]: {
    version: 1,
    schema: {
      version: 2,
      rootId: "b1",
      nodes: { b1: { type: "Text", props: { text: "Badge default" } } },
      parents: { b1: null },
      params: [{ name: "label", nodeId: "b1", prop: "text", type: "text", default: "Badge default" }],
    },
  },
};

const refPlaceholders = (html: string, reason: string) => html.split(`data-sauna-ref-placeholder="${reason}"`).length - 1;

test("renderPublishedPage (SDL-722): a Ref draws its Component with the page's params, a nested Ref too, a missing one the placeholder", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(renderPublishedPage(REF_PAGE_BODY, {}, undefined, REF_PAGE_BLOCKS));
  assert.ok(html.includes("Title from the page"), "the page's value reached the Component's node");
  assert.ok(html.includes("Card default title"), "a Ref without values draws the Component's default");
  assert.equal(html.split("Badge from the card").length - 1, 2, "the nested Ref draws its Component with the card's value, in both cards");
  assert.ok(!html.includes("Badge default"), "the nested Component's default was overridden by the card");
  assert.ok(html.includes('data-background="muted"'), "the Component's own props are drawn");
  assert.equal(refPlaceholders(html, "missing"), 1, "only the Ref to a Component absent from the map is a placeholder");
  assert.ok(html.includes(`data-sauna-ref-block="${BLOCK_GONE}"`), "the placeholder names the block it misses");
  assert.ok(html.includes("AFTER THE REFS"), "the placeholder does not take its siblings with it");
  assert.ok(!html.includes(SAUNA_NODE_ID_ATTR), "a visitor's page carries no editor node ids");
  // The stored Component is not touched by a page's values.
  assert.equal(REF_PAGE_BLOCKS[BLOCK_CARD].schema.nodes.c2.props.text, "Card default title");
});

test("renderPublishedPage (SDL-722): without `blocks` (a snapshot before SDL-722) the page renders as before — every Ref a placeholder", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const bare = renderToStaticMarkup(renderPublishedPage(REF_PAGE_BODY));
  assert.equal(refPlaceholders(bare, "missing"), 3, bare.slice(0, 600));
  assert.ok(bare.includes("AFTER THE REFS"));
  assert.ok(!bare.includes("Card default title"));
  for (const empty of [undefined, null, {}]) {
    assert.equal(renderToStaticMarkup(renderPublishedPage(REF_PAGE_BODY, {}, undefined, empty)), bare, `blocks = ${JSON.stringify(empty)}`);
  }
  // A page without Refs is byte-identical with or without the field.
  assert.equal(
    renderToStaticMarkup(renderPublishedPage(PUBLISHED_BODY, {}, undefined, REF_PAGE_BLOCKS)),
    renderToStaticMarkup(renderPublishedPage(PUBLISHED_BODY))
  );
});

test("publishedBlockMap (SDL-722): a Component whose schema is broken is left out — its Ref is a placeholder, the page still renders", async () => {
  const { publishedBlockMap, renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const broken = { ...REF_PAGE_BLOCKS, [BLOCK_BADGE]: { version: 1, schema: { nodes: {} } }, junk: null, other: { version: 1 } };
  const map = publishedBlockMap(broken);
  assert.deepEqual(Object.keys(map), [BLOCK_CARD]);
  assert.equal(map[BLOCK_CARD]!.rootId, "c1");
  const html = renderToStaticMarkup(renderPublishedPage(REF_PAGE_BODY, {}, undefined, broken));
  assert.ok(html.includes("Title from the page"), "the card still draws");
  assert.equal(refPlaceholders(html, "missing"), 3, "the gone Ref + the badge inside each of the two cards");
  assert.deepEqual(publishedBlockMap(undefined), {});
});

// SDL-722 review: the engine looks a Ref up as `blocks[blockId]`. On a plain
// map a blockId that names an `Object.prototype` member found that member,
// the renderer took a function for a schema and the whole page threw — where
// before SDL-722 the same Ref drew the "missing" placeholder.
const PROTO_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty"] as const;
const PROTO_PAGE_BODY = {
  version: 2,
  rootId: "root",
  nodes: {
    root: { type: "Page", props: {}, children: ["sec"] },
    sec: { type: "Section", props: {}, children: [...PROTO_KEYS.map((_, i) => `p${i}`), "card", "after"] },
    ...Object.fromEntries(PROTO_KEYS.map((blockId, i) => [`p${i}`, { type: "Ref", props: { blockId } }])),
    card: { type: "Ref", props: { blockId: BLOCK_CARD, params: { title: "Title from the page" } } },
    after: { type: "Text", props: { text: "AFTER THE REFS" } },
  },
  parents: { root: null, sec: "root", ...Object.fromEntries(PROTO_KEYS.map((_, i) => [`p${i}`, "sec"])), card: "sec", after: "sec" },
};

/** A tag that is the "missing" placeholder of the Ref to `blockId` (attribute order not assumed). */
const missingRef = (html: string, blockId: string) =>
  [...html.matchAll(/<[^>]*data-sauna-ref-placeholder="missing"[^>]*>/g)].some((m) => m[0].includes(`data-sauna-ref-block="${blockId}"`));

test("renderPublishedPage (SDL-722 review): a Ref whose blockId names an Object.prototype member draws the missing placeholder — with blocks absent, empty or not", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  for (const [label, blocks] of [["undefined", undefined], ["{}", {}], ["the card and the badge", REF_PAGE_BLOCKS]] as const) {
    let html = "";
    assert.doesNotThrow(() => {
      html = renderToStaticMarkup(renderPublishedPage(PROTO_PAGE_BODY, {}, undefined, blocks));
    }, `blocks = ${label}`);
    for (const key of PROTO_KEYS) {
      assert.ok(missingRef(html, key), `blocks = ${label}: Ref "${key}" is the missing placeholder\n${html.slice(0, 800)}`);
    }
    assert.ok(html.includes("AFTER THE REFS"), `blocks = ${label}: the page around the Refs renders`);
    const cardDrawn = blocks === REF_PAGE_BLOCKS;
    assert.equal(html.includes("Title from the page"), cardDrawn, `blocks = ${label}: the real Component draws only when it is in the map`);
    assert.equal(refPlaceholders(html, "missing"), PROTO_KEYS.length + (cardDrawn ? 0 : 1), `blocks = ${label}`);
  }
});

test("PublishedPage (SDL-722 review): the map as the client gets it — plain, through React's serializer — still finds no Object.prototype member", async () => {
  const { PublishedPage } = await import("@markerloop/studio/catalog");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { migrateSaunaSchema, validateSaunaSchema } = await import("@markerloop/engine");
  const validated = validateSaunaSchema(PROTO_PAGE_BODY);
  assert.ok(validated.ok);
  const schema = migrateSaunaSchema(validated.value);
  // A JSON round-trip, like the flight payload: an own "__proto__" key is a plain data key here.
  const plain = JSON.parse(JSON.stringify({ [BLOCK_CARD]: REF_PAGE_BLOCKS[BLOCK_CARD].schema }));
  for (const blocks of [undefined, {}, plain]) {
    let html = "";
    assert.doesNotThrow(() => {
      html = renderToStaticMarkup(<PublishedPage schema={schema} blocks={blocks} />);
    });
    for (const key of PROTO_KEYS) assert.ok(missingRef(html, key), `Ref "${key}"\n${html.slice(0, 800)}`);
    assert.equal(html.includes("Title from the page"), blocks === plain, "the real Component draws from the plain map");
    assert.ok(html.includes("AFTER THE REFS"));
  }
});

// --- the public DataView (SDL-679) -----------------------------------------
//
// A published page reads its DataViews from the anonymous plane
// `https://api.<base>/v1/data/<workspace>/<key>` — on the server for the first page, never
// with a token or a cookie. A collection the visitor may not read is the one
// "unavailable" stub, with nothing of the upstream answer in the HTML.

const PUB_WS = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PUB_OPEN = "11111111-1111-4111-8111-111111111111";
const PUB_CLOSED = "22222222-2222-4222-8222-222222222222";
const dataViewNode = (collectionId: string, key: string | undefined) => ({
  type: "DataView",
  props: {
    source: { kind: "collection", workspace_id: PUB_WS, collection_id: collectionId, ...(key ? { collection_key: key } : {}) },
    fields: ["title"],
    sort: { field: "created_at", direction: "desc" },
    filter: [],
    presets: [],
    limit: 20,
  },
});
const PUBLIC_DATA_BODY = {
  version: 2,
  rootId: "root",
  nodes: {
    root: { type: "Page", props: {}, children: ["open", "closed", "legacy"] },
    open: dataViewNode(PUB_OPEN, "news"),
    closed: dataViewNode(PUB_CLOSED, "salaries"),
    // Bound before SDL-679: no key, nothing to ask the anonymous plane for.
    legacy: dataViewNode(PUB_OPEN, undefined),
  },
  parents: { root: null, open: "root", closed: "root", legacy: "root" },
};

type SeenRequest = { url: string; init: RequestInit | undefined };
function fakeDataPlane(seen: SeenRequest[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    const headers = new Headers(init?.headers);
    // The plane derives the reader from Authorization: with one, a closed
    // collection would answer — exactly the leak the provider must not cause.
    const anonymous = !headers.has("authorization") && !headers.has("cookie");
    if (url.includes(`/data/${PUB_WS}/news?`) || (!anonymous && url.includes("/salaries?"))) {
      const rows = url.includes("/news?")
        ? [{ id: "r1", data: { title: "Opening hours changed" }, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" }]
        : [{ id: "s1", data: { title: "SECRET SALARY ROW" }, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" }];
      return new Response(JSON.stringify({ success: true, data: rows, meta: { total: rows.length } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: false, message: "UPSTREAM_DETAIL Ресурс не найден", request_id: "req-123" }), { status: 404 });
  }) as typeof fetch;
}

test("public DataView: SSR HTML has the public collection's records, the closed one is the stub, requests carry no token or cookie", async () => {
  const { createPublicDataCache, loadPublishedPageData, renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const seen: SeenRequest[] = [];
  const data = await loadPublishedPageData(PUBLIC_DATA_BODY, { apiBase: "https://api.sites.test/v1", fetch: fakeDataPlane(seen), cache: createPublicDataCache() });
  const html = renderToStaticMarkup(renderPublishedPage(PUBLIC_DATA_BODY, {}, data));

  assert.ok(html.includes("Opening hours changed"), `the public record is in the server HTML: ${html.slice(0, 600)}`);
  assert.ok(!html.includes("SECRET SALARY ROW"), "a closed collection's record reached the HTML");
  assert.equal((html.match(/data-pages-data-view-state="unavailable"/g) ?? []).length, 2, "closed and key-less views both draw the stub");
  assert.ok(html.includes("This collection is unavailable"));
  for (const leak of ["UPSTREAM_DETAIL", "req-123"]) assert.ok(!html.includes(leak), `upstream detail "${leak}" leaked into the HTML`);
  // Static markup only: the collection's key sits in the node's props, so a
  // hydrating page carries it in the RSC payload anyway — what is checked
  // here is that the server never DRAWS it, nor anything the plane answered.
  assert.ok(!html.includes("salaries"), "the closed collection's key is not drawn");
  assert.ok(!html.includes(SAUNA_NODE_ID_ATTR));

  // Exactly the two keyed lists were asked for, on the anonymous plane.
  assert.deepEqual(
    seen.map((r) => new URL(r.url).pathname).sort(),
    [`/v1/data/${PUB_WS}/news`, `/v1/data/${PUB_WS}/salaries`]
  );
  for (const r of seen) {
    const headers = new Headers(r.init?.headers);
    assert.equal(headers.get("authorization"), null, `Authorization sent to ${r.url}`);
    assert.equal(headers.get("cookie"), null, `Cookie sent to ${r.url}`);
    assert.equal(r.init?.credentials, "omit", "the browser must not attach the visitor's cookies either");
    const q = new URL(r.url).searchParams;
    assert.equal(q.get("collection_id"), null, "the plane takes the collection from the path");
    assert.equal(q.get("sort_by"), "created_at");
    assert.equal(q.get("limit"), "20");
  }
});

test("public DataView cache: a burst and repeats within the TTL are ONE fetch; after the TTL a new one; failures live shorter; size is capped", async () => {
  const { createPublicDataCache, loadPublishedPageData } = await import("@markerloop/studio/catalog/server");
  let clock = 1_000_000;
  const cache = createPublicDataCache({ okTtlMs: 30_000, failTtlMs: 10_000, maxEntries: 2, now: () => clock });
  const seen: SeenRequest[] = [];
  const plane = fakeDataPlane(seen);
  const opts = { apiBase: "http://gateway.internal/api/v1", browserApiBase: "https://api.sites.test/v1", fetch: plane, cache };
  const newsCalls = () => seen.filter((r) => r.url.includes("/news?")).length;
  const closedCalls = () => seen.filter((r) => r.url.includes("/salaries?")).length;

  // 20 page views at once: one request per list.
  const burst = await Promise.all(Array.from({ length: 20 }, () => loadPublishedPageData(PUBLIC_DATA_BODY, opts)));
  assert.equal(newsCalls(), 1, `concurrent views share one in-flight request, got ${newsCalls()}`);
  assert.equal(closedCalls(), 1);
  assert.ok(burst.every((d) => Object.values(d.pages).some((p) => p.status === "list")));
  assert.equal(burst[0]!.apiBase, "https://api.sites.test/v1", "the browser gets the public base, not the in-cluster one");
  assert.ok(seen.every((r) => r.url.startsWith("http://gateway.internal/api/v1/data/")), "the server reads in-cluster");

  // Sequential views inside both TTLs: still one each.
  clock += 9_000;
  await loadPublishedPageData(PUBLIC_DATA_BODY, opts);
  assert.equal(newsCalls(), 1);
  assert.equal(closedCalls(), 1);
  // Past the failure TTL, inside the success TTL: only the closed list is re-read.
  clock += 2_000;
  await loadPublishedPageData(PUBLIC_DATA_BODY, opts);
  assert.equal(newsCalls(), 1, "a success lives 30 s");
  assert.equal(closedCalls(), 2, "an unavailable answer lives 10 s");
  // Past the success TTL: a new read.
  clock += 20_000;
  await loadPublishedPageData(PUBLIC_DATA_BODY, opts);
  assert.equal(newsCalls(), 2, "after the TTL the list is read again");
  assert.ok(cache.size <= 2, `the cache is capped, size ${cache.size}`);

  // LRU: a third list pushes out the least recently used one.
  const lru = createPublicDataCache({ maxEntries: 2, now: () => clock });
  let loads = 0;
  const load = async () => (loads++, { status: "unavailable" as const });
  await lru.get("a", load);
  await lru.get("b", load);
  await lru.get("a", load);
  await lru.get("c", load); // evicts b
  assert.equal(lru.size, 2);
  await lru.get("a", load);
  assert.equal(loads, 3, "a stayed cached");
  await lru.get("b", load);
  assert.equal(loads, 4, "b was evicted and is read again");
});

test("public DataView: without a data source the page keeps the engine's frame and asks nothing", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(renderPublishedPage(PUBLIC_DATA_BODY));
  assert.ok(html.includes("No records yet"), html.slice(0, 400));
  assert.ok(!html.includes("data-pages-data-view-state"));
});

test("public DataView: a network failure or a malformed 200 is the stub too, never a throw", async () => {
  const { loadPublicDataViewPage } = await import("@markerloop/engine/providers/data");
  const props = DataViewPropsSchema.parse(PUBLIC_DATA_BODY.nodes.open.props);
  const down = (async () => {
    throw new Error("ECONNREFUSED 10.0.0.1");
  }) as typeof fetch;
  assert.deepEqual(await loadPublicDataViewPage(props, { apiBase: "https://api.sites.test/v1", fetch: down }), { status: "unavailable" });
  const odd = (async () => new Response(JSON.stringify({ data: { not: "a list" } }), { status: 200 })) as typeof fetch;
  assert.deepEqual(await loadPublicDataViewPage(props, { apiBase: "https://api.sites.test/v1", fetch: odd }), { status: "unavailable" });
});

/** The page the way Next draws it: the STREAMING server renderer, then hydration in the browser. */
async function streamToHtml(element: React.ReactElement): Promise<{ html: string; errors: string[] }> {
  const { renderToPipeableStream } = await import("react-dom/server");
  const { Writable } = await import("node:stream");
  const errors: string[] = [];
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({
      write(chunk, _enc, done) {
        html += String(chunk);
        done();
      },
      final(done) {
        resolve({ html, errors });
        done();
      },
    });
    const stream = renderToPipeableStream(element, {
      onShellError: reject,
      onError: (e) => void errors.push(e instanceof Error ? e.message : String(e)),
      onAllReady: () => stream.pipe(sink),
    });
  });
}

test("renderPublishedPage: a node that throws is isolated on the SERVER too — the page streams, the node is drawn as a plate after hydration", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { PUBLISHED_DEFERRED_ATTR } = await import("@markerloop/studio/catalog");
  const { SAUNA_NODE_ERROR_ATTR } = await import("@markerloop/engine/react");
  const { hydrateRoot } = await import("react-dom/client");
  const page = () => renderPublishedPage(PUBLISHED_BODY);

  // Server: no shell error (that is the 500), the orphan's error is reported,
  // and its siblings on both sides are in the HTML.
  const { html, errors } = await streamToHtml(page());
  assert.ok(errors.some((m) => /TabsList/.test(m)), `the orphan's error reaches onError: ${JSON.stringify(errors)}`);
  assert.ok(html.includes("Published hello") && html.includes("AFTER THE ORPHAN"), "the rest of the page is drawn on the server");
  assert.ok(html.includes(`${PUBLISHED_DEFERRED_ATTR}="TabsList"`), "the orphan's place holds the server stand-in");

  // Browser: hydration re-renders the orphan; the error boundary draws its plate.
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  const recoverable: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(host, page(), { onRecoverableError: (e) => void recoverable.push(e) });
    });
    assert.ok(host.querySelector(`[${SAUNA_NODE_ERROR_ATTR}="TabsList"]`), `the orphan draws its plate after hydration: ${host.innerHTML.slice(0, 300)}`);
    assert.ok(host.textContent?.includes("AFTER THE ORPHAN"), "the sibling survives hydration");
  } finally {
    await act(async () => root?.unmount());
    host.remove();
  }
});

test("catalog/server: the server entry pulls no client-only module", async () => {
  const dist = path.join(import.meta.dirname, "..", "dist", "catalog");
  const server = await readFile(path.join(dist, "server.js"), "utf8");
  assert.ok(!/^["']use client["']/.test(server), "server.js must not be a client module");
  // Every specifier: `from "x"`, a bare `import "x"` and a dynamic `import("x")`.
  const specs = [...server.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    specs,
    ["../site-fonts.js", "../site-theme.js", "../site-theme.js", "./published-page.js", "@markerloop/engine", "@markerloop/engine/providers/data", "react"],
    "server.js imports only the engine core, its public data provider (SDL-679), react, the site theme (SDL-773), its font list (SDL-774) and the client boundary"
  );
  // The site theme (SDL-773) is server-safe: no client directive, only react.
  const theme = await readFile(path.join(import.meta.dirname, "..", "dist", "site-theme.js"), "utf8");
  assert.ok(!/^["']use client["']/.test(theme), "site-theme.js must not be a client module");
  assert.deepEqual([...theme.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]), ["react", "./site-fonts.js"]);
  // Its font whitelist (SDL-774) is plain data: no import but the generated rows.
  const fonts = await readFile(path.join(import.meta.dirname, "..", "dist", "site-fonts.js"), "utf8");
  assert.deepEqual([...fonts.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]), ["./site-fonts-data.js"]);
  const published = await readFile(path.join(dist, "published-page.js"), "utf8");
  assert.ok(/^["']use client["'];/.test(published), "published-page.js is the client boundary");
  const engineRoot = await readFile(path.join(import.meta.dirname, "..", "..", "engine", "dist", "index.js"), "utf8");
  assert.ok(!/^["']use client["']/.test(engineRoot), "the engine core stays server-safe");
  const dataProvider = await readFile(path.join(import.meta.dirname, "..", "..", "engine", "dist", "providers", "data", "index.js"), "utf8");
  assert.ok(!/^["']use client["']/.test(dataProvider), "the public data provider stays server-safe");
});

// --- SDL-718: Components over pages-service (POST + key, id from the service) ---

const CWS = "11111111-2222-4333-8444-555555555555";
const NEW_ID = "0b9f6a0e-3c1d-4f7e-9a2b-5d6c7e8f9a0b";

type Call = { method: string; url: string; body: unknown };

function componentsFetch(script: Array<(call: Call) => Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const next = script.shift();
    if (!next) throw new Error(`unexpected request ${call.method} ${call.url}`);
    return next(call);
  };
  return { fetch: impl as typeof fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const blockSchema = (): SaunaSchema =>
  ({ version: 2, rootId: "r", parents: { r: null }, nodes: { r: { type: "Text", props: { text: "Hi" } } } }) as SaunaSchema;

test("SDL-718: component key — readable, transliterated, never empty, ≤120, matches the service alphabet", () => {
  assert.equal(studio.saunaComponentKey("Hero section"), "hero-section");
  assert.equal(studio.saunaComponentKey("  Цена / Тариф  "), "tsena-tarif");
  assert.equal(studio.saunaComponentKey("Йогурт"), "yogurt", "й is transliterated before NFKD splits it");
  assert.equal(studio.saunaComponentKey("Ёлка"), "elka");
  assert.equal(studio.saunaComponentKey("Қазақша Өнім"), "qazaqsha-onim");
  assert.equal(studio.saunaComponentKey("Café déjà vu"), "cafe-deja-vu");
  assert.equal(studio.saunaComponentKey("🔥🔥"), "component");
  assert.equal(studio.saunaComponentKey("--a__b--"), "a__b");
  const long = studio.saunaComponentKey("x".repeat(130) + " tail");
  assert.equal(long.length, 120);
  for (const name of ["Hero section", "Цена", "🔥", "a", "x".repeat(300), "Ab-_-", "_x_"]) {
    const key = studio.saunaComponentKey(name);
    assert.ok(studio.saunaIsComponentKey(key), `${JSON.stringify(name)} → ${key}`);
    assert.equal(studio.saunaComponentKey(name), key, "deterministic");
  }
});

test("SDL-718: component key — a taken key gets the next numeric suffix and still fits 120", () => {
  assert.equal(studio.saunaUniqueComponentKey("Hero", []), "hero");
  assert.equal(studio.saunaUniqueComponentKey("Hero", ["hero"]), "hero-2");
  assert.equal(studio.saunaUniqueComponentKey("Hero", ["hero", "hero-2", "hero-3"]), "hero-4");
  const base = "y".repeat(120);
  const key = studio.saunaUniqueComponentKey(base, [base]);
  assert.equal(key.length, 120);
  assert.ok(key.endsWith("-2") && studio.saunaIsComponentKey(key), key);
});

test("SDL-718: component name — trimmed, 1..200, the dialog's suggestion is the node's display name", () => {
  assert.deepEqual(studio.saunaCheckComponentName("  Hero  "), { ok: true, name: "Hero" });
  assert.equal(studio.saunaCheckComponentName("   ").ok, false);
  assert.equal(studio.saunaCheckComponentName("n".repeat(200)).ok, true);
  assert.equal(studio.saunaCheckComponentName("n".repeat(201)).ok, false);
  const s = schema();
  s.nodes.title.name = "Главный заголовок";
  assert.equal(studio.saunaComponentNameSuggestion(s, "title"), "Главный заголовок");
});

test("SDL-718: save as component — POST /pages/blocks with key, name, schema, workspace_id; id from the response; no PUT", async () => {
  const { fetch, calls } = componentsFetch([
    () => json(200, { success: true, data: [{ id: "a", key: "hero", name: "Hero" }] }),
    (call) => {
      const body = call.body as Record<string, unknown>;
      return json(201, { success: true, data: { id: NEW_ID, workspace_id: CWS, key: body.key, name: body.name, schema: body.schema, version: 1 } });
    },
  ]);
  const api = studio.createPagesComponentsApi({ apiBaseUrl: "/api/", workspaceId: CWS, fetch });
  const created = await api.saveAsComponent.create({ name: "  Hero ", schema: blockSchema() });
  assert.deepEqual(created, { id: NEW_ID, key: "hero-2" }, "the id is the service's, the key avoided the taken one");
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
    `GET /api/v1/pages/blocks?workspace_id=${CWS}`,
    "POST /api/v1/pages/blocks",
  ]);
  assert.deepEqual(calls[1].body, { workspace_id: CWS, key: "hero-2", name: "Hero", schema: blockSchema() });
  assert.ok(!calls.some((c) => c.method === "PUT" || c.method === "PATCH"), "no write under a client id");
});

test("EP-175: component group — options offer the existing groups and «Create group» for a new name", () => {
  const groups = studio.saunaComponentGroups([{ group: " Marketing " }, { group: "layout" }, { group: "MARKETING" }, { group: null }, {}]);
  assert.deepEqual(groups, ["layout", "Marketing"], "distinct, trimmed, case-insensitive, sorted");
  assert.deepEqual(studio.saunaGroupOptions(groups, ""), [{ kind: "none" }, { kind: "group", group: "layout" }, { kind: "group", group: "Marketing" }]);
  assert.deepEqual(studio.saunaGroupOptions(groups, "mark"), [{ kind: "group", group: "Marketing" }, { kind: "create", group: "mark" }]);
  assert.deepEqual(studio.saunaGroupOptions(groups, " marketing "), [{ kind: "group", group: "Marketing" }], "an existing name is not offered for creation");
  assert.deepEqual(studio.saunaGroupOptions([], "Promotions"), [{ kind: "create", group: "Promotions" }]);
});

test("EP-175: save as component — the group goes into the POST only when set; groups() reads the list", async () => {
  const { fetch, calls } = componentsFetch([
    () => json(200, { success: true, data: [] }),
    (call) => {
      const body = call.body as Record<string, unknown>;
      return json(201, { success: true, data: { id: NEW_ID, key: body.key, name: body.name, group: body.group ?? null } });
    },
    () => json(200, { success: true, data: [{ id: "a", key: "a", name: "A", group: "Promotions" }, { id: "b", key: "b", name: "B", group: null }] }),
  ]);
  const api = studio.createPagesComponentsApi({ apiBaseUrl: "/api/", workspaceId: CWS, fetch });
  await api.saveAsComponent.create({ name: "Hero", schema: blockSchema(), group: "  Promotions " });
  assert.deepEqual(calls[1].body, { workspace_id: CWS, key: "hero", name: "Hero", group: "Promotions", schema: blockSchema() });
  assert.deepEqual(await api.saveAsComponent.groups!(), ["Promotions"]);
});

test("SDL-718: save as component — a key taken in between (409 block_key_taken) is retried with the next suffix", async () => {
  const { fetch, calls } = componentsFetch([
    () => json(200, { success: true, data: [] }),
    () => json(409, { success: false, error: "block_key_taken", message: "taken" }),
    (call) => json(201, { success: true, data: { id: NEW_ID, workspace_id: CWS, key: (call.body as { key: string }).key, name: "Hero" } }),
  ]);
  const api = studio.createPagesComponentsApi({ apiBaseUrl: "/api", workspaceId: CWS, fetch });
  const created = await api.saveAsComponent.create({ name: "Hero", schema: blockSchema() });
  assert.deepEqual(created, { id: NEW_ID, key: "hero-2" });
  assert.deepEqual(calls.filter((c) => c.method === "POST").map((c) => (c.body as { key: string }).key), ["hero", "hero-2"]);
});

test("SDL-718: save as component — other failures reject with the service's code; nothing is sent for an invalid schema or name", async () => {
  const failing = componentsFetch([
    () => json(200, { success: true, data: [] }),
    () => json(400, { success: false, error: "invalid_block_key", message: "bad key" }),
  ]);
  const api = studio.createPagesComponentsApi({ apiBaseUrl: "/api", workspaceId: CWS, fetch: failing.fetch });
  await assert.rejects(api.saveAsComponent.create({ name: "Hero", schema: blockSchema() }), (e: unknown) => {
    assert.ok(studio.isPagesComponentsError(e));
    assert.equal(e.status, 400);
    assert.equal(e.code, "invalid_block_key");
    return true;
  });

  const silent = componentsFetch([]);
  const api2 = studio.createPagesComponentsApi({ apiBaseUrl: "/api", workspaceId: CWS, fetch: silent.fetch });
  const badParams = { ...blockSchema(), params: [{ name: "t", nodeId: "r", prop: "text", type: "number", default: "x" }] } as SaunaSchema;
  await assert.rejects(api2.saveAsComponent.create({ name: "Hero", schema: badParams }), /Invalid block parameters/);
  await assert.rejects(api2.saveAsComponent.create({ name: "  ", schema: blockSchema() }), /name/);
  assert.equal(silent.calls.length, 0);
});

test("SDL-718: save as component — a service that always answers 409 block_key_taken gets exactly 4 POSTs, then the refusal", async () => {
  const taken = () => json(409, { success: false, error: "block_key_taken", message: "taken" });
  const { fetch, calls } = componentsFetch([
    () => json(200, { success: true, data: [] }),
    taken, taken, taken, taken,
    () => json(201, { success: true, data: { id: NEW_ID, key: "never", name: "Hero" } }),
  ]);
  const api = studio.createPagesComponentsApi({ apiBaseUrl: "/api", workspaceId: CWS, fetch });
  await assert.rejects(api.saveAsComponent.create({ name: "Hero", schema: blockSchema() }), (e: unknown) => {
    assert.ok(studio.isPagesComponentsError(e));
    assert.equal(e.code, "block_key_taken");
    assert.equal(e.status, 409);
    return true;
  });
  const posts = calls.filter((c) => c.method === "POST").map((c) => (c.body as { key: string }).key);
  assert.deepEqual(posts, ["hero", "hero-2", "hero-3", "hero-4"]);
});

test("SDL-718: save as component — the answer's workspace_id is not cross-checked (no orphan left behind a refusal)", async () => {
  const { fetch } = componentsFetch([
    () => json(200, { success: true, data: [] }),
    () => json(201, { success: true, data: { id: NEW_ID, workspace_id: CWS.toUpperCase(), key: "hero", name: "Hero" } }),
  ]);
  const api = studio.createPagesComponentsApi({ apiBaseUrl: "/api", workspaceId: CWS, fetch });
  assert.deepEqual(await api.saveAsComponent.create({ name: "Hero", schema: blockSchema() }), { id: NEW_ID, key: "hero" });
});

test("SDL-718: saveNodeAsComponent — the Ref on the page points at created.id, written after the Component", async () => {
  const store = createStudioStore({ initialSchema: schema() });
  const seen: string[] = [];
  const api = {
    create: async (input: { name: string; schema: SaunaSchema }) => {
      seen.push(`create:${input.name}:${input.schema.nodes[input.schema.rootId]?.type}`);
      assert.equal(store.getState().schema.nodes.title.type, "Heading", "the page is untouched until the write resolves");
      return { id: NEW_ID, key: "title-key" };
    },
  };
  const result = await studio.saunaSaveNodeAsComponent({ store, api, nodeId: "title", name: "  Title  " });
  assert.deepEqual(result, { ok: true, id: NEW_ID, key: "title-key" });
  assert.deepEqual(seen, ["create:Title:Heading"]);
  const ref = store.getState().schema.nodes.title;
  assert.equal(ref.type, "Ref");
  assert.deepEqual(ref.props, { blockId: NEW_ID }, "blockId is the storage id, never the key");
});

test("SDL-718: saveNodeAsComponent — a failed write leaves the page as it was and says so in words about the component", async () => {
  const store = createStudioStore({ initialSchema: schema() });
  const before = JSON.stringify(store.getState().schema);
  const failing = studio.createPagesComponentsApi({
    apiBaseUrl: "/api",
    workspaceId: CWS,
    fetch: componentsFetch([
      () => json(200, { success: true, data: [] }),
      () => json(422, { success: false, error: "unprocessable", message: "POST failed" }),
    ]).fetch,
  });
  const result = await studio.saunaSaveNodeAsComponent({ store, api: failing.saveAsComponent, nodeId: "title", name: "Title" });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(store.getState().schema), before);
  assert.ok(!result.ok && result.field === "storage");
  assert.equal(!result.ok && result.message, "Couldn't save the component. Please try again.");
  const empty = await studio.saunaSaveNodeAsComponent({ store, api: failing.saveAsComponent, nodeId: "title", name: " " });
  assert.ok(!empty.ok && empty.field === "name");
});

test("SDL-718: error text — no endpoint, no status, no 'block'; names the broken field", () => {
  const E = studio.PagesComponentsError;
  const texts = [
    studio.saunaSaveComponentErrorText(new E(422, "unprocessable", "POST /pages/blocks failed: 422")),
    studio.saunaSaveComponentErrorText(new E(0, "invalid_schema", "x", [{ path: "$.params[1].default", message: "m" }])),
    studio.saunaSaveComponentErrorText(new E(0, "invalid_schema", "x", [{ path: "$.nodes.n1.props.href", message: "m" }])),
    studio.saunaSaveComponentErrorText(new E(409, "block_key_taken", "POST /pages/blocks failed: 409")),
    studio.saunaSaveComponentErrorText(new E(403, "forbidden", "x")),
    studio.saunaSaveComponentErrorText(new TypeError("fetch failed")),
  ];
  assert.equal(texts[1], "Couldn't save the component: parameter 2 has an invalid default.");
  assert.match(texts[2], /“href”/);
  assert.match(texts[4], /access/);
  for (const t of texts) {
    assert.match(t, /component/i, t);
    assert.doesNotMatch(t, /block|POST|\/pages|\b4\d\d\b|\b5\d\d\b/i, t);
  }
  assert.equal(
    studio.saunaSaveComponentErrorText(new E(0, "invalid_name", "x", [{ path: "name", message: "Give the component a name." }])),
    "Give the component a name."
  );
});

test("SDL-718: library — list maps the service's blocks (id, name, key), load reads by id and answers null on 404", async () => {
  const { fetch, calls } = componentsFetch([
    () => json(200, { success: true, data: [{ id: NEW_ID, workspace_id: CWS, key: "hero", name: "Hero", schema: {}, version: 3 }, { bogus: true }] }),
    () => json(200, { success: true, data: { id: NEW_ID, workspace_id: CWS, key: "hero", name: "Hero", schema: blockSchema(), version: 3 } }),
    () => json(404, { success: false, error: "not_found" }),
  ]);
  const api = studio.createPagesComponentsApi({ apiBaseUrl: "/api", workspaceId: CWS, fetch });
  assert.deepEqual(await api.list(), [{ id: NEW_ID, name: "Hero", key: "hero" }]);
  assert.deepEqual(await api.load(NEW_ID), blockSchema());
  assert.equal(await api.load("0b9f6a0e-3c1d-4f7e-9a2b-000000000000"), null);
  assert.deepEqual(calls.map((c) => c.method), ["GET", "GET", "GET"]);
  assert.equal(calls[1].url, `/api/v1/pages/blocks/${NEW_ID}?workspace_id=${CWS}`);
  assert.deepEqual(studio.saunaFilterComponents(await Promise.resolve([{ id: NEW_ID, name: "Шапка", key: "shapka" }]), "shap").length, 1, "search reads the key too");
});

test("SDL-718: Ref is in the pages catalog as an Element — not insertable, not offered by the Insert modal", async () => {
  const { PAGES_BLOCKS } = await import("@markerloop/studio/catalog");
  const ref = PAGES_BLOCKS.find((b) => b.type === "Ref");
  assert.ok(ref, "Ref is missing from PAGES_BLOCKS");
  assert.equal(ref.meta?.insertable, false);
  assert.equal(ref.staticProps?.safeParse({ blockId: NEW_ID, params: { title: "x" } }).success, true);
  assert.equal(ref.staticProps?.safeParse({ blockId: "hero" }).success, false);
});

// --- SDL-690: page behaviour slots survive an editing session ---------------
//
// `queries`/`state` (document root) and `bind`/`on` (nodes) are interpreted by
// nobody yet; the editor's only duty is not to lose them. A session of the ops
// an author actually performs, then undo/redo, then the document the
// auto-saver would hand to the provider: every slot still there, by value.

test("SDL-690: an editing session keeps queries/state/bind/on, root and nested", () => {
  const doc = {
    version: 2,
    rootId: "root",
    queries: { feed: { collection: "posts", limit: 5 } },
    state: { tab: "all" },
    nodes: {
      root: { type: "Box", children: ["title", "card"], on: { mount: [{ do: "query.refresh", query: "feed" }] } },
      title: { type: "Text", props: { children: "Hello" }, bind: { children: "queries.feed.total" } },
      card: { type: "Box", children: ["deep"], on: { click: [{ do: "state.set", path: "tab", value: "mine" }] } },
      deep: { type: "Text", props: { children: "deep" }, bind: { children: "viewer.name" }, on: { hover: null } },
    },
    parents: { root: null, title: "root", card: "root", deep: "card" },
  } satisfies SaunaSchema;
  const expected = structuredClone(doc);
  const store = createStudioStore({ initialSchema: structuredClone(doc) });
  const s = () => store.getState();
  s().applyOp({ kind: "updateNodePropsPartial", nodeId: "title", patch: { children: "Hi" } });
  s().applyOp({ kind: "updateNodePropsPartial", nodeId: "deep", patch: { children: "deeper" } });
  s().applyOp({ kind: "renameNode", nodeId: "deep", name: "Viewer name" });
  s().applyOp({ kind: "setVisibilityMode", nodeId: "card", mode: "hybrid" });
  s().applyOp({ kind: "setScreenProps", nodeId: "title", screen: "mobile", patch: { children: "Hi!" } });
  s().applyOp({ kind: "reparent", nodeId: "deep", newParentId: "root", index: 0 });
  s().applyOp({ kind: "duplicate", nodeId: "card" });
  assert.ok(s().history.past.length >= 7, `ops did not apply: ${s().history.past.length} frames`);
  s().undo();
  s().undo();
  s().redo();
  s().redo();

  // What the auto-saver PUTs is the store's schema, serialized.
  const saved = JSON.parse(JSON.stringify(s().schema)) as SaunaSchema;
  assert.deepEqual(saved.queries, expected.queries);
  assert.deepEqual(saved.state, expected.state);
  for (const id of ["root", "title", "card", "deep"] as const) {
    const want = expected.nodes[id] as { bind?: unknown; on?: unknown };
    assert.deepEqual(saved.nodes[id]?.bind, want.bind, `bind of ${id}`);
    assert.deepEqual(saved.nodes[id]?.on, want.on, `on of ${id}`);
  }
  // The duplicate is a copy, slots included.
  const copies = Object.entries(saved.nodes).filter(([id, n]) => id !== "card" && n.type === "Box" && n.on !== undefined && id !== "root");
  assert.equal(copies.length, 1, "the duplicated card carries its `on`");

  // A document without slots never gains one from the same session.
  const plain = createStudioStore({ initialSchema: schema() });
  plain.getState().applyOp({ kind: "updateNodePropsPartial", nodeId: "title", patch: { children: "Hi" } });
  const out = JSON.parse(JSON.stringify(plain.getState().schema)) as SaunaSchema;
  assert.ok(!("queries" in out) && !("state" in out), "invented a root slot");
  assert.ok(Object.values(out.nodes).every((n) => !("bind" in n) && !("on" in n)), "invented a node slot");
});

// --- SDL-721: a Block rooted at a leaf is drawn, not «empty» ------------------

async function mountRootOnly(doc: SaunaSchema, rootIsContent?: boolean): Promise<{ root: Root; host: HTMLElement }> {
  const store = createStudioStore({ initialSchema: doc });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const blocks = [
    { type: "Section", displayName: "Section" },
    { type: "Text", displayName: "Text" },
  ] as unknown as React.ComponentProps<typeof studio.SaunaStudio>["blocks"];
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <studio.SaunaStudio
        store={store}
        blocks={blocks}
        rootIsContent={rootIsContent}
        renderPreview={(s: SaunaSchema) => <div data-test="doc">{Object.keys(s.nodes).length}</div>}
      />
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { root, host };
}

test("SDL-721: a Block whose root is its Text draws it; a page and a bare Block stay «empty»", async () => {
  // What «Save as component» stores for a saved Text (extractBlockSchema).
  const leaf = {
    version: 2,
    rootId: "t",
    nodes: { t: { type: "Text", props: { level: "h2", text: "Hello" } } },
    parents: { t: null },
  } as unknown as SaunaSchema;
  const bare = { version: 2, rootId: "s", nodes: { s: { type: "Section" } }, parents: { s: null } } as unknown as SaunaSchema;
  const cases: Array<[string, SaunaSchema, boolean | undefined, boolean]> = [
    ["a Block rooted at a Text", leaf, true, false],
    ["a page with a childless root (SDL-375)", leaf, undefined, true],
    ["a Block whose root carries nothing", bare, true, true],
  ];
  for (const [name, doc, rootIsContent, wantEmpty] of cases) {
    const m = await mountRootOnly(doc, rootIsContent);
    try {
      const empty = m.host.querySelector("[data-sauna-canvas-empty]") !== null;
      assert.equal(empty, wantEmpty, `${name}: empty card ${empty ? "shown" : "missing"}`);
      // The root row is addressed by data-sauna-outline-node; the drag
      // wrapper data-sauna-outline-row exists only for non-root rows (the
      // e2e selector that missed this is sdl721-block-editor.auth.spec.ts).
      const rootId = doc.rootId;
      assert.equal(m.host.querySelector(`[data-sauna-outline-node="${rootId}"]`) !== null, true, `${name}: no root outline node`);
      assert.equal(m.host.querySelector(`[data-sauna-outline-row="${rootId}"]`) === null, true, `${name}: root got a drag row`);
    } finally {
      await act(async () => m.root.unmount());
      m.host.remove();
    }
  }
});

// --- SDL-775: style props of the first-wave Elements -----------------------

test("SDL-775: Section — primary paints the band and swaps the pair one level down; width caps the content; absent = markup as before", async () => {
  const { Section, SECTION_BACKGROUNDS, SECTION_WIDTHS } = await import("@markerloop/studio/catalog");
  const { renderToStaticMarkup } = await import("react-dom/server");
  assert.deepEqual([...SECTION_BACKGROUNDS], ["default", "muted", "primary", "dark"]);
  assert.deepEqual([...SECTION_WIDTHS], ["narrow", "default", "wide", "full"]);
  const md = (p: Record<string, unknown>) => renderToStaticMarkup(<Section {...p}><p>x</p></Section>);
  const plain = md({});
  assert.ok(!plain.includes("data-pages-section-content"), plain);
  assert.match(plain, /<section[^>]*><p>x<\/p><\/section>/, "no inner column without width/primary");
  const primary = md({ background: "primary" });
  assert.match(primary, /data-background="primary"/);
  assert.match(primary, /background:var\(--primary\);color:var\(--primary-foreground\);--pages-band-fill:var\(--primary\);--pages-band-ink:var\(--primary-foreground\)/, primary);
  assert.match(primary, /data-pages-section-content="" style="--foreground:var\(--pages-band-ink\);--muted-foreground:var\(--pages-band-ink\);--primary:var\(--pages-band-ink\);--primary-foreground:var\(--pages-band-fill\)/, primary);
  const dark = md({ background: "dark" });
  assert.match(dark, /class="dark"/);
  assert.match(md({ background: "muted" }), /background:var\(--muted\)/);
  for (const [w, px] of [["narrow", "560px"], ["default", "760px"], ["wide", "1040px"]] as const) {
    const html = md({ width: w });
    assert.match(html, new RegExp(`data-width="${w}"`), html);
    assert.match(html, new RegExp(`data-pages-section-content="" style="max-width:${px};margin-inline:auto"`), html);
    assert.match(html, /padding-inline:24px/);
  }
  const full = md({ width: "full" });
  assert.match(full, /padding-inline:0px/, full);
  assert.ok(!/max-width/.test(full), full);
  assert.equal(md({ width: "huge" }), plain, "an unknown width is ignored");
});

test("SDL-775: the inspector — style enums are segmented, Box columns write a number, Image aspect offers four", async () => {
  const { PAGES_BLOCKS } = await import("@markerloop/studio/catalog");
  const doc: SaunaSchema = {
    version: 2,
    rootId: "box",
    nodes: {
      box: { type: "Box", props: { direction: "column" }, children: ["pic", "txt"] },
      pic: { type: "Image", props: { alt: "", aspect: "3 / 2" } },
      txt: { type: "Text", props: { level: "body", text: "t" } },
    },
    parents: { box: null, pic: "box", txt: "box" },
  } as SaunaSchema;
  const store = createStudioStore({ initialSchema: doc });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = async (id: string) => {
    await act(async () => {
      store.getState().selectNode(id);
      root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={PAGES_BLOCKS} bare />);
    });
  };
  try {
    await render("box");
    const cols = host.querySelector('[data-sauna-prop="columns"]');
    assert.ok(cols, host.innerHTML.slice(0, 400));
    const items = [...cols.querySelectorAll("button")];
    assert.deepEqual(items.map((b) => b.textContent), ["1", "2", "3", "4"]);
    await act(async () => { items[2]!.click(); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(store.getState().schema.nodes.box!.props!.columns, 3, "a number in the page");
    for (const f of ["background", "radius"]) {
      assert.ok(host.querySelector(`[data-sauna-prop="${f}"] [role="group"], [data-sauna-prop="${f}"] button`), `${f} is segmented`);
    }
    assert.ok(host.querySelector('[data-sauna-prop="border"] input[type="checkbox"]'), "border is a switch-like checkbox");
    await render("pic");
    const aspect = host.querySelector<HTMLSelectElement>('[data-sauna-prop="aspect"] select');
    assert.ok(aspect, "aspect is a select");
    assert.deepEqual([...aspect.options].map((o) => o.value), ["", "auto", "1 / 1", "4 / 3", "16 / 9", "3 / 2"], "four offered + the stored one");
    assert.deepEqual(
      [...host.querySelectorAll('[data-sauna-prop="radius"] button')].map((b) => b.textContent),
      ["theme", "none", "full"]
    );
    await render("txt");
    for (const [f, vals] of [["color", ["default", "muted", "primary", "inverse"]], ["align", ["left", "center", "right"]], ["weight", ["normal", "medium", "bold"]]] as const) {
      assert.deepEqual([...host.querySelectorAll(`[data-sauna-prop="${f}"] button`)].map((b) => b.textContent), [...vals], f);
    }
    const level = host.querySelector<HTMLSelectElement>('[data-sauna-prop="level"] select');
    assert.ok(level && [...level.options].some((o) => o.value === "display"), "display is a level");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("SDL-950: the inspector offers the theme's custom colours on Text.color and Box.background; a swatch writes the key", async () => {
  const { PAGES_BLOCKS } = await import("@markerloop/studio/catalog");
  const doc: SaunaSchema = {
    version: 2,
    rootId: "box",
    nodes: {
      box: { type: "Box", props: { direction: "column" }, children: ["txt"] },
      txt: { type: "Text", props: { level: "body", text: "t" } },
    },
    parents: { box: null, txt: "box" },
  } as SaunaSchema;
  const store = createStudioStore({ initialSchema: doc });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const colors = [{ key: "brandBlue", label: "Brand blue", color: "#1d4ed8" }];
  const render = async (id: string, themeColors?: typeof colors) => {
    await act(async () => {
      store.getState().selectNode(id);
      root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={PAGES_BLOCKS} bare themeColors={themeColors} />);
    });
  };
  try {
    await render("txt");
    assert.equal(host.querySelector("[data-sauna-theme-colors]"), null, "no custom colours → the segmented row as before");
    await render("txt", colors);
    const swatch = host.querySelector<HTMLButtonElement>('[data-sauna-theme-colors="color"] [data-theme-color="brandBlue"]');
    assert.ok(swatch, host.innerHTML.slice(0, 600));
    assert.deepEqual([...host.querySelectorAll('[data-sauna-prop="color"] button')].map((b) => b.textContent), ["default", "muted", "primary", "inverse"], "built-ins still segmented");
    await act(async () => { swatch.click(); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(store.getState().schema.nodes.txt!.props!.color, "brandBlue", "the key goes into the page");
    await render("txt", colors);
    const pressed = host.querySelector<HTMLButtonElement>('[data-theme-color="brandBlue"]');
    assert.equal(pressed?.getAttribute("aria-pressed"), "true");
    await act(async () => { pressed!.click(); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(store.getState().schema.nodes.txt!.props!.color, undefined, "pressing the pressed one clears it");
    await render("box", colors);
    assert.ok(host.querySelector('[data-sauna-theme-colors="background"] [data-theme-color="brandBlue"]'), "Box.background too");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("SDL-950 review: Section.background takes a custom theme colour key; a key the theme lacks draws the default band", async () => {
  const { SectionBlock, Section, PAGES_BLOCKS } = await import("@markerloop/studio/catalog");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const parse = (background: unknown) => SectionBlock.staticProps!.safeParse({ background }).success;
  for (const v of ["default", "muted", "primary", "dark", "brandBlue", "sea-2"]) assert.equal(parse(v), true, v);
  // pages-service colorEnum: reserved words, roles and colour values are refused.
  for (const v of ["primaryForeground", "inherit", "None", "#1d4ed8", "Brand", "x y", ""]) assert.equal(parse(v), false, v);
  const html = (background: string) => renderToStaticMarkup(<Section background={background}>x</Section>);
  const keyed = /<section[^>]*>/.exec(html("brandBlue"))?.[0] ?? "";
  // No fallback in var(): a key the theme does not have leaves background at
  // its initial value — transparent, the `default` band — and no error.
  assert.match(keyed, /background:var\(--pages-color-brandBlue\)/, keyed);
  assert.ok(!/class="dark"/.test(keyed), keyed);
  assert.equal(html("default"), renderToStaticMarkup(<Section>x</Section>), "the default band unchanged");
  // A value outside the rule never reaches a variable name.
  assert.ok(!html("x}y{").includes("--pages-color"), html("x}y{"));
  // The inspector: the swatches on Section.background too.
  const doc = { version: 2, rootId: "s", nodes: { s: { type: "Section", props: {} } }, parents: { s: null } } as SaunaSchema;
  const store = createStudioStore({ initialSchema: doc });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      store.getState().selectNode("s");
      root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={PAGES_BLOCKS} bare themeColors={[{ key: "brandBlue", label: "Brand blue", color: "#1d4ed8" }]} />);
    });
    const swatch = host.querySelector<HTMLButtonElement>('[data-sauna-theme-colors="background"] [data-theme-color="brandBlue"]');
    assert.ok(swatch, "Section.background offers the theme's colours");
    assert.equal(swatch.style.width, "26px", "the assembled studio's swatch size");
    await act(async () => { swatch.click(); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(store.getState().schema.nodes.s!.props!.background, "brandBlue");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("SDL-950 review: the canvas paints the host's custom colours without the site theme — light on the page, dark on a dark band", async () => {
  const colors = [
    { key: "brandBlue", label: "Brand blue", light: "#1D4ED8", dark: "#60a5fa" },
    { key: "bad key", label: "x", light: "#000000", dark: "#000000" },
    // The #rrggbb check is the only guard of the canvas sheet against CSS
    // injection through a value (SDL-950 review, round 2): both values bad.
    { key: "evil", label: "x", light: "red}body{x:y", dark: "#000000}body{x:y" },
  ];
  assert.equal(studio.siteThemeCustomColorCss([]), null);
  for (const mode of ["light", "dark"] as const) {
    assert.deepEqual(Object.keys(studio.siteThemeCustomColorVariables(colors, mode)), ["--pages-color-brandBlue"], `${mode}: a bad value never reaches the sheet`);
  }
  // Each mode's value is checked on its own: a good light one stays, the bad dark one goes.
  const half = [{ key: "half", label: "x", light: "#111111", dark: "#000000}body{x:y" }];
  assert.deepEqual(studio.siteThemeCustomColorVariables(half, "light"), { "--pages-color-half": "#111111" });
  assert.deepEqual(studio.siteThemeCustomColorVariables(half, "dark"), {});
  assert.ok(!studio.siteThemeCustomColorCss(half)!.includes("x:y"));
  assert.equal(studio.siteThemeCustomColorCss(undefined), null);
  assert.equal(
    studio.siteThemeCustomColorCss(colors),
    `:root{--pages-color-brandBlue:#1d4ed8}\n${studio.SITE_THEME_DARK_SELECTOR}{--pages-color-brandBlue:#60a5fa}`
  );
  const store = createStudioStore({
    initialSchema: { version: 2, rootId: "s", nodes: { s: { type: "Section", props: { background: "brandBlue" } } }, parents: { s: null } } as SaunaSchema,
  });
  const { Section } = await import("@markerloop/studio/catalog");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const mount = async (themeColors?: typeof colors) => {
    await act(async () => {
      root.render(
        <studio.SaunaStudio
          store={store}
          blocks={[{ type: "Section", displayName: "Section" }] as unknown as React.ComponentProps<typeof studio.SaunaStudio>["blocks"]}
          themeColors={themeColors}
          // The Section is the root here: draw it rather than the empty card.
          rootIsContent
          renderPreview={(s: SaunaSchema) => <Section background={String(s.nodes.s!.props!.background)}>band</Section>}
        />
      );
    });
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return host.querySelector("iframe")!.contentDocument!;
  };
  try {
    const frameDoc = await mount(colors);
    const sheet = frameDoc.body.querySelector("style[data-pages-theme-colors]");
    assert.ok(sheet, "the custom colours' sheet inside the frame");
    assert.equal(sheet.textContent, studio.siteThemeCustomColorCss(colors));
    assert.ok(!/body\{|x:y|red|--pages-color-evil/.test(sheet.textContent ?? ""), `no injected rule: ${sheet.textContent}`);
    assert.equal(frameDoc.querySelector("style[data-pages-theme]") === null, true, "the rest of the theme stays off the canvas");
    assert.equal(document.querySelector("style[data-pages-theme-colors]") === null, true, "the host document is not painted");
    const band = frameDoc.querySelector<HTMLElement>("section");
    assert.equal(band?.style.background, "var(--pages-color-brandBlue)");
    const bare = await mount(undefined);
    assert.equal(bare.body.querySelector("style[data-pages-theme-colors]") === null, true, "no colours → no sheet");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

// --- SDL-951: Image focus / width / border / shadow, before its panel (SDL-956) ---

test("SDL-951: until SDL-956 the inspector shows the six new Image props as raw auto-form rows; what they write is NOT clamped", async () => {
  const { PAGES_BLOCKS } = await import("@markerloop/studio/catalog");
  const { ImageBlock } = await import("@markerloop/engine");
  const { Image } = await import("@markerloop/engine/react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const doc = {
    version: 2,
    rootId: "pic",
    nodes: { pic: { type: "Image", props: { src: "https://cdn.example/a.png", alt: "", aspect: "16 / 9" } } },
    parents: { pic: null },
  } as SaunaSchema;
  const store = createStudioStore({ initialSchema: doc });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const props = () => store.getState().schema.nodes.pic!.props as Record<string, unknown>;
  const setValue = async (el: HTMLInputElement | HTMLTextAreaElement, text: string, blur = false) => {
    const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
      el.dispatchEvent(new window.Event("input", { bubbles: true }));
      if (blur) el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
    });
  };
  const draw = async () => {
    await act(async () => {
      store.getState().selectNode("pic");
      root.render(<studio.SaunaPropertiesAutoForm store={store} blocks={PAGES_BLOCKS} bare />);
    });
  };
  try {
    await draw();
    const row = (f: string) => host.querySelector(`[data-sauna-prop="${f}"]`);
    // The rows as they are: generic editors from the zod schema, no Image panel yet.
    assert.ok(row("focus")?.querySelector("textarea"), "focus is a JSON textarea");
    const width = row("width")?.querySelector<HTMLSelectElement>("select");
    assert.ok(width, "width is a select");
    assert.deepEqual([...width.options].map((o) => o.value).filter(Boolean), ["fill", "hug", "fixed"]);
    assert.ok(row("fixedWidth")?.querySelector('input[type="number"]'), "fixedWidth is a number input");
    assert.ok(row("border")?.querySelector('input[type="checkbox"]'), "border is a checkbox");
    const color = row("borderColor")?.querySelector<HTMLSelectElement>("select");
    assert.ok(color, "borderColor is a select");
    assert.deepEqual([...color.options].map((o) => o.value).filter(Boolean).sort(), [...studio.SITE_THEME_ROLES].sort(), "the theme's roles");
    assert.ok(row("shadow")?.querySelector('input[type="checkbox"]'), "shadow is a checkbox");

    // In range: what the rows write passes the schema and draws its CSS.
    await setValue(row("fixedWidth")!.querySelector<HTMLInputElement>("input")!, "320");
    await draw();
    await setValue(row("focus")!.querySelector<HTMLTextAreaElement>("textarea")!, '{"x": 30, "y": 70}', true);
    assert.deepEqual(props().focus, { x: 30, y: 70 });
    assert.equal(props().fixedWidth, 320);
    assert.ok(ImageBlock.staticProps!.safeParse(props()).success, JSON.stringify(props()));

    // Out of range: the rows write it as typed (no clamp, the JSON field accepts any JSON).
    // The schema refuses it, and the engine draws no CSS of it: fixedWidth falls back to 480,
    // a malformed focus gives no object-position.
    await draw();
    await setValue(row("fixedWidth")!.querySelector<HTMLInputElement>("input")!, "10");
    await draw();
    await setValue(row("focus")!.querySelector<HTMLTextAreaElement>("textarea")!, '{"x": 500}', true);
    assert.equal(props().fixedWidth, 10, "written unclamped");
    assert.deepEqual(props().focus, { x: 500 }, "written as typed");
    assert.ok(!ImageBlock.staticProps!.safeParse(props()).success, "the schema refuses it");
    const html = renderToStaticMarkup(<Image {...(props() as object)} width="fixed" />);
    assert.match(html, /width:480px/, html);
    assert.ok(!/object-position/.test(html), html);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("SDL-951: IMAGE_BORDER_COLORS is the theme's roles, each drawn as the role's own (first) variable", async () => {
  const { IMAGE_BORDER_COLORS } = await import("@markerloop/engine");
  const { Image } = await import("@markerloop/engine/react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  assert.deepEqual([...IMAGE_BORDER_COLORS], [...studio.SITE_THEME_ROLES]);
  for (const role of studio.SITE_THEME_ROLES) {
    const own = studio.SITE_THEME_ROLE_VARIABLES[role][0]!;
    const html = renderToStaticMarkup(<Image src="https://cdn.example/a.png" border borderColor={role} />);
    assert.ok(html.includes(`border:1px solid var(${own})`), `${role} → ${own}: ${html}`);
  }
});

// --- run ------------------------------------------------------------------

// --- SDL-773: the published site theme → the kit's CSS variables ----------------

/** oklch(L 0 h) of the kit → #rrggbb. Achromatic only: every themed kit role is. */
function achromaticOklchToHex(value: string): string | null {
  const m = /^oklch\(\s*([\d.]+)\s+(0|none)\s+(?:[\d.]+|none)\s*\)$/.exec(value.trim());
  if (!m) return null;
  const lin = Number(m[1]) ** 3; // oklab L, a = b = 0 → l = m = s = L³ → linear sRGB r = g = b
  const srgb = lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055;
  const byte = Math.round(Math.min(1, Math.max(0, srgb)) * 255).toString(16).padStart(2, "0");
  return `#${byte}${byte}${byte}`;
}

async function kitPublicSets(): Promise<{ light: Record<string, string>; dark: Record<string, string> }> {
  const css = await readFile(path.join(import.meta.dirname, "..", "..", "ui", "src", "ui", "internal", "styles", "globals.css"), "utf8");
  const read = (start: string): Record<string, string> => {
    const from = css.indexOf(start);
    assert.ok(from >= 0, `kit block ${start} not found`);
    const body = css.slice(from + start.length, css.indexOf("}", from));
    const out: Record<string, string> = {};
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  };
  return { light: read("\n:root {"), dark: read("\n.dark {") };
}

/** `{selector{a:b;c:d}}` blocks of the theme sheet → selector → variables. */
function sheetBlocks(css: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars: Record<string, string> = {};
    for (const decl of m[2].split(";")) {
      const i = decl.indexOf(":");
      vars[decl.slice(0, i)] = decl.slice(i + 1);
    }
    out[m[1].trim()] = vars;
  }
  return out;
}

test("SDL-773: site theme — the default theme IS the kit's public set (colours within 1/255, radius, shadow, type, density)", async () => {
  const { SITE_THEME_DEFAULT, SITE_THEME_ROLE_VARIABLES, SITE_THEME_ROLES, siteThemeCss } = studio;
  const kit = await kitPublicSets();
  // Declared deviations (pages-service models.DefaultSiteTheme): textMuted.light is
  // the AA-passing #767676, border.dark the kit's 10% white flattened onto #111.
  const deviations = new Set(["textMuted.light", "border.dark"]);
  const css = siteThemeCss(SITE_THEME_DEFAULT);
  assert.ok(css);
  const blocks = sheetBlocks(css);
  const root = blocks[":root"];
  const dark = blocks[studio.SITE_THEME_DARK_SELECTOR];
  assert.ok(root && dark, `sheet blocks: ${Object.keys(blocks).join(" | ")}`);
  let compared = 0;
  for (const role of SITE_THEME_ROLES) {
    for (const mode of ["light", "dark"] as const) {
      for (const name of SITE_THEME_ROLE_VARIABLES[role]) {
        const ours = (mode === "light" ? root : dark)[name];
        assert.equal(ours, SITE_THEME_DEFAULT.colors[role][mode], `${name} (${mode}) is the role ${role}`);
        if (deviations.has(`${role}.${mode}`)) continue;
        const kitHex = achromaticOklchToHex(kit[mode][name] ?? "");
        assert.ok(kitHex, `kit ${mode} ${name} = ${kit[mode][name]} is not an achromatic oklch`);
        const diff = Math.abs(parseInt(kitHex.slice(1, 3), 16) - parseInt(ours.slice(1, 3), 16));
        assert.ok(diff <= 1, `${name} (${mode}): theme ${ours}, kit ${kit[mode][name]} = ${kitHex}`);
        compared++;
      }
    }
  }
  assert.ok(compared >= 25, `compared ${compared} variables`);
  // The kit's radius is 0.625rem with calc() steps; the default writes exactly that.
  assert.equal(root["--radius"], kit.light["--radius"]);
  assert.equal(root["--radius-small"], kit.light["--radius-small"].replace("var(--radius)", "0.625rem"));
  assert.equal(root["--radius-medium"], kit.light["--radius-medium"].replace("var(--radius)", "0.625rem"));
  assert.equal(root["--radius-xlarge"], kit.light["--radius-xlarge"].replace("var(--radius)", "0.625rem"));
  assert.equal(root["--surface-shadow"], kit.light["--surface-shadow"]);
  assert.equal(root["--elevated-shadow"], kit.light["--elevated-shadow"]);
  assert.equal(root["--pages-density"], "1");
  // Type scale `default` = the fallbacks the engine's Text primitive carries.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PRIMITIVE_REGISTRY } = await import("@markerloop/engine/react");
  const Text = PRIMITIVE_REGISTRY.Text as React.ComponentType<{ level?: string; text?: string }>;
  for (const level of ["h1", "h2", "h3", "lead", "body", "caption"]) {
    const html = renderToStaticMarkup(<Text level={level} text="x" />);
    // h1/h2 wrap it in a width cap, `min(<token>, Ncqi)` (SDL-775 verify); the fallback is the same.
    const token = `var(--pages-text-${level}, ${root[`--pages-text-${level}`]})`;
    assert.ok(html.includes(`font-size:${token}`) || html.includes(`font-size:min(${token}, `), `${level}: ${html}`);
  }
});

test("SDL-773: site theme — every enumerated token writes its own values", () => {
  const { SITE_THEME_DEFAULT, SITE_THEME_TYPE_SCALES, SITE_THEME_RADII, SITE_THEME_DENSITIES, SITE_THEME_SHADOWS, siteThemeRootVariables, parseSiteTheme } = studio;
  const at = (patch: Record<string, string>) => siteThemeRootVariables(parseSiteTheme({ ...SITE_THEME_DEFAULT, ...patch })!);
  const seen = (key: string, values: readonly string[], vars: string[]) => {
    const sigs = values.map((v) => JSON.stringify(vars.map((n) => at({ [key]: v })[n])));
    assert.equal(new Set(sigs).size, values.length, `${key}: every value differs (${sigs.join(" / ")})`);
    for (const v of values) for (const n of vars) assert.ok(at({ [key]: v })[n], `${key}=${v} writes ${n}`);
  };
  seen("typeScale", SITE_THEME_TYPE_SCALES, ["--pages-text-display", "--pages-text-h1", "--pages-text-h2", "--pages-text-h3", "--pages-text-lead", "--pages-text-body", "--pages-text-caption"]);
  seen("radius", SITE_THEME_RADII, ["--radius", "--radius-small", "--radius-medium", "--radius-large", "--radius-xlarge"]);
  seen("density", SITE_THEME_DENSITIES, ["--pages-density"]);
  seen("shadow", SITE_THEME_SHADOWS, ["--surface-shadow", "--elevated-shadow"]);
  assert.equal(at({ radius: "none" })["--radius-large"], "0px");
  assert.equal(at({ shadow: "none" })["--surface-shadow"], "none");
  assert.equal(at({ density: "airy" })["--pages-density"], "1.5");
  assert.equal(at({ density: "compact" })["--pages-density"], "0.75");
  assert.equal(at({ typeScale: "large" })["--pages-text-h1"], "2.75rem");
});

test("SDL-773: site theme — the dark pair goes to the dark scope, the light one to the root", () => {
  const { SITE_THEME_DEFAULT, siteThemeCss } = studio;
  const theme = structuredClone(SITE_THEME_DEFAULT) as typeof SITE_THEME_DEFAULT;
  theme.colors.background = { light: "#FAF7F2", dark: "#0B1020" };
  theme.colors.primary = { light: "#1d4ed8", dark: "#93c5fd" };
  const blocks = sheetBlocks(siteThemeCss(theme)!);
  assert.equal(blocks[":root"]["--background"], "#faf7f2", "colours are lower-cased");
  assert.equal(blocks[":root"]["--primary"], "#1d4ed8");
  const dark = blocks[':root .dark, :root [data-background="dark"]'];
  assert.equal(dark["--background"], "#0b1020");
  assert.equal(dark["--primary"], "#93c5fd");
  assert.equal(dark["--card"], SITE_THEME_DEFAULT.colors.surface.dark);
  assert.equal(Object.keys(blocks).length, 2, "one root block, one dark block");
});

test("SDL-773: site theme — nothing but enumerations and #rrggbb reaches the sheet (no author CSS, nothing closes the <style>)", () => {
  const { SITE_THEME_DEFAULT, siteThemeCss, parseSiteTheme } = studio;
  const evil = {
    colors: {
      background: { light: "#fff;}</style><script>alert(1)</script>", dark: "red" },
      surface: { light: "url(https://evil.example/x)", dark: "#12345g" },
      muted: { light: "#abcdef\\", dark: 7 },
      text: "#000000",
      primary: { light: "#ABCDEF", dark: "#123456 !important" },
      constructor: { light: "#000000" },
    },
    typeScale: "</style>",
    radius: "9999px",
    density: { toString: () => "airy" },
    shadow: "0 0 0 red",
    css: "body{display:none}",
    customCss: "*{}",
  };
  const parsed = parseSiteTheme(evil)!;
  assert.deepEqual(parsed.colors.background, SITE_THEME_DEFAULT.colors.background);
  assert.deepEqual(parsed.colors.surface, SITE_THEME_DEFAULT.colors.surface);
  assert.deepEqual(parsed.colors.muted, SITE_THEME_DEFAULT.colors.muted);
  assert.deepEqual(parsed.colors.text, SITE_THEME_DEFAULT.colors.text);
  assert.deepEqual(parsed.colors.primary, { light: "#abcdef", dark: SITE_THEME_DEFAULT.colors.primary.dark }, "the valid half of a pair survives");
  assert.equal(parsed.typeScale, "default");
  assert.equal(parsed.radius, "md");
  assert.equal(parsed.density, "default");
  assert.equal(parsed.shadow, "soft");
  const css = siteThemeCss(evil)!;
  for (const bad of ["<", "\\", "script", "url(", "evil", "!important", "display:none", "red", "9999px;--", "constructor"]) {
    assert.ok(!css.includes(bad), `the sheet carries ${JSON.stringify(bad)}`);
  }
  // Every colour in the sheet is #rrggbb; every value is from the module's tables.
  for (const m of css.matchAll(/#[^;}]*/g)) assert.match(m[0], /^#[0-9a-f]{6}$/);
  // Not a theme at all → no sheet.
  for (const none of [undefined, null, "", "body{}", 42, [], true]) assert.equal(siteThemeCss(none), null, JSON.stringify(none));
  assert.ok(siteThemeCss({}), "an empty object is the default theme");
});

test("SDL-773: renderPublishedPage — the theme is ONE <style> ahead of the page; no theme, markup as before; a dark Section switches its subtree", async () => {
  const { renderPublishedPage } = await import("@markerloop/studio/catalog/server");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = {
    version: 2,
    rootId: "root",
    nodes: {
      root: { type: "Page", props: {}, children: ["light", "night"] },
      light: { type: "Section", props: {}, children: ["t1"] },
      t1: { type: "Text", props: { level: "h1", text: "Day band" } },
      night: { type: "Section", props: { background: "dark" }, children: ["t2"] },
      t2: { type: "Text", props: { level: "body", text: "Night band" } },
    },
    parents: { root: null, light: "root", t1: "light", night: "root", t2: "night" },
  };
  const before = renderToStaticMarkup(renderPublishedPage(body));
  assert.ok(!before.includes("<style data-pages-theme"), "no theme → no theme sheet");
  assert.equal(renderToStaticMarkup(renderPublishedPage(body, {}, undefined, undefined, undefined)), before);
  assert.equal(renderToStaticMarkup(renderPublishedPage(body, {}, undefined, undefined, "not a theme")), before);
  const themed = renderToStaticMarkup(renderPublishedPage(body, {}, undefined, undefined, { ...studio.SITE_THEME_DEFAULT, density: "airy" }));
  assert.ok(themed.startsWith('<style data-pages-theme="">:root{--background:#ffffff;'), themed.slice(0, 120));
  assert.equal(themed.match(/<style data-pages-theme/g)?.length, 1, "one theme sheet");
  assert.equal(themed.slice(themed.indexOf("</style>") + "</style>".length), before, "the page after the sheet is the unthemed markup");
  // The dark band: the kit's `.dark` scope plus the band painted from the dark set.
  const night = /<section[^>]*data-background="dark"[^>]*>/.exec(themed)?.[0] ?? "";
  assert.match(night, /class="dark"/);
  assert.match(night, /background:var\(--background\)/);
  assert.match(night, /color:var\(--foreground\)/);
  const day = /<section[^>]*data-background="default"[^>]*>/.exec(themed)?.[0] ?? "";
  assert.ok(day && !/class="dark"/.test(day), day);
  assert.match(day, /padding-block:calc\(32px \* var\(--pages-density, 1\)\)/);
});

test("SDL-773: the canvas frame draws the same theme inside its document; without one, nothing", async () => {
  const mount = async (theme?: unknown) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <SaunaCanvasFrame width={1280} theme={theme}>
          <p data-test="content">Hello</p>
        </SaunaCanvasFrame>
      );
    });
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const frameDoc = host.querySelector("iframe")!.contentDocument!;
    return { host, root, frameDoc };
  };
  const themed = await mount({ ...studio.SITE_THEME_DEFAULT, radius: "lg" });
  const sheet = themed.frameDoc.body.querySelector("style[data-pages-theme]");
  assert.ok(sheet, "theme sheet inside the frame");
  assert.equal(sheet.textContent, studio.siteThemeCss({ ...studio.SITE_THEME_DEFAULT, radius: "lg" }));
  assert.ok(themed.frameDoc.querySelector('[data-test="content"]'), "content still portalled");
  assert.equal(document.querySelector("style[data-pages-theme]"), null, "the host document is not themed");
  await act(async () => themed.root.unmount());
  themed.host.remove();
  const bare = await mount();
  assert.equal(bare.frameDoc.querySelector("style[data-pages-theme]"), null);
  await act(async () => bare.root.unmount());
  bare.host.remove();
});

// --- SDL-774: site fonts ----------------------------------------------------

const PAGES_SERVICE_FONTS = [
  "Geist", "Inter", "Roboto", "Open Sans", "Montserrat", "Raleway", "Nunito", "Nunito Sans", "Rubik", "Manrope", "Noto Sans", "PT Sans",
  "Fira Sans", "IBM Plex Sans", "Source Sans 3", "Work Sans", "DM Sans", "Plus Jakarta Sans", "Lato", "Poppins", "Merriweather", "Lora",
  "Playfair Display", "PT Serif", "Noto Serif", "Source Serif 4", "EB Garamond", "Cormorant Garamond", "Oswald", "Unbounded", "JetBrains Mono",
];

test("SDL-774: the font whitelist is pages-service's ThemeFonts, and every face it names is a committed woff2 with its license", async () => {
  const { SITE_FONTS, SITE_FONT_WEIGHTS, siteFontFile, siteFontSubsets } = studio;
  assert.deepEqual(SITE_FONTS.map((f) => f.family), PAGES_SERVICE_FONTS, "same families, same order as pages-service models.ThemeFonts");
  const { stat } = await import("node:fs/promises");
  const pub = path.join(import.meta.dirname, "..", "..", "..", "apps", "site", "public");
  let files = 0;
  for (const f of SITE_FONTS) {
    assert.match(f.id, /^[a-z0-9-]+$/);
    assert.ok(["sans", "serif", "display", "mono"].includes(f.category), f.family);
    for (const subset of siteFontSubsets(f)) {
      for (const w of SITE_FONT_WEIGHTS) {
        const file = path.join(pub, siteFontFile(f, subset, w));
        const head = (await readFile(file)).subarray(0, 4).toString("latin1");
        assert.equal(head, "wOF2", `${file} is woff2`);
        files++;
      }
    }
    assert.ok((await stat(path.join(pub, "fonts", f.id, "LICENSE.txt"))).size > 200, `${f.family}: license next to the files`);
  }
  assert.ok(files >= 31 * 2, `${files} files`);
  assert.ok(SITE_FONTS.filter((f) => f.cyrillic).length >= 25, "most families carry Cyrillic");
  // Kazakh, by the committed files' own cmap (not by the subset names).
  const cmapModule = pathToFileURL(path.join(import.meta.dirname, "..", "..", "..", "scripts", "woff2-cmap.mjs")).href;
  const { woff2CodePoints, KAZAKH_LETTERS } = (await import(cmapModule)) as { woff2CodePoints: (b: Buffer) => Set<number>; KAZAKH_LETTERS: string };
  const incomplete: string[] = [];
  for (const f of SITE_FONTS) {
    const sets = new Map(siteFontSubsets(f).map((s) => [s, woff2CodePoints(readFileSync(path.join(pub, siteFontFile(f, s, 400))))]));
    const has = (ch: string) => [...sets.values()].some((set) => set.has(ch.codePointAt(0)!));
    const missing = [...KAZAKH_LETTERS].filter((ch) => !has(ch)).join("");
    assert.equal(f.kazakhMissing, missing, `${f.family}: kazakhMissing matches the files`);
    if (missing) incomplete.push(f.family);
    // A shipped cyrillic-ext earns its bytes: it carries Kazakh letters.
    const ext = sets.get("cyrillic-ext");
    if (ext) assert.ok([...KAZAKH_LETTERS].some((ch) => ext.has(ch.codePointAt(0)!)), `${f.family}: cyrillic-ext without a Kazakh letter`);
  }
  assert.deepEqual(
    incomplete,
    ["Manrope", "Work Sans", "DM Sans", "Plus Jakarta Sans", "Lato", "Poppins", "Playfair Display", "Unbounded", "JetBrains Mono"],
    "families that cannot draw every Kazakh letter"
  );
  const { readdir } = await import("node:fs/promises");
  const onDisk = (await Promise.all(SITE_FONTS.map(async (f) => (await readdir(path.join(pub, "fonts", f.id))).filter((n) => n.endsWith(".woff2")).length))).reduce((a, b) => a + b, 0);
  assert.equal(onDisk, files, "no woff2 on disk that the whitelist does not name");
});

test("SDL-774: a theme with fonts — @font-face per subset × weight with font-display: swap from /fonts, body and headings set; no fonts → no font rule", () => {
  const { SITE_THEME_DEFAULT, siteThemeCss, parseSiteTheme } = studio;
  const theme = { ...SITE_THEME_DEFAULT, fonts: { heading: "Playfair Display", body: "Inter" } };
  const css = siteThemeCss(theme)!;
  const faces = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 10, "Playfair Display latin+cyrillic, Inter latin+cyrillic+cyrillic-ext, × 400/700");
  for (const f of faces) {
    assert.match(f, /font-display:swap/);
    assert.match(f, /src:url\(\/fonts\/(playfair-display|inter)\/(latin|cyrillic|cyrillic-ext)-(400|700)\.woff2\) format\("woff2"\)/);
    assert.match(f, /unicode-range:U\+/);
  }
  // Each subset its own range, in Google's order per family: cyrillic-ext, cyrillic, latin
  // (on an overlap the browser takes the last declared face, so the base subsets come last).
  const ext = faces.filter((f) => f.includes("cyrillic-ext-"));
  assert.equal(ext.length, 2);
  for (const f of ext) assert.ok(f.endsWith(`unicode-range:${studio.SITE_FONT_SUBSET_RANGES["cyrillic-ext"]}`), f);
  const order = faces.map((f) => /\/fonts\/([a-z-]+)\/(latin|cyrillic-ext|cyrillic)-(\d+)/.exec(f)!.slice(1, 3).join(":"));
  assert.deepEqual(order, [
    "playfair-display:cyrillic", "playfair-display:cyrillic", "playfair-display:latin", "playfair-display:latin",
    "inter:cyrillic-ext", "inter:cyrillic-ext", "inter:cyrillic", "inter:cyrillic", "inter:latin", "inter:latin",
  ]);
  // Overlaps by code point, not by substring: the ranges as sets.
  const points = (range: string) => {
    const out = new Set<number>();
    for (const part of range.split(",")) {
      const [a, b] = part.replace("U+", "").split("-");
      for (let c = parseInt(a, 16); c <= parseInt(b ?? a, 16); c++) out.add(c);
    }
    return out;
  };
  const R = studio.SITE_FONT_SUBSET_RANGES;
  const overlap = (x: string, y: string) => [...points(x)].filter((c) => points(y).has(c)).length;
  // Ґ ґ Ұ ұ are in both Cyrillic ranges: the cyrillic face, declared after cyrillic-ext, draws them.
  assert.deepEqual([...points(R["cyrillic-ext"])].filter((c) => points(R.cyrillic).has(c)), [0x0490, 0x0491, 0x04b0, 0x04b1], "cyrillic-ext ∩ cyrillic");
  assert.equal(overlap(R.cyrillic, R.latin), 0, "cyrillic ∩ latin");
  assert.equal(overlap(R["cyrillic-ext"], R.latin), 0, "cyrillic-ext ∩ latin");
  assert.ok(points(R["cyrillic-ext"]).has(0x049a) && points(R.cyrillic).has(0x04b0), "Қ in cyrillic-ext, Ұ in cyrillic");
  assert.ok(!/googleapis|gstatic|https?:/.test(css), "nothing but the site's own /fonts");
  const root = sheetBlocks(css)[":root"];
  assert.match(root["--pages-font-heading"], /^"Playfair Display", ui-serif/);
  assert.match(root["--pages-font-body"], /^"Inter", ui-sans-serif/);
  assert.equal(root["--font-geist-sans"], "var(--pages-font-body)");
  assert.ok(css.includes("body{font-family:var(--pages-font-body)}"));
  assert.ok(css.includes("h1,h2,h3,h4,h5,h6{font-family:var(--pages-font-heading)}"));
  // One family for both → its faces once.
  assert.equal([...siteThemeCss({ ...theme, fonts: { heading: "Work Sans", body: "Work Sans" } })!.matchAll(/@font-face/g)].length, 2, "Work Sans: latin only × 2 weights");
  // Old theme (no fonts) → byte-identical to the SDL-773 sheet: no face, no rule, no variable.
  const old = siteThemeCss(SITE_THEME_DEFAULT)!;
  assert.ok(!/font/.test(old), old);
  assert.equal(parseSiteTheme(SITE_THEME_DEFAULT)!.fonts, undefined);
  // Outside the whitelist → Geist; not a string → Geist; the sheet still only has whitelisted names.
  const evil = siteThemeCss({ fonts: { heading: 'x";}body{display:none', body: 42 } })!;
  assert.deepEqual(parseSiteTheme({ fonts: { heading: "Comic Sans MS", body: null } })!.fonts, { heading: "Geist", body: "Geist" });
  assert.ok(!evil.includes("display:none") && evil.includes('font-family:"Geist"'), evil.slice(0, 200));
  for (const fonts of ["Inter", ["Inter"], null]) assert.equal(parseSiteTheme({ fonts })!.fonts, undefined, "fonts not an object → absent");
  // The canvas: no font rules at all.
  assert.equal(siteThemeCss(theme, { fontsBase: null }), old);
});

test("SDL-774: preloads — exactly the heading's 700 and the body's 400, Latin; none without fonts", () => {
  const { SITE_THEME_DEFAULT, siteThemeFontPreloads } = studio;
  const theme = { ...SITE_THEME_DEFAULT, fonts: { heading: "Unbounded", body: "PT Sans" } };
  assert.deepEqual(siteThemeFontPreloads(theme).map((p) => p.href), ["/fonts/unbounded/latin-700.woff2", "/fonts/pt-sans/latin-400.woff2"]);
  assert.deepEqual(siteThemeFontPreloads({ ...theme, fonts: { heading: "Inter", body: "Inter" } }).map((p) => p.href), ["/fonts/inter/latin-700.woff2", "/fonts/inter/latin-400.woff2"], "one family: 700 and 400");
  assert.deepEqual(siteThemeFontPreloads(SITE_THEME_DEFAULT), []);
  assert.deepEqual(siteThemeFontPreloads(undefined), []);
  assert.equal(siteThemeFontPreloads(theme, "/x")[0].href, "/x/unbounded/latin-700.woff2");
});

test("SDL-949: site theme scales — an old theme reads the defaults, the sheet writes space × density and icon px", () => {
  const { SITE_THEME_DEFAULT, SITE_THEME_SCALES, parseSiteTheme, siteThemeCss } = studio;
  const old = parseSiteTheme({ typeScale: "large", density: "airy" })!;
  assert.deepEqual(old.spacing, [
    { name: "0", value: 0 }, { name: "XS", value: 4 }, { name: "S", value: 8 }, { name: "M", value: 16 },
    { name: "L", value: 24 }, { name: "XL", value: 40 }, { name: "2XL", value: 64 },
  ], "a theme older than the scales reads the default spacing");
  assert.deepEqual(old.iconSize, [
    { name: "XS", value: 16 }, { name: "S", value: 20 }, { name: "M", value: 24 }, { name: "L", value: 32 }, { name: "XL", value: 48 },
  ]);
  assert.deepEqual(parseSiteTheme({ spacing: "M", iconSize: { M: 24 } })!.spacing, SITE_THEME_DEFAULT.spacing, "not an array → defaults");
  const root = sheetBlocks(siteThemeCss({ density: "airy" })!)[":root"];
  assert.equal(root["--pages-space-M"], "calc(16px * var(--pages-density))", "spacing is the base × the density multiplier");
  assert.equal(root["--pages-space-0"], "calc(0px * var(--pages-density))");
  assert.equal(root["--pages-space-2XL"], "calc(64px * var(--pages-density))");
  assert.equal(root["--pages-icon-M"], "24px");
  assert.equal(root["--pages-density"], "1.5", "density stays the multiplier");
  for (const key of ["spacing", "iconSize"] as const) {
    for (const b of SITE_THEME_SCALES[key].builtins) assert.ok(root[`${SITE_THEME_SCALES[key].prefix}${b.name}`], `${key} ${b.name} is written`);
  }
  // The variables that were there before the scales are unchanged: drop the
  // scale declarations and the sheet is byte-for-byte master's before SDL-949
  // (42e8f8c7) — every other variable, its value, its order, the dark block.
  const before = sheetBlocks(siteThemeCss(SITE_THEME_DEFAULT)!)[":root"];
  const added = Object.keys(before).filter((n) => n.startsWith("--pages-space-") || n.startsWith("--pages-icon-"));
  assert.equal(added.length, 12, "7 spacing + 5 icon variables");
  const withoutScales = (css: string) => css.replace(/;--pages-(?:space|icon)-[A-Za-z0-9_-]+:[^;}]*/g, "");
  const PRE_SCALES_DEFAULT_SHEET = ":root{--background:#ffffff;--card:#ffffff;--popover:#ffffff;--muted:#f5f5f5;--secondary:#f5f5f5;--accent:#f5f5f5;--foreground:#111111;--card-foreground:#111111;--popover-foreground:#111111;--secondary-foreground:#111111;--accent-foreground:#111111;--muted-foreground:#767676;--primary:#111111;--primary-foreground:#fefefe;--border:#e5e5e5;--input:#e5e5e5;--radius:0.625rem;--radius-small:calc(0.625rem - 4px);--radius-medium:calc(0.625rem - 2px);--radius-large:0.625rem;--radius-xlarge:calc(0.625rem + 4px);--surface-shadow:0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);--elevated-shadow:0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);--pages-density:1;--pages-text-display:3.5rem;--pages-text-h1:2.25rem;--pages-text-h2:1.75rem;--pages-text-h3:1.25rem;--pages-text-lead:1.125rem;--pages-text-body:1rem;--pages-text-caption:0.8125rem}\n:root .dark, :root [data-background=\"dark\"]{--background:#111111;--card:#1e1e1e;--popover:#1e1e1e;--muted:#2a2a2a;--secondary:#2a2a2a;--accent:#2a2a2a;--foreground:#fefefe;--card-foreground:#fefefe;--popover-foreground:#fefefe;--secondary-foreground:#fefefe;--accent-foreground:#fefefe;--muted-foreground:#b5b5b5;--primary:#f5f5f5;--primary-foreground:#111111;--border:#292929;--input:#292929}";
  assert.equal(withoutScales(siteThemeCss(SITE_THEME_DEFAULT)!), PRE_SCALES_DEFAULT_SHEET, "the default sheet, scales aside, as before SDL-949");
  // A theme off every default (density, type scale, radius, shadow, fonts →
  // @font-face and font rules): same, checked by the SHA-256 of master's sheet.
  const offDefault = { density: "airy", typeScale: "large", radius: "lg", shadow: "strong", fonts: { heading: "Lora", body: "Inter" } };
  const sheet = withoutScales(siteThemeCss(offDefault)!);
  assert.equal(sheet.length, 4483);
  assert.equal(createHash("sha256").update(sheet).digest("hex"), "7a8d4733e71eec8230bd00fcf0dac45e07fdc5950a9713a8b452b4ac0471ddb9", "an off-default sheet, scales aside, as before SDL-949");
});

test("SDL-949: site theme scales — added steps, canonical built-in names, nothing invalid reaches the sheet", () => {
  const { SITE_THEME_DEFAULT, SITE_THEME_MAX_SCALE_STEPS, parseSiteTheme, siteThemeCss, siteThemeScaleVariables } = studio;
  const raw = {
    ...SITE_THEME_DEFAULT,
    spacing: [
      { name: "0", value: 0 }, { name: "XS", value: 4 }, { name: "S", value: 8 }, { name: "m", value: 18 },
      { name: "L", value: 24 }, { name: "XL", value: 40 }, { name: "2XL", value: 64 }, { name: "3XL", value: 96 },
      { name: "3xl", value: 100 },
      { name: "a b", value: 10 }, { name: "x;}body{display:none", value: 10 }, { name: "-lead", value: 10 },
      { name: "toolongname_12345", value: 10 }, { name: "hero", value: 9999 }, { name: "half", value: 4.5 }, { name: 7, value: 10 },
    ],
    iconSize: [{ name: "XS", value: 2 }, { name: "hero", value: 128 }],
  };
  const theme = parseSiteTheme(raw)!;
  assert.deepEqual(theme.spacing.map((s) => s.name), ["0", "XS", "S", "M", "L", "XL", "2XL", "3XL"], "m → M, 3xl repeats 3XL, invalid steps dropped");
  assert.equal(theme.spacing.find((s) => s.name === "M")!.value, 18, "the built-in keeps the theme's value under its canonical name");
  assert.deepEqual(theme.iconSize, [
    { name: "XS", value: 16 }, { name: "S", value: 20 }, { name: "M", value: 24 }, { name: "L", value: 32 }, { name: "XL", value: 48 }, { name: "hero", value: 128 },
  ], "a built-in out of range falls back to its default; missing built-ins come back right after the previous built-in (pages-service withBuiltins)");
  const css = siteThemeCss(raw)!;
  const root = sheetBlocks(css)[":root"];
  assert.equal(root["--pages-space-3XL"], "calc(96px * var(--pages-density))", "an added step gets its variable");
  assert.equal(root["--pages-space-M"], "calc(18px * var(--pages-density))");
  assert.equal(root["--pages-icon-hero"], "128px");
  assert.equal(root["--pages-space-m"], undefined, "no lower-case twin");
  assert.equal(root["--pages-space-3xl"], undefined);
  for (const bad of ["a b", "x;}body", "-lead", "toolongname", "hero", "half", "7"]) {
    assert.ok(!css.includes(`--pages-space-${bad}`), `${bad} never reaches the sheet`);
  }
  assert.ok(!css.includes("display:none"));
  // Hand-built themes skip the parser: the variable writer checks again.
  const direct = siteThemeScaleVariables({ spacing: [{ name: "ok", value: 8 }, { name: "x:y", value: 8 }, { name: "OK", value: 9 }, { name: "big", value: 513 }], iconSize: [] });
  assert.deepEqual(direct, { "--pages-space-ok": "calc(8px * var(--pages-density))" });
  // The cap: added steps beyond 32 go, built-ins stay.
  const many = Array.from({ length: 40 }, (_, i) => ({ name: `s${i}`, value: i }));
  const capped = parseSiteTheme({ spacing: many })!.spacing;
  assert.equal(capped.length, SITE_THEME_MAX_SCALE_STEPS);
  for (const b of ["0", "XS", "S", "M", "L", "XL", "2XL"]) assert.ok(capped.some((s) => s.name === b), `${b} survives the cap`);
});

test("SDL-949: validateSiteTheme — pages-service's scale rules", () => {
  const { SITE_THEME_DEFAULT, SITE_THEME_DEFAULT_FONTS, validateSiteTheme } = studio;
  const ok = { ...SITE_THEME_DEFAULT, fonts: SITE_THEME_DEFAULT_FONTS, preset: "" };
  assert.deepEqual(validateSiteTheme(ok), []);
  assert.deepEqual(validateSiteTheme({ ...ok, spacing: undefined, iconSize: undefined }), [], "absent scales are valid (the service fills them)");
  assert.deepEqual(validateSiteTheme({ ...ok, spacing: null, iconSize: null }), [], "null is no key, as on pages-service (nil *ThemeScalePatch; withBuiltins on a stored theme)");
  assert.deepEqual(validateSiteTheme({ ...ok, spacing: null }), []);
  assert.deepEqual(studio.parseSiteTheme({ spacing: null, iconSize: null })!.spacing, SITE_THEME_DEFAULT.spacing, "null reads the defaults");
  // The built-ins are frozen: one reader cannot change them for the next.
  for (const key of ["spacing", "iconSize"] as const) {
    const spec = studio.SITE_THEME_SCALES[key];
    assert.ok(Object.isFrozen(studio.SITE_THEME_SCALES) && Object.isFrozen(spec) && Object.isFrozen(spec.builtins), key);
    assert.ok(spec.builtins.every((b) => Object.isFrozen(b)), `${key} steps`);
    assert.throws(() => { (spec.builtins as { name: string; value: number }[])[0].value = 1; }, TypeError);
    const copy = studio.siteThemeDefaultScale(key);
    copy[0].value = 1;
    assert.notEqual(spec.builtins[0].value, 1, "siteThemeDefaultScale is a mutable copy");
  }
  assert.deepEqual(validateSiteTheme({ ...ok, spacing: [...ok.spacing, { name: "3XL", value: 96 }] }), [], "an added step");
  assert.deepEqual(validateSiteTheme({ ...ok, spacing: ok.spacing.map((s) => (s.name === "M" ? { ...s, name: "m" } : s)) }), [], "built-ins match case-insensitively, as there");
  const errs = (patch: Record<string, unknown>) => validateSiteTheme({ ...ok, ...patch });
  assert.ok(errs({ spacing: ok.spacing.filter((s) => s.name !== "M") }).some((e) => e.startsWith("spacing: the built-in step \"M\"")));
  assert.ok(errs({ spacing: [...ok.spacing, { name: "a b", value: 1 }] }).some((e) => e.startsWith("spacing[7].name")));
  assert.ok(errs({ spacing: [...ok.spacing, { name: "xs", value: 1 }] }).some((e) => e.startsWith("spacing[7].name") && e.includes("repeats")));
  assert.ok(errs({ spacing: [...ok.spacing, { name: "big", value: 513 }] }).some((e) => e.startsWith("spacing[7].value")));
  assert.ok(errs({ iconSize: [...ok.iconSize, { name: "tiny", value: 7 }] }).some((e) => e.startsWith("iconSize[5].value")));
  assert.ok(errs({ iconSize: [...ok.iconSize, { name: "half", value: 9.5 }] }).some((e) => e.startsWith("iconSize[5].value")));
  assert.ok(errs({ spacing: [...ok.spacing, ...Array.from({ length: 26 }, (_, i) => ({ name: `s${i}`, value: i }))] }).some((e) => e.startsWith("spacing: at most 32")));
  assert.ok(errs({ spacing: "M" }).some((e) => e.startsWith("spacing: expected an array")));
});

test("SDL-950: custom colours — an old theme reads [], the sheet writes --pages-color-<key> light on the root and dark on a dark band", () => {
  const { SITE_THEME_DEFAULT, parseSiteTheme, siteThemeCss, siteThemeColorVariables, SITE_THEME_DARK_SELECTOR } = studio;
  assert.deepEqual(parseSiteTheme({})!.customColors, [], "a theme older than custom colours");
  assert.deepEqual(parseSiteTheme({ customColors: "x" })!.customColors, [], "not an array");
  assert.equal(siteThemeCss({ ...SITE_THEME_DEFAULT, customColors: [] }), siteThemeCss({ ...SITE_THEME_DEFAULT, customColors: undefined }), "no colours = the sheet as before");
  const theme = parseSiteTheme({
    ...SITE_THEME_DEFAULT,
    customColors: [
      { key: "brandBlue", label: "  Brand blue ", light: "#1D4ED8", dark: "#60a5fa" },
      { key: "brandblue", label: "dup", light: "#000000", dark: "#000000" },
      { key: "primary", label: "role", light: "#000000", dark: "#000000" },
      { key: "bad key", label: "x", light: "#000000", dark: "#000000" },
      { key: "short", label: "x", light: "#abc", dark: "#000000" },
      { key: "x}y", label: "x", light: "#000000", dark: "#000000" },
      { key: "sea", label: "Sea</style>", light: "#00aaaa", dark: "#007777" },
    ],
  })!;
  assert.deepEqual(theme.customColors, [
    { key: "brandBlue", label: "Brand blue", light: "#1d4ed8", dark: "#60a5fa" },
    { key: "sea", label: "Sea</style>", light: "#00aaaa", dark: "#007777" },
  ], "duplicates (without case), roles, bad keys and non-#rrggbb dropped");
  assert.equal(siteThemeColorVariables(theme, "light")["--pages-color-brandBlue"], "#1d4ed8");
  assert.equal(siteThemeColorVariables(theme, "dark")["--pages-color-brandBlue"], "#60a5fa");
  const css = siteThemeCss(theme)!;
  assert.ok(css.includes("--pages-color-sea:#00aaaa") && css.includes(`${SITE_THEME_DARK_SELECTOR}{`) && css.includes("--pages-color-sea:#007777"), css);
  assert.ok(!css.includes("Sea"), "the label never reaches the sheet");
  const many = Array.from({ length: 30 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, light: "#111111", dark: "#222222" }));
  assert.equal(parseSiteTheme({ customColors: many })!.customColors!.length, 24, "the cap");
});

test("SDL-950: the studio's copy of the colour-key rule is the engine's", () => {
  assert.equal(studio.SITE_THEME_COLOR_KEY.source, engine.THEME_COLOR_KEY_PATTERN.source);
  assert.deepEqual([...studio.SITE_THEME_RESERVED_COLOR_KEYS], [...engine.THEME_RESERVED_COLOR_KEYS]);
  assert.equal(studio.SITE_THEME_MAX_CUSTOM_COLORS, engine.THEME_MAX_CUSTOM_COLORS);
  assert.equal(studio.SITE_THEME_MAX_CUSTOM_COLOR_LABEL, engine.THEME_MAX_CUSTOM_COLOR_LABEL);
  for (const k of ["a", "brandBlue", "Primary", "inherit", "x y", "constructor"]) assert.equal(studio.isSiteThemeColorKey(k), engine.isThemeColorKey(k), k);
});

test("SDL-950: validateSiteTheme — pages-service's custom colour rules", () => {
  const { SITE_THEME_DEFAULT, SITE_THEME_DEFAULT_FONTS, validateSiteTheme } = studio;
  const ok = { ...SITE_THEME_DEFAULT, fonts: SITE_THEME_DEFAULT_FONTS, preset: "" };
  const c = (key: string, extra: Record<string, unknown> = {}) => ({ key, label: "A", light: "#111111", dark: "#eeeeee", ...extra });
  assert.deepEqual(validateSiteTheme({ ...ok, customColors: undefined }), []);
  assert.deepEqual(validateSiteTheme({ ...ok, customColors: null }), []);
  assert.deepEqual(validateSiteTheme({ ...ok, customColors: [c("brandBlue"), c("accent-2")] }), []);
  const errs = (cs: unknown) => validateSiteTheme({ ...ok, customColors: cs });
  assert.ok(errs([c("primary")]).some((e) => e.startsWith("customColors[0].key")), "a role");
  assert.ok(errs([c("Transparent")]).some((e) => e.startsWith("customColors[0].key")), "a reserved word, any case");
  assert.ok(errs([c("Brand")]).some((e) => e.startsWith("customColors[0].key")), "an upper-case first letter");
  assert.ok(errs([c("a"), c("A".toLowerCase())]).some((e) => e.startsWith("customColors[1].key") && e.includes("repeats")));
  assert.ok(errs([c("a", { label: " " })]).some((e) => e.startsWith("customColors[0].label")));
  assert.ok(errs([c("a", { label: "x".repeat(65) })]).some((e) => e.startsWith("customColors[0].label")));
  assert.ok(errs([c("a", { label: "a\u0000b" })]).some((e) => e.startsWith("customColors[0].label")));
  assert.ok(errs([c("a", { dark: "blue" })]).some((e) => e.startsWith("customColors[0].dark")));
  assert.ok(errs(Array.from({ length: 25 }, (_, i) => c(`c${i}`))).some((e) => e.startsWith("customColors: at most 24")));
  assert.ok(errs("x").some((e) => e.startsWith("customColors: expected an array")));
});

test("SDL-777: validateSiteTheme — pages-service's rules: hex, whitelist, enums, preset id, AA in both sets", () => {
  const { SITE_THEME_DEFAULT, SITE_THEME_DEFAULT_FONTS, validateSiteTheme, siteThemeContrast } = studio;
  const ok = { ...SITE_THEME_DEFAULT, fonts: SITE_THEME_DEFAULT_FONTS, preset: "" };
  assert.deepEqual(validateSiteTheme(ok), [], "pages-service's default theme is valid");
  assert.equal(siteThemeContrast("#ffffff", "#000000"), 21);
  assert.equal(siteThemeContrast("#767676", "#ffffff").toFixed(2), "4.54", "the default's declared AA deviation");
  const bad = {
    ...ok,
    colors: { ...ok.colors, text: { light: "#cccccc", dark: "red" } },
    fonts: { heading: "Comic Sans MS", body: "Geist" },
    radius: "huge",
    preset: "Not An Id",
  };
  const errors = validateSiteTheme(bad);
  for (const field of ["colors.text.dark", "fonts.heading", "radius", "preset", "colors.text.light"]) {
    assert.ok(errors.some((e) => e.startsWith(`${field}:`)), `${field} must be reported: ${errors.join(" / ")}`);
  }
  assert.ok(errors.some((e) => /^colors\.text\.light: contrast .* on background/.test(e)), "a light grey text fails AA on white");
  assert.ok(!errors.some((e) => e.startsWith("fonts.body")), "a whitelisted body is fine");
  assert.deepEqual(validateSiteTheme({ ...ok, fonts: undefined }).filter((e) => e.startsWith("fonts.")).length, 2, "fonts are required");
  assert.deepEqual(validateSiteTheme(null), ["theme: expected an object"]);
});

test("SDL-777: presets — 6 to 8, unique ids, each a valid theme naming itself", () => {
  const { SITE_THEME_PRESETS, siteThemePreset, validateSiteTheme } = studio;
  assert.ok(SITE_THEME_PRESETS.length >= 6 && SITE_THEME_PRESETS.length <= 8, `6–8 presets, got ${SITE_THEME_PRESETS.length}`);
  assert.equal(new Set(SITE_THEME_PRESETS.map((p) => p.id)).size, SITE_THEME_PRESETS.length, "ids are unique");
  for (const p of SITE_THEME_PRESETS) {
    assert.deepEqual(validateSiteTheme(p.theme), [], `preset ${p.id} must pass the theme validator`);
    assert.equal(p.theme.preset, p.id, `preset ${p.id} names itself`);
    assert.ok(p.name.trim() && p.note.trim(), `preset ${p.id} has a name and a note`);
    assert.equal(siteThemePreset(p.id), p);
  }
  assert.equal(siteThemePreset(""), undefined);
  assert.equal(siteThemePreset("nope"), undefined);
});

test("SDL-777: presets — text and the primary button hold WCAG AA (4.5:1) in light and dark", () => {
  const { SITE_THEME_PRESETS, SITE_THEME_CONTRAST_PAIRS, SITE_THEME_MIN_CONTRAST, siteThemeContrast } = studio;
  const pairs = SITE_THEME_CONTRAST_PAIRS.map(([fg, bg]) => `${fg}/${bg}`);
  for (const must of ["text/background", "primaryForeground/primary", "textMuted/background"]) assert.ok(pairs.includes(must), `${must} is checked`);
  for (const p of SITE_THEME_PRESETS) {
    for (const mode of ["light", "dark"] as const) {
      for (const [fg, bg] of SITE_THEME_CONTRAST_PAIRS) {
        const ratio = siteThemeContrast(p.theme.colors[fg][mode], p.theme.colors[bg][mode]);
        assert.ok(ratio >= SITE_THEME_MIN_CONTRAST, `${p.id} ${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 < ${SITE_THEME_MIN_CONTRAST}:1`);
      }
    }
  }
});

test("SDL-777: presets — fonts only from the whitelist, with Cyrillic and every Kazakh letter", () => {
  const { SITE_THEME_PRESETS, siteFont } = studio;
  for (const p of SITE_THEME_PRESETS) {
    for (const field of ["heading", "body"] as const) {
      const family = p.theme.fonts[field];
      const font = siteFont(family);
      assert.ok(font, `${p.id} fonts.${field}: ${family} is not in the whitelist`);
      assert.ok(font.cyrillic && font.kazakhMissing === "", `${p.id} fonts.${field}: ${family} lacks Cyrillic/Kazakh (${font.kazakhMissing})`);
    }
  }
  // The renderer takes every preset as is: its sheet carries both families.
  for (const p of SITE_THEME_PRESETS) {
    const css = studio.siteThemeCss(p.theme)!;
    assert.ok(css.includes(`font-family:"${p.theme.fonts.heading}"`) || css.includes(`"${p.theme.fonts.heading}"`), `${p.id}: heading face in the sheet`);
    assert.ok(css.includes(`--primary:${p.theme.colors.primary.light}`), `${p.id}: primary on :root`);
  }
});

let failed = 0;
// `TEST_ONLY=<substring>` runs only the matching tests (local debugging).
const selected = tests.filter((x) => !process.env.TEST_ONLY || x.name.includes(process.env.TEST_ONLY));
// A typo in the filter must not read as a green run of nothing.
if (!selected.length) {
  console.log(`TEST_ONLY=${JSON.stringify(process.env.TEST_ONLY)} matches none of the ${tests.length} tests`);
  process.exit(1);
}
for (const t of selected) {
  try {
    await t.fn();
    console.log(`  ok   ${t.name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${t.name}\n       ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`\n${selected.length - failed}/${selected.length} passed`);
process.exit(failed ? 1 : 0);
