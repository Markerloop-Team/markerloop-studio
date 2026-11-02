"use client";

// Auto-save bridge between a Studio store and a SaunaProvider.
//
// Flow:
//   1. On mount, read the latest snapshot from the provider, store its
//      `version` and load the schema (unless one was already loaded).
//   2. Subscribe to store schema changes. On change, mark dirty, set a
//      debounce timer.
//   3. When the timer fires, PUT the schema with `ifMatch: lastVersion`.
//      On success store the new version and emit `saveSuccess`. On 412
//      surface a `SaunaConflictError` via `onConflict` and freeze the
//      auto-saver until the caller resolves the conflict (typically by
//      reloading from the provider).
//
// The hook owns no UI — it dispatches via callbacks. Callers wire toasts,
// status badges, etc. as they prefer.

import { useEffect, useRef, useState } from "react";

import {
  isSaunaConflictError,
  isSaunaNotFoundError,
  type SaunaConflictError,
} from "@markerloop/engine";
import type {
  SaunaProvider,
  SaunaPutResult,
  SaunaSnapshot,
  SaunaVersion,
} from "@markerloop/engine";
import type { SaunaId, SaunaSchema } from "@markerloop/engine";
import type { StudioStore } from "./store";

export type AutoSaveStatus =
  | "idle"
  | "loading"
  | "ready"
  | "dirty"
  | "saving"
  | "conflict"
  | "error";

export type UseStudioAutoSaveOptions = {
  store: StudioStore;
  provider: SaunaProvider;
  id: SaunaId;
  /** Debounce window for batched edits. Default 800 ms. */
  debounceMs?: number;
  /**
   * If true, auto-loads the schema from the provider on mount and
   * pushes it into the store. Default false — caller already supplied
   * `initialSchema`.
   *
   * When false, the hook uses the store's current schema and waits for
   * the *first* successful PUT to learn a `version`. Until then, saves
   * are unconditional (no `ifMatch`) so a fresh document can be created.
   */
  autoLoad?: boolean;
  /**
   * If non-null, replaces the version known to the auto-saver. Use
   * after a manual reload (e.g. on conflict) to re-arm.
   */
  externalVersion?: SaunaVersion | null;
  onSaveStart?: () => void;
  onSaveSuccess?: (result: SaunaPutResult) => void;
  onSaveError?: (error: Error) => void;
  /**
   * Fires when the provider returns 412 (or the stored version
   * mismatched). The auto-saver freezes until `externalVersion` is
   * updated or the store schema changes again *after* a successful
   * `loadSchema`.
   */
  onConflict?: (error: SaunaConflictError) => void;
  onLoadStart?: () => void;
  onLoaded?: (snapshot: SaunaSnapshot) => void;
  onLoadError?: (error: Error) => void;
};

export type UseStudioAutoSaveResult = {
  status: AutoSaveStatus;
  /** Last known committed version. */
  version: SaunaVersion | null;
  /** Last error (save or load). Cleared on successful save. */
  error: Error | null;
  /** Force a save now, ignoring the debounce window. */
  saveNow: () => Promise<void>;
  /** Reload from the provider, replacing the store schema + version. */
  reload: () => Promise<void>;
};

