"use client";

// Auto-form for the Studio's properties pane.
//
// Two sources of a form spec, in this order:
//
//   1. `BlockDefinition.staticProps` — the host's own zod schema. Rendered
//      flat, exactly as before: zod has nowhere to put a group or a caption.
//   2. The kit's props manifest (SDL-290/291/292) — descriptors that already
//      carry group, order, caption, default and enum literals. Rendered as
//      captioned groups in the canonical order (SDL-293).
//
// Blocks win over the manifest on purpose. The Studio's registry is still
// the six local primitives in `src/lib/primitives.tsx`, whose names collide
// with kit components of the same name but different props (the local
// `Button` takes `label`/`href`, the kit's takes `children`/`size`). Letting
// the manifest describe a node the local primitive renders would draw a form
// for a component that is not on the canvas. SDL-295 swaps the registry for
// the kit catalog, and the collision becomes an identity.
//
// Edits flow back to the store via `updateNodePropsPartial`.
//
// Editor selection priority (high → low):
//   1. `editors[name]`             — per-instance override
//   2. `getPropEditor(name)`        — global registration
//   3. built-in editor for the kind — string/number/boolean/enum
//   4. read-only JSON dump          — fallback
//
// `name` is read from the Zod schema's `description` (via `.describe("…")`)
// when present; otherwise the field key. This is a deliberate, low-cost
// hook for tagging a field as "this is a colour" without changing the
// auto-form internals.

import { useStore } from "zustand";
import { useEffect, useState, type ReactNode } from "react";
import type { ZodTypeAny } from "zod";

import type { BlockDefinition, SaunaParamSpec } from "@markerloop/engine";
import {
  COMPOUND_ITEM_LIMITS,
  elementPropsVersionMismatch,
  isItemSlottedCompound,
  moveCompoundItem,
  saunaEffectiveVisibilityMode,
  withoutItemsOverrides,
} from "@markerloop/engine";
import { Alert, Code, Tabs, Text } from "@markerloop/ui/ui";
import { PanelColumn, PanelColumnBody, PanelColumnHeader } from "@markerloop/ui/ui/admin";
// Not in the in-repo kit yet (packages/ui is 0.2.0-alpha.2) — see kit-compat/.
import { PanelSection } from "../kit-compat/panel-section";
import { acceptJsonObject, StudioJsonField } from "../panel-parts";
import { withOverrideProps } from "../screen-variants";
import {
  isTargetOverridden,
  studioEditTarget,
  studioFieldProps,
  targetOverrideProps,
  type StudioAudience,
} from "../visibility-modes";
import { propsPatchOp, type StudioStore } from "../store";
import {
  BooleanEditor,
  EnumEditor,
  JsonEditor,
  LinkEditor,
  NumberEditor,
  SegmentedEditor,
  TextEditor,
} from "./builtin-editors";
import {
  isPrimitiveValue,
  type PropDescriptor,
  type PropDescriptorGroup,
  type SaunaPropsManifest,
} from "./descriptors";
import { resolvePropsForm } from "./form-spec";
import { draftToProps, type StudioDataSources } from "./data-view-model";
import { DataViewSettings } from "./data-view-settings";
import { CompoundItemsEditor, readCompoundItems, TableRowsEditor } from "./compound-editors";
import { STYLE_EDITORS, THEME_COLOR_FIELDS, themeColorEditor, type ThemeColorOption } from "./style-editors";
import { SaunaParamFieldAction } from "./param-field";
import { getPropEditor } from "./registry";
import { saunaPropsVersionBody, saunaPropsVersionHeading } from "../props-version-copy";
import { resetOverrideField, ScreenOverrideMark, ScreenVariantSection } from "./screen-variant-section";
import type { PropEditor, PropEditorContext } from "./types";
import { unwrapZod, zodKind } from "./zod-introspect";

