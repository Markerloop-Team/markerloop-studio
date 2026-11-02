"use client";

// Studio shell — three owned columns.
//
// Layout:
//   ┌────────────────┬──────────────────────┬──────────────────────────┐
//   │ Outline (tree) │  Preview (renderer)  │ Properties + host sections│
//   └────────────────┴──────────────────────┴──────────────────────────┘
//
// PR 3 shipped the layout, store wiring, hotkeys, and a minimal outline
// tree. The Properties panel is a placeholder until `blocks` is supplied —
// then the Zod-driven auto-form takes over. PR 5 added inline edit overlay
// + auto-save.
//
// ML-16 (phase 1) layered drag-drop reorder onto the outline:
// same-parent reorder via @dnd-kit dispatches `reorderChildren` on the
// store. Cross-parent reparent (insert-zones) is Phase 2.
//
// S2.1 (EP-15) pulled a fourth column in. Hosts used to hand-build their
// own grid around <SaunaStudio> and hang the visibility / variants / preview
// -context editors off the side of it; every host then re-invented the same
// widths, borders and scroll containment. That column was a `ReactNode`
// slot the host filled with a stack of always-open panels.
//
// SDL-285 (EP-48) folded the host column INTO Properties: the host describes
// its editors as `sections` (id, title, badge, applicability, empty-state
// action, body) and the shell renders them as PanelSection rows under the
// always-open Properties section — one 320px column, three columns total.
// The shell owns what a plain node slot could never give it: hiding a section
// that does not apply to the selection, offering the first step in the
// header of an empty one, and remembering the open state per editor in
// localStorage.
//
// SDL-288 (EP-48) removed the slot itself. It had lived on as a deprecated
// fallback so the migration could land in steps; with the only host moved to
// `sections`, keeping it meant a second layout the tests had to pin down and
// nobody rendered. The grid is now three tracks unconditionally — there is
// no arrangement of props that puts a fourth column back.
//
// SDL-287 (EP-48) finishes the move on the phone. The preview context left
// the panel stack for a chip in the host's document toolbar, which emptied
// the `Context` tab; the sections it shared the sheet with joined the Props
// sheet, where they belong (they describe the selected node). The bottom bar
// is Outline · Props — the two panels of the approved canvas board
// `FinalMobileStudio`. `Canvas` went with them: with no sheet open the canvas
// IS the screen, so the tab was a no-op that only ever acted as a fourth way
// to close a sheet, next to the close button, the backdrop and Escape.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useStore } from "zustand";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  type SortingStrategy,
} from "@dnd-kit/sortable";

import type { BlockDefinition } from "@markerloop/engine";
import {
  blockPropsVersion,
  elementPropsVersionMismatch,
  propsVersionsFromBlocks,
  saunaEffectiveVisibilityMode,
  saunaNodeDisplayName,
  SAUNA_COMPONENT_MAX_DEPTH,
  SAUNA_REF_BLOCK_ID_PROP,
  SAUNA_REF_TYPE,
} from "@markerloop/engine";
import type { LoadBlockSchema } from "@markerloop/engine";
import type { SaunaNodeId, SaunaParamSpec, SaunaSchema } from "@markerloop/engine";
// The kit's public surface is compound (`Dialog.Alert.*`, `Menu.*`) — the
// flat `AlertDialogContent`-style names exist inside the package but are not
// exported, and reaching for them is the first thing that fails to compile.
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  FormControl,
  Link,
  Menu,
  Text,
  ToggleGroup,
  cn,
} from "@markerloop/ui/ui";
// Every glyph the shell draws comes from the kit's icon registry (SDL-305)
// — the no-direct-lucide gate keeps apps/studio off lucide-react, so a new
// icon lands in the registry first and stays reusable by any host. The
// renames dodge this file's own names: `Text` is the kit's typography
// component, `Link`/`Image`/`Table` shadow DOM-ish globals.
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  ChevronsDownUp,
  Component,
  Copy,
  Edit,
  Image as ImageIcon,
  LayoutTemplateIcon,
  Link as LinkIcon,
  List,
  MoreHorizontal,
  PackageOpen,
  PanelTop,
  Plus,
  RectangleHorizontalIcon,
  RefreshCw,
  SlidersHorizontal,
  SquareIcon,
  Table as TableIcon,
  Text as TextIcon,
  Trash2,
  X,
  type Icon,
} from "./icons";
import {
  PanelColumn,
  PanelColumnBody,
  PanelColumnHeader,
} from "@markerloop/ui/ui/admin";
// Not in the in-repo kit yet (packages/ui is 0.2.0-alpha.2) — see kit-compat/.
import { PanelSection } from "./kit-compat/panel-section";
import { TreeRow } from "./kit-compat/tree-row";
import {
  SAUNA_CANVAS_DEVICES,
  SaunaCanvasFrame,
  saunaCanvasDevice,
  type SaunaCanvasDeviceId,
} from "./canvas-frame";
import { SaunaCanvasSelection, type SaunaCanvasNodeMenuItem } from "./canvas-selection";
import { useStudioHotkeys } from "./hotkeys";
import {
  SAUNA_INSERT_ALL_FILTERED,
  SAUNA_INSERT_EMPTY_BODY,
  SAUNA_INSERT_EMPTY_TITLE,
  SAUNA_INSERT_GROUP_ALL,
  SAUNA_INSERT_GROUP_EMPTY,
  SAUNA_INSERT_HEADING,
  SAUNA_INSERT_HIDE_BLOCKED,
  SAUNA_INSERT_KEY_HINT,
  SAUNA_INSERT_LOADING,
  SAUNA_INSERT_OWN_DESCRIPTION,
  SAUNA_INSERT_OWN_EMPTY,
  SAUNA_INSERT_OWN_EMPTY_LINK,
  SAUNA_INSERT_RETRY,
  SAUNA_INSERT_SEARCH_PLACEHOLDER,
  SAUNA_INSERT_SOURCES_LABEL,
  SAUNA_INSERT_SOURCE_KIT,
  saunaComponentCycleReason,
  saunaComponentDepthReason,
  saunaHiddenPhrase,
  saunaInsertActionLabel,
  saunaInsertAddress,
  saunaInsertBlockedReason,
  saunaInsertCompoundNote,
  saunaInsertNoMatches,
  saunaInsertSourceFailed,
  saunaMatchesPhrase,
  saunaParentAcceptsOnly,
} from "./insert-copy";
import {
  SAUNA_INSERT_OWN_GROUP_ID,
  SAUNA_INSERT_OWN_GROUP_TITLE,
  SAUNA_OWN_COMPONENT_ICON,
  saunaBuildInsertCatalog,
  saunaCompoundOf,
  saunaInsertDescription,
  saunaInsertGroupId,
  saunaInsertIcon,
  type SaunaInsertEntry,
  type SaunaInsertSource,
} from "./insert-catalog";
import {
  saunaCachingBlockLoader,
  saunaCyclicComponentIds,
  saunaTooDeepComponentIds,
  type SaunaComponentSummary,
} from "./own-components";
import { saunaDeleteConfirmCopy } from "./node-delete-copy";
import {
  saunaComponentKey,
  saunaComponentNameSuggestion,
  SAUNA_COMPONENT_NAME_MAX,
} from "./save-as-component-copy";
import { saunaSaveNodeAsComponent } from "./save-as-component";
import { SaunaGroupField } from "./group-field";
import { saunaSiblingMoveOp } from "./node-move";
import {
  canParentType,
  computeOutlineDrop,
  parentGuardFromBlocks,
  parentRuleVerdict,
  type OutlineDropTarget,
} from "./outline-drop";
import { SaunaPropertiesAutoForm } from "./properties/auto-form";
import { parseSiteTheme, type SiteThemeCustomColor } from "./site-theme";
import type { StudioDataSources } from "./properties/data-view-model";
import { canvasDeviceFor, deviceToScreen, type StudioScreen } from "./screen-variants";
import { SAUNA_VARIANTS_SECTION_ID, SAUNA_VISIBILITY_SECTION_ID } from "./block-sections";
import { studioCanvasAudience, type StudioAudience } from "./visibility-modes";
import { saunaBlockInsertHints } from "./properties/kit-blocks";
import type { SaunaPropsManifest } from "./properties/descriptors";
import { resolvePropsForm } from "./properties/form-spec";
import type { PropEditor } from "./properties/types";
import { createStudioStore, type StudioState, type StudioStore } from "./store";
import type { SchemaOp } from "./types";
import { useStudioIsMobile } from "./use-mobile";
import {
  OUTLINE_DRAG_ACTIVATION_DISTANCE,
  outlineDropAnimation,
  usePrefersReducedMotion,
} from "./outline-drag-motion";

/** What the Studio hands `renderPreview` besides the schema (SDL-632). */
export type SaunaStudioRenderContext = {
  /** Width variant being edited — the render context's `screen`. */
  screen: StudioScreen;
  /**
   * Who the canvas renders for — the render context's `audience` (S6).
   * Always `"guest"` in preview: a private block is not drawn there, as a
   * guest never receives it (`studioCanvasAudience`).
   */
  audience: StudioAudience;
};

/**
 * One host-owned section of the right-hand panel (SDL-285, EP-48). The host
 * describes its editor instead of handing the shell finished JSX: the shell
 * needs the title, the badge and the emptiness to hide what does not apply,
 * to summarise a collapsed section and to offer the first step in the header
 * of an empty one — none of which it could read out of an opaque node.
 */
export type SaunaStudioSection = {
  /**
   * Stable identity: the `data-sauna-section` hook and the key the open
   * state persists under. Never derived from the selection — open state is
   * per editor, not per node.
   */
  id: string;
  /** Section title, rendered as the PanelSection header row. */
  title: string;
  /**
   * Content badge next to the title (`1 rule`, `2`) — the collapsed
   * section's summary. Omit when the section is empty.
   */
  badge?: ReactNode;
  /**
   * Does the section apply to the current state? `false` → the section does
   * not render at all (EP-48: a panel that cannot say anything about the
   * selection is noise, not chrome). Omitted → the section applies only
   * while a node is selected, which is the common case for node editors;
   * page-level sections pass `() => true`.
   */
  applicable?: (state: StudioState) => boolean;
  /**
   * Empty-state action (`+ Add rule`), rendered in the header instead of
   * the chevron while the section is applicable but has nothing to show.
   * Pass it ONLY while empty — its presence is what marks the section as
   * empty, and the body is not rendered while it is set. Activating it
   * also marks the section open, so the fresh content is visible at once.
   */
  emptyAction?: ReactNode;
  /** Section body. Rendered inside the PanelSection's padded content. */
  render: (store: StudioStore) => ReactNode;
  /** Initial open state before any persisted preference exists. Default true. */
  defaultOpen?: boolean;
  /**
   * The section WRITES to the document (Visibility, Variants — SDL-632 S6).
   * Such a section is not rendered in preview: preview shuts every door into
   * the document, and a mode switch left there was autosaved from a
   * visitor's view. A section that only reads (the preview context) omits it.
   */
  editsDocument?: boolean;
  /**
   * Where the section sits in the column (SDL-721). `"top"` = above the
   * Properties section — a DOCUMENT-level section such as a Component's
   * Parameters, which the canvas /design-system/blocks/editor puts first
   * because it is the Component's contract with every page. Default
   * `"bottom"`: after Properties, as Visibility and Variants have always been.
   */
  placement?: "top" | "bottom";
};

/**
 * Storage the shell needs to turn a node into a Component (SDL-341; the
 * contract with pages-service since SDL-718). Supplied by the host because
 * the shell has no transport of its own — the same reason `renderPreview` is
 * a prop; `createPagesComponentsApi` builds it over pages-service. Omitted →
 * the row menu draws "Save as component" disabled: a Studio with nowhere to
 * write a component must not pretend it saved one.
 */
export type SaunaSaveAsComponentApi = {
  /**
   * Creates the Component (SDL-718): pages-service `POST /pages/blocks` with
   * a `key` derived from `name`, never a write under an id the client picked.
   * Resolves with the id STORAGE issued — the one the `Ref` left on the page
   * points at — and the key it was stored under. Must reject when the write
   * fails. `createPagesComponentsApi` is the implementation over
   * pages-service.
   */
  create: (input: { name: string; schema: SaunaSchema; group?: string | null }) => Promise<{ id: string; key: string }>;
  /**
   * The groups the workspace's Components already carry (EP-175), for the
   * dialog's Group field. Omitted → the field still takes a typed name.
   */
  groups?: () => Promise<readonly string[]>;
};

/**
 * The author's own components, for the Insert modal's second tab
 * (SDL-340). Supplied by the host for the same reason as
 * {@link SaunaSaveAsComponentApi}: the shell has no transport.
 *
 * Omitted → the modal has no tabs at all and shows the kit exactly as
 * it did before. That is the honest degradation: a tab that cannot
 * read the library would be an empty state lying about an empty
 * library.
 */
export type SaunaComponentLibraryApi = {
  /**
   * The block currently being edited, or `null` when the document is a
   * page. It is the OTHER half of the cycle rule — the modal has to
   * know what it is inserting INTO, and only a block can be a host.
   */
  hostBlockId: string | null;
  /** Every project block that could be referenced. */
  list: () => Promise<readonly SaunaComponentSummary[]>;
  /** One block's schema — the card's preview and the cycle walk. */
  load: LoadBlockSchema;
  /** Where components are made; the empty state links there. */
  libraryHref: string;
};

/**
 * What the author picked in the Insert modal, for hosts that intercept the
 * pick instead of taking the default `addChild` (SDL-368: the PO editor
 * inserts into a boundary and replaces sections — different ops, same
 * dialog). A kit card hands over its `BlockDefinition`; an own-component
 * card hands over the summary whose `id` becomes the `Ref`'s `blockId`.
 */
export type SaunaInsertPick =
  | { kind: "kit"; block: BlockDefinition }
  | { kind: "own"; item: SaunaComponentSummary };

export type SaunaStudioProps = {
  /**
   * Initial schema. The Studio takes ownership; pass a fresh object to
   * reset. Ignored when `store` is supplied — the caller owns the
   * store's lifecycle in that case.
   */
  initialSchema?: SaunaSchema;
  /**
   * External Studio store. When supplied, the Studio uses this instead
   * of creating its own. Required when wiring `useStudioAutoSave` (or
   * any other store-bound concern) outside the Studio. The caller must
   * have constructed the store with `createStudioStore`.
   */
  store?: StudioStore;
  /**
   * Renders the centre preview pane. Receives the *current* schema from
   * the store, and the width variant being edited (SDL-632) — pass it on as
   * the render context's `screen` so the canvas applies that variant:
   * `<SaunaRenderer schema={schema} context={{ screen: ctx.screen }} />`.
   */
  renderPreview: (schema: SaunaSchema, ctx: SaunaStudioRenderContext) => ReactNode;
  /**
   * Block catalog. When provided, the default properties pane renders
   * the Zod-driven auto-form for the selected node's block. Without
   * `blocks`, the placeholder JSON dump is used instead.
   */
  blocks?: readonly BlockDefinition[];
  /**
   * Per-instance prop editor overrides for the auto-form. Forwarded
   * to <SaunaPropertiesAutoForm>. See `registerPropEditor` for the
   * global counterpart.
   */
  propEditors?: Record<string, PropEditor>;
  /**
   * The kit's props manifest, handed to the properties auto-form (SDL-293).
   * Optional: without it the panel behaves exactly as before — blocks with a
   * zod schema render a form, everything else a JSON textarea.
   */
  propsManifest?: SaunaPropsManifest;
  /**
   * The page's workspace collections for the DataView settings panel
   * (SDL-642). The host fetches them — the package has no data client.
   */
  dataSources?: StudioDataSources;
  /**
   * Turns on the «Make a parameter» affordance under every field of the
   * Properties pane and commits the manifest it builds (SDL-503, EP-61).
   * `null` clears the manifest.
   *
   * Only the COMPONENT editor passes it: a parameter is what a block hands
   * outwards, so on a page the affordance would name something with no
   * reader. Ignored when `renderProperties` takes the pane over — a host
   * that draws its own properties pane owns this decision too.
   */
  onParamsChange?: (params: SaunaParamSpec[] | null) => void;
  /**
   * Full takeover of the properties pane. When supplied, takes
   * precedence over `blocks`/the default auto-form.
   */
  renderProperties?: (store: StudioStore) => ReactNode;
  /**
   * Host-owned sections of the Properties column (SDL-285, EP-48). The
   * column becomes: header (selected node's type + parent trail), the
   * always-open Properties section, then these sections as collapsible
   * PanelSection rows. A section whose `applicable` returns `false` is not
   * rendered; an applicable-but-empty one renders its `emptyAction` in the
   * header. Open state persists to localStorage, keyed by
   * `outlineStateKey` — per editor, not per node.
   */
  sections?: readonly SaunaStudioSection[];
  /**
   * Stable identity of the open document (e.g. `pages:index`) for
   * per-document UI state — today the outline's collapse memory, which
   * persists to localStorage under this key. Omitted → one shared key
   * for every document the Studio opens.
   */
  outlineStateKey?: string;
  /**
   * What the outline's ROOT row is called, when the document's own name for
   * it would mislead (SDL-375).
   *
   * A component is authored as a schema like any other, so its root carries
   * whatever container type it was created from — `Section` for everything
   * `createEmptySaunaSchema` makes. On the board's component editor that row
   * reads «Block», because that is what the author is editing: the section
   * is an implementation detail of the document, not its subject. Omitted →
   * the row keeps the node's real type, which is right for pages.
   */
  rootLabel?: string;
  /**
   * The root IS the document's content, not a container for it (SDL-721).
   * «Save as component» roots a Block AT the saved node
   * (`extractBlockSchema`), so a Block saved from a Text is a Text root with
   * no children. With this flag such a root is drawn on the canvas; the
   * «empty document» card is kept for a root with neither children nor
   * props. Omitted → pages: a childless root is an empty page (SDL-375).
   */
  rootIsContent?: boolean;
  /**
   * Saving a selected node as a project block (SDL-341). See
   * {@link SaunaSaveAsComponentApi}.
   */
  saveAsComponent?: SaunaSaveAsComponentApi;
  /**
   * The author's own components in the Insert modal (SDL-340). See
   * {@link SaunaComponentLibraryApi}.
   */
  componentLibrary?: SaunaComponentLibraryApi;
  /**
   * The host is showing the document in PREVIEW — i.e. it renders the
   * document without `editable`, so the nodes carry no data-sauna-node-id and
   * the canvas stops selecting and inline-editing. Nothing else about the
   * canvas changes, so without a word on screen the mode is indistinguishable
   * from an editor that has broken: the canvas toolbar says "Preview" and
   * offers the way out (canvas /design-system/studio?case=preview).
   *
   * The Studio does not own the state: `editable` belongs to the host's
   * `renderPreview`, and so does the decision to leave.
   */
  preview?: boolean;
  /**
   * The site theme (SDL-773): pages-service's theme JSON. The canvas draws
   * the page in it, as the site does with the published one. Absent → the
   * kit's own look.
   */
  siteTheme?: unknown;
  /**
   * The site theme's custom colours (SDL-950): the properties panel offers
   * them as swatches on Section.background, Text.color and Box.background
   * (light value), and the canvas paints their `--pages-color-<key>`
   * variables — light on the page, dark on a dark band — even when it draws
   * no `siteTheme`, so a chosen colour shows at once. Absent → the panel
   * offers the ones of `siteTheme`. The page editor passes the theme DRAFT's.
   */
  themeColors?: readonly SiteThemeCustomColor[];
  /** Leave preview. Omitted → the badge shows without a button. */
  onExitPreview?: () => void;
  /**
   * Draw the row above the canvas with the device switcher (default `true`).
   * The admin's editor frame (EP-187, layer 5) carries the devices and
   * Undo / Redo in its header (`StudioCanvasControls`) and passes `false`:
   * the row then appears only in preview, to name the mode and offer the
   * way out — as on the phone.
   */
  canvasToolbar?: boolean;
  /** Disable hotkeys. Useful when embedded in a modal that owns its own. */
  disableHotkeys?: boolean;
  /** Override history ring-buffer depth. Default 100. */
  historyDepth?: number;
  /** Tailwind class merged onto the root container. */
  className?: string;
};

