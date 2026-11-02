// The registry contract the renderer cannot check for itself (SDL-634).
//
// In editable mode the renderer hands every node `data-sauna-node-id` THROUGH
// ITS PROPS, and the canvas finds the node again with `closest()` on that
// attribute. So a component is selectable only if its root element spreads
// the props it does not consume. A component that forgets the spread renders
// perfectly — the page is right, the outline is right, no error anywhere —
// and a click on it on the canvas does nothing. Nothing at render time can
// notice, so the check is a probe a test runs over the whole registry.

import * as React from "react";

import { SaunaRenderer, SAUNA_NODE_ID_ATTR } from "./renderer";
import type { SaunaRegistry } from "./types";
import type { SaunaNodeConfig, SaunaSchema } from "../schema/types";

/**
 * How to draw one type for the probe. Compound parts throw outside their
 * root (`TabsList` without `Tabs`), and a few components refuse to render
 * without a prop; the probe cannot guess either, so the caller says.
 */
export type SaunaMarkProbe = {
  /** Ancestors, outermost first, the type needs around it to render. */
  within?: ReadonlyArray<{ type: string; props?: Record<string, unknown> }>;
  /** Props laid over the type's initial props. */
  props?: Record<string, unknown>;
};

/** A registered type the canvas cannot select, and why. */
export type SaunaUnmarkedType = { type: string; reason: string };

const PROBED_ID = "probed";

/**
 * Every type of `registry` whose rendered markup does not carry the node's
 * `data-sauna-node-id`, sorted by type. Empty means every registered
 * component is selectable on the canvas.
 *
 * `toMarkup` is the caller's `renderToStaticMarkup`: the engine ships to the
 * browser and does not import `react-dom/server` for a test's sake. A type
 * that throws is reported, not skipped — "could not check" must not read as
 * "checked".
 */
export function findUnmarkedTypes(args: {
  registry: SaunaRegistry;
  toMarkup: (element: React.ReactElement) => string;
  /** A new node's props, e.g. the block catalog's `meta.initialProps`. */
  initialProps?: (type: string) => Record<string, unknown> | undefined;
  probes?: Readonly<Record<string, SaunaMarkProbe>>;
}): SaunaUnmarkedType[] {
  const out: SaunaUnmarkedType[] = [];
  for (const type of Object.keys(args.registry).sort()) {
    const probe = args.probes?.[type];
    const schema = probeSchema(type, { ...args.initialProps?.(type), ...probe?.props }, probe?.within ?? []);
    let markup: string;
    try {
      markup = args.toMarkup(
        React.createElement(SaunaRenderer, { editable: true, schema, registry: args.registry }),
      );
    } catch (error) {
      out.push({ type, reason: `threw while probing: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (!markup.includes(`${SAUNA_NODE_ID_ATTR}="${PROBED_ID}"`)) {
      out.push({
        type,
        reason: `its root element does not carry ${SAUNA_NODE_ID_ATTR} — spread the rest props onto it`,
      });
    }
  }
  return out;
}

/** `within[0] > … > within[n] > type`, the probed node last. */
function probeSchema(
  type: string,
  props: Record<string, unknown>,
  within: ReadonlyArray<{ type: string; props?: Record<string, unknown> }>,
): SaunaSchema {
  const ids = [...within.map((_, i) => `within-${i}`), PROBED_ID];
  const configs: SaunaNodeConfig[] = [...within.map((w) => ({ type: w.type, props: w.props })), { type, props }];
  const nodes: SaunaSchema["nodes"] = {};
  const parents: SaunaSchema["parents"] = {};
  ids.forEach((id, i) => {
    nodes[id] = i < ids.length - 1 ? { ...configs[i]!, children: [ids[i + 1]!] } : configs[i]!;
    parents[id] = i === 0 ? null : ids[i - 1]!;
  });
  return { version: 2, rootId: ids[0]!, nodes, parents };
}
