"use client";

// SaunaVariantsEditor — Studio panel for managing a node's
// `variants[]` (M2-PR9c).
//
// MVP scope:
//   - List variants with up/down reorder, expand-to-edit, delete.
//   - Inline editor per variant: label, when (reused condition fields
//     from condition-view.ts), props (JSON textarea), children
//     (comma-separated node ids).
//   - Stable variant ids generated on add; never edited from this UI.
//
// MVP-out: drag-reorder, visual children picker, A/B weights,
// scheduling, draft/published split, per-variant analytics.
//
// Writes go through one op (`setVariants`) that replaces the whole
// array. The local component state holds the working list; we push
// to the store on every change so undo/redo Just Works through the
// existing history machinery.

import * as React from "react";
import { useStore } from "zustand";
import type { ReactNode } from "react";

import type { VariantSpec } from "@markerloop/engine";
import { Button, Code, FormControl, Menu, Text } from "@markerloop/ui/ui";
// Kebab glyph via the kit registry, not lucide-react directly — the
// no-direct-lucide gate (SDL-305) keeps apps/studio off the library.
import { MoreVertical } from "./icons";
import type { StudioStore } from "./store";
import { summariseCondition } from "./condition-view";
import {
  acceptJsonObject,
  StudioConditionFields,
  StudioFieldRow,
  StudioJsonField,
  StudioPanel,
} from "./panel-parts";
import type { PreviewContextSchema } from "./preview-context-editor";

const { Input } = FormControl;

export type SaunaVariantsEditorProps = {
  store: StudioStore;
  disabled?: boolean;
  /**
   * Body only, no StudioPanel shell of its own — for the sections column
   * (SDL-285), where the shell's PanelSection already provides the header.
   * The `data-sauna-variants` hook moves onto the bare wrapper. With no
   * node selected the bare editor renders nothing: the section that mounts
   * it is not applicable then and hides itself.
   */
  bare?: boolean;
  /**
   * Variant id to open expanded when the editor MOUNTS. The section's
   * header action (`+ Add variant`) creates the first variant while the
   * editor is not mounted yet (an empty section renders no body), so the
   * internal "freshly added opens expanded" behaviour cannot fire — the
   * host passes the fresh id here instead. Read once, in the state
   * initializer; later changes have no effect.
   */
  initialExpandedId?: string | null;
  /**
   * The host's declared preview-context fields. Forwarded to the condition
   * form, where a declared field becomes a select and settles the literal's
   * kind (SDL-377). Omitted → free-text paths, as before.
   */
  contextSchema?: PreviewContextSchema;
};

// Stable id generator. Studio runs in the browser — `crypto.randomUUID`
// is available everywhere we ship. Falls back to a timestamp+random
// for jsdom test runs where the polyfill may be absent.
// Exported for the host's section header action (SDL-285): "+ Add variant"
// in an EMPTY section lives outside this component, but the variants it
// creates must be the same shape this editor creates.
export function newVariantId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `v-${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch {
    // fall through
  }
  return `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function SaunaVariantsEditor({
  store,
  disabled,
  bare,
  initialExpandedId,
  contextSchema,
}: SaunaVariantsEditorProps): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  const [expandedVariantId, setExpandedVariantId] = React.useState<string | null>(
    initialExpandedId ?? null
  );

  const node = selectedId ? schema.nodes[selectedId] : null;
  if (!node || !selectedId) {
    if (bare) return null;
    return (
      <StudioPanel title="Variants" data-sauna-variants>
        <Text size="xs" variant="muted">
          Select a node to manage its variants.
        </Text>
      </StudioPanel>
    );
  }

  const variants = node.variants ?? [];

  const writeVariants = (next: VariantSpec[] | null) => {
    store.getState().applyOp({
      kind: "setVariants",
      nodeId: selectedId,
      variants: next,
    });
  };

  const addVariant = () => {
    const fresh: VariantSpec = {
      id: newVariantId(),
      // Empty path forces the author to wire the condition to a real context
      // variable from the host. Sunday-Sauna has no opinion on naming.
      when: { when: { op: "truthy", path: "" } },
    };
    writeVariants([...variants, fresh]);
    setExpandedVariantId(fresh.id);
  };

  const removeVariant = (id: string) => {
    const next = variants.filter((v) => v.id !== id);
    writeVariants(next.length === 0 ? null : next);
    if (expandedVariantId === id) setExpandedVariantId(null);
  };

  const moveVariant = (id: string, delta: -1 | 1) => {
    const idx = variants.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= variants.length) return;
    const next = variants.slice();
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    writeVariants(next);
  };

  const updateVariant = (id: string, patch: Partial<VariantSpec>) => {
    writeVariants(variants.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={addVariant}
      disabled={disabled}
      data-sauna-variant-add
      className="self-start"
    >
      + Add variant
    </Button>
  );

  const body = (
      <div className="flex flex-col gap-2">
        {variants.length === 0 ? (
          <Text size="xs" variant="muted">
            No variants. The node renders its default body for every viewer.
          </Text>
        ) : (
          variants.map((v, idx) => (
            <VariantRow
              key={v.id}
              variant={v}
              index={idx}
              total={variants.length}
              expanded={expandedVariantId === v.id}
              disabled={disabled}
              onToggle={() =>
                setExpandedVariantId(expandedVariantId === v.id ? null : v.id)
              }
              onMoveUp={() => moveVariant(v.id, -1)}
              onMoveDown={() => moveVariant(v.id, 1)}
              onDelete={() => removeVariant(v.id)}
              onChange={(patch) => updateVariant(v.id, patch)}
              contextSchema={contextSchema}
            />
          ))
        )}
        {addButton}
      </div>
  );

  if (bare) {
    return <div data-sauna-variants>{body}</div>;
  }

  return (
    <StudioPanel title="Variants" data-sauna-variants>
      {body}
    </StudioPanel>
  );
}