export function SaunaStudio(props: SaunaStudioProps): ReactNode {
  // Per-instance store — caller-supplied wins, otherwise we own one.
  // The internal store is keyed by the initialSchema reference: passing
  // a new object means "reset", reusing the same object preserves edits.
  const storeRef = useRef<StudioStore | null>(null);
  if (storeRef.current === null && !props.store) {
    if (!props.initialSchema) {
      throw new Error(
        "SaunaStudio: pass either `store` or `initialSchema`. Both omitted."
      );
    }
    storeRef.current = createStudioStore({
      initialSchema: props.initialSchema,
      // The shell-owned store gets the same guard the host-owned one does
      // (SDL-304) — otherwise which store you happen to be on decides
      // whether `allowedParents` is enforced.
      canParent: parentGuardFromBlocks(props.blocks),
      // Same reasoning for the Element's props version (SDL-667).
      propsVersionOf: propsVersionsFromBlocks(props.blocks),
    });
  }
  const store = props.store ?? storeRef.current!;

  // External resets via initialSchema only apply when we own the store.
  useEffect(() => {
    if (props.store) return;
    if (!props.initialSchema) return;
    const current = store.getState().schema;
    if (current !== props.initialSchema) {
      store.getState().loadSchema(props.initialSchema);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialSchema, props.store]);

  // The node whose deletion is waiting for a "yes" (SDL-303). It lives HERE,
  // in the shell, and not in the row that opened the menu: Delete/Backspace
  // is a second, independent way to destroy a subtree, and a dialog owned by
  // the row would leave the keyboard path unguarded — the half-guard defect
  // SDL-344 found in its own test. One dialog, both doors.
  const [pendingDeleteId, setPendingDeleteId] = useState<SaunaNodeId | null>(
    null
  );

  // The node waiting for a component name (SDL-341). Same shape as the
  // delete request above and for the same reason: the dialog belongs to the
  // shell, so every door into the action opens the one dialog.
  const [pendingSaveAsId, setPendingSaveAsId] = useState<SaunaNodeId | null>(
    null
  );

  /**
   * Preview switches the EDITING SURFACE off, not just the canvas.
   *
   * The host renders the document without `editable`, so the canvas stops
   * selecting and inline-editing — and for a while that was all preview did.
   * Every other door into the schema stayed open: the outline still selected
   * a node, and the Properties form behind that selection still wrote to the
   * store, so "through a visitor's eyes" was a fully working editor with one
   * pane repainted. Insert, delete, rename and drag-reorder were open too.
   *
   * The gate lives HERE and not in each host: the Studio owns all of those
   * doors, and a mode that has to be remembered as five separate props is a
   * mode that will be half-applied. The host keeps owning the STATE (it
   * renders `renderPreview` and decides how to leave); what the state means
   * is this package's answer.
   */
  const readOnly = props.preview === true;
  const canInsert = !readOnly && !!props.blocks && props.blocks.length > 0;

  useStudioHotkeys(store, {
    // `disableHotkeys` stays the host's own switch (a modal that owns its
    // keys); preview adds to it rather than replacing it, so a host that
    // forgets to pass both is still safe.
    disabled: props.disableHotkeys || readOnly,
    onDeleteRequest: setPendingDeleteId,
  });

  // Mobile chrome state (SDL-202). Below `md` the Studio is not the desktop
  // grid squeezed into a phone — it is the mockup's mobile editor: the canvas
  // fills the screen, a bottom tab bar switches between it and the side
  // panels, and each panel opens as a bottom sheet (design spec 4.6 / 2.12).
  // The split is made in JS (see use-mobile.ts) so the sheets mount their
  // panel exactly once instead of duplicating the hidden desktop columns.
  const isMobile = useStudioIsMobile();
  const [mobilePanel, setMobilePanel] = useState<MobilePanelId | null>(null);
  // Which viewport the canvas frame emulates (SDL-297). Held here, not inside
  // the canvas, because the mobile shell and the desktop grid mount separate
  // preview panes and the choice has to survive crossing the breakpoint.
  //
  // Until the author picks one it FOLLOWS the viewport — opening the editor on
  // a phone and being shown a 1280px page scaled to a third is nobody's
  // intent — and once they have picked, the pick wins and the breakpoint stops
  // moving it. A plain `useState(isMobile ? …)` cannot do this: the initialiser
  // runs once, before `useStudioIsMobile` has measured anything, so a phone
  // always got the desktop default.
  //
  // SDL-632 tied the device to the width variant being edited
  // (`store.view.screen`): picking Tablet/Phone on the canvas switches the
  // Properties form to that variant, and picking a variant in the form moves
  // the canvas to that width. One source — the store — and the device is
  // derived from it; `devicePicked` only keeps the viewport-following
  // default alive until the author has chosen anything.
  const screen = useStore(store, (s) => s.view.screen);
  const [devicePicked, setDevicePicked] = useState(false);
  const canvasDevice = canvasDeviceFor(screen, devicePicked, isMobile);
  const setPickedDevice = (device: SaunaCanvasDeviceId) => {
    setDevicePicked(true);
    store.getState().setScreen(deviceToScreen(device));
  };
  // Insert-component modal (SDL-201). Desktop-only: the mobile sheet hides
  // the outline zone head that hosts the trigger. SDL-301 added a second
  // trigger — the per-row "+" — which pre-picks that row as the parent, so
  // the modal state carries the override alongside the open flag.
  const [insertState, setInsertState] = useState<{
    open: boolean;
    parentId: SaunaNodeId | null;
  }>({ open: false, parentId: null });
  // The Props tab paints a selection dot (design spec tabStyle [L471]).
  const selectedId = useStore(store, (s) => s.selection.nodeId);

  // The menu of the selection's name label on the canvas (EP-187, layer 5,
  // canvas flow 2 «Select»): the outline row's own actions, so the canvas
  // and Layers offer the same verbs. Built on open, from the live schema.
  const nodeMenu = (nodeId: SaunaNodeId): SaunaCanvasNodeMenuItem[] => {
    const doc = store.getState().schema;
    const isRoot = nodeId === doc.rootId;
    const up = saunaSiblingMoveOp(doc, nodeId, "up");
    const down = saunaSiblingMoveOp(doc, nodeId, "down");
    const apply = (op: SchemaOp) => store.getState().applyOp(op);
    return [
      {
        id: "insert",
        label: "Insert inside",
        disabled: !canInsert,
        onSelect: () => setInsertState({ open: true, parentId: nodeId }),
      },
      { id: "duplicate", label: "Duplicate", disabled: isRoot, onSelect: () => apply({ kind: "duplicate", nodeId }) },
      {
        id: "save-as-component",
        label: "Save as component",
        disabled: isRoot || !props.saveAsComponent,
        onSelect: () => setPendingSaveAsId(nodeId),
      },
      { id: "move-up", label: "Move up", disabled: !up, onSelect: () => (up ? apply(up) : undefined) },
      { id: "move-down", label: "Move down", disabled: !down, onSelect: () => (down ? apply(down) : undefined) },
      { id: "delete", label: "Delete", destructive: true, disabled: isRoot, onSelect: () => setPendingDeleteId(nodeId) },
    ];
  };

  // Crossing into desktop closes the sheet: the desktop columns show the
  // same panels statically, and a stale `mobilePanel` would reopen a sheet
  // the moment the viewport shrinks again.
  useEffect(() => {
    if (!isMobile) setMobilePanel(null);
  }, [isMobile]);

  if (isMobile) {
    const sheetTitle = mobilePanel === "outline" ? "Layers" : "Properties";
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden bg-background text-foreground",
          props.className
        )}
        data-sauna-studio
        data-sauna-mobile-editor=""
      >
        {/* The sheet and its backdrop are absolute WITHIN this container, not
            fixed: the mockup's sheet lives inside the phone frame, and — the
            part that is behavior, not taste — the bottom tab bar must stay
            visible and tappable while a sheet is open, because the Canvas tab
            is one of the three ways to close it (protocol 17.3). */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-auto"
            data-sauna-panel="preview"
            role="region"
            aria-label="Preview"
          >
            <SaunaStudioPreview
              store={store}
              render={props.renderPreview}
              device={canvasDevice}
              onDeviceChange={setPickedDevice}
              preview={props.preview}
              onExitPreview={props.onExitPreview}
              siteTheme={props.siteTheme}
              customColors={props.themeColors}
              rootIsContent={props.rootIsContent}
              // The approved phone board (FinalMobileView) goes top bar →
              // canvas → tab bar with no strip between them: a device
              // switcher on a device that is already the smallest one costs
              // a row of chrome to offer a choice the author cannot judge on
              // that screen anyway. The canvas still emulates the phone —
              // `canvasDevice` falls to "mobile" here (SDL-297) — it just
              // stops being switchable from the phone.
              toolbar={false}
            />
          </div>
          {mobilePanel ? (
            // Keyed by panel so switching Outline → Properties (a node tap in
            // the outline sheet, behavior protocol 17.3) remounts the sheet
            // and lands focus on its close button instead of on a row that no
            // longer exists.
            <MobileSheet
              key={mobilePanel}
              id={mobilePanel}
              title={sheetTitle}
              onClose={() => setMobilePanel(null)}
            >
              {mobilePanel === "outline" ? (
                // The sheet header owns the title, so the panel's own
                // PanelColumnHeader is suppressed via the data-slot it
                // already carries.
                <div className="flex min-h-0 flex-1 flex-col [&_[data-slot=panel-column-header]]:hidden">
                  <SaunaStudioOutline
                    store={store}
                    blocks={props.blocks}
                    persistKey={props.outlineStateKey}
                    rootLabel={props.rootLabel}
                    onNodeSelect={() => setMobilePanel("properties")}
                    readOnly={readOnly}
                    onRowDelete={readOnly ? undefined : setPendingDeleteId}
                    onRowSaveAsComponent={
                      props.saveAsComponent && !readOnly
                        ? setPendingSaveAsId
                        : undefined
                    }
                  />
                </div>
              ) : props.sections ? (
                // The whole Properties column, sections included (SDL-287).
                // The desktop shows Properties, Visibility and Variants in
                // one scroll; splitting them across two sheets on a phone
                // made "the props of this node" a place you had to know to
                // look for. Its PanelColumnHeader is NOT suppressed here —
                // it carries the selected node's type over its parent trail,
                // which the approved board draws inside the sheet and the
                // sheet's own header (a fixed "Properties") cannot say.
                <StudioSectionsColumn
                  store={store}
                  sections={props.sections}
                  persistKey={props.outlineStateKey}
                  blocks={props.blocks}
                  propsManifest={props.propsManifest}
                  readOnly={readOnly}
                >
                  {propertiesBody(props, store, true, readOnly)}
                </StudioSectionsColumn>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col [&_[data-slot=panel-column-header]]:hidden">
                  {propertiesBody(props, store, false, readOnly)}
                </div>
              )}
            </MobileSheet>
          ) : null}
        </div>
        {/* Bottom tab bar — Outline · Props (approved board
            FinalMobileStudio). Two panels, two tabs: see the note at the top
            of this file for why Canvas and Context are gone. */}
        <nav
          aria-label="Editor panels"
          data-sauna-mobile-tabs=""
          className="flex flex-none border-t border-border bg-card"
        >
          <MobileTab
            id="outline"
            label="Layers"
            icon={List}
            active={mobilePanel === "outline"}
            onClick={() => setMobilePanel("outline")}
          />
          <MobileTab
            id="properties"
            label="Props"
            icon={SlidersHorizontal}
            active={mobilePanel === "properties"}
            dot={selectedId !== null}
            onClick={() => setMobilePanel("properties")}
          />
        </nav>
        <DeleteNodeDialog
          store={store}
          nodeId={pendingDeleteId}
          onClose={() => setPendingDeleteId(null)}
        />
        {props.saveAsComponent ? (
          <SaveAsComponentDialog
            store={store}
            api={props.saveAsComponent}
            nodeId={pendingSaveAsId}
            onClose={() => setPendingSaveAsId(null)}
          />
        ) : null}
      </div>
    );
  }

  // No Tooltip.Provider here on purpose: nothing in the Studio renders a
  // tooltip yet, and a provider nested inside a host's own would silently
  // override that host's delay timings for everything below it — the bodies
  // the host passes in `sections` included. Mount one with the first
  // tooltip, scoped to the panel that needs it.
  return (
    <div
      className={cn(
        "grid h-full w-full bg-background text-foreground",
        // Below `md` the shell is a single column that scrolls as a whole:
        // the desktop track lists add up to 1160px, so on a phone they
        // cannot fit and the columns used to overlap (SDL-114). Every panel
        // keeps full width, and each row is tall enough to work in rather
        // than being squeezed to a sliver.
        //
        // These are `max-md:` and not plain base utilities, which is
        // load-bearing rather than a style choice. A host imports this
        // sheet and then its own compiled Tailwind (docs/consumer-guide.md
        // §4 fixes that order), and every utility the host happens to use
        // itself is re-declared in that second sheet. Two class names that
        // target the same property then resolve by source order, because a
        // media query adds no specificity — so a base `grid-cols-1` here
        // loses to nothing, but the host's later copy of `.grid-cols-1`
        // beats our `md:grid-cols-[…]` at every width and the editor
        // collapses back into a stack. apps/studio hits exactly that: its
        // dashboard uses `grid-cols-1 md:grid-cols-3`. Pairing `max-md:`
        // with `md:` removes the race outright — the two rules live in
        // mutually exclusive media queries, so which one lands last in the
        // bundle stops mattering. Never put a bare utility on this element
        // when an `md:` counterpart for the same property sits next to it.
        "max-md:auto-rows-[minmax(18rem,auto)] max-md:grid-cols-1",
        "max-md:overflow-x-hidden max-md:overflow-y-auto",
        // From `md` up, the historical fixed grid, unchanged.
        "md:grid-rows-1 md:overflow-hidden",
        // One track list, no longer a choice (SDL-288). The host's editors
        // live inside the Properties column as `sections`, so the fourth
        // track has nothing left to hold. Spelled out in full because
        // Tailwind scans source text — a template-built class name would
        // never be generated.
        "md:grid-cols-[260px_1fr_360px]",
        props.className
      )}
      data-sauna-studio
    >
      {/* Layer D (SDL-115): the columns are landmarks. Without a role and a
          name they are three anonymous divs, and the only way to reach the
          properties pane with a screen reader is to Tab through the whole
          outline. `region` + `aria-label` puts them in the landmark list. */}
      <PanelColumn data-sauna-panel="outline" role="region" aria-label="Layers">
        <SaunaStudioOutline
          store={store}
          blocks={props.blocks}
          persistKey={props.outlineStateKey}
          rootLabel={props.rootLabel}
          readOnly={readOnly}
          onInsert={
            canInsert
              ? () => setInsertState({ open: true, parentId: null })
              : undefined
          }
          onRowInsert={
            canInsert
              ? (nodeId) => setInsertState({ open: true, parentId: nodeId })
              : undefined
          }
          onRowDelete={readOnly ? undefined : setPendingDeleteId}
          onRowSaveAsComponent={
            props.saveAsComponent && !readOnly ? setPendingSaveAsId : undefined
          }
        />
      </PanelColumn>
      <DeleteNodeDialog
        store={store}
        nodeId={pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
      />
      {props.saveAsComponent ? (
        <SaveAsComponentDialog
          store={store}
          api={props.saveAsComponent}
          nodeId={pendingSaveAsId}
          onClose={() => setPendingSaveAsId(null)}
        />
      ) : null}
      {canInsert && props.blocks ? (
        <InsertComponentModal
          store={store}
          blocks={props.blocks}
          open={insertState.open}
          initialParentId={insertState.parentId}
          library={props.componentLibrary}
          onOpenChange={(open: boolean) =>
            setInsertState((prev) => ({
              open,
              // Closing forgets the row override so the next header-driven
              // open falls back to the selection-based target.
              parentId: open ? prev.parentId : null,
            }))
          }
        />
      ) : null}
      {/* `region`, not `<main>`: the host app already renders this studio
          inside its own <main>, and a nested main is invalid HTML that
          screen readers surface as a duplicate top-level landmark. Naming it
          made the duplicate explicit, so it matches its two siblings
          instead. */}
      <div
        className="flex min-h-0 flex-col overflow-auto"
        data-sauna-panel="preview"
        role="region"
        aria-label="Preview"
      >
        <SaunaStudioPreview
          store={store}
          render={props.renderPreview}
          device={canvasDevice}
          onDeviceChange={setPickedDevice}
          preview={props.preview}
          onExitPreview={props.onExitPreview}
          siteTheme={props.siteTheme}
          customColors={props.themeColors}
          rootIsContent={props.rootIsContent}
          toolbar={props.canvasToolbar !== false}
          onInsert={
            canInsert
              ? () => setInsertState({ open: true, parentId: null })
              : undefined
          }
          nodeMenu={readOnly ? undefined : nodeMenu}
        />
      </div>
      {props.sections ? (
        // SDL-285: the column of sections. The Properties body renders bare
        // — the column header and the section chrome are owned here, so the
        // form must not bring its own PanelColumn/header along.
        <StudioSectionsColumn
          store={store}
          sections={props.sections}
          persistKey={props.outlineStateKey}
          blocks={props.blocks}
          propsManifest={props.propsManifest}
          readOnly={readOnly}
        >
          {propertiesBody(props, store, true, readOnly)}
        </StudioSectionsColumn>
      ) : (
        <PanelColumn
          className="border-r-0 border-l"
          data-sauna-panel="properties"
          role="region"
          aria-label="Properties"
        >
          {propertiesBody(props, store, false, readOnly)}
        </PanelColumn>
      )}
    </div>
  );
}