export type SaunaPropertiesAutoFormProps = {
  store: StudioStore;
  /**
   * Block catalog. The auto-form looks up the selected node's `type`
   * and uses that block's `staticProps` Zod schema as the form spec.
   * Blocks without a `staticProps` schema, or unknown node types,
   * fall back to a JSON dump.
   */
  blocks: readonly BlockDefinition[];
  /**
   * The kit's props manifest (`sunday-sauna/props-manifest.json`), supplied
   * by the host the same way `blocks` and the renderer registry are. The
   * shell never imports the kit itself — a consumer with its own design
   * system hands over its own manifest, or none at all.
   */
  propsManifest?: SaunaPropsManifest;
  /**
   * Turns on the «Make a parameter» affordance under every field
   * (SDL-503, EP-61) and commits the manifest the author builds with it.
   * `null` clears the manifest.
   *
   * Omitted → no affordance, which is the PAGE editor's state: a parameter
   * is what a block hands outwards, and a page hands nothing to anybody.
   * A prop rather than a document-kind sniff, because the auto-form has no
   * way to know which document it is drawing and no business learning one.
   */
  onParamsChange?: (params: SaunaParamSpec[] | null) => void;
  /**
   * Per-instance editor overrides. Keys are descriptor names —
   * matched against a Zod field's `.describe("…")` text first, then
   * falling back to the field key itself.
   */
  editors?: Record<string, PropEditor>;
  /**
   * The site theme's custom colours (SDL-950): offered as swatches by the
   * colour props that take a theme colour key (Text.color, Box.background).
   */
  themeColors?: readonly ThemeColorOption[];
  /** Disable inputs (e.g. while a save is in flight). */
  disabled?: boolean;
  /**
   * localStorage bucket for the prop groups' open state (SDL-329). Same
   * convention as the sections' memory in the shell: per editor, not per
   * node — collapsing `Advanced` must survive selecting another node.
   * Omitted → groups still fold, they just start open every time.
   */
  groupStateKey?: string;
  /**
   * Body only, no PanelColumn/header/scroll chrome of its own — for the
   * sections column (SDL-285), where the shell already provides the column,
   * the header and the Properties section around the form.
   */
  bare?: boolean;
  /**
   * Draw the Base / Tablet / Phone switch on top of the form (S5). `false`
   * when the host passes the «Variants» section, which holds the switch
   * below Visibility (S6) — one switch, not two. Default true.
   */
  screenSwitch?: boolean;
  /**
   * Whether the Guests / Signed in tabs (editing `member.props`) are offered
   * on a hybrid node. The shell turns them off when the host passes no
   * Visibility section: a host that withholds the mode switch (the admin
   * without `X-Pages-Public-Shell`, SDL-632 S7) must not let the author write
   * a member branch the server would hand to guests.
   */
  memberBranch?: boolean;
  /**
   * The workspace's collections, handed in by the host (SDL-642). With it a
   * `DataView` node gets its settings panel (collection, fields, sort,
   * filter, presets) instead of the generic zod form; without it the node
   * keeps the generic form. The package never fetches them itself.
   */
  dataSources?: StudioDataSources;
};

/** The engine's widget Element whose props the DataView settings panel edits. */
export const DATA_VIEW_NODE_TYPE = "DataView";