export function useStudioAutoSave(
  opts: UseStudioAutoSaveOptions
): UseStudioAutoSaveResult {
  const {
    store,
    provider,
    id,
    debounceMs = 800,
    autoLoad = false,
    externalVersion,
  } = opts;

  const [status, setStatus] = useState<AutoSaveStatus>(autoLoad ? "loading" : "ready");
  const [version, setVersion] = useState<SaunaVersion | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs for the most recent values seen by the timer callback.
  const versionRef = useRef<SaunaVersion | null>(null);
  const conflictedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Set to true while we're applying a server-fetched snapshot to the
  // store (initial autoLoad, explicit reload(), externalVersion swap).
  // The store-subscribe listener checks this flag and skips marking
  // dirty when set — without it, every load round-trips back to the
  // server as an indistinguishable "edit", creating a spurious
  // revision per page refresh.
  const loadingFromServerRef = useRef(false);

  // Allow caller to inject a new version (e.g. after manual conflict resolution).
  useEffect(() => {
    if (externalVersion !== undefined) {
      versionRef.current = externalVersion;
      setVersion(externalVersion);
      conflictedRef.current = false;
      setStatus("ready");
    }
  }, [externalVersion]);

  // Initial load.
  useEffect(() => {
    if (!autoLoad) return;
    let cancelled = false;
    const cb = optsRef.current;
    setStatus("loading");
    cb.onLoadStart?.();
    provider
      .get(id)
      .then((snap) => {
        if (cancelled) return;
        // Apply the server snapshot to the store, but flag the
        // subscriber not to mark dirty: this is a read, not an edit.
        // The flag is cleared on the next microtask once Zustand
        // has finished notifying subscribers synchronously.
        loadingFromServerRef.current = true;
        try {
          store.getState().loadSchema(snap.schema);
        } finally {
          loadingFromServerRef.current = false;
        }
        versionRef.current = snap.version;
        setVersion(snap.version);
        setError(null);
        setStatus("ready");
        cb.onLoaded?.(snap);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e instanceof Error ? e : new Error(String(e));
        // Name-based guard, never instanceof (hard rule 5): the provider
        // contract marks errors BY NAME — a plain Error carrying
        // `name: "SaunaNotFoundError"` is a legal throw, and class identity
        // splits across the CJS+ESM dual build anyway.
        if (isSaunaNotFoundError(e)) {
          // Fresh document — keep current schema, leave version null.
          setStatus("ready");
          return;
        }
        setError(err);
        setStatus("error");
        cb.onLoadError?.(err);
      });
    return () => {
      cancelled = true;
    };
  }, [autoLoad, id, provider, store]);

  // Debounced save loop.
  useEffect(() => {
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.schema === prev.schema) return;
      if (conflictedRef.current) return;
      // Server snapshot replay — not a user edit. Skip dirty/PUT
      // round-trip; otherwise every page refresh creates a no-op
      // revision and bumps the page version for nothing.
      if (loadingFromServerRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus((s) => (s === "saving" ? s : "dirty"));
      timerRef.current = setTimeout(() => {
        runSave(store.getState().schema);
      }, debounceMs);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // runSave is a stable closure inside this effect via refs; we only
    // need to re-bind when the debounce window or store changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, debounceMs]);

  async function runSave(schema: SaunaSchema): Promise<void> {
    if (inflightRef.current) return; // Save in flight — let it finish; subsequent edit will re-arm.
    inflightRef.current = true;
    const cb = optsRef.current;
    setStatus("saving");
    cb.onSaveStart?.();
    try {
      const result = await provider.put(id, schema, {
        ifMatch: versionRef.current ?? undefined,
      });
      versionRef.current = result.version;
      setVersion(result.version);
      setError(null);
      // If the store changed during the save, the subscriber fired and
      // a new timer is queued. Status returns to "ready" briefly before
      // the next "dirty"/"saving" cycle.
      setStatus("ready");
      cb.onSaveSuccess?.(result);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      // Name-based guard, never instanceof (hard rule 5): the inline
      // provider in schema-editor.tsx throws a plain Error with
      // `name: "SaunaConflictError"`, which `instanceof` misses — the 412
      // then landed in the generic error branch and the conflict freeze
      // never engaged (SDL-210).
      if (isSaunaConflictError(e)) {
        conflictedRef.current = true;
        setStatus("conflict");
        setError(err);
        cb.onConflict?.(e);
        return;
      }
      setStatus("error");
      setError(err);
      cb.onSaveError?.(err);
    } finally {
      inflightRef.current = false;
    }
  }

  async function saveNow(): Promise<void> {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await runSave(store.getState().schema);
  }

  async function reload(): Promise<void> {
    const cb = optsRef.current;
    setStatus("loading");
    cb.onLoadStart?.();
    try {
      const snap = await provider.get(id);
      // Same flag-and-clear dance as the initial load: the subscriber
      // would otherwise see the new schema reference and PUT it back
      // up — creating an empty revision on every reload (e.g. after
      // restore, after page refresh).
      loadingFromServerRef.current = true;
      try {
        store.getState().loadSchema(snap.schema);
      } finally {
        loadingFromServerRef.current = false;
      }
      versionRef.current = snap.version;
      setVersion(snap.version);
      setError(null);
      conflictedRef.current = false;
      setStatus("ready");
      cb.onLoaded?.(snap);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus("error");
      cb.onLoadError?.(err);
    }
  }

  return { status, version, error, saveNow, reload };
}
