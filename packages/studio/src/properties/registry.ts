// Global default registry of prop editors.
//
// Consumers can `registerPropEditor("color", editorFn)` once at app
// boot to get a colour picker available wherever a Zod schema is
// tagged with `meta.editor === "color"`. The auto-form falls back to
// built-in editors based on Zod kind when no custom editor is named.
//
// Per-instance overrides (without polluting the global) are supported
// via `<SaunaPropertiesAutoForm editors={...}>`.

import type { PropEditor } from "./types";

const globalRegistry = new Map<string, PropEditor>();

export function registerPropEditor(name: string, editor: PropEditor): void {
  globalRegistry.set(name, editor);
}

export function unregisterPropEditor(name: string): void {
  globalRegistry.delete(name);
}

export function getPropEditor(name: string): PropEditor | undefined {
  return globalRegistry.get(name);
}

/** Snapshot of current registrations. Mainly for tests / inspection. */
export function listPropEditors(): string[] {
  return [...globalRegistry.keys()];
}
