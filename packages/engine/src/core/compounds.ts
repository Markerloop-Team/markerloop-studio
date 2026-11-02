// Compound Elements (SDL-633): Tabs, Card, Table, Accordion — inserted as ONE node with all of its settings, not as a tree of
// parts the author assembles by hand.
//
// A compound is an Element of its own (`TabsView`, `CardView`, `TableView`),
// not a new version of the kit root it draws: a hand-built `Tabs > TabsList >
// …` tree stored before SDL-633 keeps its type and renders exactly as before.
// The node stores settings only; `expand` turns them into the tree of kit
// parts IN MEMORY at render time, and that tree is never written anywhere.
//
// Rich content is not squeezed into strings: the node's own CHILDREN are
// slots. `TabsView` puts child i under tab i, `AccordionView` child i in item
// i, `CardView` puts every child in the card body.
//
// Binding by POSITION is a decision, not an accident (review of a57dc14): the
// page tree already stores the children's order, and every studio path that
// moves nodes (drop, move, paste, undo) keeps it without knowing compounds
// exist. A second link (item id → child id) would be a second source of truth
// all of those paths must maintain. The price: `items` and the children must
// change TOGETHER — delete or reorder an item only through
// `removeCompoundItem` / `moveCompoundItem` below, which carry the item's
// child with it in the same edit, and add an item only through
// `addCompoundItem`, which gives it (and every item before it) a content
// child of its own. The properties panel's item list editor
// (`@markerloop/studio`, SDL-633) is the only caller, and `items` is no
// longer offered as raw JSON there. What still can put content under another
// title is deleting or dragging a CHILD in the outline — the outline does not
// know compounds; the panel's list is the way to change items. A child with no slot to go to is not dropped silently — the
// component draws a visible "N not shown" plate (the same rule as the
// renderer's unknown-children mark).
//
// Server-safe: zod only, no React.

import { z } from "zod";

import { createSaunaNodeId } from "../schema/id";
import type { SaunaNodeConfig, SaunaSchema } from "../schema/types";
import { defineBlock, type BlockDefinition } from "./define-block";
import type { SaunaPropsVersionOf } from "./element-props";
import { createInitialNodeConfig } from "./schema-ops";

/** Node type the component replaces with the node's own children. `props.index` picks one child; absent → all. */
export const SAUNA_COMPOUND_SLOT = "$slot";
/** Node type the component replaces with the string `props.text`. */
export const SAUNA_COMPOUND_TEXT = "$text";

export type CompoundDefinition<S extends z.ZodObject = z.ZodObject, T extends string = string> = {
  /** The Element: what the catalog offers and the props panel edits. */
  block: BlockDefinition<S, z.ZodTypeAny, T>;
  /** The settings schema (the same object as `block.staticProps`). */
  schema: S;
  /** The kit root this Element replaces in the Insert modal. */
  root: string;
  /** Every other kit type `expand` may emit. */
  parts: readonly string[];
  /** How many of the node's own children have a slot, given its parsed props (`Infinity` = all). */
  slots(props: z.output<S>): number;
  /** Settings → the tree of kit parts. Pure; the result is never stored. */
  expand(props: z.output<S>): SaunaSchema;
};

function defineCompound<const T extends string, S extends z.ZodObject>(def: {
  type: T;
  displayName: string;
  schema: S;
  meta: NonNullable<BlockDefinition["meta"]>;
  root: string;
  parts: readonly string[];
  slots(props: z.output<S>): number;
  expand(props: z.output<S>): SaunaSchema;
}): CompoundDefinition<S, T> {
  const block = defineBlock({ type: def.type, displayName: def.displayName, propsVersion: 1, staticProps: def.schema, meta: def.meta });
  return { block, schema: def.schema, root: def.root, parts: def.parts, slots: def.slots, expand: def.expand };
}

/** A tiny tree builder: deterministic ids, parents filled in. */
function tree(build: (add: (type: string, props?: Record<string, unknown>, parent?: string) => string) => void): SaunaSchema {
  const nodes: Record<string, SaunaNodeConfig> = {};
  const parents: Record<string, string | null> = {};
  let n = 0;
  let rootId = "";
  const add = (type: string, props?: Record<string, unknown>, parent?: string): string => {
    const id = `c${n++}`;
    nodes[id] = props ? { type, props } : { type };
    parents[id] = parent ?? null;
    if (parent) {
      const p = nodes[parent]!;
      p.children = [...(p.children ?? []), id];
    } else rootId = id;
    return id;
  };
  build(add);
  return { version: 2, rootId, nodes, parents };
}