/** Custom colours as the properties panel offers them (SDL-950): light swatches; the host's, else `siteTheme`'s. */
function themeColorOptions(
  own: readonly SiteThemeCustomColor[] | undefined,
  theme: unknown
): { key: string; label: string; color: string }[] | undefined {
  const colors = own ?? parseSiteTheme(theme)?.customColors;
  return colors && colors.length > 0 ? colors.map((c) => ({ key: c.key, label: c.label, color: c.light })) : undefined;
}

/**
 * The Properties pane's body — the one place that decides between the
 * host's own renderer, the Zod/manifest auto-form and the JSON placeholder.
 * Shared by the desktop column and the mobile Props sheet (SDL-287); before
 * that the choice was spelled out three times and the mobile copy had
 * already drifted (it never passed `bare`).
 *
 * `bare` = the caller already draws the panel chrome (a PanelSection inside
 * the sections column), so the form must not bring its own.
 */
function propertiesBody(
  props: SaunaStudioProps,
  store: StudioStore,
  bare: boolean,
  readOnly: boolean
): ReactNode {
  // Preview is a visitor's view of the document, so the pane that WRITES to
  // the document has nothing to do in it. This branch comes first, ahead of
  // the host's own `renderProperties`: a host renderer is a form too, and
  // leaving the decision to each host is how preview ends up editable in
  // one of them. The Insert modal is not mounted at all in preview, and the
  // outline's row actions are withheld — see `readOnly` in SaunaStudio.
  if (readOnly) return <PropertiesPreviewNotice bare={bare} />;
  if (props.renderProperties) return props.renderProperties(store);
  if (props.blocks) {
    return (
      <SaunaPropertiesAutoForm
        bare={bare}
        store={store}
        blocks={props.blocks}
        propsManifest={props.propsManifest}
        editors={props.propEditors}
        themeColors={themeColorOptions(props.themeColors, props.siteTheme)}
        groupStateKey={propGroupsStorageKey(props.outlineStateKey)}
        onParamsChange={props.onParamsChange}
        // The Variants section, when the host passes it, holds the width
        // switch (S6) — the form must not draw a second one.
        screenSwitch={!props.sections?.some((s) => s.id === SAUNA_VARIANTS_SECTION_ID)}
        // No Visibility section, no member branch editing (SDL-632 S7).
        memberBranch={!!props.sections?.some((s) => s.id === SAUNA_VISIBILITY_SECTION_ID)}
        dataSources={props.dataSources}
      />
    );
  }
  return <PropertiesPlaceholder bare={bare} store={store} />;
}

/* ------------------------------------------------------------------ */
/* Sections column (SDL-285, EP-48)                                   */
/* ------------------------------------------------------------------ */

/**
 * localStorage key of the sections' open memory. Same shape as the outline's
 * collapse memory above: per editor when the caller supplies
 * `outlineStateKey`, one shared bucket otherwise. Deliberately NOT keyed by
 * node — the owner's rule is that the open state survives selection changes.
 */
function sectionsStorageKey(persistKey: string | undefined): string {
  return `sauna-studio:sections-open:${persistKey ?? "shared"}`;
}

/**
 * localStorage key of the prop groups' open memory (SDL-329). Sibling of
 * `sectionsStorageKey`, and per editor for the same reason: collapsing
 * `Advanced` is a preference about the panel, not about one node.
 */
function propGroupsStorageKey(persistKey: string | undefined): string {
  return `sauna-studio:prop-groups-open:${persistKey ?? "shared"}`;
}

/**
 * Shared className of the pills the Properties header puts in its badge slot
 * (group counter, `raw` marker). One constant rather than two literals for a
 * blunt reason on top of DRY: the EP-32 guard (spec 18) counts every textual
 * occurrence of an arbitrary utility, comments included, and the studio sits
 * exactly on its budget. Repeating the literal below — even inside prose like
 * this one — would have cost a slot the panel has no reason to spend.
 */
const PANEL_BADGE_CLASS = "px-1.5 text-caption";

/**
 * The trail of the selected node, cheapest possible: a walk up
 * `schema.parents` reading each ancestor's type. Root first, the selected
 * node last — the reading order of a breadcrumb.
 *
 * The node itself is part of the trail (SDL-375). The board writes the
 * subline as «Block → Heading» / «Хиро → Button»: the zone title names the
 * node, and the line under it says where that node LIVES — a path that
 * stops at the parent leaves the reader to join the two lines themselves.
 * The separator is the board's arrow, not the typographic «›» this walk
 * used to print.
 */
function parentTrail(schema: SaunaSchema, nodeId: SaunaNodeId): string | null {
  const self = schema.nodes[nodeId];
  const parts: string[] = self ? [saunaNodeDisplayName(self)] : [];
  let cursor = schema.parents[nodeId] ?? null;
  // The parents map is host data; a cycle in it must not hang the editor.
  let guard = 0;
  while (cursor && guard < 64) {
    const ancestor = schema.nodes[cursor];
    if (!ancestor) break;
    // The trail reads the SAME name the outline row shows (SDL-302) — a
    // renamed «Хиро» has to be «Хиро» in both, or the two panels are
    // describing different trees.
    parts.unshift(saunaNodeDisplayName(ancestor));
    cursor = schema.parents[cursor] ?? null;
    guard += 1;
  }
  // A lone entry is the selected node with no ancestors — the root itself.
  // There is no path to show, so the subline stays empty rather than
  // repeating the zone title verbatim.
  return parts.length > 1 ? parts.join(" → ") : null;
}

/**
 * The right-hand column in sections mode: header (selected node's type over
 * its parent trail), the always-open Properties section (children), then the
 * host sections. Keeps the `properties` panel hook and the `Properties`
 * region landmark — the column IS the properties column, grown sections.
 */
function StudioSectionsColumn({
  store,
  sections,
  persistKey,
  blocks,
  propsManifest,
  readOnly,
  children,
}: StoreProp & {
  sections: readonly SaunaStudioSection[];
  persistKey?: string;
  blocks?: readonly BlockDefinition[];
  propsManifest?: SaunaPropsManifest;
  /** Preview: sections that write to the document are withheld. */
  readOnly?: boolean;
  children: ReactNode;
}): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  const node = selectedId ? schema.nodes[selectedId] : null;
  const trail = node && selectedId ? parentTrail(schema, selectedId) : null;

  // How many groups the form below splits into — the badge the approved
  // canvas puts on the Properties header. Resolved through the SAME helper
  // the form uses, so the header cannot claim groups the body does not draw.
  const form = node ? resolvePropsForm({ node, blocks: blocks ?? [], manifest: propsManifest }) : null;
  // A node whose props schema is not the editor's gets a plate instead of the
  // form (SDL-667), so the header must not count groups nobody draws.
  const def = node ? blocks?.find((b) => b.type === node.type) : undefined;
  const versionPlate = !!(node && def && elementPropsVersionMismatch(def, node));
  const groupCount = form?.kind === "descriptors" && !versionPlate ? form.groups.length : 0;
  // A type with no `staticProps` schema falls back to the raw-JSON editor,
  // and the board marks that on the header with a yellow `raw` pill (SDL-377)
  // — the group counter cannot say it, because a raw form has no groups and
  // the header simply went empty. Same slot, mutually exclusive with the
  // counter by construction: `descriptors` has groups, `raw` has none.
  const isRawForm = form?.kind === "raw" && !versionPlate;

  return (
    <PanelColumn
      className="border-r-0 border-l"
      data-sauna-panel="properties"
      role="region"
      aria-label="Properties"
    >
      <PanelColumnHeader title={node ? saunaNodeDisplayName(node) : "Properties"}>
        {trail}
      </PanelColumnHeader>
      <PanelColumnBody>
        {/* Sections placed on top (SDL-721) come before Properties. */}
        <StudioHostSections
          store={store}
          sections={sections.filter((s) => s.placement === "top")}
          persistKey={persistKey}
          readOnly={readOnly}
        />
        {/* Without a selection the column header IS the Properties heading,
            so the section around the hint would print the same uppercase
            word twice in a row (SDL-375). The board draws one 36px row and
            the hint straight under it — which is what the bare body is. The
            section comes back the moment there is a node to describe: then
            the header names the node and «PROPERTIES» is the group's own
            title, not a duplicate. */}
        {node ? (
          <PanelSection
            alwaysOpen
            title="Properties"
            data-sauna-section="properties"
            badge={
              groupCount > 0 ? (
                <Badge variant="secondary" className={PANEL_BADGE_CLASS} data-sauna-prop-group-count="">
                  {groupCount === 1 ? "1 group" : `${groupCount} groups`}
                </Badge>
              ) : isRawForm ? (
                <Badge
                  variant="secondary"
                  tone="orange"
                  className={PANEL_BADGE_CLASS}
                  data-sauna-prop-raw=""
                >
                  raw
                </Badge>
              ) : undefined
            }
          >
            {children}
          </PanelSection>
        ) : (
          <div className="p-3" data-sauna-section="properties">
            {children}
          </div>
        )}
        <StudioHostSections
          store={store}
          sections={sections.filter((s) => s.placement !== "top")}
          persistKey={persistKey}
          readOnly={readOnly}
        />
      </PanelColumnBody>
    </PanelColumn>
  );
}

/**
 * The host sections as PanelSection rows. Shared between the desktop column
 * and the mobile Context sheet — only one of the two is mounted at a time,
 * so the localStorage bucket is the single source of persisted open state.
 */
