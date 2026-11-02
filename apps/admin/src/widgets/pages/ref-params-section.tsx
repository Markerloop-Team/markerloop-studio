"use client";

// The values a page gives a Component it uses (SDL-719, EP-145), laid out
// after the canvas `/design-system/blocks?case=values`
// (design-system/_canvas/blocks-ref-parts.tsx, RefValuesSection): on a page a
// Component is ONE node `{ type: "Ref", props: { blockId, params } }`, and
// what the page edits there is only the values of the Component's parameters.
//
// One field per `schema.params[]` entry of the Component, its control chosen
// by the parameter's `type` (SDL-718; absent = string). An empty field is the
// ABSENCE of a value, not an empty string: the key leaves `params` and the
// Component's own value is drawn (shown as the placeholder) — the canvas's
// "Block value" reset is that same removal.
//
// «Detach» (SDL-720) turns the Ref into an ordinary copy of the Component's
// body with these values written in — after a confirmation that says what
// changes; one studio op (`expandRef`), so one undo brings the Ref back.

import * as React from "react";
import { useStore } from "zustand";
import { Copy, RotateCcw, SquareStack, Unlink } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import {
  SAUNA_REF_PARAMS_PROP,
  blockParamSpecs,
  refBlockId,
  refNodesForBlock,
  refParamValues,
  saunaParamType,
  type SaunaBlockMap,
  type SaunaParamSpec,
  type SaunaSchema,
} from "@markerloop/engine";
import type { SaunaStudioSection, StudioState, StudioStore } from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";

/** The Components the page's refs resolve to — the same map the canvas draws with. */
export const RefBlocksContext = React.createContext<SaunaBlockMap>({});

function selectedRef(state: StudioState): { nodeId: string; blockId: string } | null {
  const nodeId = state.selection.nodeId;
  if (!nodeId) return null;
  const blockId = refBlockId(state.schema.nodes[nodeId]);
  return blockId ? { nodeId, blockId } : null;
}

/** What the Component itself puts at the parameter's place — the empty field's hint. */
function componentValue(block: SaunaSchema, spec: SaunaParamSpec): unknown {
  if (spec.default !== undefined) return spec.default;
  return block.nodes[spec.nodeId]?.props?.[spec.prop];
}