export function SaunaPropertiesAutoForm({
  store,
  blocks,
  propsManifest,
  editors,
  themeColors,
  disabled,
  bare,
  groupStateKey,
  onParamsChange,
  screenSwitch = true,
  memberBranch = true,
  dataSources,
}: SaunaPropertiesAutoFormProps): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  // The text being typed into the canvas right now, if any (SDL-378). Read
  // here rather than inside the field: which field it belongs to is a
  // property of the draft, and the panel is where a node's props are
  // assembled.
  const textDraft = useStore(store, (s) => s.textDraft);
  // The width variant being edited (SDL-632). At a width every field shows
  // the override where there is one and the base value otherwise, and every
  // edit lands in `screens[screen].props`.
  const screen = useStore(store, (s) => s.view.screen);
  // Guests / Signed in on a hybrid node (S6): as a member at the base width
  // the form edits `member.props`.
  const audience = useStore(store, (s) => s.view.audience);

  const node = selectedId ? schema.nodes[selectedId] : null;
  if (!node || !selectedId) {
    // Two lines, per the board's FinalNoSelection: what to do, and what the
    // author is missing while nothing is selected (SDL-375). The behaviour
    // itself — Visibility and Variants hidden without a node — has been
    // there since the sections column landed; until now the panel simply
    // never said so, and an empty column reads as a broken one.
    const hint = (
      <div className="space-y-1">
        <Text size="sm" variant="muted">
          Select a layer to edit its props.
        </Text>
        <Text size="sm" variant="muted" data-sauna-no-selection-sections="">
          Visibility and Variants appear once a node is selected.
        </Text>
      </div>
    );
    if (bare) return hint;
    return (
      <PanelColumn className="border-r-0">
        <PanelColumnHeader title="Properties" />
        <PanelColumnBody className="p-3">{hint}</PanelColumnBody>
      </PanelColumn>
    );
  }

  // Props written against another version of the Element's schema (SDL-667):
  // a form built from THIS editor's schema would misread them, and any edit
  // would write a mix of two contracts under the node's old number. A plate
  // instead of the whole form — the width switch included, it edits props
  // too. Same rule the canvas applies (`elementPropsVersionMismatch`).
  const def = blocks.find((b) => b.type === node.type);
  const mismatch = def ? elementPropsVersionMismatch(def, node) : null;
  if (mismatch) {
    const plate = <PropsVersionPlate type={node.type} {...mismatch} />;
    if (bare) return plate;
    return (
      <PanelColumn className="border-r-0">
        <PanelColumnHeader title="Properties" />
        <PanelColumnBody className="p-3">{plate}</PanelColumnBody>
      </PanelColumn>
    );
  }

  const form = resolvePropsForm({ node, blocks, manifest: propsManifest });
  const shape = form.kind === "zod" ? form.shape : null;
  const view = { screen, audience: memberBranch ? audience : ("guest" as const) };
  const target = studioEditTarget(schema, selectedId, view);
  const hybrid = memberBranch && saunaEffectiveVisibilityMode(schema, selectedId) === "hybrid";
  const stored = studioFieldProps(schema, selectedId, view);
  // The board's «обновляется по мере набора»: while an in-place edit is open
  // the field shows the caret's text, not the last committed value. An
  // overlay rather than a write — the schema still changes once, at commit,
  // and closing the session drops the draft and the field falls back to the
  // stored prop with nothing to reconcile.
  const props =
    textDraft && textDraft.nodeId === selectedId
      ? { ...stored, [textDraft.prop]: textDraft.value }
      : stored;

  const onFieldChange = (fieldName: string) => (value: unknown) =>
    store.getState().applyOp(propsPatchOp(target, selectedId, { [fieldName]: value }));

  // «Overridden» + Reset under a field the width variant — or the member
  // branch — overrides. Nothing at the base: there is nothing to inherit from
  // there. This is the ONLY Reset of a field (the Variants strip names how
  // many fields are overridden, it draws no second pair).
  const overrideMark = (fieldName: string): ReactNode =>
    isTargetOverridden(node, target, fieldName) ? (
      <ScreenOverrideMark
        disabled={disabled}
        onReset={() => resetOverrideField(store, selectedId, fieldName)}
      />
    ) : undefined;

  // One factory rather than a prop per row: the manifest and the selected
  // node are the same for every field in the pane, and only the prop key
  // differs. `undefined` when the host did not opt in, and every row below
  // renders nothing extra — the page editor's state.
  const paramAction = onParamsChange
    ? (fieldName: string) => (
        <SaunaParamFieldAction
          params={schema.params ?? []}
          nodeId={selectedId}
          prop={fieldName}
          disabled={disabled}
          onParamsChange={onParamsChange}
        />
      )
    : undefined;

  // A DataView's binding is not a per-width or per-audience look: a source,
  // presets or a filter written into `screens[phone].props` would silently
  // make the feed phone-only (SDL-642 review). The panel reads and writes
  // the BASE props at any width and for any audience.
  const dataViewPanel = !!dataSources && node.type === DATA_VIEW_NODE_TYPE;

  // The compound Elements' list fields (SDL-633) get list editors instead of
  // the raw JSON field. Tabs / accordion items are structural — they are
  // bound to the node's children by position — so, like a DataView binding,
  // they are edited in the BASE props at any width and for any audience, and
  // add / delete / reorder go through the `compoundItems` op that carries the
  // content child along. A per-instance editor the host passed still wins.
  // Style props (SDL-775) get the canvas's controls; the compound list
  // editors below are separate fields, so the two never collide.
  const compoundEditors: Record<string, PropEditor> = { ...STYLE_EDITORS[node.type] };
  if (themeColors && themeColors.length > 0) {
    for (const field of THEME_COLOR_FIELDS[node.type] ?? []) compoundEditors[field] = themeColorEditor(themeColors);
  }
  if (isItemSlottedCompound(node.type)) {
    const nodeId = selectedId;
    const noun = node.type === "TabsView" ? "Tab" : "Item";
    compoundEditors.items = (ctx) => (
      <CompoundItemsEditor
        noun={noun}
        items={readCompoundItems(node.props?.items)}
        max={COMPOUND_ITEM_LIMITS[node.type] ?? 1}
        disabled={ctx.disabled}
        note={
          // True by construction: every item edit (the `compoundItems` op)
          // also drops any `items` stored in a width or member override.
          target.kind !== "base" || withoutItemsOverrides(node) !== node ? (
            <Text size="xs" variant="muted" data-sauna-items-base-note="">
              {noun}s are one list for every width and every visitor; an edit here also clears any per-width or
              signed-in copy of the list.
            </Text>
          ) : undefined
        }
        onEdit={(next) => store.getState().applyOp({ kind: "compoundItems", nodeId, edit: { action: "set", items: next } })}
        onAdd={() =>
          store.getState().applyOp({
            kind: "compoundItems",
            nodeId,
            edit: { action: "add", item: { label: `${noun} ${readCompoundItems(node.props?.items).length + 1}`, text: "" } },
          })
        }
        onRemove={(index) => store.getState().applyOp({ kind: "compoundItems", nodeId, edit: { action: "remove", index } })}
        onMove={(from, to) => store.getState().applyOp({ kind: "compoundItems", nodeId, edit: { action: "move", from, to } })}
        canMove={(from, to) => {
          const moved = moveCompoundItem(schema, nodeId, from, to).nodes[nodeId];
          return JSON.stringify(moved?.props?.items) !== JSON.stringify(node.props?.items);
        }}
      />
    );
  } else if (node.type === "TableView") {
    compoundEditors.rows = TableRowsEditor;
  }
  const fieldEditors = editors ? { ...compoundEditors, ...editors } : compoundEditors;
  const fields = dataSources && dataViewPanel ? (
    // One edit = one operation = one history frame: the panel hands back the
    // whole next props, and every top-level key goes in one patch.
    <div className="flex flex-col gap-2">
      {target.kind !== "base" ? (
        <Text size="xs" variant="muted" data-testid="dv-base-note">
          Data settings are the same at every width and for every visitor.
        </Text>
      ) : null}
      <DataViewSettings
        props={(node.props ?? {}) as Record<string, unknown>}
        sources={dataSources}
        disabled={disabled}
        onChange={(next) =>
          store.getState().applyOp(propsPatchOp({ kind: "base" }, selectedId, draftToProps(next)))
        }
      />
    </div>
  ) : shape ? (
    <div className="flex flex-col gap-3">
      {Object.entries(shape).map(([fieldName, fieldSchema]) => (
        <FieldRow
          key={fieldName}
          fieldName={fieldName}
          fieldSchema={fieldSchema}
          value={props[fieldName]}
          allProps={props}
          disabled={disabled}
          editors={fieldEditors}
          onChange={onFieldChange(fieldName)}
          paramAction={paramAction?.(fieldName)}
          overrideMark={overrideMark(fieldName)}
        />
      ))}
    </div>
  ) : form.kind === "descriptors" ? (
    <DescriptorGroups
      groups={form.groups}
      props={props}
      disabled={disabled}
      editors={fieldEditors}
      onFieldChange={onFieldChange}
      storageKey={groupStateKey}
      paramAction={paramAction}
      overrideMark={overrideMark}
    />
  ) : (
    // No `defineBlock` registered for this component type —
    // expose a single JSON textarea for the whole `props`
    // object so authors aren't blocked while a typed editor
    // is missing. Save fires on blur, schema-aware editors
    // take over once the type is registered.
    <RawJsonProps
      nodeType={node.type}
      // At a width the raw field edits the OVERRIDES only — the one place
      // the form shows the stored difference rather than the layered value,
      // because a whole-object textarea has no per-key «inherited» to show.
      value={target.kind === "base" ? props : (targetOverrideProps(node, target) ?? {})}
      screenLabel={target.kind === "base" ? undefined : target.kind === "member" ? "member" : target.screen}
      disabled={disabled}
      onChange={(next) => {
        // An emptied textarea means "no props", not "drop the key" — the
        // node config always carries an object. At a width it means "no
        // overrides", which drops the width entirely; a blur that changes
        // nothing hands the node back itself and costs no history frame.
        const nextNode =
          target.kind === "base" ? { ...node, props: next ?? {} } : withOverrideProps(node, target, next);
        if (nextNode === node) return;
        store.getState().applyOp({ kind: "updateNodeConfig", nodeId: selectedId, next: nextNode });
      }}
    />
  );

  const body = (
    <div className="flex flex-col gap-3">
      {screenSwitch ? <ScreenVariantSection store={store} node={node} /> : null}
      {hybrid && !dataViewPanel ? (
        <HybridBranchTabs
          audience={audience}
          onChange={(next) => store.getState().setAudience(next)}
          atWidth={screen !== "base"}
        >
          {fields}
        </HybridBranchTabs>
      ) : (
        fields
      )}
    </div>
  );

  if (bare) return body;

  return (
    <PanelColumn className="border-r-0">
      <PanelColumnHeader title="Properties" />
      <PanelColumnBody className="p-3">{body}</PanelColumnBody>
    </PanelColumn>
  );
}

