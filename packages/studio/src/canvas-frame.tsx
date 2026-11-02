"use client";

// The canvas frame (SDL-297, EP-48).
//
// Until now the canvas rendered the author's document straight into the admin
// document, on a 660px sheet marked `data-sauna-author-surface`. Two things
// were wrong with that, both of them things the owner could see:
//
//   1. the view was not the visitor's view — it held only because the admin
//      sheet and the public sheet agreed by convention, not because anything
//      separated them;
//   2. the responsive layout lied. A `@media (max-width: 640px)` inside author
//      content measures the WINDOW, so on a 1440px editor the mobile layout of
//      the page being edited could never be shown.
//
// Both are fixed by giving the document its own viewport: a same-origin,
// src-less iframe whose body is a React portal target. The portal keeps ONE
// React tree and one store — the frame is a rendering surface, not a second
// application — so a mutation still costs a single commit into a subtree.
// SDL-296 measured that: p95 commit ≤ 1.2 ms and the paint lands in the very
// next frame at 201 nodes, indistinguishable from inline rendering
// (docs/tasks/EP-48-editor-and-components/06-spike-iframe-perf.md).
//
// The alternative — pointing the frame at `/studio/preview/*` — is variant B
// of the analysis (03-canvas-and-outline.md). It reloads the document on every
// keystroke and needs a postMessage bridge for selection. It stays where it is,
// behind the "preview ↗" button.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SiteThemeCustomColorStyle, SiteThemeStyle, type SiteThemeCustomColor } from "./site-theme";

import { Monitor, Smartphone, Tablet, type Icon } from "./icons";

/* ------------------------------------------------------------------ */
/* Devices                                                            */
/* ------------------------------------------------------------------ */

/** The sheet's border width (Tailwind `border`), kept out of the document's box. */
const SHEET_BORDER = 1;

export type SaunaCanvasDeviceId = "desktop" | "tablet" | "mobile";

export type SaunaCanvasDevice = {
  id: SaunaCanvasDeviceId;
  label: string;
  /** CSS pixels the frame's viewport is given — what `@media` measures. */
  width: number;
  icon: Icon;
};

/**
 * The three widths the owner asked for. They are viewport widths, not
 * breakpoints: 1280 is the common laptop, 768 the tablet portrait that sits
 * exactly on Tailwind's `md`, 375 the iPhone width every phone layout is
 * checked against.
 */
export const SAUNA_CANVAS_DEVICES: readonly SaunaCanvasDevice[] = [
  { id: "desktop", label: "Desktop", width: 1280, icon: Monitor },
  { id: "tablet", label: "Tablet", width: 768, icon: Tablet },
  { id: "mobile", label: "Phone", width: 375, icon: Smartphone },
];

export function saunaCanvasDevice(id: SaunaCanvasDeviceId): SaunaCanvasDevice {
  return SAUNA_CANVAS_DEVICES.find((d) => d.id === id) ?? SAUNA_CANVAS_DEVICES[0]!;
}

/* ------------------------------------------------------------------ */
/* Stylesheet transfer                                                */
/* ------------------------------------------------------------------ */

/**
 * Which of the parent document's stylesheets the frame gets.
 *
 * The frame must receive the sheets a VISITOR downloads — the kit's
 * `ui/styles.css` and the root layout's `public.css` (theme tokens plus the
 * `.ss-*` primitives) — and must NOT receive the editor's own sheet, or the
 * isolation this whole change buys is given straight back: admin utilities
 * would be reachable from author content and an admin rule could repaint the
 * page under the author's feet.
 *
 * They cannot be told apart by URL — Next emits hashed chunk names and which
 * chunk holds what is a build detail that changes with the module graph. So
 * the admin chunk labels itself: `studio-admin.css` declares
 * `--sauna-sheet-role: "admin"` on `:root`, and this scan drops whichever
 * sheet carries that declaration.
 *
 * Unlabelled sheets are KEPT, deliberately: the set of admin sheets is closed
 * and known, everything else (next/font's `<style>`, a future third-party
 * sheet) is either needed or harmless. Failing open here costs a stray rule;
 * failing closed would silently render the canvas unstyled.
 */
