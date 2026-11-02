import type { BlockDefinition } from "../core/define-block";
import type { SaunaSchema } from "../schema/types";
import type { SaunaAnyComponent, SaunaRegistry } from "./types";
import { SAUNA_REF_TYPE } from "../core/refs";

// Two objects, not one list (SDL-629):
//
//   - the REGISTRY (`SaunaRegistry`, `type` → component) answers "what do I
//     render this node with";
//   - the CATALOG (`SaunaComponentCatalog` items, or the `BlockDefinition[]`
//     the editor is handed) answers "what do I offer for insertion".
//
// They are built from the same kit but are not the same set, and a catalog
// entry with no registry pair is a block that inserts and renders nothing.
// `defineElementSet` is where the two meet: it rejects such an entry at
// compile time when both sides have literal types, and
// `findUnrenderableTypes` reports it at run time for the string-keyed kit
// half, so a test — not someone looking at the canvas — catches it.

export type SaunaComponentGroupId = string;

/** The bucket a Component lands in when nothing assigned it a group. */
export const SAUNA_UNGROUPED_ID = "ungrouped";

/**
 * How the host adapts design-system Components for the editor (SDL-629).
 *
 * A Component is not passed to the editor one-to-one: its place in the
 * Insert modal is the adapter's decision, written down as data. When an
 * adapter is given it is the ONLY source of the group — a Component with no
 * row lands in `SAUNA_UNGROUPED_ID`, and the host's test is expected to fail
 * on that rather than the engine guessing from the export name.
 */
export type SaunaElementAdapter = {
  groups: readonly SaunaComponentGroup[];
  groupOf: Readonly<Record<string, SaunaComponentGroupId>>;
  /**
   * Parts of compound Components, as DATA (SDL-633): part type → the chain
   * of types it must sit inside, outer first (`TabsTrigger: ["Tabs",
   * "TabsList"]`). A part is never offered on its own: it goes only under
   * the last type of its chain (its `allowedParents`, unless the kit is more
   * precise), and its preview is drawn inside the whole chain. Radix throws
   * for a part outside its root, so a part on a page, in a Section or in a
   * standalone preview is exactly the crash of MARKERLOOP-APP-3.
   *
   * `findUndeclaredParts` checks this table against the kit's own shape, so
   * a part exported without a row is a failing test, not a guess.
   */
  within?: Readonly<Record<string, readonly string[]>>;
  /**
   * Kit exports that are structurally a member of another export but are
   * a root of their own (`ResizablePanelGroup` of the `Resizable`
   * namespace). The other half of `findUndeclaredParts`.
   */
  standalone?: readonly string[];
};

export type SaunaComponentGroup = {
  id: SaunaComponentGroupId;
  title: string;
  order?: number;
};

export type SaunaComponentCatalogItem = {
  type: string;
  groupId: SaunaComponentGroupId;
  title?: string;
  description?: string;
  /**
   * Дефолтные props для нового узла этого типа (при добавлении).
   * Нужны, чтобы редактор не хардкодил значения для конкретных компонентов.
   */
  initialProps?: Record<string, unknown>;
  allowedParents?: string[];
  /**
   * Что этот компонент принимает внутрь себя (SDL-352). Вторая сторона
   * правила вложенности: `canAddChild` читал её из меты кита с самого
   * начала, но item её не отдавал — и потребители, живущие на items
   * (`blocksFromCatalog` → `canParentType`), половину правила не видели.
   */
  allowedChildren?: string[];
  /**
   * Предлагать ли запись к вставке (по умолчанию `true`, метка из кита).
   *
   * `false` оставляет запись в каталоге и в реестре — узел такого типа
   * рисуется и описывается редактором, — но исключает её из списка блоков,
   * которые автор может поставить на страницу (SDL-337).
   */
  insertable?: boolean;
  /**
   * The compound this entry is a part of (SDL-633): the first type of its
   * `within` chain. A part is offered only under its `allowedParents`, never
   * at a page root or in a Section, and never previewed on its own.
   */
  partOf?: string;
  previewSchema?: SaunaSchema;
  /**
   * На будущее: статическое превью/доки (например из Storybook).
   */
  previewImageSrc?: string;
  docs?: string;
  keywords?: string[];
};

export type SaunaComponentCatalog = {
  groups: SaunaComponentGroup[];
  items: SaunaComponentCatalogItem[];
  canAddChild?: (args: { parentType: string; childType: string }) => boolean;
};

export function createBasicCatalogFromRegistry(
  registry: Record<string, unknown>
): SaunaComponentCatalog {
  const types = Object.keys(registry).sort();
  return {
    groups: [{ id: "all", title: "All components", order: 0 }],
    items: types.map((type) => ({ type, groupId: "all" })),
  };
}