/**
 * The plate the Properties form gives way to when the node's props follow
 * another version of its Element's schema (SDL-667). The attribute carries
 * `<type>@v<node's version>`, the same value the canvas plate carries, so a
 * guard can match the two without reading the wording.
 */
function PropsVersionPlate({
  type,
  nodeVersion,
  knownVersion,
}: {
  type: string;
  nodeVersion: number;
  knownVersion: number;
}): ReactNode {
  return (
    <Alert
      role="status"
      data-testid="properties-props-version"
      data-sauna-props-version-mismatch={`${type}@v${nodeVersion}`}
      className="flex flex-col gap-1"
    >
      <Text size="sm" className="font-medium">
        {saunaPropsVersionHeading(nodeVersion, knownVersion)}
      </Text>
      <Text size="xs" variant="muted">
        {saunaPropsVersionBody(nodeVersion, knownVersion)}
      </Text>
    </Alert>
  );
}

/**
 * Guests / Signed in on a node whose mode in force is hybrid (S6), after the
 * canvas `/design-system/studio/properties?case=hybrid`. The tab picks whose
 * values the fields below show and edit: Guests → the base `props`, Signed
 * in → `member.props` (each field shows member ?? base, with the same
 * «Overridden» + Reset as a width). The canvas renders for the same audience.
 *
 * At a width the tabs are OFF and the fields show guest values: a width
 * override is what guests receive too (pages-service strips `member`, not
 * `screens`), so a field that showed member values there leaked them into
 * `screens` on the first blur. The member branch is edited at Base only.
 */
