"use client";

// The workspace a collections screen is working in (SDL-621).
//
// Since the workspace IS the scope, a field renderer deep inside a record
// form (the relation picker) needs it to list sibling collections — but
// the field-type registry hands a renderer only the field, the value and
// an onChange. The collections page publishes the workspace here instead,
// the same way it publishes the file scope, together with whether it is
// still being resolved — so a consumer shows "loading" rather than "no
// target" during the lookup. Outside a provider the workspace is null,
// nothing is resolving, and consumers degrade (the picker shows its
// "missing target" state).

import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface CurrentWorkspace {
  workspaceId: string | null;
  /** True while the host is still finding out which workspace it is. */
  isResolving: boolean;
}

const CurrentWorkspaceContext = createContext<CurrentWorkspace>({
  workspaceId: null,
  isResolving: false,
});

export function CurrentWorkspaceProvider({
  workspaceId,
  isResolving,
  children,
}: CurrentWorkspace & { children: ReactNode }): ReactNode {
  const value = useMemo<CurrentWorkspace>(
    () => ({ workspaceId, isResolving }),
    [workspaceId, isResolving]
  );
  return (
    <CurrentWorkspaceContext.Provider value={value}>
      {children}
    </CurrentWorkspaceContext.Provider>
  );
}

export function useCurrentWorkspace(): CurrentWorkspace {
  return useContext(CurrentWorkspaceContext);
}
