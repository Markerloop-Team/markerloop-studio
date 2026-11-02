"use client";

// The Blocks tab of the pages section (SDL-721, EP-145): the workspace's
// Blocks with how many places use each, where one is used, and delete with a
// reference check. pages-service refuses to delete a Block that is still
// referenced (409 `block_in_use` with the places); the person sees them and
// may delete anyway (`force=true`), after which the refs draw "missing".

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  pagesApi,
  pagesBlockInUse,
  pagesConflictBlock,
  type PagesBlock,
  pagesHttpStatus,
  type PagesBlockUsage,
} from "@/shared/lib/api/pages-client";
import { isGatewayRouteMissing } from "@/shared/lib/api/client";
import { pagesBlockKeys, pagesComponentKeys } from "./components";

export type {
  PagesBlock,
  PagesBlockDetail,
  PagesBlockUsage,
  PagesBlockUsagePage,
  PagesBlockUsageBlock,
} from "@/shared/lib/api/pages-client";
export { pagesBlockInUse, pagesBlockUsageOf, pagesConflictBlock } from "@/shared/lib/api/pages-client";

// Usage changes elsewhere (a Ref inserted or removed on a page, an address
// deleted, a Component saved), so the tab never trusts a cached answer on
// mount: the global staleTime of 5 minutes would show a stale count.

export function useBlocks(workspaceId: string | null) {
  return useQuery({
    queryKey: pagesBlockKeys.list(workspaceId ?? ""),
    queryFn: () => pagesApi.listBlocks(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/** One Block with its usage — for "Where used". */
export function useBlockDetail(workspaceId: string | null, blockId: string | null) {
  return useQuery({
    queryKey: pagesBlockKeys.detail(workspaceId ?? "", blockId ?? ""),
    queryFn: () => pagesApi.getBlock(workspaceId!, blockId!),
    enabled: !!workspaceId && !!blockId,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export type DeleteBlockArgs = { workspaceId: string; blockId: string; force?: boolean };

export type DeleteBlockResult = { deleted: true } | { deleted: false; usage: PagesBlockUsage };

/**
 * DELETE of a Block. A 409 `block_in_use` is not an error for the caller but
 * an answer: the places that still use the Block, for the dialog to list
 * before the person decides on `force`. pages-service's own 404 is success
 * (the Block is gone, which was asked); the gateway's 404 is not.
 */
export async function deleteBlock(args: DeleteBlockArgs): Promise<DeleteBlockResult> {
  try {
    await pagesApi.deleteBlock(args.workspaceId, args.blockId, args.force === true);
    return { deleted: true };
  } catch (error) {
    const usage = pagesBlockInUse(error);
    if (usage && args.force !== true) return { deleted: false, usage };
    if (pagesHttpStatus(error) === 404 && !isGatewayRouteMissing(error)) return { deleted: true };
    throw error;
  }
}

export function useDeleteBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBlock,
    onSuccess: (result, args) => {
      if (!result.deleted) {
        // The 409 is the freshest answer about this Block: the list's counter
        // and "Where used" are read again to match it.
        void qc.invalidateQueries({ queryKey: pagesBlockKeys.all(args.workspaceId) });
        return;
      }
      qc.removeQueries({ queryKey: pagesBlockKeys.detail(args.workspaceId, args.blockId) });
      qc.removeQueries({ queryKey: pagesComponentKeys.schema(args.workspaceId, args.blockId) });
      void qc.invalidateQueries({ queryKey: pagesBlockKeys.list(args.workspaceId) });
      void qc.invalidateQueries({ queryKey: pagesComponentKeys.list(args.workspaceId) });
    },
  });
}

export type UpdateBlockMetaArgs = {
  workspaceId: string;
  blockId: string;
  /** The version the caller holds (the list row's). */
  version: number;
  patch: { name?: string; group?: string | null };
};

/**
 * Rename or move a Component to a group (EP-175). A 409
 * `block_version_conflict` means the Component was saved meanwhile (its body,
 * usually): the PATCH carries only the name / group, so it is repeated ONCE
 * under the version the 409 returns — it overwrites nothing of that save.
 */
export async function updateBlockMeta(args: UpdateBlockMetaArgs): Promise<PagesBlock> {
  try {
    return await pagesApi.updateBlockMeta(args.workspaceId, args.blockId, args.patch, args.version);
  } catch (error) {
    const current = pagesConflictBlock(error);
    if (!current || typeof current.version !== "number") throw error;
    return pagesApi.updateBlockMeta(args.workspaceId, args.blockId, args.patch, current.version);
  }
}

export function useUpdateBlockMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateBlockMeta,
    onSuccess: (_updated, args) => {
      void qc.invalidateQueries({ queryKey: pagesBlockKeys.all(args.workspaceId) });
      void qc.invalidateQueries({ queryKey: pagesComponentKeys.list(args.workspaceId) });
    },
  });
}

/** «Name copy», «Name copy 2», … — the first free one among the names given. */
export function duplicateName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  const base = `${name.trim()} copy`;
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const next = `${base} ${n}`;
    if (!used.has(next.toLowerCase())) return next;
  }
}