const ADMIN_SHEET_ROLE = "admin";

function declaresAdminRole(rules: CSSRuleList, depth: number): boolean {
  if (depth > 2) return false;
  for (const rule of Array.from(rules)) {
    const style = (rule as CSSStyleRule).style as CSSStyleDeclaration | undefined;
    if (style?.getPropertyValue) {
      // Custom properties keep their authored quoting: `"admin"`.
      const role = style.getPropertyValue("--sauna-sheet-role").trim().replace(/^["']|["']$/g, "");
      if (role === ADMIN_SHEET_ROLE) return true;
    }
    // Tailwind wraps output in `@layer`, so the marker can sit one or two
    // grouping rules deep even though it is authored at the top level.
    const nested = (rule as CSSGroupingRule).cssRules as CSSRuleList | undefined;
    if (nested && declaresAdminRole(nested, depth + 1)) return true;
  }
  return false;
}

function isAdminStyleSheet(el: HTMLElement): boolean {
  const sheet = (el as HTMLLinkElement | HTMLStyleElement).sheet;
  // Not parsed yet, or unreadable (a cross-origin sheet has no `cssRules`):
  // unclassifiable, so keep it — see the fail-open note above.
  if (!sheet) return false;
  try {
    return declaresAdminRole(sheet.cssRules, 0);
  } catch {
    return false;
  }
}

/**
 * The admin's own tokens for the editor chrome drawn INSIDE the frame
 * (EP-187, layer 5): the selection overlay paints with `--selection` and the
 * admin surface tokens, but those are declared on `[data-surface]` in the
 * admin's sheets — the parent document — and the frame does not always get
 * that rule (under `next dev` the kit's sheet ships merged into the admin
 * chunk, which the transfer drops). So the LIGHT `[data-surface]` declaration
 * blocks are read from the parent's CSSOM and re-declared in the frame for
 * the overlay only. Light, never `.dark [data-surface]`: the selection is
 * the same blue in a light and a dark admin, and the canvas is never dark.
 * Values come from the token definitions — nothing is written here.
 */
export const SAUNA_OVERLAY_TOKENS_ATTR = "data-sauna-overlay-tokens";
const SURFACE_SELECTOR = "[data-surface]";

function collectSurfaceDeclarations(rules: CSSRuleList, depth: number, out: string[]): void {
  if (depth > 3) return;
  for (const rule of Array.from(rules)) {
    const styleRule = rule as CSSStyleRule;
    if (typeof styleRule.selectorText === "string" && styleRule.selectorText.trim() === SURFACE_SELECTOR) {
      out.push(styleRule.style.cssText);
    }
    const nested = (rule as CSSGroupingRule).cssRules as CSSRuleList | undefined;
    if (nested) collectSurfaceDeclarations(nested, depth + 1, out);
  }
}

/** The light admin-surface declarations of the parent document, or "" when none is readable. */
export function adminSurfaceDeclarations(from: Document): string {
  const out: string[] = [];
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      collectSurfaceDeclarations(sheet.cssRules, 0, out);
    } catch {
      // A cross-origin sheet has no readable rules; it holds no admin token.
    }
  }
  return out.join(" ");
}

function installOverlayTokens(doc: Document): void {
  if (doc.head.querySelector(`[${SAUNA_OVERLAY_TOKENS_ATTR}]`)) return;
  const declarations = adminSurfaceDeclarations(document);
  if (!declarations) return;
  const style = doc.createElement("style");
  style.setAttribute(SAUNA_OVERLAY_TOKENS_ATTR, "");
  // (0,2,0): above the kit's own `[data-surface]` and `.dark [data-surface]`.
  style.textContent = `[data-sauna-canvas-overlay][data-surface]{${declarations}}`;
  doc.head.appendChild(style);
}

/**
 * Copies the public sheets into the frame's head and resolves once they have
 * loaded. Elements are cloned rather than adopted as constructed stylesheets
 * on purpose: a clone keeps its absolute `href`, so `url()` inside the sheet
 * (fonts, background images) resolves exactly as it does in the parent, and
 * the bytes come from the HTTP cache. Constructed sheets would need the rule
 * text re-serialised and re-based, for no measurable gain — the transfer
 * happens once per frame, outside every render.
 */