function HybridBranchTabs({
  audience,
  onChange,
  atWidth,
  children,
}: {
  audience: StudioAudience;
  onChange: (audience: StudioAudience) => void;
  atWidth: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <Tabs
      value={atWidth ? "guest" : audience}
      onValueChange={(next: string) => {
        if (next === "guest" || next === "member") onChange(next);
      }}
      data-sauna-branch-tabs=""
      data-sauna-branch={atWidth ? "guest" : audience}
    >
      <Tabs.List className="w-full">
        <Tabs.Trigger value="guest" className="flex-1" data-sauna-branch-tab="guest">
          Guests
        </Tabs.Trigger>
        <Tabs.Trigger
          value="member"
          className="flex-1"
          data-sauna-branch-tab="member"
          disabled={atWidth}
        >
          Signed in
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value={atWidth ? "guest" : audience} className="flex flex-col gap-3 pt-2">
        {atWidth ? (
          <Text size="xs" variant="muted" data-sauna-branch-width-note="">
            Signed-in values are edited at Base. At this width an edit
            overrides the field for guests and signed-in visitors alike.
          </Text>
        ) : audience === "member" ? (
          <Text size="xs" variant="muted" data-sauna-branch-member-note="">
            Signed-in visitors see these values. A field left as it is keeps the
            guest value.
          </Text>
        ) : null}
        {children}
      </Tabs.Content>
    </Tabs>
  );
}

