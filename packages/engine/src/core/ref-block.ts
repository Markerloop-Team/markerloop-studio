// `Ref` as an Element of the catalog (SDL-718, EP-145).
//
// A reference node has been rendered since SDL-338 without a catalog entry:
// the renderer intercepts `type: "Ref"` before the registry lookup. What the
// catalog lacked is the DESCRIPTION — an agent reading the Element catalog
// (`GET /api/element-catalog`, the markerloop MCP) had no way to learn that
// a page may hold `{ type: "Ref", props: { blockId, params } }`, nor what
// those props are.
//
// Not insertable: a reference is made by picking one of the workspace's
// Components (the Insert modal's own tab) or by "Save as component", never
// as an empty tile from the Elements list — a Ref without a `blockId` is a
// placeholder by definition.
//
// Server-safe: zod only, like `primitives.ts`.

import { z } from "zod";

import { defineBlock } from "./define-block";
import { SAUNA_REF_TYPE } from "./refs";

/**
 * Props of a `Ref` node: `blockId` is the pages-service id of the referenced
 * Component (a UUID the service issues on `POST /pages/blocks`), `params`
 * the page's values for the Component's parameters, addressed by name.
 */
export const RefPropsSchema = z.object({
  blockId: z.uuid(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const RefBlock = defineBlock({
  type: SAUNA_REF_TYPE,
  displayName: "Component",
  staticProps: RefPropsSchema,
  meta: {
    category: "Components",
    description: "A reference to one of the workspace's Components: edits to the Component reach every page it sits on.",
    insertable: false,
  },
});
