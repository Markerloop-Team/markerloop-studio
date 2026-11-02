import * as React from "react";

/**
 * The leave-guard of every autosaving editor (EP-186, pattern 6): while
 * `active` (an edit is not on the server yet), closing or reloading the tab
 * gets the browser's own «Leave site?» prompt. Links inside the app are the
 * editor's business — it flushes the save before it navigates.
 */
export function useBeforeUnloadGuard(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