const text = (max: number) => z.string().max(max);

/** Item caps of the item-slotted compounds — one number for the schema and the list editor. */
export const TABS_MAX_ITEMS = 12;
export const ACCORDION_MAX_ITEMS = 30;

// --- TabsView ---------------------------------------------------------------

export const TabsViewProps = z.strictObject({
  items: z.array(z.strictObject({ label: text(80).min(1), text: text(4000) })).min(1).max(TABS_MAX_ITEMS),
  orientation: z.enum(["horizontal", "vertical"]),
});

export const TabsViewElement = defineCompound({
  type: "TabsView",
  displayName: "Tabs",
  schema: TabsViewProps,
  meta: {
    category: "Widgets",
    icon: "Tabs",
    description: "Tabs with their labels and text; drop a block inside to fill a tab — the n-th block goes to the n-th tab.",
    initialProps: {
      items: [
        { label: "Overview", text: "What this is about." },
        { label: "Details", text: "The finer points." },
      ],
      orientation: "horizontal",
    },
  },
  root: "Tabs",
  parts: ["TabsList", "TabsTrigger", "TabsContent"],
  slots: (p) => p.items.length,
  expand: (p) =>
    tree((add) => {
      const root = add("Tabs", { defaultValue: "tab-0", orientation: p.orientation });
      const list = add("TabsList", undefined, root);
      p.items.forEach((item, i) => {
        const trigger = add("TabsTrigger", { value: `tab-${i}` }, list);
        add(SAUNA_COMPOUND_TEXT, { text: item.label }, trigger);
      });
      p.items.forEach((item, i) => {
        const content = add("TabsContent", { value: `tab-${i}` }, root);
        if (item.text) add(SAUNA_COMPOUND_TEXT, { text: item.text }, content);
        add(SAUNA_COMPOUND_SLOT, { index: i }, content);
      });
    }),
});

// --- CardView ---------------------------------------------------------------

export const CardViewProps = z.strictObject({
  title: text(200),
  description: text(400).optional(),
  text: text(4000).optional(),
  footer: text(400).optional(),
});

export const CardViewElement = defineCompound({
  type: "CardView",
  displayName: "Card",
  schema: CardViewProps,
  meta: {
    category: "Widgets",
    icon: "Card",
    description: "A card with a title, a line of description, text and a footer; blocks dropped inside go to its body.",
    initialProps: { title: "Card title", description: "A short description", text: "Card text." },
  },
  root: "Card",
  parts: ["CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter"],
  slots: () => Number.POSITIVE_INFINITY,
  expand: (p) =>
    tree((add) => {
      const root = add("Card");
      const header = add("CardHeader", undefined, root);
      add(SAUNA_COMPOUND_TEXT, { text: p.title }, add("CardTitle", undefined, header));
      if (p.description) add(SAUNA_COMPOUND_TEXT, { text: p.description }, add("CardDescription", undefined, header));
      const content = add("CardContent", undefined, root);
      if (p.text) add(SAUNA_COMPOUND_TEXT, { text: p.text }, content);
      add(SAUNA_COMPOUND_SLOT, undefined, content);
      if (p.footer) add(SAUNA_COMPOUND_TEXT, { text: p.footer }, add("CardFooter", undefined, root));
    }),
});

// --- AccordionView ----------------------------------------------------------

export const AccordionViewProps = z.strictObject({
  items: z.array(z.strictObject({ label: text(200).min(1), text: text(4000) })).min(1).max(ACCORDION_MAX_ITEMS),
  /** `single`: one item open at a time; `multiple`: each opens on its own. */
  type: z.enum(["single", "multiple"]),
  /** `single` only: the open item can be closed again. Ignored for `multiple` — never reaches the DOM. */
  collapsible: z.boolean(),
});

export const AccordionViewElement = defineCompound({
  type: "AccordionView",
  displayName: "Accordion",
  schema: AccordionViewProps,
  meta: {
    category: "Widgets",
    icon: "Accordion",
    description: "Collapsible items with their titles and text; drop a block inside to fill an item — the n-th block goes to the n-th item.",
    initialProps: {
      items: [
        { label: "What is it?", text: "A short answer." },
        { label: "How does it work?", text: "A longer answer." },
      ],
      type: "single",
      collapsible: true,
    },
  },
  root: "Accordion",
  parts: ["AccordionItem", "AccordionTrigger", "AccordionContent"],
  slots: (p) => p.items.length,
  expand: (p) =>
    tree((add) => {
      const root = add("Accordion", p.type === "single" ? { type: "single", collapsible: p.collapsible } : { type: "multiple" });
      p.items.forEach((item, i) => {
        const it = add("AccordionItem", { value: `item-${i}` }, root);
        add(SAUNA_COMPOUND_TEXT, { text: item.label }, add("AccordionTrigger", undefined, it));
        const content = add("AccordionContent", undefined, it);
        if (item.text) add(SAUNA_COMPOUND_TEXT, { text: item.text }, content);
        add(SAUNA_COMPOUND_SLOT, { index: i }, content);
      });
    }),
});