function installStyles(doc: Document): Promise<void> {
  const pending: Promise<void>[] = [];
  document
    .querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')
    .forEach((el) => {
      if (isAdminStyleSheet(el)) return;
      const clone = doc.importNode(el, true);
      if (el.tagName === "LINK") {
        pending.push(
          new Promise<void>((resolve) => {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          })
        );
      }
      doc.head.appendChild(clone);
    });
  // A clone served from cache is flaky about firing `load` at all, so the wait
  // is capped: a late sheet repaints, a frame that never resolves would leave
  // the canvas permanently blank.
  const cap = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  return Promise.race([Promise.all(pending).then(() => undefined), cap]);
}

/* ------------------------------------------------------------------ */
/* Frame                                                              */
/* ------------------------------------------------------------------ */

export type SaunaCanvasFrameProps = {
  /** Viewport width in CSS pixels — the device the author is looking at. */
  width: number;
  /** Author content. Rendered through a portal into the frame's body. */
  children: ReactNode;
  /** Accessible name; the frame is a `region` holding the edited document. */
  title?: string;
  /**
   * Editor chrome drawn INSIDE the frame's document, on top of `children`
   * (SDL-298). Takes the document because anything that hit-tests or measures
   * the canvas has to work in the frame's own realm — its `getBoundingClientRect`
   * origin, its scroll offsets, its event listeners. Called only once the
   * document is prepared, so the callee can assume a live body.
   */
  overlay?: (doc: Document) => ReactNode;
  /**
   * The site theme (SDL-773) — pages-service's theme JSON, drawn as the
   * frame's first `<style>` so the canvas shows the page in the colours,
   * radius, density and type scale the site will. Absent or not an object →
   * the kit's own look, as before.
   */
  theme?: unknown;
  /**
   * Custom colours of the site theme (SDL-950) to paint WITHOUT the theme:
   * only their `--pages-color-<key>` variables, drawn after `theme`'s sheet so
   * they win over its copy. The page editor passes the theme draft's, so an
   * element holding a colour key shows the colour at once.
   */
  customColors?: readonly SiteThemeCustomColor[];
};

/**
 * A viewport-sized frame that renders `children` inside its own document.
 *
 * Sizing: the frame is always `width` CSS pixels wide, because that is the
 * number author `@media` queries must see. When the canvas column is narrower
 * — 1280 rarely fits between the outline and the properties panel — the frame
 * is scaled DOWN to fit, never reflowed and never zoomed past 1:1. Layout is
 * still computed at the device width; only the presentation shrinks, which is
 * what every builder does and the only way "Desktop" can mean 1280 in a 600px
 * column. Height follows the content, so the canvas keeps a single scrollbar
 * (the workspace's) instead of nesting a second one inside the frame.
 */
