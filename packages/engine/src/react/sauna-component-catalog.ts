import { createSaunaNodeId } from "../index";
import type { SaunaNodeConfig, SaunaSchema } from "../schema/types";
import {
  SAUNA_UNGROUPED_ID,
  type SaunaComponentCatalog,
  type SaunaComponentGroup,
  type SaunaElementAdapter,
} from "./catalog";
import { isRenderableComponent } from "./is-renderable-component";

type Group = { id: string; title: string; order: number };

type UiSaunaComponentMeta = {
  groupId?: string;
  title?: string;
  description?: string;
  keywords?: string[];
  allowedParents?: string[];
  allowedChildren?: string[];
  insertable?: boolean;
  /** Chain of types this part must sit inside, outer first (SDL-633); the adapter's `within` wins. */
  within?: string[];
  previewPath?: string[];
  initialProps?: Record<string, unknown>;
  previewImageSrc?: string;
  docs?: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readUiSaunaMeta(ui: Record<string, unknown>): {
  groups?: Group[];
  metaByType?: Record<string, UiSaunaComponentMeta>;
} {
  const groupsRaw = ui["saunaCatalogGroups"];
  const metaRaw = ui["saunaCatalogMeta"];

  const groups =
    Array.isArray(groupsRaw) && groupsRaw.every((g) => isPlainObject(g) && typeof g.id === "string")
      ? (groupsRaw as unknown as Group[])
      : undefined;

  const metaByType =
    isPlainObject(metaRaw) && Object.values(metaRaw).every((m) => isPlainObject(m))
      ? (metaRaw as Record<string, UiSaunaComponentMeta>)
      : undefined;

  return { groups, metaByType };
}

function buildPreviewSchemaFromPath(args: {
  path: string[];
  selfType: string;
  metaByType?: Record<string, UiSaunaComponentMeta>;
}): SaunaSchema | undefined {
  const resolved = args.path.map((t) => (t === "$self" ? args.selfType : t)).filter(Boolean);
  if (resolved.length === 0) return undefined;

  const ids = resolved.map(() => createSaunaNodeId());
  const nodes: Record<string, SaunaNodeConfig> = {};
  const parents: Record<string, string | null> = {};

  for (let i = 0; i < resolved.length; i++) {
    const type = resolved[i]!;
    const id = ids[i]!;
    const childId = ids[i + 1];
    const initialProps = args.metaByType?.[type]?.initialProps;

    nodes[id] = {
      type,
      props: initialProps,
      children: childId ? [childId] : undefined,
    };
    parents[id] = i === 0 ? null : ids[i - 1]!;
  }

  return { version: 2, rootId: ids[0]!, nodes, parents };
}

export function createSaunaComponentCatalog(
  ui: Record<string, unknown>,
  opts?: {
    include?: string[];
    exclude?: string[];
    /** Where each Component goes in the editor (SDL-629). */
    adapter?: SaunaElementAdapter;
  }
): SaunaComponentCatalog {
  const { groups: uiGroups, metaByType } = readUiSaunaMeta(ui);
  const groups: SaunaComponentGroup[] = [...(opts?.adapter?.groups ?? uiGroups ?? [])];

  const include = new Set(opts?.include ?? []);
  const exclude = new Set(opts?.exclude ?? []);

  const exportNames = Object.keys(ui).sort();
  const types = exportNames
    .filter((name) => {
      if (exclude.has(name)) return false;
      // `include` narrows the set but never bypasses the shape check
      // below: the registry applies it unconditionally, so a name that
      // skips it here becomes a catalog entry the renderer can't
      // resolve — the block is offered for insertion and renders nothing.
      if (include.size > 0 && !include.has(name)) return false;
      return isRenderableComponent(name, ui[name]);
    })
    .sort();

  const items = types.map((type) => {
    const meta = metaByType?.[type];
    // The group is DATA (SDL-629): the adapter's row when the host adapts the
    // kit, the kit's own declaration otherwise, and a visible "ungrouped"
    // bucket when neither says anything. Never a guess from the export name.
    const groupId = opts?.adapter
      ? (opts.adapter.groupOf[type] ?? SAUNA_UNGROUPED_ID)
      : (meta?.groupId ?? SAUNA_UNGROUPED_ID);
    // A compound part (SDL-633) goes only under the last type of its chain,
    // unless the kit names its parents more precisely, and is previewed
    // inside the whole chain — never mounted on its own.
    const within = opts?.adapter?.within?.[type] ?? meta?.within;
    const partOf = within && within.length > 0 ? within[0] : undefined;
    const allowedParents = meta?.allowedParents ?? (within && within.length > 0 ? [within[within.length - 1]!] : undefined);
    const previewPath = meta?.previewPath ?? (within && within.length > 0 ? [...within, "$self"] : undefined);
    const previewSchema = previewPath
      ? buildPreviewSchemaFromPath({ path: previewPath, selfType: type, metaByType })
      : undefined;
    return {
      type,
      groupId,
      title: meta?.title ?? type,
      description: meta?.description,
      initialProps: meta?.initialProps,
      allowedParents,
      allowedChildren: meta?.allowedChildren,
      // Absent means insertable: the kit marks the exceptions, and a kit that
      // predates the flag must keep offering everything it offered before.
      insertable: meta?.insertable !== false,
      partOf,
      previewSchema,
      previewImageSrc: meta?.previewImageSrc,
      docs: meta?.docs,
      keywords: Array.from(new Set([type, groupId, ...(meta?.keywords ?? [])])),
    };
  });

  if (items.some((i) => i.groupId === SAUNA_UNGROUPED_ID) && !groups.some((g) => g.id === SAUNA_UNGROUPED_ID)) {
    groups.push({ id: SAUNA_UNGROUPED_ID, title: "Ungrouped", order: Number.MAX_SAFE_INTEGER });
  }

  return {
    groups,
    items,
    canAddChild: ({ parentType, childType }) => {
      const childAllowedParents = metaByType?.[childType]?.allowedParents;
      if (childAllowedParents && !childAllowedParents.includes(parentType)) return false;

      const parentAllowedChildren = metaByType?.[parentType]?.allowedChildren;
      if (parentAllowedChildren && !parentAllowedChildren.includes(childType)) return false;

      return true;
    },
  };
}

