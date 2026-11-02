import type { SaunaAnySchema, SaunaNodeConfig, SaunaNodeV1, SaunaSchema } from "./types";
import { createSaunaNodeId } from "./id";

function migrateV1ToV2(node: SaunaNodeV1) {
  const rootId = createSaunaNodeId();
  const nodes: Record<string, SaunaNodeConfig> = {};
  const parents: Record<string, string | null> = { [rootId]: null };

  function walk(n: SaunaNodeV1, id: string) {
    const childIds: string[] = [];
    nodes[id] = {
      type: n.type,
      props: n.props,
      visibility: n.visibility,
      children: undefined as string[] | undefined,
    };
    // The props-schema version travels with the props it describes (SDL-725):
    // dropping it makes a migrated node read as v1 again. Absent stays absent.
    if (n.propsVersion !== undefined) nodes[id].propsVersion = n.propsVersion;
    if (n.children && n.children.length) {
      for (const c of n.children) {
        const cid = createSaunaNodeId();
        childIds.push(cid);
        parents[cid] = id;
        walk(c, cid);
      }
      nodes[id].children = childIds;
    } else {
      delete nodes[id].children;
    }
  }

  walk(node, rootId);

  return {
    version: 2 as const,
    rootId,
    nodes,
    parents,
  };
}

export function migrateSaunaSchema(schema: SaunaAnySchema): SaunaSchema {
  if (schema.version === 2) return schema;
  return migrateV1ToV2(schema.root);
}