function StudioHostSections({
  store,
  sections,
  persistKey,
  readOnly,
}: StoreProp & {
  sections: readonly SaunaStudioSection[];
  persistKey?: string;
  readOnly?: boolean;
}): ReactNode {
  // The whole state, not a slice: `applicable` is host code and may read any
  // part of it. The column is a handful of headers — re-rendering it per
  // store change costs less than a wrong staleness bug here.
  const state = useStore(store);

  // Open memory. Loaded in an effect for the same SSR reason as the
  // outline's collapse memory: a client-only initializer would hydrate a
  // tree different from the one the server sent.
  const storageKey = sectionsStorageKey(persistKey);
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed as Record<string, unknown>).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
        );
        setOpenState(Object.fromEntries(entries));
      }
    } catch {
      // Unreadable state is dropped, never fatal: sections open per default.
    }
  }, [storageKey]);

  const setSectionOpen = (id: string, open: boolean) => {
    const next = { ...openState, [id]: open };
    setOpenState(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Quota/privacy-mode failures lose only the memory, not the feature.
    }
  };

  return (
    <>
      {sections.map((section) => {
        // Preview shuts every door into the document (SDL-632 S6 review):
        // a section that writes is not drawn at all.
        if (readOnly && section.editsDocument) return null;
        // Default applicability: node editors. A section that says nothing
        // about the current selection is not shown at all (EP-48).
        const applicable = section.applicable
          ? section.applicable(state)
          : state.selection.nodeId !== null;
        if (!applicable) return null;
        const isEmpty = section.emptyAction != null;
        return (
          <PanelSection
            key={section.id}
            data-sauna-section={section.id}
            title={section.title}
            badge={section.badge}
            // The wrapper marks the section open when the empty action is
            // used, so the content it just created is on screen even if the
            // section was collapsed when it emptied out.
            emptyAction={
              isEmpty ? (
                <span
                  className="contents"
                  onClickCapture={() => setSectionOpen(section.id, true)}
                >
                  {section.emptyAction}
                </span>
              ) : undefined
            }
            open={
              isEmpty
                ? undefined
                : (openState[section.id] ?? section.defaultOpen ?? true)
            }
            onOpenChange={(open: boolean) => setSectionOpen(section.id, open)}
          >
            {isEmpty ? null : section.render(store)}
          </PanelSection>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile chrome (SDL-202): bottom tabs + bottom sheet                */
/* ------------------------------------------------------------------ */

type MobilePanelId = "outline" | "properties";

const SHEET_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type MobileTabProps = {
  id: MobilePanelId;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  active: boolean;
  /** Selection indicator on the Props tab (design spec [L471]). */
  dot?: boolean;
  onClick: () => void;
};

function MobileTab({ id, label, icon: Icon, active, dot, onClick }: MobileTabProps): ReactNode {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-pressed={active}
      data-sauna-mobile-tab={id}
      className={cn(
        // Mockup tabStyle: flex:1 column, gap 3, 9/11 vertical padding,
        // 10.5px/600 label; active paints the emphasis colour.
        "h-auto flex-1 flex-col gap-[3px] rounded-none pt-[9px] pb-[11px] text-caption font-semibold",
        active
          ? "text-primary"
          : "text-muted-foreground"
      )}
    >
      <span className="relative flex">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden />
        {dot ? (
          <span
            aria-hidden="true"
            data-sauna-mobile-tab-dot=""
            className="absolute -top-[3px] -right-1 h-[7px] w-[7px] rounded-sm bg-primary"
          />
        ) : null}
      </span>
      {label}
    </Button>
  );
}

type MobileSheetProps = {
  id: MobilePanelId;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Bottom sheet (design spec 2.12): backdrop + a card sliding up from the
 * bottom edge, capped at 76% of the viewport, 22px top radius, header of
 * "dot + title + close". Dialog semantics mirror the admin drawer
 * (studio-shell.tsx): focus moves to the close button on open, Tab cycles
 * inside, Escape closes — the mockup's sheet ignored Escape, which is defect
 * D5 of the behavior protocol, not a feature to preserve. The Escape
 * listener runs in the capture phase so the Studio hotkey layer (Escape =
 * clear selection) does not also fire underneath the sheet.
 */
function MobileSheet({ id, title, onClose, children }: MobileSheetProps): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Latest-callback ref, written in an effect rather than during render:
  // a ref assignment in the render body is exactly what `react-hooks/refs`
  // forbids (SDL-317). The listeners below read it, and they are installed
  // by an effect that runs after this one on every commit, so they never see
  // a stale callback.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    // The restore target is captured only when it sits OUTSIDE the sheet.
    // `document.activeElement` unconditionally is a trap twice over: under
    // StrictMode the effect's second invocation runs after the first one has
    // already focused the close button — inside the sheet, removed with it,
    // so the hand-back aimed at a disconnected node and focus fell to
    // <body>; and a keyed Outline → Properties remount captures the dying
    // sheet's internals the same way. When the capture is unusable, fall
    // back to this panel's own tab in the bottom bar — it is the one
    // stable, always-mounted element that semantically "opened" the sheet.
    const active = document.activeElement;
    const previous =
      active instanceof HTMLElement &&
      active !== document.body &&
      !panelRef.current?.contains(active)
        ? active
        : null;
    const restoreTarget = () =>
      previous?.isConnected
        ? previous
        : document.querySelector<HTMLElement>(`[data-sauna-mobile-tab="${id}"]`);
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Hand focus back only if it is still inside the sheet (or nowhere):
      // if the user already tapped into the canvas, leave it alone.
      const now = document.activeElement;
      if (!now || now === document.body || panelRef.current?.contains(now)) {
        restoreTarget()?.focus();
      }
    };
  }, [id]);

  return (
    <>
      {/* Catches the tap that closes the sheet (protocol 17.3, pinned by
          e2e 13) and nothing else: the board draws the sheet as a shadowed
          layer OVER a canvas that stays lit, so the author can still see the
          node they are editing while they edit it. Dimming it was the
          reflex, not the design (SDL-379). */}
      <div
        aria-hidden="true"
        onClick={onClose}
        data-sauna-mobile-sheet-backdrop=""
        className="absolute inset-0 z-40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-sauna-mobile-sheet={id}
        className="absolute inset-x-0 bottom-0 z-50 flex max-h-[76%] min-h-0 flex-col rounded-t-[22px] bg-card shadow-[0_-10px_40px_rgba(0,0,0,0.18)]"
      >
        {/* Grabber. The board puts one on every bottom sheet, and it is the
            only thing on this chrome that says "this panel came up from the
            edge and can go back" — the X says "close", which is not the same
            claim. Decorative: dragging the sheet is not a gesture the editor
            implements, so it carries no role and no handler. */}
        <span
          aria-hidden="true"
          data-sauna-mobile-sheet-grabber=""
          className="mx-auto mt-2 mb-1 h-1 w-9 flex-none rounded-full bg-border"
        />
        <div className="flex flex-none items-center gap-2.5 px-[18px] pt-1.5 pb-2.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-sm bg-primary"
          />
          <span className="text-base font-semibold">{title}</span>
          {/* `icon-sm` (32px) replaces the mockup's 30px override, and the
              X falls back to the Button's default 16px svg — the ±2px snap
              to the kit scale accepted in EP-32 §4.2 (SDL-224). */}
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close panel"
            onClick={onClose}
            className="ml-auto rounded-lg bg-muted text-muted-foreground"
          >
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-[9px] pb-4">
          {children}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Outline pane                                                       */
/* ------------------------------------------------------------------ */

type StoreProp = { store: StudioStore };

/**
 * Node-type icons of the outline rows (SDL-301, replacing the SDL-199 mono
 * glyphs). Resolved from the kit's icon registry (SDL-305), so a host
 * composing its own editor chrome gets the same set from `icons`. Types
 * outside the map — custom primitives a host registers — fall back to a box
 * rather than to nothing, so every row keeps its mark column.
 */
const OUTLINE_ICONS: Record<string, Icon> = {
  // Glyphs follow the board's «Node icons» cell (SDL-374): a page is a plain
  // square, a button is a pill, a block is a layout template. The previous
  // set read as "application window", "cursor" and "cardboard box" — the
  // roles were right, the drawings were of something else.
  Page: SquareIcon,
  Section: PanelTop,
  Text: TextIcon,
  Button: RectangleHorizontalIcon,
  Block: LayoutTemplateIcon,
  Image: ImageIcon,
  Link: LinkIcon,
  ActionCardLink: LinkIcon,
  Table: TableIcon,
  // A placed Component (EP-187, layer 5, canvas flow 2): the purple
  // component glyph, so a Ref never reads as an ordinary block.
  Ref: Component,
};

/** The colour of a row's glyph: the component role colour for a Ref, the row's own otherwise. */
function iconToneFor(type: string): string | undefined {
  return type === "Ref" ? "text-component" : undefined;
}

function iconFor(type: string): Icon {
  return OUTLINE_ICONS[type] ?? Box;
}

/**
 * Depth-first order of the outline — the order the rows appear on screen,
 * which is the order the arrow keys have to walk. Derived from the schema
 * rather than from the DOM so the traversal is testable without a browser
 * and stays correct while a drag is mid-flight.
 *
 * Children of a collapsed node are skipped: they are not on screen, and a
 * roving tabindex that walks into an invisible row strands the focus (ARIA
 * tree pattern — arrow keys move between VISIBLE rows only).
 */
function flattenOutline(
  schema: SaunaSchema,
  collapsed: ReadonlySet<SaunaNodeId>
): SaunaNodeId[] {
  const out: SaunaNodeId[] = [];
  const walk = (id: SaunaNodeId) => {
    if (!schema.nodes[id]) return;
    out.push(id);
    if (collapsed.has(id)) return;
    for (const child of schema.nodes[id].children ?? []) walk(child);
  };
  walk(schema.rootId);
  return out;
}

/**
 * localStorage key of the collapse memory. Per document when the caller
 * supplies `outlineStateKey` (schema-editor passes `<kind>:<id>`), one
 * shared bucket otherwise — a shell mounted without the prop still keeps
 * its state across reloads, it just shares it between documents.
 */
function collapseStorageKey(persistKey: string | undefined): string {
  return `sauna-studio:outline-collapsed:${persistKey ?? "shared"}`;
}

/**
 * Viewport Y of the gesture that started a drag. `PointerSensor` hands us a
 * PointerEvent, `TouchSensor` a TouchEvent whose coordinates live on the
 * touch list — and by the time a drag ends `touches` is empty, so
 * `changedTouches` is the one that still holds the finger.
 */
function pointerStart(activatorEvent: Event | null): number | null {
  if (!activatorEvent) return null;
  if ("clientY" in activatorEvent) {
    return (activatorEvent as unknown as { clientY: number }).clientY;
  }
  const touches = activatorEvent as unknown as {
    touches?: ArrayLike<{ clientY: number }>;
    changedTouches?: ArrayLike<{ clientY: number }>;
  };
  const touch = touches.touches?.[0] ?? touches.changedTouches?.[0];
  return touch ? touch.clientY : null;
}

/**
 * Pointer-first collision detection (SDL-304). The drop zones are quarters
 * of a row, so "which row is the POINTER in" is the only reading that can
 * agree with the indicator; `rectIntersection` answers "which row does the
 * dragged box overlap most", which is a different row whenever the box
 * straddles two. `rectIntersection` stays as the fallback for the gaps
 * between rows, where `pointerWithin` legitimately finds nothing.
 */
const outlineCollisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

/**
 * The delete confirmation (SDL-303, approved canvas «13 · Удаление узла с
 * детьми»). One instance per Studio, driven by an id rather than mounted by
 * whoever asked: the row menu and Delete/Backspace both hand their node to
 * the shell, so the two paths cannot drift into showing different sentences
 * — or into one of them showing none.
 *
 * Built on the kit's AlertDialog rather than a hand-rolled overlay (EP-32,
 * the lesson of SDL-329/336): focus trapping, Escape, the initial focus on
 * Cancel and the aria wiring are behaviour, not decoration, and a bespoke
 * div gets them wrong in ways a screenshot cannot show.
 *
 * Exported since SDL-364: the PO page editor guards its section delete with
 * the SAME dialog — same copy source, same hooks — instead of a copy that
 * would drift the moment either wording changes.
 */
export function DeleteNodeDialog({
  store,
  nodeId,
  onClose,
}: StoreProp & {
  /** Node awaiting confirmation, or null when nothing is pending. */
  nodeId: SaunaNodeId | null;
  onClose: () => void;
}): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  // Undo (Cmd+Z) can take the node out from under an open dialog. Closing on
  // a missing node keeps the confirmation from naming — and then removing —
  // an id that is no longer there.
  const node = nodeId ? schema.nodes[nodeId] : undefined;
  if (!nodeId || !node) return null;

  const copy = saunaDeleteConfirmCopy(schema, nodeId);

  return (
    <Dialog.Alert.Root
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Alert.Content data-sauna-delete-confirm="">
        <Dialog.Alert.Header>
          <Dialog.Alert.Title>{copy.title}</Dialog.Alert.Title>
          <Dialog.Alert.Description>{copy.body}</Dialog.Alert.Description>
        </Dialog.Alert.Header>
        <Dialog.Alert.Footer>
          <Dialog.Alert.Cancel data-sauna-delete-cancel="">
            Cancel
          </Dialog.Alert.Cancel>
          <Dialog.Alert.Action
            variant="destructive"
            data-sauna-delete-confirm-action=""
            onClick={() => {
              store.getState().applyOp({ kind: "remove", nodeId });
              onClose();
            }}
          >
            Delete
          </Dialog.Alert.Action>
        </Dialog.Alert.Footer>
      </Dialog.Alert.Content>
    </Dialog.Alert.Root>
  );
}

/**
 * The "save as component" dialog (SDL-341): the node's subtree becomes a
 * Component (`POST /pages/blocks`, SDL-718 — the service issues its id), and
 * a reference to that id stays in the node's place.
 *
 * Order is the whole design. The block is written FIRST and the page is
 * edited only after that write resolves — a failed write must not leave the
 * page pointing at a component that does not exist. The two halves are not
 * one transaction and cannot be: storage is remote, the schema is local.
 * This order makes the surviving failure the harmless one (a block nobody
 * references yet), not the broken one (a ref to nothing).
 *
 * Undo afterwards restores the page and LEAVES THE BLOCK. That is
 * deliberate: the block is its own document from the moment it exists, and
 * silently deleting a document because someone pressed ⌘Z on a different
 * one is not undo, it is data loss.
 */
function SaveAsComponentDialog({
  store,
  api,
  nodeId,
  onClose,
}: StoreProp & {
  api: SaunaSaveAsComponentApi;
  /** Node awaiting a name, or null when nothing is pending. */
  nodeId: SaunaNodeId | null;
  onClose: () => void;
}): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const node = nodeId ? schema.nodes[nodeId] : undefined;

  const [value, setValue] = useState("");
  const [group, setGroup] = useState("");
  const [groups, setGroups] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The workspace's groups, read once per opening; a failed read leaves the
  // field taking a typed name only (the save itself does not depend on it).
  useEffect(() => {
    if (!nodeId || !api.groups) return;
    let live = true;
    api.groups().then(
      (list) => {
        if (live) setGroups(list);
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [nodeId, api]);

  // Suggestion is seeded per opening, not per keystroke: retyping the name
  // and reopening the dialog should start from the node again, but an
  // author mid-edit must not have the field yanked out from under them.
  useEffect(() => {
    if (!nodeId) return;
    setValue(saunaComponentNameSuggestion(store.getState().schema, nodeId));
    setGroup("");
    setError(null);
    setBusy(false);
  }, [nodeId, store]);

  // Undo (⌘Z) can take the node out from under an open dialog — same guard
  // the delete confirmation carries, and the same reason: a dialog naming a
  // node that is gone would create a component out of nothing.
  if (!nodeId || !node) return null;

  // What the key will most likely be — the service may add a suffix when
  // the workspace already has it.
  const key = value.trim() ? saunaComponentKey(value) : "";

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    // The whole save is `saunaSaveNodeAsComponent` (SDL-718): Component
    // first, then the Ref to the id storage issued — tested without a DOM.
    const result = await saunaSaveNodeAsComponent({ store, api, nodeId, name: value, group });
    if (!result.ok) {
      setBusy(false);
      // A person reads words about the component; the endpoint and status
      // line go to the console only.
      if (result.cause !== undefined) console.error("[studio] save as component failed", result.cause);
      setError(result.message);
      if (result.field === "name") inputRef.current?.focus();
      return;
    }
    setBusy(false);
    onClose();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open: boolean) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Content
        data-sauna-save-component=""
        maxWidth={440}
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <Dialog.Header>
          <Dialog.Title>Save as component</Dialog.Title>
          <Dialog.Description>
            «{saunaNodeDisplayName(node)}» moves into a component of its own, and
            a reference to it stays on the page. Edits to the component reach
            every page it sits on.
          </Dialog.Description>
        </Dialog.Header>
        <FormControl.Input
          ref={inputRef}
          value={value}
          disabled={busy}
          placeholder="Hero section"
          maxLength={SAUNA_COMPONENT_NAME_MAX}
          aria-label="Component name"
          data-sauna-save-component-name=""
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {/* The key the Component is addressed by (agents, the MCP) — derived
            from the name, so it is shown rather than asked for. */}
        {key ? (
          <Text as="div" variant="meta" data-sauna-save-component-key={key}>
            Key <span className="font-mono">{key}</span>
          </Text>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5" data-sauna-save-component-group="">
          <Text as="div" size="sm" weight="medium">
            Group
          </Text>
          <SaunaGroupField groups={groups} value={group} onChange={setGroup} disabled={busy} />
        </div>
        {error ? (
          <Text
            as="div"
            size="sm"
            className="text-destructive"
            role="alert"
            data-sauna-save-component-error=""
          >
            {error}
          </Text>
        ) : null}
        <Dialog.Footer>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            data-sauna-save-component-cancel=""
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !value.trim()}
            data-sauna-save-component-submit=""
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function SaunaStudioOutline({
  store,
  blocks,
  persistKey,
  rootLabel,
  onNodeSelect,
  readOnly,
  onInsert,
  onRowInsert,
  onRowDelete,
  onRowSaveAsComponent,
}: StoreProp & {
  /**
   * Block catalog, for the composition rule the drag has to honour
   * (SDL-304): `meta.allowedParents` decides which rows can receive the
   * dragged node. Absent → structural guards only, as before.
   */
  blocks?: readonly BlockDefinition[];
  /** See SaunaStudioProps.outlineStateKey. */
  persistKey?: string;
  /** See SaunaStudioProps.rootLabel. */
  rootLabel?: string;
  /**
   * Fires after a row selects its node. The mobile sheet uses it to flip
   * from Outline to Properties (behavior protocol 17.3); the desktop
   * column passes nothing.
   */
  onNodeSelect?: () => void;
  /**
   * The tree is a reader, not an editor (preview). Rows still select and
   * collapse — neither writes to the document — but renaming and
   * drag-reorder are off, and the shell withholds the row actions on top of
   * that. Two doors into the same tree, so both are shut here rather than
   * in the caller.
   */
  readOnly?: boolean;
  /**
   * Opens the Insert-component modal (SDL-201). Absent → the zone-head
   * button renders disabled: the mobile sheet hides the header, and a
   * shell without a `blocks` catalog has nothing to insert.
   */
  onInsert?: () => void;
  /**
   * Opens the Insert-component modal with the given row pre-picked as the
   * parent (SDL-301, the per-row "+"). Absent → rows render no "+": the
   * mobile sheet has no hover, and no catalog means nothing to insert.
   */
  onRowInsert?: (nodeId: SaunaNodeId) => void;
  /**
   * Asks the shell to confirm deleting a row (SDL-303). Absent → the row
   * menu draws «Удалить» disabled: a tree with nowhere to send the request
   * must not delete silently.
   */
  onRowDelete?: (nodeId: SaunaNodeId) => void;
  /**
   * Asks the shell to name and save a row's subtree as a project block
   * (SDL-341). Absent → the item is drawn disabled, like «Удалить» without
   * a handler: no storage, no silent success.
   */
  onRowSaveAsComponent?: (nodeId: SaunaNodeId) => void;
}): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);

  // Collapse memory (SDL-301). State lives here — per outline mount — and
  // persists to localStorage so it survives reloads. Loaded in an effect,
  // not in the useState initializer: the shell is server-rendered, and a
  // client-only initializer would hydrate a tree different from the one the
  // server sent. The one-frame all-expanded flash is the accepted price.
  const storageKey = collapseStorageKey(persistKey);
  const [collapsed, setCollapsed] = useState<ReadonlySet<SaunaNodeId>>(
    () => new Set()
  );
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const ids: unknown = JSON.parse(raw);
      if (Array.isArray(ids)) {
        setCollapsed(new Set(ids.filter((id): id is string => typeof id === "string")));
      }
    } catch {
      // Unreadable state is dropped, never fatal: the tree opens expanded.
    }
  }, [storageKey]);

  const persistCollapsed = (next: ReadonlySet<SaunaNodeId>) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Quota/privacy-mode failures lose only the memory, not the feature.
    }
  };

  const setNodeCollapsed = (nodeId: SaunaNodeId, isCollapsed: boolean) => {
    if (collapsed.has(nodeId) === isCollapsed) return;
    const next = new Set(collapsed);
    if (isCollapsed) next.add(nodeId);
    else next.delete(nodeId);
    persistCollapsed(next);
  };

  // "Collapse all" (SDL-301, per Figma's layers panel): every container
  // except the root, which stays open so the tree never collapses to a
  // single row with everything unreachable behind it.
  const collapseAll = () => {
    const next = new Set<SaunaNodeId>();
    for (const [id, node] of Object.entries(schema.nodes)) {
      if (id === schema.rootId) continue;
      if ((node.children?.length ?? 0) > 0) next.add(id);
    }
    persistCollapsed(next);
  };

  // Roving tabindex (layer D, SDL-115). A tree is ONE Tab stop: before this
  // every row carried `tabIndex={0}`, so reaching the properties pane from
  // the top of the editor took 40+ Tab presses on a real page — a keyboard
  // trap in everything but name. Exactly one row is tabbable; inside the
  // tree the arrow keys move, per the ARIA tree pattern.
  const treeRef = useRef<HTMLDivElement | null>(null);
  const order = useMemo(() => flattenOutline(schema, collapsed), [schema, collapsed]);
  const [activeId, setActiveId] = useState<SaunaNodeId | null>(null);

  // The row whose name is being edited (SDL-302), or null. One at a time by
  // construction: starting a rename elsewhere replaces this id, which
  // unmounts the previous field and commits it through its own blur.
  const [renamingId, setRenamingId] = useState<SaunaNodeId | null>(null);

  // Both doors into a rename — F2 on the focused row and the row's own
  // double-click / menu item — go through here, so `readOnly` shuts them
  // together. A gate on one of them is the half-guard SDL-344 already paid
  // for once.
  const startRename = (nodeId: SaunaNodeId) => {
    if (readOnly) return;
    setRenamingId(nodeId);
  };

  const commitRename = (nodeId: SaunaNodeId, value: string) => {
    setRenamingId((current) => (current === nodeId ? null : current));
    store.getState().applyOp({ kind: "renameNode", nodeId, name: value });
  };

  // The tabbable row follows selection when the author has not moved focus
  // themselves, so clicking a node in the canvas and then Tabbing lands on
  // that node rather than back at the root. Membership is checked against
  // the VISIBLE order, not the schema: a row hidden inside a collapsed
  // branch cannot hold the tab stop.
  const rovingId =
    (activeId && order.includes(activeId) ? activeId : null) ??
    (selectedId && order.includes(selectedId) ? selectedId : null) ??
    order[0] ??
    null;

  const focusRow = (nodeId: SaunaNodeId | undefined) => {
    if (!nodeId) return;
    setActiveId(nodeId);
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-sauna-outline-node="${nodeId}"]`)
      ?.focus();
  };

  function handleTreeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-sauna-outline-node]"
    );
    if (!current) return;
    const id = current.dataset.saunaOutlineNode;
    if (!id) return;
    const index = order.indexOf(id);
    if (index < 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(order[Math.min(index + 1, order.length - 1)]);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRow(order[Math.max(index - 1, 0)]);
        break;
      // Horizontal arrows per the ARIA tree pattern (SDL-301): Right opens
      // a closed container, then steps into its first child; Left closes an
      // open container, then steps out to the parent. Leaves skip straight
      // to the move.
      case "ArrowRight": {
        event.preventDefault();
        const children = schema.nodes[id]?.children ?? [];
        if (children.length === 0) break;
        if (collapsed.has(id)) setNodeCollapsed(id, false);
        else focusRow(children[0]);
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        const children = schema.nodes[id]?.children ?? [];
        if (children.length > 0 && !collapsed.has(id)) {
          setNodeCollapsed(id, true);
        } else {
          const parent = schema.parents[id];
          if (parent) focusRow(parent);
        }
        break;
      }
      // F2 is the rename key of every file tree and of Figma's layers
      // panel; the double-click on the row is the pointer twin. The context
      // menu adds a third entry point in SDL-303 — all three call the same
      // setter, so there is one rename, not three.
      case "F2":
        event.preventDefault();
        startRename(id);
        break;
      case "Home":
        event.preventDefault();
        focusRow(order[0]);
        break;
      case "End":
        event.preventDefault();
        focusRow(order[order.length - 1]);
        break;
      default:
        break;
    }
  }

  // 8px PointerSensor activation distance keeps single-tap = select
  // working — clicks, shaky ones included, never cross the threshold so they
  // fall through to the row's own onClick (SDL-757; it was 4px). Only a real
  // drag hands the gesture to dnd-kit. TouchSensor with 250ms delay + 5px
  // tolerance gives iPad long-press to drag without blocking pane scroll.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: OUTLINE_DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  // The chip flies back to the row on drop, unless the system asks for
  // reduced motion (SDL-757, `outline-drag-motion.ts`).
  const dropAnimation = outlineDropAnimation(usePrefersReducedMotion());

  // Where the current drag would land (SDL-304). Recomputed on every move,
  // drawn as the indicator, and re-derived — not read from here — on drop:
  // React state is a frame behind, and `handleDragEnd` carries the same
  // event fields the move handler used.
  //
  // In the store since SDL-378, not in a `useState` here: the canvas mirrors
  // the same target between the author's own blocks, and it is portalled into
  // another document, so local state was invisible to it. Same move `hoveredId`
  // made in SDL-300, for the same reason.
  const dropTarget = useStore(store, (s) => s.dropTarget);
  const setDropTarget = useCallback(
    (target: OutlineDropTarget | null) => store.getState().setDropTarget(target),
    [store]
  );

  // The row being dragged, for the floating chip below. Separate from
  // `dropTarget`, which is about the DESTINATION and is null whenever the
  // pointer sits over nothing droppable — the ghost has to follow the pointer
  // there too.
  const [draggingId, setDraggingId] = useState<SaunaNodeId | null>(null);

  /**
   * dnd-kit resolves one droppable per row; SDL-304 needs to know WHERE in
   * that row the pointer sits, which nothing in the event carries directly.
   *
   * `activatorEvent` is the pointer/touch event that started the drag and
   * `delta` is how far it has travelled since — their sum is the live
   * pointer, the same arithmetic dnd-kit's own sensors do. The row box is
   * `over.rect`: dnd-kit's measurement, deliberately not a fresh
   * `getBoundingClientRect()`. The measured rects are what collision
   * detection just used to pick this row, so the ratio is computed in the
   * same coordinate space as the decision it feeds.
   *
   * That mattered more before SDL-378: sortable used to shift rows with CSS
   * transforms the measurements did not include, and a fresh live-DOM read
   * would have landed in a different space than the row it belonged to. The
   * rows no longer move (`OUTLINE_NO_ROW_SHIFT`), so the two spaces now
   * agree — `over.rect` stays because it is still the honest source, not
   * because the DOM would lie.
   */
  function dropFromEvent(
    event: DragMoveEvent | DragEndEvent
  ): OutlineDropTarget | null {
    const { active, over, delta, activatorEvent } = event;
    if (!over) return null;

    const start = pointerStart(activatorEvent);
    if (start === null) return null;

    const rect = over.rect;
    if (!rect.height) return null;
    const ratio = (start + delta.y - rect.top) / rect.height;

    return computeOutlineDrop({
      schema,
      blocks,
      activeId: String(active.id),
      overId: String(over.id),
      ratio,
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id) as SaunaNodeId);
  }

  function handleDragMove(event: DragMoveEvent) {
    // The "same target, don't re-render" check moved into the store's
    // `setDropTarget` with the state itself: two surfaces read it now, and
    // the comparison belongs where the value lives rather than at one of
    // the two call sites.
    setDropTarget(dropFromEvent(event));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDropTarget(null);
    setDraggingId(null);

    const target = dropFromEvent(event);
    if (!target) return;

    const activeId = String(event.active.id);
    const activeParent = schema.parents[activeId] ?? null;

    // Same parent stays `reorderChildren`: it is the op undo/redo, autosave
    // and the Phase-1 tests already know, and `reparent` would describe the
    // move as a parent change that never happened.
    if (activeParent && activeParent === target.parentId) {
      const siblings = schema.nodes[activeParent]?.children ?? [];
      const fromIndex = siblings.indexOf(activeId);
      if (fromIndex < 0 || fromIndex === target.index) return;
      store.getState().applyOp({
        kind: "reorderChildren",
        parentId: activeParent,
        fromIndex,
        toIndex: target.index,
      });
      return;
    }

    store.getState().applyOp({
      kind: "reparent",
      nodeId: activeId,
      newParentId: target.parentId,
      index: target.index,
    });
  }

  return (
    <>
      {/* "+ Insert" per the mockup's zone head (design spec insertBtn
          [L1048], protocol 13.3). Enabled when the shell can actually
          insert — i.e. the caller supplied a block catalog for the modal
          (SDL-201); without one it stays an honest disabled control.
          Desktop-only by construction: the mobile sheet hides the panel's
          own header (the sheet header owns the title), which matches the
          mockup — its Insert exists on desktop alone. */}
      <PanelColumnHeader
        title="Layers"
        actions={
          <>
            {/* "Collapse all" (SDL-301) — the corner control Figma's layers
                panel ships. Root is exempt, see collapseAll. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse all"
              title="Collapse all"
              data-sauna-outline-collapse-all=""
              onClick={collapseAll}
            >
              <ChevronsDownUp aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={!onInsert}
              onClick={onInsert}
              title="Insert component"
              data-sauna-outline-insert=""
              className="text-xs font-semibold"
            >
              + Insert
            </Button>
          </>
        }
      />
      <PanelColumnBody>
        <div
          ref={treeRef}
          className="px-1 py-2"
          role="tree"
          aria-label="Page layers"
          onKeyDown={handleTreeKeyDown}
        >
          <DndContext
            // No sensors = no drag activation at all (preview): the rows
            // stay readable and the tree stops being a way to move nodes.
            sensors={readOnly ? [] : sensors}
            collisionDetection={outlineCollisionDetection}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setDropTarget(null);
              setDraggingId(null);
            }}
          >
            {/* Root is rendered directly (no useSortable, not in any
                SortableContext) — undraggable by construction. */}
            <OutlineNode
              store={store}
              schema={schema}
              nodeId={schema.rootId}
              depth={0}
              rootLabel={rootLabel}
              selectedId={selectedId}
              rovingId={rovingId}
              collapsed={collapsed}
              dropTarget={dropTarget}
              renamingId={renamingId}
              onCollapsedChange={setNodeCollapsed}
              onRove={setActiveId}
              onNodeSelect={onNodeSelect}
              onRowInsert={onRowInsert}
              onRowDelete={onRowDelete}
              onRowSaveAsComponent={onRowSaveAsComponent}
              onRenameStart={startRename}
              onRenameCommit={commitRename}
              onRenameCancel={() => setRenamingId(null)}
              sortable={false}
            />
            {/* The ghost the board draws (SDL-378): a compact chip under the
                pointer — icon, name, a 2° tilt — while the row it came from
                stays where it is, dimmed.

                Until now the row itself was the ghost: `useSortable`'s
                transform carried it under the pointer at half opacity, which
                meant a deep row travelled with its indent and a tall one
                covered the very rows it was being aimed between. A chip in an
                overlay is the standard dnd-kit answer and the one the board
                approved. On drop the chip flies to where the row now sits
                (220ms), and is removed at once under reduced motion
                (SDL-757). */}
            <DragOverlay dropAnimation={dropAnimation}>
              {draggingId ? (
                <OutlineDragChip schema={schema} nodeId={draggingId} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
        {/* An empty document (EP-187, layer 5, canvas flow 3): Layers says
            what to do next instead of showing a lone root row. */}
        {onInsert && (schema.nodes[schema.rootId]?.children ?? []).length === 0 ? (
          <div className="px-3 pb-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onInsert}
              data-sauna-outline-empty-insert=""
              data-testid="layers-insert-element"
            >
              <Plus aria-hidden />
              Insert element
            </Button>
          </div>
        ) : null}
      </PanelColumnBody>
    </>
  );
}

type OutlineNodeProps = StoreProp & {
  schema: SaunaSchema;
  nodeId: string;
  depth: number;
  /** See SaunaStudioProps.rootLabel. Only the root row reads it. */
  rootLabel?: string;
  selectedId: string | null;
  /** The single row currently in the Tab ring (roving tabindex). */
  rovingId: string | null;
  /** Nodes whose children are hidden (SDL-301). */
  collapsed: ReadonlySet<SaunaNodeId>;
  /** Live drop position of the drag in flight, or null (SDL-304). */
  dropTarget: OutlineDropTarget | null;
  /** The row currently being renamed, or null (SDL-302). */
  renamingId: SaunaNodeId | null;
  /** Chevron toggle — flips one node's collapse state. */
  onCollapsedChange: (nodeId: SaunaNodeId, collapsed: boolean) => void;
  /** Row took focus — hand the roving tabindex over to it. */
  onRove: (nodeId: SaunaNodeId) => void;
  /** Post-selection hook, see SaunaStudioOutline. */
  onNodeSelect?: () => void;
  /** Per-row "+", see SaunaStudioOutline. */
  onRowInsert?: (nodeId: SaunaNodeId) => void;
  /** Per-row delete request, see SaunaStudioOutline. */
  onRowDelete?: (nodeId: SaunaNodeId) => void;
  /** Per-row "save as component", see SaunaStudioOutline. */
  onRowSaveAsComponent?: (nodeId: SaunaNodeId) => void;
  /** Rename plumbing (SDL-302) — the state itself lives in the outline. */
  onRenameStart: (nodeId: SaunaNodeId) => void;
  onRenameCommit: (nodeId: SaunaNodeId, value: string) => void;
  onRenameCancel: () => void;
  /** When true, render via SortableOutlineNode wrapper (non-root). */
  sortable: boolean;
};

function OutlineNode({
  store,
  schema,
  nodeId,
  depth,
  rootLabel,
  selectedId,
  rovingId,
  collapsed,
  dropTarget,
  renamingId,
  onCollapsedChange,
  onRove,
  onNodeSelect,
  onRowInsert,
  onRowDelete,
  onRowSaveAsComponent,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  sortable,
}: OutlineNodeProps): ReactNode {
  const node = schema.nodes[nodeId];
  if (!node) return null;
  const children = node.children ?? [];
  const isExpanded = !collapsed.has(nodeId);

  // Row actions (SDL-303). Computed here rather than inside the row because
  // the schema — the only thing that knows whether a move exists or whether
  // this is the root — is already in hand at this level. An action that
  // cannot run is `undefined`, and the menu draws that item disabled instead
  // of offering a click that would be a no-op.
  const isRoot = nodeId === schema.rootId;
  const applyOp = (op: SchemaOp) => store.getState().applyOp(op);
  const moveUpOp = saunaSiblingMoveOp(schema, nodeId, "up");
  const moveDownOp = saunaSiblingMoveOp(schema, nodeId, "down");

  const row = (
    <OutlineRow
      store={store}
      nodeId={nodeId}
      label={isRoot && rootLabel ? rootLabel : saunaNodeDisplayName(node)}
      // The type badge appears only on a renamed row: on an unnamed one the
      // label already IS the type, and printing it twice is noise (approved
      // canvas — «Button» carries no badge, «Хиро» carries `Section`).
      named={saunaNodeDisplayName(node) !== node.type}
      // The NAME is overridden for the root, the type is not: `type` feeds
      // `data-sauna-outline-icon`, which spec 08 reads as a statement about
      // what the node IS. A display label must not rewrite that. Which glyph
      // the board wants on a component's root is an open question — its
      // «Node icons» cell gives «Block» a layout-template (SDL-374) and
      // FinalComponentEditor draws a package — so it stays the real type's
      // until the owner picks one.
      type={node.type}
      depth={depth}
      isSelected={nodeId === selectedId}
      dropMode={dropTarget?.overId === nodeId ? dropTarget.mode : null}
      // «0» on the root, nothing on an empty leaf (SDL-375). The board puts
      // a counter on the root of an empty page, because that row is the one
      // the author has to notice; a «0» on every childless row is the
      // over-application SDL-374 reverted once already.
      //
      // The root is the only node known to be a container without asking:
      // it IS the document. The catalog cannot answer the general question —
      // `allowedParents`/`allowedChildren` describe compound parts (Card,
      // InputGroup), so a bare `Section` is indistinguishable there from a
      // `Text` (see `typeAcceptsChildren`, which returns false for both).
      // Inventing a container flag is a kit change, not an outline change.
      childCount={isRoot || children.length > 0 ? children.length : null}
      expandable={children.length > 0}
      expanded={isExpanded}
      onExpandedChange={(expanded) => onCollapsedChange(nodeId, !expanded)}
      tabbable={nodeId === rovingId}
      onRove={onRove}
      onNodeSelect={onNodeSelect}
      onInsertChild={onRowInsert ? () => onRowInsert(nodeId) : undefined}
      renaming={nodeId === renamingId}
      onRenameStart={() => onRenameStart(nodeId)}
      onRenameCommit={(value) => onRenameCommit(nodeId, value)}
      onRenameCancel={onRenameCancel}
      onDuplicate={
        isRoot ? undefined : () => applyOp({ kind: "duplicate", nodeId })
      }
      onMoveUp={moveUpOp ? () => applyOp(moveUpOp) : undefined}
      onMoveDown={moveDownOp ? () => applyOp(moveDownOp) : undefined}
      onDelete={
        isRoot || !onRowDelete ? undefined : () => onRowDelete(nodeId)
      }
      // Disabled on the root for the same reason as «Удалить»: a document
      // whose root became a reference has nothing of its own left to edit.
      onSaveAsComponent={
        isRoot || !onRowSaveAsComponent
          ? undefined
          : () => onRowSaveAsComponent(nodeId)
      }
    />
  );

  return (
    // `role="none"` keeps the grouping div out of the tree structure: an
    // unlabelled `generic` between `tree` and `treeitem` is what makes some
    // screen readers stop announcing positions.
    <div className="flex flex-col" role="none">
      {sortable ? (
        <SortableOutlineRow nodeId={nodeId}>{row}</SortableOutlineRow>
      ) : (
        row
      )}
      {/* A collapsed node renders no children at all — not hidden-by-CSS:
          rows that are not in the DOM cannot take focus, match e2e locators
          or register with dnd-kit, which is exactly the contract. */}
      {children.length > 0 && isExpanded ? (
        <SortableContext items={children} strategy={OUTLINE_NO_ROW_SHIFT}>
          {children.map((childId) => (
            <OutlineNode
              key={childId}
              store={store}
              schema={schema}
              nodeId={childId}
              depth={depth + 1}
              selectedId={selectedId}
              rovingId={rovingId}
              collapsed={collapsed}
              dropTarget={dropTarget}
              renamingId={renamingId}
              onCollapsedChange={onCollapsedChange}
              onRove={onRove}
              onNodeSelect={onNodeSelect}
              onRowInsert={onRowInsert}
              onRowDelete={onRowDelete}
              onRowSaveAsComponent={onRowSaveAsComponent}
              onRenameStart={onRenameStart}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              sortable
            />
          ))}
        </SortableContext>
      ) : null}
    </div>
  );
}

type OutlineRowProps = StoreProp & {
  nodeId: SaunaNodeId;
  /** What the row is CALLED — the node's name, or its type (SDL-302). */
  label: string;
  /**
   * What the row IS. Kept separate from `label` because the icon, the
   * insert modal and the e2e hooks all address the primitive, and a
   * renamed node must not change which glyph it draws.
   */
  type: string;
  /**
   * The node carries an author-given name, i.e. `label` is that name and
   * not the type spelled out. Passed rather than inferred from
   * `label !== type`: the root of a component editor is labelled «Block»
   * while its type is `Section` (SDL-375), and the inference read that as
   * a rename — printing a type badge the board does not draw and seeding
   * the F2 field with a name the author never gave.
   */
  named: boolean;
  depth: number;
  isSelected: boolean;
  /**
   * This row is the current drop target (SDL-304): a line above it, a line
   * below it, or a ring around it for "goes inside". Null the rest of the
   * time, which is every row but one during a drag and every row when no
   * drag is in flight.
   */
  dropMode: OutlineDropTarget["mode"] | null;
  childCount: number | null;
  expandable: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  tabbable: boolean;
  onRove: (nodeId: SaunaNodeId) => void;
  onNodeSelect?: () => void;
  /** Opens the insert modal targeting THIS row (SDL-301). */
  onInsertChild?: () => void;
  /** This row is in rename mode (SDL-302). */
  renaming: boolean;
  onRenameStart: () => void;
  onRenameCommit: (value: string) => void;
  onRenameCancel: () => void;
  /**
   * Row menu actions (SDL-303). `undefined` means the action does not exist
   * for THIS row — the root cannot be duplicated or deleted, the first child
   * cannot move up — and the item renders disabled rather than disappearing:
   * a menu whose length changes per row is harder to use than one whose
   * items grey out.
   */
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  /** Opens the "save as component" dialog for THIS row (SDL-341). */
  onSaveAsComponent?: () => void;
};

function OutlineRow({
  store,
  nodeId,
  label,
  type,
  named,
  depth,
  isSelected,
  dropMode,
  childCount,
  expandable,
  expanded,
  onExpandedChange,
  tabbable,
  onRove,
  onNodeSelect,
  onInsertChild,
  renaming,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSaveAsComponent,
}: OutlineRowProps): ReactNode {
  // Read here rather than passed down from the outline (SDL-300): the
  // subscription is a boolean, so moving the pointer re-renders the row
  // that gained the mark and the one that lost it — not the whole tree on
  // every pixel of travel.
  const isHovered = useStore(store, (s) => s.hoveredId === nodeId);
  const select = () => {
    store.getState().selectNode(nodeId);
    onNodeSelect?.();
  };
  const TypeIcon = iconFor(type);
  const row = (
    <TreeRow
      depth={depth}
      // The icon is decorative (the label right next to it IS the type
      // name), hence aria-hidden. The wrapper span sizes the mark itself —
      // 14px per the SDL-301 design reference — because TreeRow's own icon
      // slot only sizes a DIRECT svg child.
      icon={
        <span
          aria-hidden="true"
          data-sauna-outline-icon={type}
          className={cn("flex items-center justify-center [&>svg]:size-3.5", iconToneFor(type))}
        >
          {/* False positive of `react-hooks/static-components` (SDL-317):
              `iconFor` is a lookup in the module-level OUTLINE_ICONS map, so
              the component identity is fixed at module load and a row never
              remounts its glyph. The rule sees a capitalized binding assigned
              from a CALL in render and cannot tell a lookup from a factory —
              the device switcher below does the same thing through a property
              access (`d.icon`) and is not flagged. */}
          {/* eslint-disable-next-line react-hooks/static-components */}
          <TypeIcon />
        </span>
      }
      label={label}
      meta={named ? type : undefined}
      editing={renaming}
      // Seeded from the NAME, not the display name: on an unnamed row the
      // field opens empty, so F2 + Enter stays a true no-op instead of
      // writing `name` equal to the type — a redundant field, an undo step
      // and a save for a gesture the author sees as doing nothing.
      editValue={named ? label : ""}
      editLabel={`Rename ${label}`}
      onEditCommit={onRenameCommit}
      onEditCancel={onRenameCancel}
      childCount={childCount}
      expandable={expandable}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      selected={isSelected}
      onClick={select}
      // TreeRow is a div, so the button behaviour it replaced has to be
      // restored explicitly. It matters beyond keyboard access: the hotkey
      // layer ignores keys typed inside form fields, so clicking a row must
      // move focus OUT of the properties input for Cmd+Z to reach the store.
      //
      // Roving tabindex (SDL-115): only the active row is in the Tab ring;
      // the others are reachable with the arrow keys the tree container
      // handles. Arrow keys are deliberately NOT handled here — one listener
      // on the tree beats one per row, and dnd-kit's own keyboard listeners
      // sit between the two.
      tabIndex={tabbable ? 0 : -1}
      onFocus={() => onRove(nodeId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      // Pointer twin of F2 (SDL-302). The single click underneath still
      // selects — a rename is a deliberate second click, and the author who
      // only wanted the node keeps the behaviour they had.
      onDoubleClick={(event) => {
        event.preventDefault();
        onRenameStart();
      }}
      // Cross-surface hover (SDL-300). `hover:bg-accent` in TreeRow already
      // covers the pointer sitting on the row itself; this class is what
      // lights the row while the pointer is out on the CANVAS, over the same
      // node. Weaker than the selected row's fill on purpose — hover says
      // "this one", selection says "this one, and the properties pane is
      // about it".
      className={cn(
        isHovered && !isSelected && "bg-accent/50 text-accent-foreground"
      )}
      // Mouse only, same reason as the canvas side: a tap has no "left the
      // row" event to undo it with.
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        store.getState().hoverNode(nodeId);
      }}
      onPointerLeave={() => store.getState().hoverNode(null)}
      data-sauna-outline-node={nodeId}
      data-selected={isSelected ? "true" : undefined}
      data-sauna-outline-hovered={isHovered ? "true" : undefined}
    />
  );

  return (
    // The hover scope is THIS row only — the wrapper must not contain the
    // child rows, or hovering a child would light every ancestor's "+".
    // `role="none"` for the same reason as every other wrapper in the tree.
    //
    // Rendered unconditionally since SDL-304, where it used to appear only
    // with a per-row "+". The drop indicator needs the same positioning
    // context, and a wrapper that MOUNTS mid-drag would remount the row
    // under it — losing dnd-kit's node ref at the exact moment the drag
    // depends on it.
    <div
      role="none"
      className={cn(
        "group/outline-row relative",
        dropMode === "inside" && "rounded-sm ring-2 ring-info ring-inset"
      )}
    >
      {row}
      {/* The insertion line. Decorative — the position it marks is announced
          by nothing, because a pointer drag has no screen-reader audience;
          the keyboard path to the same move is the tree's own arrows.
          Drawn from `dropMode`, which comes from the SAME
          `computeOutlineDrop` call that the drop applies, so the line
          cannot promise a position the drop will not use. */}
      {dropMode === "before" || dropMode === "after" ? (
        <span
          aria-hidden="true"
          data-sauna-outline-drop={dropMode}
          // Indented to the depth the drop would land at, per the board: a
          // full-width rule says "somewhere here", an indented one says
          // "here, as a sibling of THAT row". The number is TreeRow's own
          // padding formula (8 + depth × 16) rather than a copy of it in a
          // class, so the line cannot drift from the rows it runs between —
          // and an inline style keeps it out of the arbitrary-value budget
          // (e2e 18), which a `left-[40px]` per depth would blow.
          // Only the depth-driven half is inline; the right inset is a utility
          // (`right-2`) below, because EP-32 bans STATIC geometry in style
          // objects and is right to — a literal that never changes belongs on
          // the kit's scale. What is left here is runtime geometry of the same
          // kind `src/engine` is exempted for: it is a function of the node's
          // place in the tree and no scale can express it.
          style={{ left: OUTLINE_INDENT_BASE + depth * OUTLINE_INDENT_PER_LEVEL }}
          // `info`, not `ring`: the drop line is the editor speaking, and it
          // shares that voice with selection and the canvas overlay. On the
          // neutral `--ring` it was the same near-black as the text it ran
          // between. The leading dot is the board's own marker — it gives the
          // line a head, so a 2px rule reads as an insertion point.
          className={cn(
            "pointer-events-none absolute right-2 h-0.5 rounded-full bg-info",
            dropMode === "before" ? "top-0" : "bottom-0"
          )}
        >
          {/* The head of the line, as a real element rather than a `before:`
              pseudo. A pseudo would need an empty-content arbitrary utility,
              and the studio's arbitrary budget (e2e 18) is a ceiling worth
              keeping — the dot is cheaper as a span. */}
          <span className="absolute top-1/2 left-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-info bg-card" />
        </span>
      ) : null}
      {dropMode === "inside" ? (
        <span
          aria-hidden="true"
          data-sauna-outline-drop="inside"
          className="pointer-events-none absolute inset-0"
        >
          {/* The board's «внутрь» pill. The inset ring alone said "this row
              is involved" without saying HOW — before/after paint a line
              between rows, and a ring around a row is the only mode with no
              line to read, so the mode has to be spelled out. Right-aligned
              because the left of the row is the node's own name; the row
              controls step aside for it below. */}
          <span className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-info/15 px-1.5 py-px text-xs font-medium text-info-foreground">
            inside
          </span>
        </span>
      ) : null}
      {/* Per-row insert (SDL-301): a 20px icon button that fades in on the
          row's hover or focus. Out of the Tab ring on purpose — keyboard
          users reach the same modal through the zone-head "+ Insert", and
          a tab stop per row would undo SDL-115. It covers the child-count
          badge while shown, which is the Figma-style trade: the counter is
          resting-state info, the action is the hover state. */}
      {/* Row controls, right-aligned: "+" (SDL-301) then the "⋯" menu
          (SDL-303). Each positions itself against the row rather than
          sharing a flex strip — the "+" is addressed by e2e as a SIBLING of
          the row (`[data-sauna-outline-node=…] ~ [data-sauna-outline-add]`),
          and wrapping the pair in a div would quietly break that locator.
          They step aside for the «внутрь» pill, which lands in the same
          corner: mid-drag the drop mode is the only thing worth reading
          there, and the pointer that would "hover" them is holding a node. */}
      <>
        {onInsertChild ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Insert into ${label}`}
            title="Insert component here"
            data-sauna-outline-add=""
            onClick={(event) => {
              // The row's own onClick must not fire: "+" opens the modal for
              // THIS row without moving the selection.
              event.stopPropagation();
              onInsertChild();
            }}
            className={cn(
              OUTLINE_ROW_BUTTON,
              "right-7",
              dropMode === "inside" && "hidden"
            )}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        ) : null}
        <Menu.Root>
          <Menu.Trigger asChild>
            <button
              type="button"
              // Out of the Tab ring for the same reason as "+": one tab stop
              // per row is what SDL-115 removed. The keyboard reaches every
              // item in this menu through its own shortcut — F2, ⌘D, ⌘↑/⌘↓,
              // Delete — which is why the menu prints them.
              tabIndex={-1}
              aria-label={`Actions for ${label}`}
              title="Node actions"
              data-sauna-outline-menu=""
              onClick={(event) => event.stopPropagation()}
              className={cn(
                OUTLINE_ROW_BUTTON,
                "right-1",
                dropMode === "inside" && "hidden",
                // An open menu whose trigger has faded out looks detached
                // from the row it acts on — and on the way to the menu the
                // pointer leaves the row, which is exactly when hover ends.
                //
                // Visible alone is not enough: the board draws the trigger
                // PRESSED while its menu is open (SDL-376), and the pointer
                // is by then somewhere down the menu, so nothing else on the
                // row says which "⋯" this menu belongs to. Tokens, not the
                // board's literals: `border`/`border-strong`/`foreground` are
                // the admin surface's #e4e4e7/#d4d4d8/#09090b.
                //
                // The ARIA variant, not the data-attribute one, and not as a
                // matter of taste: the EP-32 budget guard counts any utility
                // written with a bracketed tail, so the data-state form
                // spends four slots of the arbitrary remainder on a variant
                // that carries no value at all. Radix sets both attributes on
                // the trigger; this one is a built-in Tailwind variant and is
                // what a screen reader already announces. Mind the same trap
                // in prose here — the guard greps the file, comments included.
                "aria-expanded:opacity-100 aria-expanded:border-border-strong aria-expanded:bg-border aria-expanded:text-foreground"
              )}
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </Menu.Trigger>
          {/* 232px and the item shortcuts come from the approved canvas
              «11 · Контекстное меню узла». One separator, above «Delete». */}
          <Menu.Content align="end" width={232}>
            <Menu.Item
              data-sauna-outline-action="rename"
              onSelect={onRenameStart}
            >
              <Edit aria-hidden />
              Rename
              {/* The board prints ⏎ here. Enter SELECTS a row (SDL-115
                  roving tabindex) and rename lives on F2 and double click
                  (SDL-302), so the menu shows the key that works; whether to
                  move rename onto Enter is the question left on EP-48. */}
              <Menu.Shortcut>F2</Menu.Shortcut>
            </Menu.Item>
            <Menu.Item
              data-sauna-outline-action="duplicate"
              disabled={!onDuplicate}
              onSelect={onDuplicate}
            >
              <Copy aria-hidden />
              Duplicate
              <Menu.Shortcut>⌘D</Menu.Shortcut>
            </Menu.Item>
            {/* SDL-341. Sits with «Duplicate» — both answer "make
                something out of this node" — and carries no shortcut: the
                approved canvas prints one only for actions the keyboard
                already reaches, and this one has no key of its own. */}
            <Menu.Item
              data-sauna-outline-action="save-as-component"
              disabled={!onSaveAsComponent}
              onSelect={onSaveAsComponent}
            >
              <Component aria-hidden />
              Save as component
            </Menu.Item>
            <Menu.Item
              data-sauna-outline-action="move-up"
              disabled={!onMoveUp}
              onSelect={onMoveUp}
            >
              <ArrowUp aria-hidden />
              Move up
              <Menu.Shortcut>⌘↑</Menu.Shortcut>
            </Menu.Item>
            <Menu.Item
              data-sauna-outline-action="move-down"
              disabled={!onMoveDown}
              onSelect={onMoveDown}
            >
              <ArrowDown aria-hidden />
              Move down
              <Menu.Shortcut>⌘↓</Menu.Shortcut>
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              variant="destructive"
              data-sauna-outline-action="delete"
              disabled={!onDelete}
              onSelect={onDelete}
            >
              <Trash2 aria-hidden />
              Delete
              <Menu.Shortcut>⌫</Menu.Shortcut>
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </>
    </div>
  );
}

