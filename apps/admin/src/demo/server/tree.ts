// A tiny authoring helper for the demo documents: write a page as a nested
// tree (`el(type, props, children, name)`) and get the normalized v2 schema
// pages-service stores (`{version: 2, rootId, nodes, parents}`).

export type TreeNode = {
  type: string;
  props?: Record<string, unknown>;
  children?: TreeNode[];
  name?: string;
  /** Stable id for nodes other parts of the seed point at (block params). */
  id?: string;
};

export type DocV2 = {
  version: 2;
  rootId: string;
  nodes: Record<string, Record<string, unknown>>;
  parents: Record<string, string | null>;
  params?: Array<Record<string, unknown>>;
};

export function el(
  type: string,
  props: Record<string, unknown> = {},
  children: TreeNode[] = [],
  name?: string,
  id?: string
): TreeNode {
  return { type, props, children, name, id };
}

/** Converts a tree into the normalized schema; ids are `<prefix>-<n>` unless fixed. */
export function toDoc(root: TreeNode, prefix: string, params?: Array<Record<string, unknown>>): DocV2 {
  const nodes: DocV2["nodes"] = {};
  const parents: DocV2["parents"] = {};
  let counter = 0;
  const walk = (node: TreeNode, parent: string | null): string => {
    counter += 1;
    const id = node.id ?? `${prefix}-${counter}`;
    const children = (node.children ?? []).map((c) => walk(c, id));
    const config: Record<string, unknown> = { type: node.type, propsVersion: 1 };
    if (node.name) config.name = node.name;
    if (node.props && Object.keys(node.props).length > 0) config.props = node.props;
    if (children.length > 0) config.children = children;
    nodes[id] = config;
    parents[id] = parent;
    return id;
  };
  const rootId = walk(root, null);
  const doc: DocV2 = { version: 2, rootId, nodes, parents };
  if (params && params.length > 0) doc.params = params;
  return doc;
}