export function SaunaCanvasFrame({
  width,
  children,
  title = "Canvas",
  overlay,
  theme,
  customColors,
}: SaunaCanvasFrameProps): ReactNode {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [available, setAvailable] = useState(0);

  // Mount the portal target. Re-runs on the frame's `load` event as well as at
  // mount: Firefox replaces the initial `about:blank` document shortly after
  // the element is inserted, and anything written into the first document —
  // styles and the portal alike — disappears with it. Keying off the body we
  // last prepared makes the re-run idempotent in Chromium, where no swap
  // happens (and under StrictMode's double effect).
  const attach = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;
    if (doc.body.dataset.saunaCanvasBody === "ready") {
      setBody(doc.body);
      return;
    }
    doc.body.dataset.saunaCanvasBody = "ready";
    // The frame IS the page: no admin chrome, no sheet padding. `theme-tokens`
    // gives it the public background, foreground and margin reset once the
    // public sheets land.
    doc.documentElement.setAttribute("data-sauna-canvas-document", "");
    // The canvas shows the SITE, never the admin's dark theme (EP-187,
    // decision 3). The frame's own document is always light: without this a
    // dark admin left the frame transparent over the dark sheet behind it,
    // and the page's default black text read black on black. `Canvas` /
    // `CanvasText` are the light system colours here; the public sheets and
    // the site theme paint over them as soon as they land.
    doc.documentElement.style.colorScheme = "light";
    doc.documentElement.style.backgroundColor = "Canvas";
    doc.documentElement.style.color = "CanvasText";
    installOverlayTokens(doc);
    void installStyles(doc).then(() => {
      if (frameRef.current?.contentDocument !== doc) return;
      setBody(doc.body);
    });
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    attach();
    frame.addEventListener("load", attach);
    return () => frame.removeEventListener("load", attach);
  }, [attach]);

  // Auto-height: the frame grows with its document instead of scrolling
  // inside itself. Observed from the frame's own realm so the callback fires
  // on that document's layout, and on `documentElement` rather than `body`,
  // because collapsing margins can leave the body shorter than the page.
  useEffect(() => {
    if (!body) return;
    const doc = body.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    const measure = (): void =>
      setContentHeight(Math.ceil(doc.documentElement.scrollHeight));
    measure();
    const ro = new win.ResizeObserver(measure);
    ro.observe(doc.documentElement);
    ro.observe(body);
    return () => ro.disconnect();
  }, [body]);

  // How much room the workspace gives us, for the fit-to-width scale.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = (): void => setAvailable(box.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // The sheet's border is drawn OUTSIDE the document (content-box): the fit
  // leaves room for it, so the scaled document gets every pixel it asked for.
  const scale =
    available > 0
      ? Math.min(1, Math.max(0, available - 2 * SHEET_BORDER) / width)
      : 1;
  // Before the first measurement there is no height to reserve; a small
  // placeholder keeps the sheet from flashing at zero height on mount.
  const height = contentHeight > 0 ? contentHeight : 320;

  return (
    <div ref={boxRef} className="flex w-full justify-center">
      <div
        // The sheet chrome — border, shadow, public surface — sits on
        // the UNSCALED box so a 1px border stays 1px at any zoom. The e2e hook
        // `data-sauna-canvas-sheet` stays on it: it has always meant "the
        // island that holds the document", and it still does.
        //
        // `boxSizing: content-box` (SDL-770): width/height below are the
        // DOCUMENT's scaled size, and the 1px border goes around it. Under the
        // admin preflight's `border-box` the border ate 2px of that size, and
        // `overflow-hidden` cut the document's last 2px on the right and at
        // the bottom — a 768px page was shown in 766px, the selection frame's
        // right edge with it. Inline, not a class: the preflight is not ours
        // to rely on.
        //
        // No `rounded-*` (SDL-770 review): `overflow-hidden` clips to the
        // rounded padding box, and the document runs edge to edge, so a radius
        // shaved the page's own corners — the corner handles and the frame's
        // corners of the first and the last block lost 2-4px to the curve.
        // Square corners show the document exactly as the site renders it.
        className="h-fit overflow-hidden border border-border bg-background shadow-sm"
        style={{ boxSizing: "content-box", width: width * scale, height: height * scale }}
        data-sauna-canvas-sheet
        data-sauna-canvas-device-width={width}
        data-sauna-canvas-scale={scale.toFixed(4)}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <iframe
            ref={frameRef}
            title={title}
            data-sauna-canvas-frame
            // Out of the sequential tab order. A browser makes a populated
            // iframe focusable in its own right, which added a Tab stop that
            // is not a control and paints no focus ring (caught by
            // 15-a11y-keyboard). The frame is a rendering surface, not a
            // widget — focusable content INSIDE it stays reachable exactly as
            // it was when the document rendered inline.
            tabIndex={-1}
            className="block h-full w-full border-0"
          />
        </div>
      </div>
      {body
        ? createPortal(
            <>
              {/* No fonts in the canvas: the admin's host does not serve the site's /fonts (SDL-774). */}
              <SiteThemeStyle theme={theme} fontsBase={null} />
              <SiteThemeCustomColorStyle colors={customColors} />
              {children}
              {overlay?.(body.ownerDocument)}
            </>,
            body
          )
        : null}
    </div>
  );
}