// --- TableView --------------------------------------------------------------

export const TableViewProps = z.strictObject({
  caption: text(200).optional(),
  header: z.boolean(),
  rows: z.array(z.array(text(500)).min(1).max(12)).min(1).max(100),
  // Style flags (SDL-775, EP-160); absent = off = the table as before.
  bordered: z.boolean().optional(),
  striped: z.boolean().optional(),
  compact: z.boolean().optional(),
});

/** Inline style of the table's parts for the style flags; `undefined` when a part is untouched. */
export function tableViewPartStyles(p: { bordered?: boolean; striped?: boolean; compact?: boolean }): {
  table?: Record<string, string>;
  cell?: Record<string, string>;
  head?: Record<string, string>;
  stripe?: Record<string, string>;
} {
  const cell: Record<string, string> = {
    ...(p.compact ? { padding: "0.25rem 0.5rem" } : null),
    ...(p.bordered ? { border: "1px solid var(--border)" } : null),
  };
  const any = Object.keys(cell).length > 0;
  return {
    ...(p.bordered ? { table: { borderCollapse: "collapse" } } : null),
    ...(any ? { cell, head: p.compact ? { ...cell, height: "auto" } : cell } : null),
    ...(p.striped ? { stripe: { background: "var(--muted)" } } : null),
  };
}

export const TableViewElement = defineCompound({
  type: "TableView",
  displayName: "Table",
  schema: TableViewProps,
  meta: {
    category: "Widgets",
    icon: "Table",
    description: "A table of text cells; the first row can be its header.",
    allowedChildren: [],
    initialProps: {
      header: true,
      rows: [
        ["Plan", "Price"],
        ["Basic", "$10"],
      ],
    },
  },
  root: "Table",
  parts: ["TableCaption", "TableHeader", "TableBody", "TableRow", "TableHead", "TableCell"],
  slots: () => 0,
  expand: (p) =>
    tree((add) => {
      const width = Math.max(...p.rows.map((r) => r.length));
      const pad = (r: readonly string[]) => [...r, ...Array.from({ length: width - r.length }, () => "")];
      const st = tableViewPartStyles(p);
      const own = (style: Record<string, string> | undefined) => (style ? { style } : undefined);
      const root = add("Table", own(st.table));
      if (p.caption) add(SAUNA_COMPOUND_TEXT, { text: p.caption }, add("TableCaption", undefined, root));
      const [first, ...rest] = p.rows;
      const bodyRows = p.header ? rest : p.rows;
      if (p.header && first) {
        const row = add("TableRow", undefined, add("TableHeader", undefined, root));
        pad(first).forEach((cell) => add(SAUNA_COMPOUND_TEXT, { text: cell }, add("TableHead", own(st.head), row)));
      }
      const body = add("TableBody", undefined, root);
      bodyRows.forEach((r, i) => {
        const row = add("TableRow", own(i % 2 === 1 ? st.stripe : undefined), body);
        pad(r).forEach((cell) => add(SAUNA_COMPOUND_TEXT, { text: cell }, add("TableCell", own(st.cell), row)));
      });
    }),
});

/** The compound Elements; pair with `createCompoundRegistry` from `@markerloop/engine/react`. */
export const COMPOUND_ELEMENTS = [TabsViewElement, CardViewElement, TableViewElement, AccordionViewElement] as const;
export const COMPOUND_BLOCKS = [
  TabsViewElement.block,
  CardViewElement.block,
  TableViewElement.block,
  AccordionViewElement.block,
] as const;

/** Kit types a compound's tree needs that `registry` cannot render, sorted. Empty = every compound draws. */
export function findMissingCompoundParts(
  elements: readonly CompoundDefinition[],
  registry: Readonly<Record<string, unknown>>
): string[] {
  const missing = new Set<string>();
  for (const e of elements) for (const t of [e.root, ...e.parts]) if (registry[t] == null) missing.add(t);
  return [...missing].sort();
}

// --- keeping `items` and the children in lockstep ---------------------------

