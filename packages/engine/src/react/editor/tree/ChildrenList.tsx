"use client";

import * as React from "react";

import type { SaunaNodeId } from "../../../schema/types";
import { useSaunaTreeContext } from "./context";

export function ChildrenList({
  parentId,
  childIds,
  depth,
  renderChild,
}: {
  parentId: SaunaNodeId;
  childIds: SaunaNodeId[];
  depth: number;
  renderChild: (childId: SaunaNodeId, depth: number) => React.ReactNode;
}) {
  const { drag, setDrag, onReorderWithinParent } = useSaunaTreeContext();

  return (
    <div>
      {childIds.map((childId, idx) => (
        <div
          key={childId}
          draggable
          onDragStart={() => setDrag({ parentId, index: idx })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!drag) return;
            if (drag.parentId !== parentId) return;
            onReorderWithinParent(parentId, drag.index, idx);
            setDrag(null);
          }}
        >
          <div
            aria-hidden
            style={{
              background: "var(--border)",
            }}
          />
          {renderChild(childId, depth + 1)}
        </div>
      ))}
    </div>
  );
}