/**
 * The 20px icon button both row controls wear (approved canvas: 20×20,
 * radius 4). Hidden until the row is hovered or holds focus — resting state
 * belongs to the node's own name and child count.
 */
/**
 * TreeRow's own indent step, mirrored so the drop line can start where the
 * row's content starts (SDL-378). The kit keeps the number private, so this
 * is a copy — pinned by e2e 29, which measures the line against the row's
 * real `padding-left` rather than trusting either constant.
 */
const OUTLINE_INDENT_PER_LEVEL = 16;

/** TreeRow's base padding, the other half of the same mirrored formula. */
const OUTLINE_INDENT_BASE = 8;

const OUTLINE_ROW_BUTTON =
  "absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity group-focus-within/outline-row:opacity-100 group-hover/outline-row:opacity-100 hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/**
 * The ghost that follows the pointer during an outline drag (SDL-378).
 *
 * Deliberately NOT the row: a chip says "you are carrying this node" without
 * claiming anything about where it currently sits. It has no indent (the
 * indent belongs to a position in the tree, and mid-drag the node has none),
 * no counter, no chevron and no row controls — none of them can be acted on
 * while the pointer is down, and each one would be a target the author can
 * see and cannot hit.
 *
 * The 2° tilt is the board's, and it earns its place: the chip is otherwise a
 * card on a surface of cards, and the tilt is what says it is airborne.
 */