function hint(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * The next `params` with `name` set to `value`, or without it when `value` is
 * `undefined`; `undefined` when nothing is left (the prop then leaves the node).
 */
export function nextRefParams(
  current: Readonly<Record<string, unknown>> | null,
  name: string,
  value: unknown
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  if (value === undefined) delete next[name];
  else next[name] = value;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** A field's text turned into the parameter's value; `undefined` = no value. */
export function parseParamInput(spec: SaunaParamSpec, raw: string): unknown {
  if (raw === "") return undefined;
  if (saunaParamType(spec) === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return raw;
}

/**
 * The "no value here, the Component's own is drawn" item of a select. Radix
 * Select refuses an Item with value "", so the choice gets a sentinel that
 * maps back to `undefined` (the key removed) on change.
 */
const COMPONENT_VALUE = "__component__";

function RefParamField({
  spec,
  value,
  placeholder,
  onChange,
}: {
  spec: SaunaParamSpec;
  value: unknown;
  placeholder: string;
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations("pages.components.params");
  const id = `ref-param-${spec.name}`;
  const label = spec.label?.trim() || spec.name;
  const set = value !== undefined;
  const type = saunaParamType(spec);
  const text = value === undefined || value === null ? "" : String(value);

  let control: React.ReactNode;
  if (type === "boolean") {
    control = (
      <UI.FormControl.Select.Root
        value={set ? String(value === true) : COMPONENT_VALUE}
        onValueChange={(v) => onChange(v === COMPONENT_VALUE ? undefined : v === "true")}
      >
        <UI.FormControl.Select.Trigger id={id} fullWidth>
          <UI.FormControl.Select.Value />
        </UI.FormControl.Select.Trigger>
        <UI.FormControl.Select.Content>
          <UI.FormControl.Select.Item value={COMPONENT_VALUE}>
            {t("componentValue", { value: placeholder === "true" ? t("yes") : placeholder === "false" ? t("no") : "—" })}
          </UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="true">{t("yes")}</UI.FormControl.Select.Item>
          <UI.FormControl.Select.Item value="false">{t("no")}</UI.FormControl.Select.Item>
        </UI.FormControl.Select.Content>
      </UI.FormControl.Select.Root>
    );
  } else if (type === "select") {
    control = (
      <UI.FormControl.Select.Root
        value={text === "" ? COMPONENT_VALUE : text}
        onValueChange={(v) => onChange(v === COMPONENT_VALUE ? undefined : v)}
      >
        <UI.FormControl.Select.Trigger id={id} fullWidth>
          <UI.FormControl.Select.Value />
        </UI.FormControl.Select.Trigger>
        <UI.FormControl.Select.Content>
          <UI.FormControl.Select.Item value={COMPONENT_VALUE}>
            {t("componentValue", { value: placeholder || "—" })}
          </UI.FormControl.Select.Item>
          {(spec.options ?? [])
            .filter((o) => String(o) !== "" && String(o) !== COMPONENT_VALUE)
            .map((o) => (
              <UI.FormControl.Select.Item key={String(o)} value={String(o)}>
                {String(o)}
              </UI.FormControl.Select.Item>
            ))}
        </UI.FormControl.Select.Content>
      </UI.FormControl.Select.Root>
    );
  } else if (type === "text") {
    control = (
      <UI.FormControl.Textarea
        id={id}
        value={text}
        placeholder={placeholder}
        rows={3}
        onChange={(e) => onChange(parseParamInput(spec, e.target.value))}
      />
    );
  } else {
    control = (
      <UI.FormControl.Input
        id={id}
        type={type === "number" ? "number" : "text"}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        className={type === "url" || type === "file" ? "font-mono" : undefined}
        onChange={(e) => onChange(parseParamInput(spec, e.target.value))}
      />
    );
  }

  return (
    <UI.Box
      direction="column"
      gap={1}
      data-testid="ref-value"
      data-param={spec.name}
      data-set={set ? "true" : "false"}
    >
      <UI.Box direction="row" align="center" gap={2}>
        <UI.FormControl.Label htmlFor={id}>{label}</UI.FormControl.Label>
        {set ? (
          <UI.Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 gap-1 px-1.5"
            onClick={() => onChange(undefined)}
            aria-label={t("resetAria", { name: label })}
            data-testid="ref-value-reset"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {t("reset")}
          </UI.Button>
        ) : null}
      </UI.Box>
      {control}
      {set ? null : (
        <UI.Text size="xs" variant="muted">
          {t("fromComponent")}
        </UI.Text>
      )}
    </UI.Box>
  );
}

/**
 * Why this Ref cannot be detached, or `null` when it can.
 *
 * The copy carries only the Ref's BASE `params` (`expandRef`), so anything
 * else the page keeps on the Ref would vanish silently:
 * - `"variantBlocks"` — its variants point at Components of their own: one
 *   node draws a different Component per condition and no single copy keeps
 *   that (`refNodesForBlock`, SDL-434);
 * - `"overrides"` — values per condition, width or signed-in member
 *   (`params` inside `variants`, `screens`, `member`);
 * - `"behavior"` — a `bind` / `on` slot on the Ref itself.
 */
export type RefDetachRefusal = "variantBlocks" | "overrides" | "behavior";

const hasParams = (props: Record<string, unknown> | undefined): boolean =>
  props !== undefined && Object.hasOwn(props, SAUNA_REF_PARAMS_PROP);

export function refDetachRefusal(schema: SaunaSchema, nodeId: string, blockId: string): RefDetachRefusal | null {
  if (!refNodesForBlock(schema, blockId).expandable.includes(nodeId)) return "variantBlocks";
  const node = schema.nodes[nodeId];
  if (!node) return "variantBlocks";
  if (
    (node.variants ?? []).some((v) => hasParams(v.props)) ||
    Object.values(node.screens ?? {}).some((sc) => hasParams(sc?.props)) ||
    hasParams(node.member?.props)
  ) {
    return "overrides";
  }
  if (node.bind !== undefined || node.on !== undefined) return "behavior";
  return null;
}

export function canDetachRef(schema: SaunaSchema, nodeId: string, blockId: string): boolean {
  return refDetachRefusal(schema, nodeId, blockId) === null;
}

/** How many elements the copy gets: the Component's root and its subtree, nothing outside it. */
export function blockSubtreeSize(block: SaunaSchema): number {
  const seen = new Set<string>();
  const stack = [block.rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const node = block.nodes[id];
    if (seen.has(id) || !node) continue;
    seen.add(id);
    stack.push(...(node.children ?? []));
  }
  return seen.size;
}

/**
 * «Detach» confirmation (SDL-720), laid out after the canvas
 * `/design-system/blocks?case=detach` (blocks-ref-parts.tsx, DetachDialog):
 * the consequences in the author's words, the buttons in a `Box` rather than
 * `Dialog.Footer` (order on a phone).
 */
function DetachDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
}) {
  const t = useTranslations("pages.components.params");
  const rows = [
    { icon: Copy, text: t("detachCopy", { count }) },
    { icon: Unlink, text: t("detachUnlink") },
    { icon: SquareStack, text: t("detachValues") },
  ];
  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]"
        data-testid="detach-dialog"
      >
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title>
            <UI.Box direction="row" align="center" gap={2}>
              <Unlink size={16} aria-hidden="true" />
              {t("detachTitle")}
            </UI.Box>
          </UI.Dialog.Title>
          <UI.Dialog.Description>{t("detachDescription")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <UI.Box direction="column" gap={4} className="min-w-0">
          <UI.Box direction="column" gap={3} data-testid="detach-consequences">
            {rows.map((row) => (
              <UI.Box key={row.text} direction="row" align="start" gap={2}>
                <row.icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 opacity-60" />
                <UI.Text size="sm">{row.text}</UI.Text>
              </UI.Box>
            ))}
          </UI.Box>
          <UI.Text size="xs" variant="muted">
            {t("detachUndo")}
          </UI.Text>
          <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
            <UI.Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="detach-cancel">
              {t("detachCancel")}
            </UI.Button>
            <UI.Button onClick={onConfirm} data-testid="detach-confirm">
              <Unlink size={16} aria-hidden="true" />
              {t("detachConfirm")}
            </UI.Button>
          </UI.Box>
        </UI.Box>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/** The «Detach» button and its confirmation, under the parameters. */
function RefDetach({ store, nodeId, blockId, block }: { store: StudioStore; nodeId: string; blockId: string; block: SaunaSchema }) {
  const t = useTranslations("pages.components.params");
  const [open, setOpen] = React.useState(false);
  const refusal = useStore(store, (s) => refDetachRefusal(s.schema, nodeId, blockId));
  if (refusal) {
    const key = refusal === "variantBlocks" ? "detachRefused" : refusal === "overrides" ? "detachRefusedOverrides" : "detachRefusedBehavior";
    return (
      <UI.Text size="xs" variant="muted" data-testid="ref-detach-refused" data-reason={refusal}>
        {t(key)}
      </UI.Text>
    );
  }
  return (
    <>
      <UI.Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
        data-testid="ref-detach"
      >
        <Unlink size={14} aria-hidden="true" />
        {t("detach")}
      </UI.Button>
      <DetachDialog
        open={open}
        onOpenChange={setOpen}
        count={blockSubtreeSize(block)}
        onConfirm={() => {
          setOpen(false);
          store.getState().applyOp({ kind: "expandRef", nodeId, blockId, block });
        }}
      />
    </>
  );
}

function RefParamsBody({ store }: { store: StudioStore }) {
  const t = useTranslations("pages.components.params");
  const blocks = React.useContext(RefBlocksContext);
  // Primitives only: a selector that returns a fresh object re-renders forever.
  const nodeId = useStore(store, (s) => selectedRef(s)?.nodeId ?? null);
  const blockId = useStore(store, (s) => selectedRef(s)?.blockId ?? null);
  const node = useStore(store, (s) => (nodeId ? s.schema.nodes[nodeId] : undefined));
  if (!nodeId || !blockId) return null;
  const ref = { nodeId, blockId };
  const block = blocks[ref.blockId];
  if (!block) {
    return (
      <UI.Text size="sm" variant="muted" data-testid="ref-params-missing">
        {t("missing")}
      </UI.Text>
    );
  }
  const specs = blockParamSpecs(block);
  const values = refParamValues(node);
  return (
    <UI.Box direction="column" gap={3} data-testid="ref-values-form">
      <UI.Text size="sm" variant="muted" data-testid="ref-explain">
        {t("explain")}
      </UI.Text>
      {specs.length === 0 ? (
        <UI.Text size="sm" variant="muted" data-testid="ref-params-empty">
          {t("empty")}
        </UI.Text>
      ) : (
        specs.map((spec) => (
          <RefParamField
            key={spec.name}
            spec={spec}
            value={values?.[spec.name]}
            placeholder={hint(componentValue(block, spec))}
            onChange={(value) =>
              store.getState().applyOp({
                kind: "updateNodePropsPartial",
                nodeId: ref.nodeId,
                patch: { [SAUNA_REF_PARAMS_PROP]: nextRefParams(refParamValues(store.getState().schema.nodes[ref.nodeId]), spec.name, value) },
              })
            }
          />
        ))
      )}
      <RefDetach store={store} nodeId={ref.nodeId} blockId={ref.blockId} block={block} />
    </UI.Box>
  );
}

/** The Properties section a selected `Ref` gets. Applicable only to a Ref node. */
export function refParamsSection(title: string): SaunaStudioSection {
  return {
    id: "ref-params",
    title,
    editsDocument: true,
    applicable: (state) => selectedRef(state) !== null,
    render: (store) => <RefParamsBody store={store} />,
  };
}
