export type SaunaId = string;

export type SaunaSchemaVersion = 1 | 2;

/**
 * Primitive JSON value used as the right-hand side of a comparison
 * in a VisibilityCondition. Arrays and nested objects are not
 * supported on the literal side — keep conditions flat; if richer
 * literals are needed, model them as nested `all`/`any` trees.
 */
export type SaunaJSONPrimitive = string | number | boolean | null;

/**
 * A single visibility condition. `path` is a dot-separated dot-path
 * into the SaunaContext (e.g. `"user.role"`, `"route.params.slug"`).
 *
 * `op` enumerates the supported comparators:
 *
 *  - `eq` / `neq`  — strict equality against `value`
 *  - `in`          — `values` array membership
 *  - `exists`      — path resolves to a non-undefined value
 *  - `truthy`      — value at path is truthy (handles booleans + nullish)
 *  - `not`         — boolean inverse of nested condition
 *  - `all`         — every nested condition is true (AND)
 *  - `any`         — at least one nested condition is true (OR)
 *
 * M2 may add range comparators (`gt`, `lt`) once we see real
 * use-cases. Until then, keep it minimal.
 */
export type VisibilityCondition =
  | { op: "eq"; path: string; value: SaunaJSONPrimitive }
  | { op: "neq"; path: string; value: SaunaJSONPrimitive }
  | { op: "in"; path: string; values: SaunaJSONPrimitive[] }
  | { op: "exists"; path: string }
  | { op: "truthy"; path: string }
  | { op: "not"; condition: VisibilityCondition }
  | { op: "all"; conditions: VisibilityCondition[] }
  | { op: "any"; conditions: VisibilityCondition[] };

/**
 * Per-node visibility rule. Both `permission` and `when` are
 * optional. When both are present, the node renders only if BOTH
 * are satisfied (logical AND). When neither is present, the node
 * is unconditionally visible.
 *
 * `permission` predates `when` (M1-PR4 introduces `when`). It
 * remains supported as a shorthand for "ask the host's
 * permission predicate" so existing schemas keep working without
 * migration.
 */
export type VisibilityRule = {
  permission?: string;
  when?: VisibilityCondition;
};

/**
 * Visibility MODE of a node (SDL-632), stored as a bare string in the same
 * `visibility` field the legacy {@link VisibilityRule} object lives in:
 *
 *  - `"public"`  — everyone sees it; goes into the anonymous, cacheable shell
 *    as is. An absent `visibility` means the same thing, which is why there is
 *    no migration writing `"public"` into old documents.
 *  - `"hybrid"`  — everyone sees it, but a member (see `SaunaContext.audience`)
 *    gets `member.props` layered over the guest values. The shell carries the
 *    GUEST branch only: `member` is stripped from every node.
 *  - `"private"` — members only. The node and its whole subtree are cut out of
 *    the public shell (`saunaPublicShell`) before it leaves the server.
 *
 * A mode is ACCESS CONTROL — it decides what reaches an anonymous visitor. The
 * legacy object rule is PRESENTATION: it is evaluated at render time against
 * the context and never removes anything from the shell. Any other string in
 * the field is malformed and hides the node (fail closed).
 */
export type SaunaVisibilityMode = "public" | "hybrid" | "private";

/** What a node's `visibility` field may hold: a mode, or the legacy rule. */
export type SaunaNodeVisibility = VisibilityRule | SaunaVisibilityMode;

/**
 * Screen widths a node may carry prop overrides for (SDL-632). `base` is not
 * a key — the node's own `props` ARE the base.
 */
export type SaunaScreen = "tablet" | "mobile";

/**
 * Values a member sees instead of the guest ones on a hybrid node (SDL-632).
 * Only the keys that differ — layered over `props` key by key.
 */
export type SaunaMemberBranch = {
  props?: Record<string, unknown>;
};

/**
 * Per-width prop overrides (SDL-632). Only the keys that differ from the base
 * `props` are stored; an absent key falls back to the base value.
 */
export type SaunaScreenOverrides = Partial<Record<SaunaScreen, { props?: Record<string, unknown> }>>;

// v1 (legacy) tree schema
export type SaunaNodeV1 = {
  type: string;
  /**
   * Same field and rule as {@link SaunaNodeConfig.propsVersion} (absent = 1).
   * pages-service migrates the props of a v1 tree in place and stamps it here;
   * `migrateSaunaSchema` carries it into the v2 node (SDL-725).
   */
  propsVersion?: number;
  props?: Record<string, unknown>;
  children?: SaunaNodeV1[];
  visibility?: SaunaNodeVisibility;
};

