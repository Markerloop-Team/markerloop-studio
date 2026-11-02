// The Insert panel's catalogue as data (SDL-631).
//
// The acceptance reference is the SDL-594 canvas
// (`apps/admin/src/app/design-system/_canvas/studio-insert-parts.tsx`,
// route `/design-system/studio/insert`). It retired the live-showcase card
// (`insert-preview.tsx`, deleted in SDL-631): nine cards out of ten degraded to an empty box with
// a name under it, and the ones that did render flooded the console. A card
// is now an ICON, a name and a sentence — and every one of the three is
// guaranteed here, so an empty card cannot be built at all.
//
// One function builds what the grid, the group chips and the match counter
// read (the canvas's `buildCatalog`), for the same reason the canvas gives:
// three places computing the same list is how the modal and the outline drag
// once disagreed (SDL-304).

import type { BlockDefinition } from "@markerloop/engine";

import {
  AlertTriangle,
  Bell,
  Blocks,
  Box,
  ChevronsDownUp,
  CircleUser,
  Code,
  Columns2,
  Component,
  Image,
  LayoutTemplateIcon,
  Link,
  List,
  MessageSquare,
  Minus,
  MousePointerClick,
  PackageOpen,
  Palette,
  PanelRight,
  PanelTop,
  RectangleHorizontal,
  Rows3,
  ScrollText,
  Search,
  Shapes,
  SquareArrowOutUpRight,
  SquareDashed,
  Table,
  Tag,
  TextCursorInput,
  ToggleLeft,
  Type,
  type Icon,
} from "./icons";

/** Where an entry came from — the canvas's «Sources» row. */
export type SaunaInsertSource = "kit" | "own";

export type SaunaInsertEntry = {
  /** `data-sauna-insert-card` — the block type or the component id. */
  key: string;
  title: string;
  /** Never empty: see `saunaInsertDescription`. */
  description: string;
  /** The group is ADAPTER data (`meta.category`), not a guess from a name. */
  groupId: string;
  groupTitle: string;
  /**
   * The adapter group's `order` (kit: primitives 10, forms 20, widgets 30).
   * Absent for the host's hand-written blocks: their groups keep arrival
   * order and come before the ordered ones.
   */
  groupOrder?: number;
  source: SaunaInsertSource;
  icon: Icon;
  /** What the search reads besides the title and the description. */
  keywords: readonly string[];
  /** False when the target refuses it; `reason` then says why. */
  allowed: boolean;
  reason?: string;
  /**
   * A build that goes in as ONE node (the author's own component). `chain`
   * is what is inside, in document order, so the promise «inserts as a whole»
   * can be checked before the click rather than trusted.
   */
  compound?: { nodes: number; chain: readonly string[] };
};

export type SaunaInsertGroup = {
  id: string;
  title: string;
  source: SaunaInsertSource;
  order?: number;
};

export type SaunaInsertSection = {
  group: SaunaInsertGroup;
  entries: SaunaInsertEntry[];
};

export type SaunaInsertCatalog = {
  sections: SaunaInsertSection[];
  /** Every group of the catalogue — for the chip row, including groups the search emptied. */
  groups: SaunaInsertGroup[];
  /** Entries drawn. */
  shown: number;
  /** Entries the sources returned at all — the difference between «nothing found» and «nothing here». */
  total: number;
};

/**
 * Glyph per kit type, for blocks whose adapter names no icon. The keys are
 * type NAMES, and the table is a fallback, not the source: `meta.icon` wins
 * whenever the adapter fills it. A type missing here still gets a glyph —
 * `Component` — so coverage is 100% by construction, which is the whole point
 * of the icon card.
 */
const ICON_BY_TYPE: Readonly<Record<string, Icon>> = {
  Page: LayoutTemplateIcon,
  Section: PanelTop,
  Box,
  Text: Type,
  Heading: Type,
  Link,
  Image,
  Button: MousePointerClick,
  ActionCardLink: SquareArrowOutUpRight,
  Badge: Tag,
  Separator: Minus,
  Skeleton: SquareDashed,
  Input: TextCursorInput,
  InputGroup: TextCursorInput,
  Switch: ToggleLeft,
  Toggle: ToggleLeft,
  ToggleGroup: ToggleLeft,
  Card: RectangleHorizontal,
  Table,
  TableKit: Table,
  Accordion: ChevronsDownUp,
  Alert: AlertTriangle,
  Avatar: CircleUser,
  Code,
  Command: Search,
  EmptyState: PackageOpen,
  IconGallery: Shapes,
  ListHeader: List,
  ResizablePanelGroup: Columns2,
  ScrollArea: ScrollText,
  Sheet: PanelRight,
  Tabs: Rows3,
  ThemeProvider: Palette,
  Toast: Bell,
  Tooltip: MessageSquare,
};

