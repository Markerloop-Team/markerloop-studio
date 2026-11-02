"use client";

import * as React from "react";

import type { SaunaNodeConfig, SaunaNodeId } from "../../../schema/types";
import { NodeActionsMenu } from "./NodeActionsMenu";
import { TreeIcon } from "./TreeIcon";

export function TreeNodeRow({
  id,
  node,
  isSelected,
  isRoot,
  childrenCount,
  isCollapsed,
  plusDisabled,
  plusTitle,
  canMoveUp,
  canMoveDown,
  onSelect,
  onToggleCollapse,
  onAddChild,
  onMove,
  onDuplicate,
  onDelete,
    depth
}: {
  id: SaunaNodeId;
  node: SaunaNodeConfig;
  isSelected: boolean;
  isRoot: boolean;
  childrenCount: number;
  depth: number;
  isCollapsed: boolean;
  plusDisabled: boolean;
  plusTitle: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
  onAddChild: () => void;
  onMove: (dir: "up" | "down") => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const hasChildren = childrenCount > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 12 * (depth + 1), paddingRight: 12,             borderLeft: "1px solid var(--border)",
      background: isSelected ? "var(--muted)" : "transparent",
    }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
        title={hasChildren ? (isCollapsed ? "Expand" : "Collapse") : "No children"}
        aria-label="Toggle children"
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: hasChildren ? "var(--background)" : "var(--muted)",
          cursor: hasChildren ? "pointer" : "default",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hasChildren ? 1 : 0.45,
          color: "var(--muted-foreground)",
          flex: "0 0 auto",
          transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
          transition: "transform 120ms ease",
        }}
      >
        <TreeIcon name="chevron" size={14} />
      </button>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          width: 327,
          padding: "6px 8px",
          marginLeft: 10,
          marginTop: 0,
          cursor: "pointer",
          borderRadius: 10,
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          border: "none",
        }}
        onClick={onSelect}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <strong>{node.type}</strong> <span style={{ opacity: 0.55 }}>{id.slice(0, 8)}</span>
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
          <span title={plusTitle} style={{ display: "inline-flex" }}>
            <button
              type="button"
              disabled={plusDisabled}
              onClick={(e) => {
                e.stopPropagation();
                onAddChild();
              }}
              aria-label="Add child"
              style={{
                width: 28,
                height: 28,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                cursor: plusDisabled ? "not-allowed" : "pointer",
                opacity: plusDisabled ? 0.4 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TreeIcon name="plus" size={14} />
            </button>
          </span>

          <NodeActionsMenu
            id={id}
            node={node}
            isRoot={isRoot}
            plusDisabled={plusDisabled}
            plusTitle={plusTitle}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onAddChild={onAddChild}
            onMove={onMove}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        </span>
      </div>
    </div>
  );
}