export function isCatalogItemAllowed(
  catalog: SaunaComponentCatalog,
  args: { parentType: string; childType: string; item?: SaunaComponentCatalogItem }
): boolean {
  const { parentType, childType } = args;
  const item = args.item ?? catalog.items.find((x) => x.type === childType);
  if (!item) return false;
  // Not offered (SDL-337) is not offered anywhere — this is also the path of
  // the engine's add-child modal, which draws a preview of every allowed item.
  if (item.insertable === false) return false;
  // A part without its parent rule would be offered everywhere (SDL-633).
  if (item.partOf && !item.allowedParents) return false;
  if (item.allowedParents && !item.allowedParents.includes(parentType)) return false;
  if (catalog.canAddChild && catalog.canAddChild({ parentType, childType }) === false) return false;
  return true;
}


/** Anything that names types offered for insertion. */
export type SaunaInsertable = { readonly type: string };

/**
 * Types offered for insertion that the registry cannot render, sorted.
 * Empty means every catalog entry has its registry pair.
 */
export function findUnrenderableTypes(
  offered: readonly SaunaInsertable[] | SaunaComponentCatalog,
  registry: SaunaRegistry
): string[] {
  const list = Array.isArray(offered) ? offered : (offered as SaunaComponentCatalog).items;
  const missing = new Set<string>();
  for (const entry of list as readonly SaunaInsertable[]) {
    // `Ref` is drawn by the renderer itself, before any registry lookup
    // (SDL-338); its catalog entry (SDL-718) describes it, nothing renders it.
    if (entry.type === SAUNA_REF_TYPE) continue;
    if (registry[entry.type] == null) {
      missing.add(entry.type);
    }
  }
  return [...missing].sort();
}

/**
 * The editor's palette: what it renders with and what it offers, paired.
 *
 * `TType` is inferred from the blocks. When the blocks carry literal types
 * and the registry literal keys, a block without a component is a type
 * error (`blocks` stops being assignable). A string-keyed registry — the kit
 * walked at run time — accepts any name, which is what
 * `findUnrenderableTypes` covers.
 */
export type SaunaElementSet<TType extends string = string> = {
  readonly registry: SaunaRegistry & Record<TType, SaunaAnyComponent>;
  readonly blocks: readonly (BlockDefinition & { type: TType })[];
};

export function defineElementSet<
  const TRegistry extends SaunaRegistry,
  const TType extends Extract<keyof TRegistry, string>,
>(args: {
  registry: TRegistry;
  blocks: readonly (BlockDefinition & { type: TType })[];
}): SaunaElementSet<TType> {
  return { registry: args.registry as SaunaRegistry & Record<TType, SaunaAnyComponent>, blocks: args.blocks };
}

/**
 * The kit's compound parts by SHAPE (SDL-633): part export → the export it
 * is a member of. An export that is a function with members
 * (`Object.assign(Root, {Header})`) or a namespace object (`DialogKit`) owns
 * every capitalised member that is also a flat export by identity
 * (`UI.Card.Header === UI.CardHeader`); nested namespaces
 * (`Dialog.Alert.Portal`) are walked too. `Root` and a self-reference are
 * not parts.
 *
 * Not the source of truth — the adapter's `within` is. This is the drift
 * check behind `findUndeclaredParts`.
 */
export function saunaCompoundParts(ui: Readonly<Record<string, unknown>>): Record<string, string> {
  const byValue = new Map<unknown, string[]>();
  for (const name of Object.keys(ui).sort()) {
    if (!/^[A-Z]/.test(name)) continue;
    const v = ui[name];
    if (v == null || (typeof v !== "function" && typeof v !== "object")) continue;
    byValue.set(v, [...(byValue.get(v) ?? []), name]);
  }
  const out: Record<string, string> = {};
  const walk = (owner: string, ownerValue: unknown, value: unknown, seen: Set<unknown>) => {
    if (value == null || (typeof value !== "function" && typeof value !== "object") || seen.has(value)) return;
    seen.add(value);
    for (const key of Object.keys(value).sort()) {
      if (!/^[A-Z]/.test(key) || key === "Root") continue;
      const member = (value as Record<string, unknown>)[key];
      if (member === ownerValue) continue;
      for (const flat of byValue.get(member) ?? []) if (flat !== owner && !(flat in out)) out[flat] = owner;
      walk(owner, ownerValue, member, seen);
    }
  };
  // Only Component-named exports own parts — not a CJS interop `default`.
  for (const name of Object.keys(ui).sort()) if (/^[A-Z]/.test(name)) walk(name, ui[name], ui[name], new Set());
  // An alias of an owner (`TableKit` for `Table`) is not a part of itself.
  for (const [part, owner] of Object.entries(out)) if (ui[part] === ui[owner]) delete out[part];
  return out;
}

/**
 * Kit parts the adapter does not declare, sorted (SDL-633): every structural
 * part must have a `within` row or be listed `standalone`. Empty is green.
 */
export function findUndeclaredParts(
  ui: Readonly<Record<string, unknown>>,
  adapter: Pick<SaunaElementAdapter, "within" | "standalone">
): string[] {
  const standalone = new Set(adapter.standalone ?? []);
  return Object.keys(saunaCompoundParts(ui))
    .filter((p) => !(p in (adapter.within ?? {})) && !standalone.has(p))
    .sort();
}