// ---- One variant row -------------------------------------------------

function VariantRow({
  variant,
  index,
  total,
  expanded,
  disabled,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDelete,
  onChange,
  contextSchema,
}: {
  variant: VariantSpec;
  index: number;
  total: number;
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  contextSchema?: PreviewContextSchema;
  onChange: (patch: Partial<VariantSpec>) => void;
}) {
  return (
    <div
      className="rounded-md border bg-background"
      data-sauna-variant={variant.id}
      data-expanded={expanded ? "true" : undefined}
    >
      {/* Header row: priority + label + condition summary + actions */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          title={expanded ? "Collapse" : "Expand"}
          className="h-7 min-w-0 flex-1 justify-start gap-2 px-1 font-normal"
        >
          {/* Both strings are ellipsised inside the collapsed row, and the
              row's own scroller stops short of the laid-out text, so the tail
              of a long id is otherwise unreachable. `title` on each span keeps
              the full value readable; the button's own title stays the
              expand/collapse hint. */}
          <span className="truncate font-medium" title={variant.label || variant.id}>
            {variant.label || variant.id}
          </span>
          <span
            className="truncate text-muted-foreground"
            title={summariseCondition(variant.when.when)}
          >
            {summariseCondition(variant.when.when)}
          </span>
        </Button>
        {/* One kebab instead of the three inline glyphs the MVP shipped
            (SDL-377). The approved canvas draws a single actions control on
            the card, and the row has to hold the label AND the condition
            summary — three always-visible buttons ate the width both strings
            were already truncating into. Reorder and delete keep their
            wording from the outline's node menu so the two menus of the
            editor do not name the same action differently. */}
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Actions for ${variant.label || variant.id}`}
              title="Variant actions"
              data-sauna-variant-menu=""
              className="size-7 shrink-0 p-0"
            >
              <MoreVertical className="size-3.5" aria-hidden />
            </Button>
          </Menu.Trigger>
          <Menu.Content align="end" width={200}>
            <Menu.Item
              data-sauna-variant-action="move-up"
              disabled={disabled || index === 0}
              onSelect={onMoveUp}
            >
              Move up
            </Menu.Item>
            <Menu.Item
              data-sauna-variant-action="move-down"
              disabled={disabled || index === total - 1}
              onSelect={onMoveDown}
            >
              Move down
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              data-sauna-variant-action="delete"
              variant="destructive"
              disabled={disabled}
              onSelect={onDelete}
            >
              Delete
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </div>

      {/* Body row: only when expanded */}
      {expanded ? (
        <div className="flex flex-col gap-2 border-t px-2 py-2">
          <StudioFieldRow label="Label (Studio only)">
            <Input
              type="text"
              value={variant.label ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ label: e.target.value || undefined })}
              placeholder="e.g. Paid user"
              className="h-8 max-md:text-xs md:text-xs"
            />
          </StudioFieldRow>

          <StudioFieldRow label="ID">
            <Code className="mx-0 py-0.5 text-xs text-muted-foreground">
              {variant.id}
            </Code>
          </StudioFieldRow>

          <StudioFieldRow label="When">
            <StudioConditionFields
              layout="compact"
              when={variant.when.when}
              disabled={disabled}
              contextSchema={contextSchema}
              onChange={(when) => onChange({ when: { ...variant.when, when } })}
            />
          </StudioFieldRow>

          <StudioFieldRow label="Props (JSON, overrides node.props)">
            <StudioJsonField
              value={variant.props}
              validate={acceptJsonObject}
              disabled={disabled}
              onChange={(value) => onChange({ props: value })}
              placeholder='{"title": "alt"}'
            />
          </StudioFieldRow>

          <StudioFieldRow label="Children (comma-separated node ids, empty = use node.children)">
            <Input
              type="text"
              value={(variant.children ?? []).join(", ")}
              disabled={disabled}
              onChange={(e) => {
                const raw = e.target.value.trim();
                onChange({
                  children: raw === ""
                    ? undefined
                    : raw.split(",").map((s) => s.trim()).filter(Boolean),
                });
              }}
              placeholder="alt-a, alt-b"
              className="h-8 font-mono max-md:text-xs md:text-xs"
            />
          </StudioFieldRow>
        </div>
      ) : null}
    </div>
  );
}
