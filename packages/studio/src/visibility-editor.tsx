"use client";

// SaunaVisibilityEditor — Studio panel for setting per-node `when`
// visibility rules (M1-PR4).
//
// Rules are a LIST of conditions joined by AND, each with one of four
// ops (eq / neq / exists / truthy) — the shape the approved canvas draws,
// with «+ Add rule» under the filled ones (SDL-377). One rule is stored
// flat; several are stored as the engine's `all` node, which the runtime
// evaluator and `summariseCondition` have always understood — the
// translation lives in ./condition-view.
//
// Still out of the editor: `any` (OR), `not` and `in`. A rule set built
// out of those is authored by hand and stays a single opaque row rather
// than being silently re-joined with AND; authors edit it through
// store.applyOp({ kind: "setVisibility" }) as before.
//
// Wiring: drop the component below <SaunaPropertiesAutoForm>. It
// reads the currently selected node from the same store and writes
// back via the same applyOp("setVisibility") used by the Properties
// pane.
//
// The panel shell and the condition form itself are shared with the other
// editors (./panel-parts) — only the rule's lifecycle (add / remove, and
// preserving a legacy `permission` field) is specific to this file.

import { useStore } from "zustand";
import type { ReactNode } from "react";

import type { VisibilityCondition, VisibilityRule } from "@markerloop/engine";
import { Button, Text } from "@markerloop/ui/ui";
import { conditionList, isEditableList, listToWhen, summariseCondition } from "./condition-view";
import type { StudioStore } from "./store";
import { StudioConditionFields, StudioPanel } from "./panel-parts";
import type { PreviewContextSchema } from "./preview-context-editor";

export type SaunaVisibilityEditorProps = {
  store: StudioStore;
  /** Disable inputs (e.g. while a save is in flight). */
  disabled?: boolean;
  /**
   * Body only, no StudioPanel shell of its own — for the sections column
   * (SDL-285), where the shell's PanelSection already provides the header.
   * The `data-sauna-visibility` hook moves onto the bare wrapper. With no
   * node selected the bare editor renders nothing: the section that mounts
   * it is not applicable then and hides itself.
   */
  bare?: boolean;
  /**
   * The host's declared preview-context fields. Forwarded to the condition
   * form, where a declared field becomes a select and settles the literal's
   * kind (SDL-377). Omitted → free-text paths, as before.
   */
  contextSchema?: PreviewContextSchema;
};

export function SaunaVisibilityEditor({
  store,
  disabled,
  bare,
  contextSchema,
}: SaunaVisibilityEditorProps): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);

  const node = selectedId ? schema.nodes[selectedId] : null;
  if (!node || !selectedId) {
    if (bare) return null;
    return (
      <StudioPanel title="Visibility" data-sauna-visibility>
        <Text size="xs" variant="muted">
          Select a node to configure its visibility.
        </Text>
      </StudioPanel>
    );
  }

  // This editor speaks the legacy CONDITION rule only. Since SDL-632 the same
  // field may hold a mode string ("public" | "hybrid" | "private"); that is
  // the mode editor's (S6), and here it reads as "no condition". Writing a
  // condition onto a node that has a mode replaces the mode — the pages
  // editor does not mount this panel, and S6 decides how the two meet.
  const rule =
    typeof node.visibility === "object" && node.visibility !== null ? node.visibility : undefined;
  const when = rule?.when;
  const rules = conditionList(when);
  // A hand-authored `any` / `not` / `in` is one row the editor cannot take
  // apart; offering «+ Add rule» there would AND a second condition onto a
  // tree whose top-level operator is not AND. Fields fall back to their
  // usual empty view for such a row, which is the pre-SDL-377 behaviour.
  const editable = isEditableList(when);

  const writeRule = (next: VisibilityRule | null) => {
    store.getState().applyOp({
      kind: "setVisibility",
      nodeId: selectedId,
      rule: next,
    });
  };

  const writeList = (list: VisibilityCondition[]) => {
    const nextWhen = listToWhen(list);
    if (nextWhen === undefined) {
      remove();
      return;
    }
    writeRule({ ...(rule ?? {}), when: nextWhen });
  };

  const enable = () => {
    // Default to a no-op `exists` against an empty path so the user is forced
    // to fill in the path themselves — Sunday-Sauna doesn't know what context
    // variables the host application provides.
    writeRule({ ...(rule ?? {}), when: { op: "exists", path: "" } });
  };

  const addRule = () => writeList([...rules, { op: "exists", path: "" }]);

  const removeAt = (index: number) =>
    writeList(rules.filter((_, i) => i !== index));

  const remove = () => {
    if (!rule) return;
    // Drop only `when`; preserve legacy `permission` if any.
    const { when: _drop, ...rest } = rule;
    void _drop;
    if (rest.permission !== undefined) {
      writeRule(rest);
    } else {
      writeRule(null);
    }
  };

  const body =
    when === undefined ? (
      // In the sections column this state is unreachable — an empty section
      // renders no body and offers "+ Add rule" in its header instead — but
      // the fallback stays for any host that mounts the bare editor on its
      // own chrome.
      <Button type="button" variant="outline" size="sm" onClick={enable} disabled={disabled}>
        Add visibility rule
      </Button>
    ) : (
      <div className="flex flex-col gap-2">
        {rules.map((cond, index) => (
          // Index as key on purpose: a rule has no identity of its own — the
          // list IS the value being edited, and removing row 1 is meant to
          // shift row 2 up into its slot rather than carry state along.
          <div key={index} className="flex flex-col gap-2" data-sauna-visibility-rule={index}>
            <StudioConditionFields
              when={cond}
              disabled={disabled}
              contextSchema={contextSchema}
              onChange={(next) =>
                writeList(rules.map((c, i) => (i === index ? next : c)))
              }
            />
            {rules.length > 1 ? (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeAt(index)}
                  disabled={disabled}
                  data-sauna-visibility-remove={index}
                >
                  Remove rule
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {/* The board puts a plain-language restatement of the rule under the
            fields (SDL-377): the three controls say `path` / `op` / `value`
            separately, and the reader has to assemble the sentence to check
            it. `summariseCondition` is the same helper the variant cards
            already print, so the two surfaces cannot describe one condition
            differently — and it is also what joins several rules with AND,
            so the summary stays one sentence however many rows there are. */}
        <Text
          as="p"
          size="xs"
          variant="muted"
          className="rounded-md bg-muted px-2.5 py-2 font-mono"
          data-sauna-visibility-summary=""
        >
          show when {summariseCondition(when)}
        </Text>
        <div className="flex gap-2">
          {editable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRule}
              disabled={disabled}
              data-sauna-visibility-add-rule=""
            >
              + Add rule
            </Button>
          ) : null}
          {rules.length === 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={disabled}
            >
              Remove rule
            </Button>
          ) : null}
        </div>
      </div>
    );

  if (bare) {
    return (
      <div data-sauna-visibility className="flex flex-col gap-2">
        {body}
      </div>
    );
  }

  return (
    <StudioPanel title="Visibility" data-sauna-visibility>
      {body}
    </StudioPanel>
  );
}
