// "Save as component" as one function (SDL-341, SDL-718): what the dialog
// does on submit, without the dialog — so it is tested without a DOM.
//
// Order is the design: the Component is written FIRST and the page is edited
// only after that write resolves, so a failure leaves a Component nobody
// references yet, never a Ref to nothing. The Ref points at the id STORAGE
// issued (`created.id`), not at the key and not at anything the client chose.

import { extractBlockSchema, type SaunaNodeId } from "@markerloop/engine";

import { saunaCheckComponentName, saunaSaveComponentErrorText } from "./save-as-component-copy";
import type { SaunaSaveAsComponentApi } from "./shell";
import type { StudioStore } from "./store";

export type SaunaSaveAsComponentResult =
  | { ok: true; id: string; key: string }
  | { ok: false; field: "name" | "node" | "storage"; message: string; cause?: unknown };

export async function saunaSaveNodeAsComponent({
  store,
  api,
  nodeId,
  name,
  group,
}: {
  store: StudioStore;
  api: SaunaSaveAsComponentApi;
  nodeId: SaunaNodeId;
  name: string;
  /** The Component's group (EP-175); empty or absent — no group. */
  group?: string;
}): Promise<SaunaSaveAsComponentResult> {
  const block = extractBlockSchema(store.getState().schema, nodeId);
  if (!block) return { ok: false, field: "node", message: "The element is gone — this dialog can be closed." };
  const check = saunaCheckComponentName(name);
  if (!check.ok) return { ok: false, field: "name", message: check.reason };
  let created: { id: string; key: string };
  try {
    const trimmed = (group ?? "").trim();
    created = await api.create(trimmed ? { name: check.name, schema: block, group: trimmed } : { name: check.name, schema: block });
  } catch (e) {
    return { ok: false, field: "storage", message: saunaSaveComponentErrorText(e), cause: e };
  }
  // Against the CURRENT schema: the write took a round trip, and the author
  // may have edited elsewhere while it was in flight.
  store.getState().applyOp({ kind: "replaceWithRef", nodeId, blockId: created.id });
  return { ok: true, id: created.id, key: created.key };
}
