"use client";

import * as React from "react";

import type { SaunaNodeId } from "../../../schema/types";
import type { SaunaTreeProps } from "./types";

export type DragState =
  | null
  | {
      parentId: SaunaNodeId;
      index: number;
    };

export type SaunaTreeContextValue = SaunaTreeProps & {
  drag: DragState;
  setDrag: React.Dispatch<React.SetStateAction<DragState>>;

  collapsed: Record<string, boolean>;
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  menuOpenId: string | null;
  setMenuOpenId: React.Dispatch<React.SetStateAction<string | null>>;
};

const SaunaTreeContext = React.createContext<SaunaTreeContextValue | null>(null);

export function useSaunaTreeContext(): SaunaTreeContextValue {
  const ctx = React.useContext(SaunaTreeContext);
  if (!ctx) {
    throw new Error("useSaunaTreeContext must be used within SaunaTreeContext.Provider");
  }
  return ctx;
}

export function SaunaTreeContextProvider({
  value,
  children,
}: {
  value: SaunaTreeContextValue;
  children: React.ReactNode;
}) {
  return <SaunaTreeContext.Provider value={value}>{children}</SaunaTreeContext.Provider>;
}

