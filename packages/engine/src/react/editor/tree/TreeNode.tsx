"use client";

import * as React from "react";

import type { SaunaNodeId, SaunaNodeConfig } from "../../../schema/types";
import { getChildren } from "../schema-ops";
import { useSaunaTreeContext } from "./context";
import { ChildrenList } from "./ChildrenList";
import { TreeNodeRow } from "./TreeNodeRow";

export function TreeNode({ id, depth }: { id: SaunaNodeId; depth: number }) {
  const {
    schema,
    selectedId,
    onSelect,
    onAddChild,
    canAddChild,
    onMove,
    onDuplicate,
    onDelete,
    collapsed,
    setCollapsed,
  } = useSaunaTreeContext();

  const node: SaunaNodeConfig | undefined = schema.nodes[id];
  if (!node) return null;

  const children = getChildren(schema, id);
  const isCollapsed = collapsed[id] === true;
  const isSelected = selectedId === id;
  const parentId = schema.parents[id];
  const isRoot = id === schema.rootId;

  const addCheck = canAddChild(id);
  const plusDisabled = !addCheck.ok;
  const plusTitle = plusDisabled ? addCheck.reason ?? "This component does not accept children" : "Add child";

  const siblings = parentId ? schema.nodes[parentId]?.children ?? [] : [];
  const indexInParent = parentId ? siblings.indexOf(id) : -1;
  const canMoveUp = Boolean(parentId && indexInParent > 0);
  const canMoveDown = Boolean(parentId && indexInParent >= 0 && indexInParent < siblings.length - 1);

  return (
    <div key={id} className={'???'}>
      <TreeNodeRow
        id={id}
        node={node}
        depth={depth}
        isSelected={isSelected}
        isRoot={isRoot}
        childrenCount={children.length}
        isCollapsed={isCollapsed}
        plusDisabled={plusDisabled}
        plusTitle={plusTitle}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onSelect={() => onSelect(id)}
        onToggleCollapse={() => {
          if (children.length === 0) return;
          setCollapsed((m) => ({ ...m, [id]: !m[id] }));
        }}
        onAddChild={() => {
          onSelect(id);
          onAddChild(id);
        }}
        onMove={(dir) => onMove(id, dir)}
        onDuplicate={() => onDuplicate(id)}
        onDelete={() => onDelete(id)}
      />

      {children.length > 0 && !isCollapsed ? (
        <ChildrenList
          parentId={id}
          childIds={children}
          depth={depth}
          renderChild={(childId, childDepth) => <TreeNode id={childId} depth={childDepth} />}
        />
      ) : null}
    </div>
  );
}