export type SaunaSchemaV1 = {
  version: 1;
  root: SaunaNodeV1;
};

// v2 (current) normalized schema
export type SaunaNodeId = string;

/**
 * One alternative rendering for a node, selected at render time
 * against the live `SaunaContext`. The first variant whose `when`
 * evaluates true wins; ties are impossible because evaluation
 * short-circuits on first match.
 *
 * `props` is shallow-merged over the node's default `props`. `children`
 * fully replaces the node's default children when provided — there is
 * no array-level merge. Both are optional: a variant that only
 * overrides `props` keeps the default children, and vice versa.
 *
 * `id` is a stable handle the Studio uses for reorder/delete and that
 * future analytics layers will reference. `label` is Studio-only.
 *
 * Variants and `visibility` co-exist: `visibility` is the outer gate
 * (render this node at all?); variants choose the body once the gate
 * passes. See `react/visibility.ts` for the evaluation engine, which
 * is reused verbatim for `when`.
 */
export type VariantSpec = {
  id: string;
  when: VisibilityRule;
  props?: Record<string, unknown>;
  children?: SaunaNodeId[];
  label?: string;
};

export type SaunaNodeConfig = {
  type: string;
  /**
   * Author-given name of this node (SDL-302). Editor-only: the renderer
   * never reads it, so naming a node cannot change what a visitor sees.
   *
   * Optional and free-form on purpose — it is a label, not an identifier.
   * Nodes are addressed by `SaunaNodeId` everywhere, names may repeat, and
   * an absent name means "call it by its type" (see `saunaNodeDisplayName`).
   * Clearing a name removes the field rather than storing `""`, so a schema
   * that was never renamed and one that was renamed back are the same JSON.
   */
  name?: string;
  /**
   * Version of the Element's PROPS SCHEMA this node was written against
   * (EP-128, SDL-639). `type` names the Element; this says which contract
   * of its props the stored `props` follow. The kit may change look,
   * spacing and markup freely — only a change of the props contract bumps
   * this number, which is why it is not the Component's version and not the
   * kit package's version.
   *
   * Optional on purpose: an absent field means version 1, so every document
   * stored before the field existed reads unchanged — there is NO migration
   * and none is to be added. `saunaNodePropsVersion` is the one reader;
   * `parseElementProps` compares it with the definition's `propsVersion`.
   */
  propsVersion?: number;
  props?: Record<string, unknown>;
  children?: SaunaNodeId[];
  /**
   * A {@link SaunaVisibilityMode} string or the legacy {@link VisibilityRule}
   * object. Absent = `"public"`.
   */
  visibility?: SaunaNodeVisibility;
  /**
   * The member branch of a hybrid node (SDL-632). Meaningful when this node's
   * own mode, or that of its nearest ancestor that has a mode, is `"hybrid"`;
   * anywhere else it is inert and NOT refused by the validator — a document
   * already in storage must stay loadable so the author can fix it.
   *
   * Props layer order: `props` < `member.props` (members only) <
   * `screens[screen].props` < matched conditional variant (legacy).
   */
  member?: SaunaMemberBranch;
  /** Per-width overrides of `props`, see {@link SaunaScreenOverrides}. */
  screens?: SaunaScreenOverrides;
  /**
   * Optional list of alternative renderings. First match wins (array
   * order = priority). Falls back to the node's default `props` +
   * `children` if no variant matches. See {@link VariantSpec}.
   */
  variants?: VariantSpec[];
  /**
   * Which props of this node come from the context (SDL-690, EP-128).
   * A behaviour slot: see {@link SaunaPageBehaviorSlot}.
   */
  bind?: SaunaPageBehaviorSlot;
  /**
   * This node's reactions to events (SDL-690, EP-128). A behaviour slot: see
   * {@link SaunaPageBehaviorSlot}. Not an `on…` prop — those stay refused
   * inside `props` (SDL-681); this is data for the engine, never handed to
   * a component.
   */
  on?: SaunaPageBehaviorSlot;
};