/** The compounds whose children bind to `items` by position, with their item cap (the schema's `.max`). */
export const COMPOUND_ITEM_LIMITS: Readonly<Record<string, number>> = {
  TabsView: TABS_MAX_ITEMS,
  AccordionView: ACCORDION_MAX_ITEMS,
};
const ITEM_SLOTTED: ReadonlySet<string> = new Set(Object.keys(COMPOUND_ITEM_LIMITS));

/** True for a type whose children bind to its `items` by position (`TabsView`, `AccordionView`). */
export function isItemSlottedCompound(type: string | undefined): boolean {
  return type !== undefined && ITEM_SLOTTED.has(type);
}

/** The node a new item's content starts as: an empty column `Box` (an engine primitive) the author drops blocks into. */
export const COMPOUND_ITEM_CONTENT: Readonly<SaunaNodeConfig> = {
  type: "Box",
  props: { direction: "column", gap: 4, padding: 0, align: "stretch" },
};

/**
 * `node` without `items` in any width override (`screens[w].props`) or in the
 * member branch (`member.props`); emptied override objects are removed, not
 * left as `{}`. An override of `items` is layered over the base by the
 * renderer, so after an item edit that moved children it would put content
 * under another title (a phone override [A,B,C] after B's deletion shows C's
 * content under B). Items are one list for every width and every visitor:
 * every item edit drops those overrides in the same edit. The node itself
 * comes back when it had none.
 */
export function withoutItemsOverrides(node: SaunaNodeConfig): SaunaNodeConfig {
  let next = node;
  if (node.screens) {
    const screens: NonNullable<SaunaNodeConfig["screens"]> = {};
    let changed = false;
    for (const [screen, entry] of Object.entries(node.screens) as [keyof NonNullable<SaunaNodeConfig["screens"]>, { props?: Record<string, unknown> } | undefined][]) {
      if (!entry) continue;
      if (entry.props && "items" in entry.props) {
        changed = true;
        const { items: _drop, ...rest } = entry.props;
        void _drop;
        const { props: _p, ...other } = entry;
        void _p;
        const kept = Object.keys(rest).length ? { ...other, props: rest } : other;
        if (Object.keys(kept).length) screens[screen] = kept;
      } else screens[screen] = entry;
    }
    if (changed) {
      const { screens: _s, ...withoutScreens } = next;
      void _s;
      next = Object.keys(screens).length ? { ...withoutScreens, screens } : withoutScreens;
    }
  }
  if (node.member?.props && "items" in node.member.props) {
    const { items: _drop, ...rest } = node.member.props;
    void _drop;
    const { props: _p, ...other } = node.member;
    void _p;
    const member = Object.keys(rest).length ? { ...other, props: rest } : other;
    const { member: _m, ...withoutMember } = next;
    void _m;
    next = Object.keys(member).length ? { ...withoutMember, member } : withoutMember;
  }
  return next;
}

function withItemsAndChildren(
  schema: SaunaSchema,
  nodeId: string,
  edit: (items: unknown[], children: (string | undefined)[]) => void
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node || !ITEM_SLOTTED.has(node.type)) return schema;
  const items = Array.isArray(node.props?.items) ? [...(node.props!.items as unknown[])] : null;
  if (!items) return schema;
  const children: (string | undefined)[] = [...(node.children ?? [])];
  const before = JSON.stringify([items, children]);
  edit(items, children);
  // A refused edit (a move that would open a hole) leaves the document — overrides included — as it was.
  // Compared without the `undefined` padding a move adds for items that have no child yet: a refused
  // move keeps that padding, and counting it as a change stored a copy and dropped the overrides.
  const filled = children.filter((c): c is string => c !== undefined);
  if (JSON.stringify([items, filled]) === before) return schema;
  const nodes = { ...schema.nodes, [nodeId]: { ...withoutItemsOverrides(node), props: { ...node.props, items }, children: filled } };
  return { ...schema, nodes };
}

/**
 * Removes item `index` of a `TabsView` / `AccordionView` and the child that
 * fills it, as one edit. The child's subtree leaves the document. Children
 * after it move up with their items, so every title keeps its content.
 */