// Editable whole-object JSON editor for component types that don't
// have a `defineBlock` registration. The textarea itself (re-seeding on
// node change, parse-on-blur, inline error) is the shared StudioJsonField;
// `acceptJsonObject` is what keeps a typo from replacing the props map with
// a string or an array.
function RawJsonProps({
  nodeType,
  value,
  screenLabel,
  disabled,
  onChange,
}: {
  nodeType: string;
  value: Record<string, unknown>;
  /** Set at a width: the field holds that width's overrides only. */
  screenLabel?: string;
  disabled?: boolean;
  onChange: (next: Record<string, unknown> | undefined) => void;
}): ReactNode {
  return (
    <div className="space-y-2 text-sm">
      {/* The board's SDL-377 sentence, in English since EP-86 took the whole
          Studio shell over: the panel has to say WHY the author is looking at
          raw JSON, not just hand them a textarea. */}
      <Text size="xs" variant="muted">
        Type <Code className="text-xs">{nodeType}</Code> declares no{" "}
        <Code className="text-xs">props</Code> schema — editing JSON directly.
      </Text>
      {screenLabel ? (
        <Text size="xs" variant="muted" data-sauna-raw-screen={screenLabel}>
          {screenLabel === "member"
            ? "Only the keys signed-in visitors see differently from guests."
            : "Only the keys that differ from the base at this width."}
        </Text>
      ) : null}
      <StudioJsonField
        value={value}
        validate={acceptJsonObject}
        disabled={disabled}
        onChange={onChange}
        maxRows={20}
        saveLabel="Save JSON"
      />
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Manifest-driven path (SDL-293)                                     */
/* ------------------------------------------------------------------ */

/**
 * The descriptors of one node as the approved canvas draws them (board
 * `FinalRichProps`): each group is a BAND — a tinted 28px header with a
 * chevron, bounded top and bottom — over its own padded body, in the
 * canonical order (content → appearance → layout → state → advanced).
 *
 * SDL-329 exists because the first cut (SDL-293) rendered the group name as
 * small muted text in the same flow, at the same size and tone as the field
 * captions under it. Everything was technically grouped and nothing read as
 * a group: the owner looked at the panel and saw no groups at all. The band
 * is the kit's `PanelSection variant="group"` — Studio does not assemble
 * panel chrome by hand (EP-32).
 *
 * A component the manifest knows but that has no authorable props of its own
 * (the compound parts: CardHeader, TableRow…) renders a sentence, not an
 * empty column: the old JSON textarea only invited people to invent props
 * the component does not read.
 */
function DescriptorGroups({
  groups,
  props,
  disabled,
  editors,
  onFieldChange,
  storageKey,
  paramAction,
  overrideMark,
}: {
  groups: readonly PropDescriptorGroup[];
  props: Record<string, unknown>;
  disabled?: boolean;
  editors?: Record<string, PropEditor>;
  onFieldChange: (fieldName: string) => (value: unknown) => void;
  storageKey?: string;
  paramAction?: (fieldName: string) => ReactNode;
  overrideMark?: (fieldName: string) => ReactNode;
}): ReactNode {
  const [openState, setOpenState] = useGroupOpenState(storageKey);

  if (groups.length === 0) {
    return (
      <Text size="xs" variant="muted">
        This component takes no editable props — its content is its children in
        the outline.
      </Text>
    );
  }
  return (
    <div className="-mx-3 -mb-3 flex flex-col">
      {groups.map((group) => (
        <PanelSection
          key={group.group}
          variant="group"
          title={group.label}
          data-sauna-prop-group={group.group}
          open={openState[group.group] ?? true}
          onOpenChange={(open: boolean) => setOpenState(group.group, open)}
        >
          <div className="flex flex-col gap-3">
            {group.items.map((descriptor) => (
              <DescriptorRow
                key={descriptor.name}
                descriptor={descriptor}
                value={props[descriptor.name]}
                allProps={props}
                disabled={disabled}
                editors={editors}
                onChange={onFieldChange(descriptor.name)}
                paramAction={paramAction?.(descriptor.name)}
                overrideMark={overrideMark?.(descriptor.name)}
              />
            ))}
          </div>
        </PanelSection>
      ))}
    </div>
  );
}

/**
 * Open memory of the groups, in localStorage under the caller's key.
 *
 * Loaded in an effect, not in the initializer — the same SSR reason as the
 * outline's collapse memory in the shell: reading storage while rendering
 * hydrates a tree different from the one the server sent. Unreadable or
 * unwritable storage costs the memory, never the feature.
 */
function useGroupOpenState(
  storageKey: string | undefined
): [Record<string, boolean>, (group: string, open: boolean) => void] {
  const [openState, setState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        setState(
          Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
            )
          )
        );
      }
    } catch {
      // Ignored on purpose — see the doc comment.
    }
  }, [storageKey]);

  const setGroupOpen = (group: string, open: boolean) => {
    setState((prev) => {
      const next = { ...prev, [group]: open };
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Ignored on purpose — see the doc comment.
        }
      }
      return next;
    });
  };

  return [openState, setGroupOpen];
}

