"use client";

import * as React from "react";

import type { SaunaNodeConfig, SaunaNodeId } from "../../../schema/types";
import { useSaunaTreeContext } from "./context";
import { TreeIcon } from "./TreeIcon";
import { TreeMenuItem } from "./TreeMenuItem";

export function NodeActionsMenu({
  id,
  node,
  isRoot,
  plusDisabled,
  plusTitle,
  canMoveUp,
  canMoveDown,
  onAddChild,
  onMove,
  onDuplicate,
  onDelete,
}: {
  id: SaunaNodeId;
  node: SaunaNodeConfig;
  isRoot: boolean;
  plusDisabled: boolean;
  plusTitle: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAddChild: () => void;
  onMove: (dir: "up" | "down") => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { menuOpenId, setMenuOpenId } = useSaunaTreeContext();

  return (
    <div style={{ position: "relative" }} onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpenId((cur) => (cur === id ? null : id));
        }}
        aria-label="Node actions"
        title="Actions"
        style={{
          width: 28,
          height: 28,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--background)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-foreground)",
        }}
      >
        <TreeIcon name="dots" size={16} />
      </button>

      {menuOpenId === id ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 32,
            zIndex: 50,
            width: 220,
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 14px 40px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          <TreeMenuItem
            icon="plus"
            label="Add child…"
            disabled={plusDisabled}
            onClick={() => {
              onAddChild();
              setMenuOpenId(null);
            }}
          />
          <div style={{ height: 1, background: "var(--border)" }} />
          <TreeMenuItem
            icon="arrowUp"
            label="Move up"
            disabled={!canMoveUp}
            onClick={() => {
              onMove("up");
              setMenuOpenId(null);
            }}
          />
          <TreeMenuItem
            icon="arrowDown"
            label="Move down"
            disabled={!canMoveDown}
            onClick={() => {
              onMove("down");
              setMenuOpenId(null);
            }}
          />
          <div style={{ height: 1, background: "var(--border)" }} />
          <TreeMenuItem
            icon="copy"
            label="Copy id"
            onClick={async () => {
              await navigator.clipboard.writeText(String(id));
              setMenuOpenId(null);
            }}
          />
          <TreeMenuItem
            icon="copy"
            label="Copy JSON"
            onClick={async () => {
              await navigator.clipboard.writeText(JSON.stringify(node, null, 2));
              setMenuOpenId(null);
            }}
          />
          <div style={{ height: 1, background: "var(--border)" }} />
          <TreeMenuItem
            icon="duplicate"
            label="Duplicate"
            disabled={isRoot}
            onClick={() => {
              onDuplicate();
              setMenuOpenId(null);
            }}
          />
          <TreeMenuItem
            icon="trash"
            label="Delete"
            disabled={isRoot}
            danger
            onClick={() => {
              onDelete();
              setMenuOpenId(null);
            }}
          />
          {plusDisabled ? (
            <div
              style={{
                padding: "8px 10px",
                fontSize: 12,
                opacity: 0.55,
                fontFamily: "ui-sans-serif, system-ui",
              }}
            >
              {plusTitle}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

