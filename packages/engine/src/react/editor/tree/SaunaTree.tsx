"use client";

import * as React from "react";

import type { SaunaTreeProps } from "./types";
import type { DragState } from "./context";
import { SaunaTreeContextProvider } from "./context";
import { TreeNode } from "./TreeNode";

export type { SaunaTreeProps } from "./types";

export function SaunaTree(props: SaunaTreeProps) {
  const { schema } = props;

  const [drag, setDrag] = React.useState<DragState>(null);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onDoc = () => setMenuOpenId(null);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <SaunaTreeContextProvider
      value={{
        ...props,
        drag,
        setDrag,
        collapsed,
        setCollapsed,
        menuOpenId,
        setMenuOpenId,
      }}
    >
      <div style={{ background: "unset", backgroundColor: "unset" }}>
        <TreeNode id={schema.rootId} depth={0} />
      </div>
    </SaunaTreeContextProvider>
  );
}

