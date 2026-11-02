// Pluggable prop editor.
//
// A `PropEditor` renders one row of the auto-form: a label + control
// for a single field. The auto-form picks a built-in editor based on
// the Zod schema (string → text, number → number, boolean → checkbox,
// enum → select), but consumers can override or extend that mapping
// either globally (`registerPropEditor`) or per-instance via the
// `editors` prop on <SaunaPropertiesAutoForm>.

import type { ReactNode } from "react";
import type { ZodTypeAny } from "zod";

import type { PropDescriptor } from "./descriptors";

export type PropEditorContext = {
  /** Field name on the node's `props`. */
  fieldName: string;
  /**
   * Zod schema fragment for this field (after Optional/Nullable unwrap).
   * Absent on the manifest-driven path (SDL-293): a descriptor carries the
   * type, the enum values and the default itself, and no zod schema exists
   * for a kit component the host never registered as a block.
   */
  zodSchema?: ZodTypeAny;
  /**
   * Manifest descriptor for this field, when the panel was built from the
   * kit's props manifest rather than from a `BlockDefinition`. Carries the
   * caption, the group, the component default and the enum values.
   */
  descriptor?: PropDescriptor;
  /** Current value (raw — may be undefined if the field is unset). */
  value: unknown;
  /** Commit a new value. `undefined` deletes the field. */
  onChange: (value: unknown) => void;
  /** Full props snapshot — useful for editors that depend on siblings. */
  allProps: Record<string, unknown>;
  /** Disable input (e.g. mid-save). Default false. */
  disabled?: boolean;
};

export type PropEditor = (ctx: PropEditorContext) => ReactNode;
