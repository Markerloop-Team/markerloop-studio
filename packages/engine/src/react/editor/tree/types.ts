"use client";

import type { SaunaNodeId, SaunaSchema } from "../../../schema/types";

export type SaunaTreeProps = {
  schema: SaunaSchema;
  selectedId: SaunaNodeId | null;
  onSelect: (id: SaunaNodeId) => void;

  onReorderWithinParent: (parentId: SaunaNodeId, fromIndex: number, toIndex: number) => void;

  onAddChild: (parentId: SaunaNodeId) => void;
  canAddChild: (parentId: SaunaNodeId) => { ok: boolean; reason?: string };

  onDuplicate: (nodeId: SaunaNodeId) => void;
  onDelete: (nodeId: SaunaNodeId) => void;
  onMove: (nodeId: SaunaNodeId, dir: "up" | "down") => void;
};