function OutlineDragChip({
  schema,
  nodeId,
}: {
  schema: SaunaSchema;
  nodeId: SaunaNodeId;
}): ReactNode {
  const node = schema.nodes[nodeId];
  if (!node) return null;
  const TypeIcon = iconFor(node.type);

  return (
    <div
      data-sauna-outline-drag-chip=""
      // `cursor-grabbing` on the chip, not on the row: the chip is what sits
      // under the pointer for the whole gesture.
      className="flex h-8 w-fit max-w-56 cursor-grabbing items-center gap-1.5 rounded-md border border-border bg-card px-2 text-sm font-medium text-foreground shadow-md"
      style={{ transform: "rotate(2deg)" }}
    >
      <span
        aria-hidden="true"
        data-sauna-outline-icon={node.type}
        className={cn("flex items-center justify-center text-muted-foreground [&>svg]:size-3.5", iconToneFor(node.type))}
      >
        {/* Same false positive as the row's glyph: `iconFor` is a lookup in
            a module-level map, not a component factory (SDL-317). */}
        {/* eslint-disable-next-line react-hooks/static-components */}
        <TypeIcon />
      </span>
      <span className="truncate">{saunaNodeDisplayName(node)}</span>
    </div>
  );
}

/**
 * The sorting strategy that moves nothing (SDL-378).
 *
 * `verticalListSortingStrategy` opened a gap under the pointer by pushing
 * the rows below it down — the behaviour a flat list of cards wants. A tree
 * is not that list: the gap appears between rows whose indentation says they
 * belong to different parents, so it reads as a promise about WHERE the node
 * lands that the drop rule (top quarter / middle / bottom quarter) does not
 * keep. The board draws no shifting either — the destination is stated by
 * the line and the pill, once, in one place.
 *
 * Returning `null` is dnd-kit's own "no transform for this item"; the rows
 * keep their measured boxes, which is also what makes `dropFromEvent`'s
 * arithmetic exact rather than approximately right.
 */
const OUTLINE_NO_ROW_SHIFT: SortingStrategy = () => null;

function SortableOutlineRow({
  nodeId,
  children,
}: {
  nodeId: SaunaNodeId;
  children: ReactNode;
}): ReactNode {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: nodeId,
  });

  // No transform and no transition: the row STAYS, and the thing that
  // travels under the pointer is the chip in `DragOverlay`. 0.45 is the
  // board's own value for the row left behind — dimmed enough to read as
  // "this is the one in flight", solid enough to stay countable in the tree.
  const style = useMemo(
    () => ({ opacity: isDragging ? 0.45 : 1 }),
    [isDragging]
  );

  // dnd-kit's `attributes` are dropped whole, not filtered. They exist for
  // its KeyboardSensor, and we mount PointerSensor + TouchSensor only, so
  // every one of them is dead weight: `role="button"` + `tabIndex={0}` made
  // each wrapper its own Tab stop (most of the 43 stops SDL-115 starts from)
  // and put a `button` between `tree` and `treeitem`.
  //
  // Filtering just those two is not enough, which is the trap here. What
  // remains — `aria-describedby` and `aria-roledescription` — is *global*
  // ARIA, and a `role="none"` element carrying global ARIA loses its
  // presentational role (ARIA 1.2 presentational-role conflict resolution).
  // The wrapper would fall back to `generic`: the same broken tree, now with
  // an `aria-roledescription` on a generic node on top. Dragging is
  // unaffected — `setNodeRef` and `listeners` are what pointer/touch use.
  void attributes;

  return (
    // Named so the drag state is addressable from outside: the row inside
    // carries `data-sauna-outline-node`, but the dimming belongs to this
    // wrapper — it is the element dnd-kit holds — and an unnamed div is not
    // something a spec (or a debugging session) can point at.
    <div
      ref={setNodeRef}
      data-sauna-outline-row={nodeId}
      data-sauna-outline-row-dragging={isDragging || undefined}
      style={style}
      role="none"
      {...listeners}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview pane                                                       */
/* ------------------------------------------------------------------ */

function SaunaStudioPreview({
  store,
  render,
  device,
  onDeviceChange,
  onInsert,
  toolbar = true,
  preview = false,
  onExitPreview,
  siteTheme,
  customColors,
  rootIsContent = false,
  nodeMenu,
}: StoreProp & {
  /** The canvas name label's menu (EP-187). Absent → the label is not a button. */
  nodeMenu?: (nodeId: SaunaNodeId) => SaunaCanvasNodeMenuItem[];
  render: (schema: SaunaSchema, ctx: SaunaStudioRenderContext) => ReactNode;
  /** The site theme — see SaunaStudioProps.siteTheme. */
  siteTheme?: unknown;
  /** The custom colours painted on the canvas — see SaunaStudioProps.themeColors. */
  customColors?: readonly SiteThemeCustomColor[];
  /** See SaunaStudioProps.rootIsContent. */
  rootIsContent?: boolean;
  device: SaunaCanvasDeviceId;
  onDeviceChange: (device: SaunaCanvasDeviceId) => void;
  /** Preview mode — see SaunaStudioProps.preview. */
  preview?: boolean;
  onExitPreview?: () => void;
  /**
   * Opens the insert modal at the root. Optional: the modal is mounted on
   * the desktop shell only, so the mobile canvas gets the empty card
   * without a call to action rather than a button that does nothing.
   */
  onInsert?: () => void;
  /**
   * Draws the device switcher above the canvas. On by default; the mobile
   * shell turns it off, because the phone board draws no such row (SDL-379).
   */
  toolbar?: boolean;
}): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const screen = useStore(store, (s) => s.view.screen);
  const audience = useStore(store, (s) => s.view.audience);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  const canvasAudience = studioCanvasAudience({
    preview,
    audience,
    selectedMode: selectedId ? saunaEffectiveVisibilityMode(schema, selectedId) : undefined,
    screen,
  });
  const active = saunaCanvasDevice(device);
  // An empty document is a state, not an absence (SDL-375). Until now the
  // canvas rendered a document with no children as a blank sheet, which on
  // a brand-new page is indistinguishable from a canvas that failed to
  // load — the one moment where the editor has to say what to do next.
  // A Block's root may be its only element (SDL-721): see rootIsContent.
  const root = schema.nodes[schema.rootId];
  const isEmpty =
    (root?.children ?? []).length === 0 &&
    (!rootIsContent || Object.keys(root?.props ?? {}).length === 0);

  // The canvas is a work field, not a bare scroll pane (SDL-200): the
  // document renders as a centered sheet on the muted workspace, with the
  // field padding from the mockup's editor (4.5/4.6 in the design spec; 30px
  // desktop, 15px mobile).
  //
  // SDL-297 changed what the sheet IS. It used to be a 660px div in the admin
  // document with the public palette borrowed onto it; now it is a device
  // viewport — an iframe of exactly the selected width, holding the public
  // sheets and nothing of the admin's. The 660px cap is gone with it: a fixed
  // width that matched no device was the reason the responsive view could not
  // be trusted. Padding is gone too, for the same reason — a real viewport has
  // none, and the author's own layout must be the thing that spaces the page.
  //
  // `max-md:` paired with `md:` for the paddings, same reason as the shell
  // grid above: base utilities lose to a host's later copy of the same class,
  // mutually exclusive media queries cannot.
  return (
    <div className="flex flex-1 flex-col overflow-auto bg-muted">
      {/* In preview the strip appears even where the device switcher is
          turned off (the phone shell): the mode has to be named wherever it
          can be entered. */}
      {toolbar || preview ? (
        <CanvasToolbar
          device={device}
          onDeviceChange={onDeviceChange}
          devices={toolbar}
          preview={preview}
          onExitPreview={onExitPreview}
        />
      ) : null}
      {isEmpty ? (
        <SaunaCanvasEmpty onInsert={onInsert} />
      ) : (
      <div className="flex flex-1 justify-center max-md:p-[15px] md:p-[30px]">
        <SaunaCanvasFrame
          width={active.width}
          title="Canvas"
          theme={siteTheme}
          customColors={customColors}
          // SDL-298: selection lives inside the frame, next to the content it
          // marks. Passing it as an overlay rather than appending it to
          // `render(schema)` keeps the host's render function about the
          // author's document — editor chrome is the shell's business.
          overlay={(doc) => <SaunaCanvasSelection doc={doc} store={store} nodeMenu={nodeMenu} />}
        >
          {render(schema, { screen, audience: canvasAudience })}
        </SaunaCanvasFrame>
      </div>
      )}
    </div>
  );
}

