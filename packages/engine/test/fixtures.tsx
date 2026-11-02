// Render fixtures for the parity snapshot (SDL-603).
//
// The same documents are rendered twice: once by the frozen reference's
// engine source (`record-reference.tsx`, run locally, output committed as
// `__snapshots__/reference.json`) and once by this package's built dist
// (`run.tsx`, runs in CI). The engine is passed in, so this file imports
// neither — it is the one definition of "the same document".
import * as React from "react";

export type EngineUnderTest = {
  SaunaRenderer: React.ComponentType<Record<string, unknown>>;
  SaunaServer: (props: Record<string, unknown>) => Promise<React.ReactNode>;
  SaunaClient: React.ComponentType<Record<string, unknown>>;
  SaunaProvider: React.ComponentType<Record<string, unknown>>;
  validateSaunaSchema: (raw: unknown) => { ok: true; value: unknown } | { ok: false; error: { message: string } };
  migrateSaunaSchema: (s: never) => unknown;
  loadBlockRefs: (schema: never, load: (id: string) => Promise<unknown>) => Promise<unknown>;
};

// A registry that makes every resolved prop visible in the markup: a
// renderer change that alters props, order, keys or visibility shows up as
// a different string, not only one that alters structure.
function Box(props: Record<string, unknown> & { children?: React.ReactNode }) {
  const { children, ...rest } = props;
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (k.startsWith("data-")) attrs[k] = String(v);
    else attrs[`data-p-${k.toLowerCase()}`] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return React.createElement("div", attrs, children);
}
function Heading(props: { as?: string; children?: React.ReactNode } & Record<string, unknown>) {
  const { as, children, ...rest } = props;
  return React.createElement(as ?? "h1", rest, children);
}
function Text(props: { children?: React.ReactNode } & Record<string, unknown>) {
  return React.createElement("p", props, props.children);
}
function Link(props: { href?: string; children?: React.ReactNode } & Record<string, unknown>) {
  return React.createElement("a", props, props.children);
}
function Icon() {
  return React.createElement("svg", { "data-icon": "star" });
}
function WithIcon(props: { icon?: React.ComponentType; label?: string }) {
  const I = props.icon;
  return React.createElement("span", null, I ? React.createElement(I) : "no-icon", props.label);
}

export const REGISTRY = { Box, Heading, Text, Link, WithIcon };

const heroBlock = {
  version: 2,
  rootId: "hb",
  nodes: {
    hb: { type: "Box", props: { variant: "hero" }, children: ["ht", "hs"] },
    ht: { type: "Heading", props: { as: "h2", children: "Default title" } },
    hs: { type: "Text", props: { children: "Default subtitle" } },
  },
  parents: { hb: null, ht: "hb", hs: "hb" },
  params: [
    { name: "title", nodeId: "ht", prop: "children", label: "Title" },
    { name: "subtitle", nodeId: "hs", prop: "children" },
  ],
};

const outerBlock = {
  version: 2,
  rootId: "ob",
  nodes: {
    ob: { type: "Box", props: { variant: "outer" }, children: ["or"] },
    or: { type: "Ref", props: { blockId: "hero", params: { title: "Nested hero" } } },
  },
  parents: { ob: null, or: "ob" },
};

const selfBlock = {
  version: 2,
  rootId: "sb",
  nodes: {
    sb: { type: "Box", children: ["sr"] },
    sr: { type: "Ref", props: { blockId: "self" } },
  },
  parents: { sb: null, sr: "sb" },
};

export const BLOCK_STORE: Record<string, unknown> = { hero: heroBlock, outer: outerBlock, self: selfBlock };

const page = {
  version: 2,
  rootId: "root",
  nodes: {
    root: { type: "Box", props: { gap: 4, layout: { dir: "col" } }, children: ["title", "admin", "guest", "promo", "cta", "icon", "ghost", "list"] },
    title: { type: "Heading", props: { as: "h1", children: "Welcome" } },
    admin: {
      type: "Text",
      props: { children: "Admin only" },
      visibility: { when: { op: "in", path: "user.role", values: ["admin", "owner"] } },
    },
    guest: {
      type: "Text",
      props: { children: "Guest only" },
      visibility: { when: { op: "not", condition: { op: "exists", path: "user" } } },
    },
    promo: {
      type: "Text",
      props: { children: "Default promo" },
      variants: [
        { id: "kk", when: { when: { op: "eq", path: "locale", value: "kk" } }, props: { children: "Қазақша промо" } },
        { id: "ru", when: { when: { op: "eq", path: "locale", value: "ru" } }, props: { children: "Промо по-русски" } },
      ],
    },
    cta: { type: "Link", props: { href: "about", children: "About us" } },
    icon: { type: "WithIcon", props: { icon: "star", label: "rated" } },
    ghost: { type: "NotInRegistry", props: { children: "never drawn" } },
    list: { type: "Box", props: { role: "list" }, children: ["i1", "i2", "i3"] },
    i1: { type: "Text", props: { children: "first" } },
    i2: { type: "Text", props: { children: "second" }, visibility: { permission: "list:read" } },
    i3: { type: "Text", props: { children: "third" } },
  },
  parents: { root: null, title: "root", admin: "root", guest: "root", promo: "root", cta: "root", icon: "root", ghost: "root", list: "root", i1: "list", i2: "list", i3: "list" },
};