/** Families: `CardHeader` draws like `Card`, `TableRow` like `Table`. */
const ICON_BY_PREFIX: readonly (readonly [string, Icon])[] = [
  ["Card", RectangleHorizontal],
  ["Table", Table],
  ["Avatar", CircleUser],
  ["Command", Search],
  ["InputGroup", TextCursorInput],
  ["Resizable", Columns2],
  ["ScrollBar", ScrollText],
  ["Sheet", PanelRight],
  ["Tabs", Rows3],
  ["ToggleGroup", ToggleLeft],
  ["Tooltip", MessageSquare],
];

/** `meta.icon` names this panel can draw — the adapter's channel for a glyph. */
const ICON_BY_NAME: Readonly<Record<string, Icon>> = {
  ...ICON_BY_TYPE,
  blocks: Blocks,
  box: Box,
  component: Component,
  image: Image,
  link: Link,
  list: List,
  table: Table,
  text: Type,
  type: Type,
};

/** The glyph a kit block is drawn with. Never undefined. */
export function saunaInsertIcon(block: BlockDefinition): Icon {
  const named = block.meta?.icon;
  if (named) {
    const hit = ICON_BY_NAME[named] ?? ICON_BY_NAME[named.toLowerCase()];
    if (hit) return hit;
  }
  const direct = ICON_BY_TYPE[block.type];
  if (direct) return direct;
  const family = ICON_BY_PREFIX.find(([prefix]) => block.type.startsWith(prefix));
  return family ? family[1] : Component;
}

/** The glyph of the author's own components (the canvas's «Your components»). */
export const SAUNA_OWN_COMPONENT_ICON: Icon = Blocks;

/**
 * The card's sentence. The adapter's description when it has one; otherwise
 * a sentence built from the group — never an empty line under the name,
 * which is the very card this task removes.
 */
export function saunaInsertDescription(block: BlockDefinition): string {
  const text = block.meta?.description?.trim();
  if (text) return text;
  const group = block.meta?.category?.trim();
  return group ? `Component from the ${group} group.` : "Component from the kit.";
}

/** Group id from the adapter's title: stable, attribute-safe. */
export function saunaInsertGroupId(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "other"
  );
}

/** Title of the group the author's own components land in (canvas: order 50, last). */
export const SAUNA_INSERT_OWN_GROUP_TITLE = "Your components";
export const SAUNA_INSERT_OWN_GROUP_ID = "own";

function matches(entry: SaunaInsertEntry, q: string): boolean {
  if (!q) return true;
  return [entry.title, entry.description, ...entry.keywords]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/**
 * The catalogue the panel draws.
 *
 * Groups are sorted by the adapter's `order`, as the canvas's `buildCatalog`
 * does. The order has to be carried explicitly: the engine hands kit blocks
 * over sorted by TYPE NAME, so arrival order would give «Accordion's group»
 * first. Groups without an order (the host's own blocks) keep arrival order
 * ahead of the ordered ones; the author's own components come last.
 */
export function saunaBuildInsertCatalog(args: {
  entries: readonly SaunaInsertEntry[];
  query?: string;
  groupId?: string | null;
  /** Draw refused entries too (the «N hidden — show» toggle, SDL-370). */
  includeBlocked?: boolean;
}): SaunaInsertCatalog {
  const q = (args.query ?? "").trim().toLowerCase();
  const groupId = args.groupId ?? null;
  const groups: SaunaInsertGroup[] = [];
  const byGroup = new Map<string, SaunaInsertSection>();

  for (const entry of args.entries) {
    let section = byGroup.get(entry.groupId);
    if (!section) {
      const group: SaunaInsertGroup = {
        id: entry.groupId,
        title: entry.groupTitle,
        source: entry.source,
        ...(entry.groupOrder === undefined ? {} : { order: entry.groupOrder }),
      };
      groups.push(group);
      section = { group, entries: [] };
      byGroup.set(entry.groupId, section);
    }
    if (!args.includeBlocked && !entry.allowed) continue;
    if (groupId !== null && groupId !== entry.groupId) continue;
    if (!matches(entry, q)) continue;
    section.entries.push(entry);
  }

  const rank = (g: SaunaInsertGroup) => g.order ?? Number.NEGATIVE_INFINITY;
  groups.sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) - rank(b)));
  const sections = groups
    .map((g) => byGroup.get(g.id))
    .filter((s): s is SaunaInsertSection => !!s && s.entries.length > 0);

  return {
    sections,
    groups,
    shown: sections.reduce((sum, s) => sum + s.entries.length, 0),
    total: args.entries.length,
  };
}

/** Node count and type chain of a build, in document order. */
export function saunaCompoundOf(schema: {
  rootId: string;
  nodes: Readonly<Record<string, { type: string; children?: readonly string[] } | undefined>>;
}): { nodes: number; chain: string[] } {
  const chain: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = schema.nodes[id];
    if (!node) return;
    chain.push(node.type);
    for (const child of node.children ?? []) walk(child);
  };
  walk(schema.rootId);
  return { nodes: chain.length, chain };
}