/**
 * The canvas of a document with nothing in it (SDL-375), per the board's
 * «Empty states» card and FinalEmptyPage: a dashed card on the workspace,
 * a circled plus, what the state IS, what to do about it, and the dark
 * button that does it.
 *
 * It REPLACES the device frame instead of floating over it. An empty
 * viewport has no content to size itself against and no node for the
 * selection overlay to mark, so keeping it mounted would only put an
 * empty white rectangle behind the card. The frame comes back with the
 * first block — which is also the first moment it has anything to show.
 */
function SaunaCanvasEmpty({ onInsert }: { onInsert?: () => void }): ReactNode {
  return (
    <div
      // Kit scale steps, not the frame wrapper's 15/30px: the card is
      // centred and capped, so this padding only keeps it off the edge —
      // it does not have to line up with the device frame's gutter, and
      // copying those two arbitrary values would spend the EP-32 budget
      // on a coincidence.
      className="flex flex-1 items-center justify-center p-4 md:p-8"
      data-sauna-canvas-empty=""
    >
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-background/60 px-6 py-10 text-center">
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
        >
          <Plus className="size-5" strokeWidth={1.8} />
        </span>
        <div className="space-y-1">
          <Text weight="semibold">The page is empty</Text>
          <Text size="sm" variant="muted">
            Add the first block from the catalog
          </Text>
        </div>
        {onInsert ? (
          <Button size="sm" onClick={onInsert} data-sauna-canvas-empty-insert="">
            <Plus aria-hidden />
            Insert
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Device switcher above the canvas. A toggle group rather than a select: three
 * options that are switched between constantly want one click, not two, and
 * the current one has to be readable without opening anything.
 */
function CanvasToolbar({
  device,
  onDeviceChange,
  devices = true,
  preview = false,
  onExitPreview,
}: {
  device: SaunaCanvasDeviceId;
  onDeviceChange: (device: SaunaCanvasDeviceId) => void;
  /** Draw the device switcher and the readout. */
  devices?: boolean;
  preview?: boolean;
  onExitPreview?: () => void;
}): ReactNode {
  return (
    <div
      className="flex shrink-0 items-center justify-start gap-2 border-b border-border bg-background px-3 py-1.5"
      data-sauna-canvas-toolbar
    >
      {devices ? (
      <>
      <ToggleGroup
        type="single"
        value={device}
        // Radix clears the value when the pressed item is pressed again; the
        // canvas always has a device, so an empty payload keeps the current
        // one instead of leaving the frame width undefined.
        onValueChange={(next: string) => {
          if (next) onDeviceChange(next as SaunaCanvasDeviceId);
        }}
        size="sm"
        variant="outline" /* kit-compat: "segmented" is not in 0.2.0-alpha.2 */
        aria-label="Canvas device"
      >
        {SAUNA_CANVAS_DEVICES.map((d) => {
          const Glyph = d.icon;
          return (
            <ToggleGroup.Item
              key={d.id}
              value={d.id}
              aria-label={`${d.label} — ${d.width}px`}
              data-sauna-canvas-device={d.id}
            >
              {/* The board names the devices in words — Desktop / Tablet /
                  Mobile — and moves the number out to the readout below
                  (SDL-375). The glyph stays: it is what keeps the chips
                  readable when the strip narrows and the words go
                  `sr-only`, which is the case the icons were added for. */}
              <Glyph aria-hidden />
              <span className="max-md:sr-only">{d.label}</span>
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup>
      {/* The viewport readout the board puts next to the track: the width
          the frame is actually given, and `auto` for the height it is not.
          Mono, because the number changes under the eye when devices are
          switched and a proportional font makes it jump. */}
      <span
        className="font-mono text-xs text-muted-foreground tabular-nums"
        data-sauna-canvas-readout=""
      >
        {saunaCanvasDevice(device).width} × auto
      </span>
      </>
      ) : null}
      {/* The canvas looks the same in preview as out of it — same blocks,
          same widths — so the only thing that can tell the author why a click
          no longer selects anything is this strip. */}
      {preview ? (
        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant="secondary"
            data-sauna-canvas-preview=""
            data-testid="canvas-preview-badge"
          >
            Preview
          </Badge>
          {onExitPreview ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={onExitPreview}
              data-sauna-canvas-preview-exit=""
              data-testid="canvas-preview-exit"
            >
              <X aria-hidden />
              Exit
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Properties placeholder (replaced by PR 4)                          */
/* ------------------------------------------------------------------ */

function PropertiesPlaceholder({
  store,
  bare,
}: StoreProp & {
  /**
   * Body only, no PanelColumnHeader/Body chrome — the sections column
   * (SDL-285) already wraps the placeholder in its Properties section.
   */
  bare?: boolean;
}): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  const node = selectedId ? schema.nodes[selectedId] : null;

  const body = node ? (
    <pre className="whitespace-pre-wrap break-all rounded-sm bg-muted p-2 text-xs">
      {JSON.stringify({ id: selectedId, ...node }, null, 2)}
    </pre>
  ) : (
    <Text size="sm" variant="muted">
      Select a node from the outline to see its props. Pass `blocks` to
      get the Zod-driven auto-form instead of this dump.
    </Text>
  );

  if (bare) return body;

  return (
    <>
      <PanelColumnHeader title="Properties" />
      <PanelColumnBody className="p-3">{body}</PanelColumnBody>
    </>
  );
}

/**
 * What the Properties column says in preview.
 *
 * An empty column would read as a broken panel — the same complaint the
 * preview badge on the canvas answers. It says the mode is on and where the
 * way out is, and it carries a testid because "the form is gone" is the
 * behaviour under guard, not the wording.
 */
function PropertiesPreviewNotice({ bare }: { bare?: boolean }): ReactNode {
  const body = (
    <Text size="sm" variant="muted" data-testid="properties-preview-notice">
      Preview is on — this is the page as a visitor gets it, so nothing here
      can be edited. Leave preview to change the page.
    </Text>
  );
  if (bare) return body;
  return (
    <>
      <PanelColumnHeader title="Properties" />
      <PanelColumnBody className="p-3">{body}</PanelColumnBody>
    </>
  );
}


/* ------------------------------------------------------------------ */
/* Insert component modal (SDL-201 → SDL-631, icon panel)             */
/* ------------------------------------------------------------------ */

/**
 * One tile of the catalogue — the SDL-594 canvas's `CatalogTile`.
 *
 * The kit's `Button` with its box unclenched (`h-auto`, a column, wrapping),
 * not a hand-built `div`: a card is now an icon, a name and a sentence, none
 * of them interactive, so the tile can be a real `<button>` and keyboard and
 * screen reader come for free. The glyph sits in a box of its own — that is
 * what keeps the orphan-icon guard (`canvas-layout-guards.ts`) from reading
 * an icon above its caption as a defect.
 *
 * A click SELECTS the tile (`aria-pressed`, the canvas's «picked» look) and
 * the footer's button or Enter inserts it — the SDL-594 canvas, which the
 * owner approved on 23 Sep 2026 over SDL-201's click-to-insert (SDL-631).
 * A double click inserts straight away, as a shortcut the canvas does not
 * contradict.
 */
function InsertCatalogTile({
  entry,
  active,
  activeRef,
  onPick,
  onInsert,
}: {
  entry: SaunaInsertEntry;
  active: boolean;
  activeRef?: RefObject<HTMLButtonElement | null>;
  onPick: () => void;
  onInsert: () => void;
}): ReactNode {
  const Glyph = entry.icon;
  return (
    <Button
      ref={active ? activeRef : undefined}
      type="button"
      variant={active ? "secondary" : "outline"}
      aria-pressed={active}
      aria-disabled={!entry.allowed}
      tabIndex={-1}
      onClick={entry.allowed ? onPick : undefined}
      onDoubleClick={entry.allowed ? onInsert : undefined}
      title={entry.allowed ? undefined : `${entry.title} — ${entry.reason ?? ""}`}
      data-sauna-insert-card={entry.key}
      data-group={entry.groupId}
      data-adapter={entry.source}
      data-compound={entry.compound ? "true" : "false"}
      {...(active ? { "data-sauna-insert-active": "" } : {})}
      {...(entry.allowed ? {} : { "data-sauna-insert-blocked": "" })}
      className={cn(
        "h-auto w-full flex-col items-start justify-start gap-2 whitespace-normal p-3 text-left",
        !entry.allowed && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted"
        data-sauna-insert-icon=""
      >
        <Glyph size={18} aria-hidden="true" />
      </span>
      <span className="flex w-full flex-row flex-wrap items-center gap-2">
        <Text as="span" size="sm" weight="medium" data-sauna-insert-name="">
          {entry.title}
        </Text>
        {entry.compound ? (
          <Badge variant="secondary">{entry.compound.nodes} nodes</Badge>
        ) : null}
      </span>
      {/* The description is what the card is FOR; when the block cannot
          land here the reason takes its place — the author needs the
          "why not" more than the "what". */}
      <Text
        as="span"
        size="xs"
        variant="muted"
        className="w-full"
        data-sauna-insert-note=""
      >
        {entry.allowed ? entry.description : (entry.reason ?? entry.description)}
      </Text>
    </Button>
  );
}

/**
 * "Insert component" — the icon panel of the SDL-594 canvas
 * (`/design-system/studio/insert`), which is this dialog's acceptance
 * reference (SDL-631, owner's decision of 23 Sep 2026). What it draws, in the
 * canvas's order: the heading with the insertion address under it, the row
 * of sources, the search with its counter, the group chips, a source-failure
 * alert, the list of groups with icon tiles, and the footer with the keyboard
 * hint and the action that names what Enter would insert.
 *
 * The live showcase card (`insert-preview.tsx`, SDL-339) is deleted:
 * it mounted every kit component standalone, nine in ten came out as an
 * empty box with a name, and the rest flooded the console. A tile cannot be
 * empty any more — icon, name and sentence are guaranteed by
 * `insert-catalog.ts`.
 *
 * Groups are ADAPTER data: the kit's `meta.category` (SDL-629) in the order
 * the adapter hands the blocks over; the author's own components are the
 * last group, «Your components», as on the canvas — no tabs.
 *
 * Kept from before, because the canvas does not contradict them:
 *   - what cannot go into the target is hidden behind «N hidden — show»
 *     (SDL-370) and shown dimmed WITH the reason when expanded;
 *   - ↑↓ walk the allowed tiles; nothing is selected on open, a click
 *     selects, Enter or the footer's button inserts (the canvas, SDL-631 —
 *     SDL-201's click-to-insert is retired); a double click inserts;
 *   - the host overrides (`title`, `kitFilter`, `submitLabel`, `onPick`,
 *     SDL-368).
 */
export function InsertComponentModal({
  store,
  blocks,
  open,
  initialParentId,
  library,
  title,
  kitFilter,
  submitLabel,
  onPick,
  onOpenChange,
}: StoreProp & {
  blocks: readonly BlockDefinition[];
  open: boolean;
  /**
   * Pre-picked parent (SDL-301, the per-row "+"). Takes precedence over
   * the selection-based target; null/absent keeps the SDL-201 behaviour —
   * insert into the selected node, or the root when nothing is selected.
   */
  initialParentId?: SaunaNodeId | null;
  /**
   * The host's renderer. Unused since SDL-631 — the tiles are icons, not
   * live previews — and kept optional so hosts that still pass it compile.
   */
  renderPreview?: (schema: SaunaSchema) => ReactNode;
  /** The author's own components (SDL-340). Absent → no «Your components» source. */
  library?: SaunaComponentLibraryApi;
  /**
   * Overrides the address title (SDL-368). The default sentence describes
   * an `addChild` append into the target node; a host that inserts
   * somewhere else must say where itself.
   */
  title?: string;
  /**
   * Narrows the kit's catalogue (SDL-368: sections only). The nesting
   * rule still runs on the full `blocks` list — a filter is about what the
   * dialog offers, never about what the schema allows.
   */
  kitFilter?: (block: BlockDefinition) => boolean;
  /** Overrides the footer's action label («Заменить на …», SDL-368). */
  submitLabel?: (activeName: string | undefined) => string;
  /**
   * Intercepts the pick: called INSTEAD of the default `addChild` op, with
   * the modal still closing itself.
   */
  onPick?: (pick: SaunaInsertPick) => void;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  // Elements | Components (EP-187, layer 5, canvas flow 3): the kit's
  // catalogue and the workspace's own Components are two tabs again. Without
  // a library there is one source and no tabs.
  const [tab, setTab] = useState<"elements" | "components">("elements");
  // What cannot go into this target is HIDDEN by default (owner, 23 Aug
  // 2026, SDL-370); the dimmed tiles with their reasons are one click away.
  const [showBlocked, setShowBlocked] = useState(false);
  // The selected tile. Nothing on open — the canvas opens with «Insert block»
  // disabled (SDL-631); a click or an arrow selects.
  const [pickedKey, setPickedKey] = useState<{ source: SaunaInsertSource; key: string } | null>(null);
  const activeCardRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Scrolling follows the ARROWS, not the cursor's existence: on open the
  // first tile is already on screen, and a scroll would only push its group
  // heading out of the frame.
  const followActive = useRef(false);

  const targetId =
    initialParentId && schema.nodes[initialParentId]
      ? initialParentId
      : selectedId && schema.nodes[selectedId]
        ? selectedId
        : schema.rootId;
  const targetNode = schema.nodes[targetId];
  const targetType = targetNode?.type ?? "";
  // The rule runs on `targetType`; the sentence names the node the way the
  // outline does (SDL-302).
  const targetName = saunaNodeDisplayName(targetNode);
  // `addChild` appends, so the fresh node follows the target's last child.
  const lastChildId = targetNode?.children?.[targetNode.children.length - 1];
  const after = lastChildId
    ? saunaNodeDisplayName(schema.nodes[lastChildId])
    : undefined;

  // Never offered (SDL-633): a block marked `insertable: false` (kept only
  // for stored nodes), and a compound PART wherever the target refuses it —
  // not even behind "show hidden", because a part outside its root throws.
  const catalogue = useMemo(
    () =>
      blocks.filter(
        (b) =>
          b.meta?.insertable !== false &&
          !(b.meta?.partOf && !canParentType(blocks, targetType, b.type)) &&
          (!kitFilter || kitFilter(b))
      ),
    [blocks, kitFilter, targetType]
  );

  // Why a tile is refused — per tile, because the two halves of the rule
  // read differently (SDL-352). Same order as `canAddChild`.
  const targetAllowedChildren = useMemo(
    () => blocks.find((b) => b.type === targetType)?.meta?.allowedChildren ?? [],
    [blocks, targetType]
  );
  const blockedReasonFor = useCallback(
    (childType: string): string =>
      parentRuleVerdict(blocks, targetType, childType) === "parent-refuses-child"
        ? saunaParentAcceptsOnly(targetType, targetAllowedChildren)
        : saunaInsertBlockedReason(targetType),
    [blocks, targetType, targetAllowedChildren]
  );

  /* ---- «Свои компоненты» (SDL-340) as a source ------------------- */

  // Read on OPEN, not on mount: the author saves components from this very
  // editor (SDL-341). `attempt` re-runs the read from the failure alert.
  const [attempt, setAttempt] = useState(0);
  const [own, setOwn] = useState<{
    status: "idle" | "loading" | "ready" | "failed";
    items: readonly SaunaComponentSummary[];
    cyclic: ReadonlySet<string>;
    /** Too deep to insert (SDL-723); absent = none. */
    tooDeep?: ReadonlySet<string>;
  }>({ status: "idle", items: [], cyclic: new Set() });
  // Loaded builds, for the tile's «N nodes» and the footer's chain.
  const [ownSchemas, setOwnSchemas] = useState<Record<string, SaunaSchema>>({});

  useEffect(() => {
    if (!open || !library) return;
    let cancelled = false;
    setOwn({ status: "loading", items: [], cyclic: new Set() });
    setOwnSchemas({});
    void (async () => {
      let items: readonly SaunaComponentSummary[];
      try {
        items = await library.list();
      } catch {
        if (!cancelled) setOwn({ status: "failed", items: [], cyclic: new Set() });
        return;
      }
      const load = saunaCachingBlockLoader(library.load);
      const cyclic = await saunaCyclicComponentIds({
        hostBlockId: library.hostBlockId,
        ids: items.map((i) => i.id),
        load,
      });
      const tooDeep = await saunaTooDeepComponentIds({
        hostBlockId: library.hostBlockId,
        schema: store.getState().schema,
        ids: items.map((i) => i.id),
        load,
      });
      if (cancelled) return;
      setOwn({ status: "ready", items, cyclic, tooDeep });
      for (const item of items) {
        void load(item.id)
          .then((blockSchema) => {
            if (cancelled || !blockSchema) return;
            setOwnSchemas((prev) => ({ ...prev, [item.id]: blockSchema }));
          })
          .catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, library, attempt]);

  // A component lands as a `Ref` node, and the store checks the nesting
  // rule on it like on any other type (SDL-634).
  const refAllowed = canParentType(blocks, targetType, SAUNA_REF_TYPE);
  const hostBlockId = library?.hostBlockId ?? null;
  const hostName = hostBlockId
    ? (own.items.find((i) => i.id === hostBlockId)?.name ?? hostBlockId)
    : "";

  // Every source's entries as ONE list — the canvas's catalogue.
  const allEntries = useMemo<SaunaInsertEntry[]>(() => {
    const kit = catalogue.map((b): SaunaInsertEntry => {
      const groupTitle = b.meta?.category?.trim() || "Other";
      const allowed = canParentType(blocks, targetType, b.type);
      const hints = saunaBlockInsertHints(b);
      return {
        key: b.type,
        title: b.displayName ?? b.type,
        description: saunaInsertDescription(b),
        groupId: saunaInsertGroupId(groupTitle),
        groupTitle,
        ...(hints?.groupOrder === undefined ? {} : { groupOrder: hints.groupOrder }),
        source: "kit",
        icon: saunaInsertIcon(b),
        keywords: [b.type, ...(hints?.keywords ?? [])],
        allowed,
        ...(allowed ? {} : { reason: blockedReasonFor(b.type) }),
      };
    });
    const mine = own.items.map((item): SaunaInsertEntry => {
      const cyclic = own.cyclic.has(item.id);
      const tooDeep = own.tooDeep?.has(item.id) ?? false;
      const allowed = refAllowed && !cyclic && !tooDeep;
      const built = ownSchemas[item.id];
      // Components are grouped by their own group when they have one; the
      // service does not store one yet, so today they share one group.
      const group = item.group?.trim();
      return {
        key: item.id,
        title: item.name,
        description: SAUNA_INSERT_OWN_DESCRIPTION,
        groupId: group ? `${SAUNA_INSERT_OWN_GROUP_ID}-${saunaInsertGroupId(group)}` : SAUNA_INSERT_OWN_GROUP_ID,
        groupTitle: group || SAUNA_INSERT_OWN_GROUP_TITLE,
        // Last, after every kit group — the canvas's order 50.
        groupOrder: Number.POSITIVE_INFINITY,
        source: "own",
        icon: SAUNA_OWN_COMPONENT_ICON,
        keywords: [item.id],
        allowed,
        ...(allowed
          ? {}
          : {
              reason: cyclic
                ? saunaComponentCycleReason({ componentName: item.name, hostName })
                : tooDeep
                  ? saunaComponentDepthReason({ componentName: item.name, limit: SAUNA_COMPONENT_MAX_DEPTH })
                  : blockedReasonFor(SAUNA_REF_TYPE),
            }),
        ...(built ? { compound: saunaCompoundOf(built) } : {}),
      };
    });
    return [...kit, ...mine];
  }, [catalogue, blocks, targetType, blockedReasonFor, own, ownSchemas, refAllowed, hostName]);
  const tabbed = !!library;
  const entries = useMemo(
    () => (tabbed ? allEntries.filter((e) => (tab === "components") === (e.source === "own")) : allEntries),
    [allEntries, tab, tabbed]
  );

  const q = query.trim();
  const view = useMemo(
    () =>
      saunaBuildInsertCatalog({
        entries,
        query: q,
        groupId: groupFilter,
        includeBlocked: showBlocked,
      }),
    [entries, q, groupFilter, showBlocked]
  );
  // Refused entries under the current search and group — the hidden counter.
  const hiddenCount = useMemo(() => {
    if (showBlocked) return 0;
    const all = saunaBuildInsertCatalog({
      entries,
      query: q,
      groupId: groupFilter,
      includeBlocked: true,
    });
    return all.shown - view.shown;
  }, [entries, q, groupFilter, showBlocked, view.shown]);

  const drawn = useMemo(() => view.sections.flatMap((s) => s.entries), [view]);
  const activeList = useMemo(() => drawn.filter((e) => e.allowed), [drawn]);
  // A selection the search or a chip filtered out is no selection: the
  // footer must never name a tile that is not on screen.
  const active = pickedKey
    ? activeList.find((e) => e.key === pickedKey.key && e.source === pickedKey.source)
    : undefined;
  const pick = (entry: SaunaInsertEntry) =>
    setPickedKey({ source: entry.source, key: entry.key });

  const catalogEmpty = allEntries.length === 0 && own.status !== "loading";
  const ownFailed = !!library && own.status === "failed" && tab === "components";
  // The library answered with nothing: its group stays on screen with the
  // way to fill it (SDL-340's pointer), instead of silently disappearing.
  const ownEmpty =
    !!library && tab === "components" && own.status === "ready" && own.items.length === 0 && !catalogEmpty;
  const chipGroups = ownEmpty
    ? [...view.groups, { id: SAUNA_INSERT_OWN_GROUP_ID, title: SAUNA_INSERT_OWN_GROUP_TITLE, source: "own" as const }]
    : view.groups;
  const showOwnEmpty =
    ownEmpty && !q && (groupFilter === null || groupFilter === SAUNA_INSERT_OWN_GROUP_ID);

  // Opening the modal a second time must not resume the previous session's
  // cursor, search or filters — the address may be a different node entirely.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setGroupFilter(null);
    setPickedKey(null);
    setShowBlocked(false);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [open, targetId]);

  useEffect(() => {
    if (!followActive.current) return;
    followActive.current = false;
    // Focus follows the arrow selection, so the focus ring and Enter's
    // target are the same tile.
    activeCardRef.current?.focus({ preventScroll: true });
    activeCardRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [active?.key]);

  const commit = (entry: SaunaInsertEntry | undefined) => {
    if (!entry || !entry.allowed) return;
    if (entry.source === "own") {
      const item = own.items.find((i) => i.id === entry.key);
      if (!item || own.cyclic.has(item.id) || own.tooDeep?.has(item.id) || !refAllowed) return;
      if (onPick) {
        onPick({ kind: "own", item });
      } else {
        // A REFERENCE, not a copy (SDL-338): one `Ref` node with the block id.
        store.getState().applyOp({
          kind: "addChild",
          parentId: targetId,
          child: { type: SAUNA_REF_TYPE, props: { [SAUNA_REF_BLOCK_ID_PROP]: item.id } },
        });
      }
    } else {
      const block = catalogue.find((b) => b.type === entry.key);
      if (!block || !canParentType(blocks, targetType, block.type)) return;
      if (onPick) {
        onPick({ kind: "kit", block });
      } else {
        store.getState().applyOp({
          kind: "addChild",
          parentId: targetId,
          // One node with ALL of its settings (SDL-633: a compound Element is
          // one node), a copy so two inserts never share one props object.
          // The props are the Element's initialProps, so they follow ITS
          // contract: the version travels with them (SDL-667) — into any
          // store, including a host's that was built without a lookup.
          child: {
            type: block.type,
            props: structuredClone(block.meta?.initialProps ?? {}),
            propsVersion: blockPropsVersion(block),
          },
        });
      }
    }
    setQuery("");
    onOpenChange(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (activeList.length === 0) return;
    // The panel's keys belong to the search field and the tiles only. On a
    // chip, «N hidden — show», «Try again» or the close button, Enter is that
    // button's own; an IME composition's Enter confirms the composition.
    if (event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    const fromPanel =
      target.hasAttribute?.("data-sauna-insert-search") ||
      target.hasAttribute?.("data-sauna-insert-card");
    if (!fromPanel) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      followActive.current = true;
      const at = active ? activeList.indexOf(active) : -1;
      const next =
        at < 0
          ? step > 0
            ? 0
            : activeList.length - 1
          : (at + step + activeList.length) % activeList.length;
      pick(activeList[next]!);
      return;
    }
    // Enter inserts the selected tile (the canvas's footer promise).
    if (event.key === "Enter" && active) {
      event.preventDefault();
      commit(active);
    }
  };

  const sources: { id: SaunaInsertSource; title: string; failed: boolean }[] = [
    { id: "kit", title: SAUNA_INSERT_SOURCE_KIT, failed: false },
    ...(library
      ? [{ id: "own" as const, title: SAUNA_INSERT_OWN_GROUP_TITLE, failed: ownFailed }]
      : []),
  ];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <Dialog.Content
        data-sauna-insert-modal=""
        // Width by class, as the canvas does: the kit's `maxWidth` writes an
        // inline style that also beats `max-sm:max-w-[calc(100%-2rem)]` and
        // eats the side margins on a phone.
        className="max-sm:gap-3 max-sm:p-4 sm:max-w-[60rem]"
        onKeyDown={onKeyDown}
        // Radix would focus the first tabbable node; the author lands in the
        // search field instead.
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <Dialog.Header className="pr-8 max-sm:text-left">
          <Dialog.Title data-sauna-insert-title="">
            {title ?? SAUNA_INSERT_HEADING}
          </Dialog.Title>
          {title ? null : (
            <Dialog.Description data-sauna-insert-address="">
              {saunaInsertAddress({ targetName, targetType, after })}
            </Dialog.Description>
          )}
        </Dialog.Header>

        {/* Sources. The catalogue is built from them, and «why is my block
            not here» is a question about a source, not about the search. */}
        <div className="flex flex-row flex-wrap items-center gap-2" data-sauna-insert-sources="">
          <Text as="span" size="xs" variant="muted">
            {SAUNA_INSERT_SOURCES_LABEL}
          </Text>
          {sources.map((source) => (
            <Badge
              key={source.id}
              variant={source.failed ? "destructive" : "secondary"}
              data-sauna-insert-source={source.id}
            >
              {source.title}
            </Badge>
          ))}
        </div>

        {tabbed ? (
          <div role="tablist" aria-label="Insert source" className="flex flex-row gap-1 border-b border-border" data-sauna-insert-tabs="">
            {(
              [
                ["elements", "Elements"],
                ["components", "Components"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-sauna-insert-tab={id}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setTab(id);
                  setGroupFilter(null);
                  setPickedKey(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-row flex-wrap items-center gap-3">
          {/* kit-compat: 0.2.0-alpha.2's SearchField takes no `inputRef`;
              the wrapper resolves the input for focus. */}
          <div
            // The canvas's field is 360px wide (`maxWidth={360}`); a bare
            // wrapper would shrink it to its placeholder.
            className="w-full min-w-0 max-w-[22.5rem]"
            data-sauna-insert-search-wrap=""
            ref={(el) => {
              searchRef.current = el?.querySelector("input") ?? null;
              searchRef.current?.setAttribute("data-sauna-insert-search", "");
            }}
          >
            <FormControl.SearchField
              value={query}
              onChange={setQuery}
              placeholder={SAUNA_INSERT_SEARCH_PLACEHOLDER}
              ariaLabel={SAUNA_INSERT_SEARCH_PLACEHOLDER}
              maxWidth={360}
            />
          </div>
          {/* Silent on an empty query: a count without a search is a fact
              about the catalogue, not about a search. */}
          {q ? (
            <Text
              as="span"
              size="xs"
              variant="muted"
              className="tabular-nums"
              data-sauna-insert-count=""
            >
              {saunaMatchesPhrase(view.shown)}
            </Text>
          ) : null}
          {hiddenCount > 0 || showBlocked ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-sauna-insert-hidden-toggle=""
              {...(showBlocked ? { "data-sauna-insert-hidden-open": "" } : {})}
              onClick={() => setShowBlocked((prev) => !prev)}
            >
              {showBlocked ? SAUNA_INSERT_HIDE_BLOCKED : saunaHiddenPhrase(hiddenCount)}
            </Button>
          ) : null}
        </div>

        {/* Group chips — groups are the adapter's data, so they filter. */}
        {catalogEmpty ? null : (
          <div className="flex flex-row flex-wrap items-center gap-2" data-sauna-insert-groups="">
            <Button
              type="button"
              size="sm"
              variant={groupFilter === null ? "secondary" : "ghost"}
              aria-pressed={groupFilter === null}
              onClick={() => setGroupFilter(null)}
              data-sauna-insert-group-chip="all"
            >
              {SAUNA_INSERT_GROUP_ALL}
            </Button>
            {chipGroups.map((group) => (
              <Button
                key={group.id}
                type="button"
                size="sm"
                variant={groupFilter === group.id ? "secondary" : "ghost"}
                aria-pressed={groupFilter === group.id}
                onClick={() => setGroupFilter(group.id)}
                data-sauna-insert-group-chip={group.id}
              >
                {group.title}
              </Button>
            ))}
          </div>
        )}

        {/* A source that did not answer: an alert over a live catalogue. */}
        {ownFailed ? (
          <Alert variant="destructive" role="alert" data-sauna-insert-own-error="">
            <div className="flex flex-row flex-wrap items-center gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center">
                <AlertTriangle size={16} aria-hidden="true" />
              </span>
              <Text as="span" size="sm" className="min-w-[12rem] flex-1">
                {saunaInsertSourceFailed(SAUNA_INSERT_OWN_GROUP_TITLE)}
              </Text>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                data-sauna-insert-retry=""
                onClick={() => setAttempt((n) => n + 1)}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {SAUNA_INSERT_RETRY}
              </Button>
            </div>
          </Alert>
        ) : null}

        <div
          ref={listRef}
          data-sauna-insert-list=""
          role="group"
          aria-label="Components"
          className="flex max-h-[34vh] flex-col gap-4 overflow-y-auto sm:max-h-[52vh]"
        >
          {catalogEmpty ? (
            // Empty catalogue ≠ «nothing found»: there is nowhere to search,
            // so the text names the two ways to fill it.
            <EmptyState paddingY={10} data-sauna-insert-catalog-empty="">
              <div className="flex flex-col items-center gap-4 text-center">
                <span className="flex size-10 items-center justify-center">
                  <PackageOpen size={32} aria-hidden="true" className="opacity-40" />
                </span>
                <div className="flex flex-col items-center gap-1">
                  <Text as="h2" size="lg" weight="semibold">
                    {SAUNA_INSERT_EMPTY_TITLE}
                  </Text>
                  <Text size="sm" variant="muted">
                    {SAUNA_INSERT_EMPTY_BODY}
                  </Text>
                </div>
              </div>
            </EmptyState>
          ) : view.sections.length === 0 && !showOwnEmpty ? (
            <div
              className="flex flex-col items-center gap-2 py-10 text-center"
              data-sauna-insert-empty=""
            >
              <Text size="sm" variant="muted">
                {hiddenCount > 0
                  ? SAUNA_INSERT_ALL_FILTERED
                  : q
                    ? saunaInsertNoMatches(q, view.total)
                    : groupFilter !== null
                      ? SAUNA_INSERT_GROUP_EMPTY
                      : SAUNA_INSERT_LOADING}
              </Text>
            </div>
          ) : (
            view.sections.map((section) => (
              <div
                key={section.group.id}
                className="flex flex-col gap-2"
                data-sauna-insert-group={section.group.id}
                data-adapter={section.group.source}
              >
                <div className="flex flex-row flex-wrap items-center gap-2">
                  <Text as="span" size="xs" weight="medium" className="uppercase tracking-wide">
                    {section.group.title}
                  </Text>
                  <Badge variant="secondary">
                    {section.group.source === "own"
                      ? SAUNA_INSERT_OWN_GROUP_TITLE
                      : SAUNA_INSERT_SOURCE_KIT}
                  </Badge>
                  <Text as="span" size="xs" variant="muted">
                    {section.entries.length}
                  </Text>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.entries.map((entry) => (
                    <InsertCatalogTile
                      key={`${entry.source}:${entry.key}`}
                      entry={entry}
                      active={
                        entry.allowed &&
                        active?.key === entry.key &&
                        active.source === entry.source
                      }
                      activeRef={activeCardRef}
                      onPick={() => pick(entry)}
                      onInsert={() => commit(entry)}
                    />
                  ))}
                </div>
              </div>
            )).concat(
              showOwnEmpty ? (
                <div
                  key={SAUNA_INSERT_OWN_GROUP_ID}
                  className="flex flex-col gap-2"
                  data-sauna-insert-group={SAUNA_INSERT_OWN_GROUP_ID}
                  data-adapter="own"
                  data-sauna-insert-own-empty=""
                >
                  <div className="flex flex-row flex-wrap items-center gap-2">
                    <Text as="span" size="xs" weight="medium" className="uppercase tracking-wide">
                      {SAUNA_INSERT_OWN_GROUP_TITLE}
                    </Text>
                    <Badge variant="secondary">{SAUNA_INSERT_OWN_GROUP_TITLE}</Badge>
                    <Text as="span" size="xs" variant="muted">
                      0
                    </Text>
                  </div>
                  <Text size="sm" variant="muted">
                    {SAUNA_INSERT_OWN_EMPTY}
                  </Text>
                  {library?.libraryHref ? (
                    <Link href={library.libraryHref} className="self-start">
                      {SAUNA_INSERT_OWN_EMPTY_LINK}
                    </Link>
                  ) : null}
                </div>
              ) : []
            )
          )}
        </div>

        {/* What exactly goes in, for a build: «as a whole» is a promise, and
            only the enumeration checks it. */}
        {active?.compound ? (
          <Text as="div" size="xs" variant="muted" data-sauna-insert-compound-note="">
            {saunaInsertCompoundNote(active.title, active.compound.chain)}
          </Text>
        ) : null}

        <Dialog.Footer className="sm:items-center sm:justify-between">
          <Text as="span" size="xs" variant="muted" data-sauna-insert-hint="">
            {SAUNA_INSERT_KEY_HINT}
          </Text>
          <Button
            type="button"
            disabled={!active}
            data-sauna-insert-submit=""
            onClick={() => commit(active)}
            // The label carries the block's name — on a phone it wraps
            // instead of pushing past the edge (the kit's Button is nowrap).
            className="h-auto whitespace-normal"
          >
            {submitLabel
              ? submitLabel(active?.title)
              : saunaInsertActionLabel(active?.title, !!active?.compound)}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