const refsPage = {
  version: 2,
  rootId: "r",
  nodes: {
    r: { type: "Box", children: ["hero1", "hero2", "outer", "missing", "empty", "self"] },
    hero1: { type: "Ref", props: { blockId: "hero" } },
    hero2: { type: "Ref", props: { blockId: "hero", params: { title: "Custom title", subtitle: 42 } } },
    outer: { type: "Ref", props: { blockId: "outer" } },
    missing: { type: "Ref", props: { blockId: "gone" } },
    empty: { type: "Ref", props: {} },
    self: { type: "Ref", props: { blockId: "self" } },
  },
  parents: { r: null, hero1: "r", hero2: "r", outer: "r", missing: "r", empty: "r", self: "r" },
};

const legacyV1 = {
  version: 1,
  root: {
    type: "Box",
    props: { legacy: true },
    children: [
      { type: "Heading", props: { children: "From v1" } },
      { type: "Text", props: { children: "hidden for guests" }, visibility: { when: { op: "truthy", path: "user.id" } } },
      { type: "Box", children: [{ type: "Text", props: { children: "deep" } }] },
    ],
  },
};

const ctxAdminKk = {
  user: { id: "u1", role: "admin" },
  locale: "kk",
  can: (p: string) => p === "list:read",
  link: (href: string) => (href.startsWith("/") ? href : `/site/${href}`),
  icons: { star: Icon },
};
const ctxGuestRu = { locale: "ru", link: (href: string) => `/ru/${href}` };

export type RenderCase = {
  name: string;
  render: (engine: EngineUnderTest) => Promise<React.ReactNode>;
};

function prepare(engine: EngineUnderTest, raw: unknown): unknown {
  const v = engine.validateSaunaSchema(raw);
  if (!v.ok) throw new Error(`fixture invalid: ${v.error.message}`);
  return engine.migrateSaunaSchema(v.value as never);
}

async function loadBlocks(engine: EngineUnderTest, schema: unknown) {
  return engine.loadBlockRefs(schema as never, async (id) => BLOCK_STORE[id] ?? null);
}

export const CASES: RenderCase[] = [
  {
    name: "page / admin, kk, permissions, link + icon context",
    render: async (e) => <e.SaunaRenderer schema={prepare(e, page)} registry={REGISTRY} context={ctxAdminKk} />,
  },
  {
    name: "page / guest, ru, no can()",
    render: async (e) => <e.SaunaRenderer schema={prepare(e, page)} registry={REGISTRY} context={ctxGuestRu} />,
  },
  {
    name: "page / no context",
    render: async (e) => <e.SaunaRenderer schema={prepare(e, page)} registry={REGISTRY} />,
  },
  {
    name: "page / editable",
    render: async (e) => <e.SaunaRenderer schema={prepare(e, page)} registry={REGISTRY} context={ctxAdminKk} editable />,
  },
  {
    name: "refs / blocks loaded with loadBlockRefs",
    render: async (e) => {
      const s = prepare(e, refsPage);
      return <e.SaunaRenderer schema={s} registry={REGISTRY} blocks={await loadBlocks(e, s)} />;
    },
  },
  {
    name: "refs / editable",
    render: async (e) => {
      const s = prepare(e, refsPage);
      return <e.SaunaRenderer schema={s} registry={REGISTRY} blocks={await loadBlocks(e, s)} editable />;
    },
  },
  {
    name: "refs / no blocks map",
    render: async (e) => <e.SaunaRenderer schema={prepare(e, refsPage)} registry={REGISTRY} />,
  },
  {
    name: "legacy v1 migrated / signed in",
    render: async (e) => <e.SaunaRenderer schema={prepare(e, legacyV1)} registry={REGISTRY} context={{ user: { id: "u" } }} />,
  },
  {
    name: "legacy v1 migrated / guest",
    render: async (e) => <e.SaunaRenderer schema={prepare(e, legacyV1)} registry={REGISTRY} />,
  },
  {
    name: "server Sauna (react/server) with schema + extra context",
    render: async (e) =>
      e.SaunaServer({ id: "home", schema: prepare(e, page), registry: REGISTRY, context: ctxGuestRu, extra: { locale: "kk" } }),
  },
  {
    name: "client Sauna (react) inside SaunaProvider",
    render: async (e) => (
      <e.SaunaProvider registry={REGISTRY} context={ctxAdminKk}>
        <e.SaunaClient id="home" schema={prepare(e, page)} />
      </e.SaunaProvider>
    ),
  },
];