/**
 * A page-behaviour slot of the document format (SDL-690, EP-128): `queries`
 * and `state` at the document root, `bind` and `on` on a node.
 *
 * The format keeps room for them now so that their arrival is not a
 * migration of stored documents. NOTHING interprets them yet, so their shape
 * is not fixed here: it is `unknown`, carried by value. The rule every
 * reader and writer of the engine and the editor holds:
 *
 *  - a slot present in a document survives read → edit → write unchanged
 *    (validator, migration, public shell and every schema op pass it through);
 *  - a document without them stays byte-identical — nothing invents an
 *    empty slot.
 *
 * pages-service holds the same line (`dev-infra` docs/domains/pages.md,
 * section on page behaviour slots). The shape and its checks belong to the
 * interpreter that will read them.
 */
export type SaunaPageBehaviorSlot = unknown;

/** Behaviour slots at the document root (SDL-690). */
export const SAUNA_DOCUMENT_BEHAVIOR_KEYS = ["queries", "state"] as const;
/** Behaviour slots on a node (SDL-690). */
export const SAUNA_NODE_BEHAVIOR_KEYS = ["bind", "on"] as const;

/**
 * The value types a block parameter can declare (SDL-718, EP-145). One list
 * for the engine and pages-service: an absent `type` reads as `"string"`, and
 * a document written before SDL-718 carries none — it stays valid and is
 * never rewritten on read.
 */
export const SAUNA_PARAM_TYPES = ["string", "text", "number", "boolean", "url", "file", "select"] as const;
export type SaunaParamType = (typeof SAUNA_PARAM_TYPES)[number];

/** What an absent `SaunaParamSpec.type` means. */
export const SAUNA_DEFAULT_PARAM_TYPE: SaunaParamType = "string";

/** Longest parameter `name` the contract accepts (pages-service holds the same limit). */
export const SAUNA_PARAM_NAME_MAX = 120;

/**
 * One field a block exposes to the pages that reference it (EP-61).
 *
 * `nodeId` + `prop` is the path: which node inside the block, which prop
 * of that node. A page addresses the field by `name` and never learns
 * the path, so moving the field to another node is a block-side edit
 * that leaves every page alone.
 *
 * Typed since SDL-718 (the contract shared with pages-service):
 *
 * - `type` — absent means `"string"`;
 * - `default` — what a page that sets no value for this parameter gets
 *   (`applyBlockParams`); without one the prop keeps the value it holds
 *   inside the block. Its JS type follows `type`: a string for
 *   string/text/url/file, a finite number for number, a boolean for
 *   boolean, one of `options` for select;
 * - `options` — required and non-empty for `select` only (non-empty,
 *   unique strings), refused on every other type.
 *
 * The validator checks all three in write mode (`validateSaunaSchema(...,
 * { mode: "write" })`) and only warns on read: a stored document is not
 * ours to refuse. `label` is Studio-only chrome, like
 * `SaunaNodeConfig.name`.
 *
 * A spec whose `nodeId`/`prop` no longer resolve is an ORPHAN. Nothing
 * here rejects one: the manifest is storage, and a schema that came off
 * disk is not ours to refuse. Reporting orphans is SDL-501's job, and
 * hard rule 7 requires it to exist before anything substitutes params.
 */
export type SaunaParamSpec = {
  name: string;
  nodeId: SaunaNodeId;
  prop: string;
  label?: string;
  type?: SaunaParamType;
  default?: string | number | boolean;
  options?: string[];
};

export type SaunaSchemaV2 = {
  version: 2;
  rootId: SaunaNodeId;
  nodes: Record<SaunaNodeId, SaunaNodeConfig>;
  parents: Record<SaunaNodeId, SaunaNodeId | null>;
  /**
   * Fields this document exposes when it is referenced as a block
   * (EP-61). Absent on every document that has never declared one,
   * which is why it is optional rather than `[]` — a page and a block
   * that was never parameterised stay byte-identical to what v2 stored
   * before, so no migration is needed and none was added.
   *
   * Lives on the schema and not beside it because the provider stores
   * exactly one thing per id ({@link SaunaSnapshot}): a manifest kept
   * anywhere else would have no way to travel with its block.
   */
  params?: SaunaParamSpec[];
  /**
   * What data the page takes (SDL-690, EP-128) — the successor of the
   * route-level `collection_binding`. A behaviour slot: see
   * {@link SaunaPageBehaviorSlot}.
   */
  queries?: SaunaPageBehaviorSlot;
  /** The page's local state (SDL-690, EP-128). A behaviour slot: see {@link SaunaPageBehaviorSlot}. */
  state?: SaunaPageBehaviorSlot;
};

export type SaunaAnySchema = SaunaSchemaV1 | SaunaSchemaV2;

export type SaunaSchema = SaunaSchemaV2;