export function removeCompoundItem(schema: SaunaSchema, nodeId: string, index: number): SaunaSchema {
  let removed: string | undefined;
  const next = withItemsAndChildren(schema, nodeId, (items, children) => {
    if (index < 0 || index >= items.length || items.length <= 1) return;
    items.splice(index, 1);
    if (index < children.length) removed = children.splice(index, 1)[0];
  });
  if (!removed) return next;
  const drop = new Set<string>();
  const walk = (id: string) => {
    drop.add(id);
    for (const c of next.nodes[id]?.children ?? schema.nodes[id]?.children ?? []) walk(c);
  };
  walk(removed);
  const nodes = Object.fromEntries(Object.entries(next.nodes).filter(([id]) => !drop.has(id)));
  const parents = Object.fromEntries(Object.entries(next.parents).filter(([id]) => !drop.has(id)));
  return { ...next, nodes, parents };
}

/**
 * Moves item `from` to position `to` of a `TabsView` / `AccordionView` and
 * its child with it, as one edit. An item with no child yet (a trailing,
 * empty tab) moves alone; the children that exist keep their items.
 */
export function moveCompoundItem(schema: SaunaSchema, nodeId: string, from: number, to: number): SaunaSchema {
  return withItemsAndChildren(schema, nodeId, (items, children) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    while (children.length < items.length) children.push(undefined);
    const extra = children.splice(items.length);
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    const [child] = children.splice(from, 1);
    children.splice(to, 0, child);
    // Trailing holes are harmless; a hole in the MIDDLE would shift slots
    // again, so an empty item that moved before a filled one needs a
    // placeholder child — refuse instead and keep the document as it was.
    const lastFilled = children.reduce((acc, c, i) => (c !== undefined ? i : acc), -1);
    if (children.slice(0, lastFilled).some((c) => c === undefined)) {
      items.splice(to, 1);
      items.splice(from, 0, item);
      children.splice(to, 1);
      children.splice(from, 0, child);
    }
    children.push(...extra);
  });
}

/**
 * Appends `item` to a `TabsView` / `AccordionView` together with a content
 * child of its own, as one edit. Without that child the new item's slot would
 * be filled by whatever child already sits at that position — a block the
 * author left over the end of the list would jump under the new title. Items
 * before it that have no child yet get one too, so the children line up with
 * the items and every later move is allowed. Refused (the schema comes back
 * as it was) at the type's item cap.
 */
export function addCompoundItem(
  schema: SaunaSchema,
  nodeId: string,
  item: { label: string; text: string },
  options?: { propsVersionOf?: SaunaPropsVersionOf }
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node || !ITEM_SLOTTED.has(node.type)) return schema;
  const items = Array.isArray(node.props?.items) ? (node.props!.items as unknown[]) : null;
  if (!items || items.length >= (COMPOUND_ITEM_LIMITS[node.type] ?? 0)) return schema;
  const children = [...(node.children ?? [])];
  const fresh: Record<string, SaunaNodeConfig> = {};
  // Items 0..items.length (the new one included) each need a child.
  const at = Math.min(children.length, items.length);
  const ids: string[] = [];
  // The content child is a node like any inserted one: it carries its
  // Element's props version when that is not 1 (SDL-667).
  const contentVersion = options?.propsVersionOf?.(COMPOUND_ITEM_CONTENT.type);
  for (let i = at; i <= items.length; i++) {
    const id = createSaunaNodeId();
    fresh[id] = { ...createInitialNodeConfig(COMPOUND_ITEM_CONTENT.type, contentVersion), props: { ...COMPOUND_ITEM_CONTENT.props } };
    ids.push(id);
  }
  children.splice(at, 0, ...ids);
  const parents = { ...schema.parents };
  for (const id of ids) parents[id] = nodeId;
  return {
    ...schema,
    nodes: {
      ...schema.nodes,
      ...fresh,
      [nodeId]: { ...withoutItemsOverrides(node), props: { ...node.props, items: [...items, { ...item }] }, children },
    },
    parents,
  };
}

/**
 * Replaces the headings and texts of a `TabsView` / `AccordionView` — the
 * list the panel's fields edit — and drops every width / member override of
 * `items` in the same edit, so the list the author sees is what every width
 * and every visitor gets. The item COUNT must stay: adding, deleting and
 * reordering go through the functions above, which carry the children.
 */
export function setCompoundItems(
  schema: SaunaSchema,
  nodeId: string,
  items: readonly { label: string; text: string }[]
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node || !ITEM_SLOTTED.has(node.type)) return schema;
  const current = Array.isArray(node.props?.items) ? (node.props!.items as unknown[]) : null;
  if (!current || current.length !== items.length) return schema;
  return {
    ...schema,
    nodes: { ...schema.nodes, [nodeId]: { ...withoutItemsOverrides(node), props: { ...node.props, items: items.map((i) => ({ ...i })) } } },
  };
}