function DescriptorRow(props: {
  descriptor: PropDescriptor;
  value: unknown;
  allProps: Record<string, unknown>;
  disabled?: boolean;
  editors?: Record<string, PropEditor>;
  onChange: (value: unknown) => void;
  /** «Make a parameter» affordance, when the host asked for one. */
  paramAction?: ReactNode;
  /** «Overridden» + Reset, when the width variant overrides this field. */
  overrideMark?: ReactNode;
}): ReactNode {
  const editor = pickDescriptorEditor(props.descriptor, props.value, props.editors);
  const ctx: PropEditorContext = {
    fieldName: props.descriptor.name,
    descriptor: props.descriptor,
    value: props.value,
    allProps: props.allProps,
    onChange: props.onChange,
    disabled: props.disabled,
  };
  return (
    <FieldWithParam paramAction={props.paramAction} overrideMark={props.overrideMark}>
      {editor(ctx)}
    </FieldWithParam>
  );
}

/**
 * A field plus, optionally, its parameter affordance.
 *
 * A wrapper rather than a change to the editors: an editor renders a whole
 * labelled row and there is no seam inside one to hand a button to. Every
 * editor the manifest can name — and every editor a host registers — gets
 * the affordance for free this way, which is the point: the author must not
 * have to learn which field types can be parameterised.
 *
 * Without an affordance the wrapper returns the editor untouched, so the
 * page editor's DOM is byte-identical to what it rendered before SDL-503.
 */
