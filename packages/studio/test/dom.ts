// A browser for the tests (SDL-604): jsdom installed as the global realm
// BEFORE react-dom loads. The canvas iframe gets its own jsdom window — a
// separate realm with its own `Element`, `MouseEvent` and `document` — which
// is exactly the boundary the three guarded behaviours live on.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const g = globalThis as Record<string, unknown>;
const win = dom.window as unknown as Record<string, unknown>;
for (const key of [
  "window", "document", "navigator", "Node", "Element", "HTMLElement", "HTMLIFrameElement",
  // CustomEvent: Radix's dialog layers dispatch one on open; Node's own
  // CustomEvent is not an Event of jsdom's realm and dispatch rejects it.
  "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "FocusEvent", "PointerEvent", "InputEvent",
  "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
]) {
  if (win[key] !== undefined) Object.defineProperty(g, key, { value: win[key], configurable: true, writable: true });
}
// `self`: next/link (behind the kit's `Link`, drawn by the Insert panel's
// empty «Your components» group, SDL-631) reads it at module scope.
if (g.self === undefined) Object.defineProperty(g, "self", { value: dom.window, configurable: true, writable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom has no layout, so no ResizeObserver; the canvas only needs it to exist. */
export class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
export function installLayoutStubs(w: Window): void {
  const target = w as unknown as Record<string, unknown>;
  if (!target.ResizeObserver) target.ResizeObserver = StubResizeObserver;
  // jsdom has no layout and no matchMedia. The shell asks it which chrome to
  // mount (`use-mobile.ts`), and the answer here is the desktop grid — the
  // three columns the admin runs on. A stub that answered `true` would mount
  // the phone shell instead and the column assertions would be about a
  // screen nobody was testing.
  if (!target.matchMedia) {
    target.matchMedia = (query: string) => ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
  // jsdom lacks PointerEvent; the canvas only reads `pointerType`.
  if (!target.PointerEvent) {
    const MouseEv = target.MouseEvent as typeof MouseEvent;
    target.PointerEvent = class extends MouseEv {
      pointerType: string;
      constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
      }
    };
  }
}
installLayoutStubs(dom.window as unknown as Window);
g.ResizeObserver = (dom.window as unknown as Record<string, unknown>).ResizeObserver;

// Every canvas iframe gets the same stubs the moment anyone reaches its
// document — the frame component does that first thing on mount.
{
  const proto = (dom.window as unknown as { HTMLIFrameElement: { prototype: object } }).HTMLIFrameElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "contentDocument")!;
  Object.defineProperty(proto, "contentDocument", {
    configurable: true,
    get(this: HTMLIFrameElement) {
      const doc = desc.get!.call(this) as Document | null;
      if (doc?.defaultView) installLayoutStubs(doc.defaultView);
      return doc;
    },
  });
}