function FieldWithParam({
  paramAction,
  overrideMark,
  children,
}: {
  paramAction?: ReactNode;
  overrideMark?: ReactNode;
  children: ReactNode;
}): ReactNode {
  if (!paramAction && !overrideMark) return <>{children}</>;
  return (
    <div className="flex flex-col gap-1" data-sauna-field-overridden={overrideMark ? "" : undefined}>
      {children}
      {overrideMark}
      {paramAction}
    </div>
  );
}

/**
 * Editor for a descriptor. Registered editors still win by field name, so a
 * host that registered a colour picker keeps it. Every editor the manifest
 * can name now has a control of its own: SDL-294 filled the last two holes
 * (`segmented`, `link`), which until then fell through to the dropdown and
 * the plain text input.
 *
 * Exported because the page's content panel draws a block's parameters with
 * the same rules (SDL-504): a parameter points at a prop, and the control it
 * deserves is the control that prop already has. A second copy of this switch
 * would drift from this one the first time a kind is added.
 */
export function pickDescriptorEditor(
  descriptor: PropDescriptor,
  value: unknown,
  perInstance?: Record<string, PropEditor>
): PropEditor {
  if (perInstance?.[descriptor.name]) return perInstance[descriptor.name];
  const global = getPropEditor(descriptor.name);
  if (global) return global;
  // A prop the manifest does not know may hold anything the page was
  // authored with; objects and arrays need the JSON textarea, not an input
  // that would stringify them.
  if (descriptor.unknown && value !== undefined && !isPrimitiveValue(value)) return JsonEditor;
  switch (descriptor.editor) {
    case "number":
      return NumberEditor;
    case "switch":
      return BooleanEditor;
    case "segmented":
      return SegmentedEditor;
    case "select":
      return EnumEditor;
    case "link":
      return LinkEditor;
    default:
      return TextEditor;
  }
}

function FieldRow(props: {
  fieldName: string;
  fieldSchema: ZodTypeAny;
  value: unknown;
  allProps: Record<string, unknown>;
  disabled?: boolean;
  editors?: Record<string, PropEditor>;
  onChange: (value: unknown) => void;
  /** «Make a parameter» affordance, when the host asked for one. */
  paramAction?: ReactNode;
  /** «Overridden» + Reset, when the width variant overrides this field. */
  overrideMark?: ReactNode;
}): ReactNode {
  const editor = pickEditor(props.fieldName, props.fieldSchema, props.editors);
  const ctx: PropEditorContext = {
    fieldName: props.fieldName,
    zodSchema: unwrapZod(props.fieldSchema),
    value: props.value,
    allProps: props.allProps,
    onChange: props.onChange,
    disabled: props.disabled,
  };
  return (
    <FieldWithParam paramAction={props.paramAction} overrideMark={props.overrideMark}>
      {editor(ctx)}
    </FieldWithParam>
  );
}

function pickEditor(
  fieldName: string,
  fieldSchema: ZodTypeAny,
  perInstance?: Record<string, PropEditor>
): PropEditor {
  const description = readDescription(fieldSchema);
  for (const lookup of [description, fieldName]) {
    if (!lookup) continue;
    if (perInstance?.[lookup]) return perInstance[lookup];
    const global = getPropEditor(lookup);
    if (global) return global;
  }
  switch (zodKind(fieldSchema)) {
    case "string":
      return TextEditor;
    case "number":
      return NumberEditor;
    case "boolean":
      return BooleanEditor;
    case "enum":
      return EnumEditor;
    default:
      // JSON textarea — editable fallback for objects/arrays/unknowns
      // that don't have a typed editor yet. Was ReadonlyJsonEditor
      // pre-2026-05-17; switched after authors hit fields they could
      // not actually edit. ReadonlyJsonEditor remains exported for
      // callers who want the old behaviour.
      return JsonEditor;
  }
}

function readDescription(schema: ZodTypeAny): string | undefined {
  return (schema as unknown as { description?: string; _def?: { description?: string } })
    .description ?? (schema as unknown as { _def: { description?: string } })._def?.description;
}
