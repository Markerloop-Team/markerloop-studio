// Per-visitor state of the mock backend. Every sign-in mints a session id
// that travels inside the (unsigned, demo-only) JWTs; each session gets its
// own deep copy of the seed, so one visitor's edits never show up for
// another. State lives in this process's memory: capped, expired after a few
// idle hours, and gone on restart — exactly what a public demo wants.

import { createSeedState, type DemoState } from "./seed";
import { renderArt } from "./art";

const MAX_SESSIONS = 500;
const IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_UPLOADS_PER_SESSION = 40;

type Entry = { state: DemoState; touched: number };

type Registry = {
  sessions: Map<string, Entry>;
  /** File id → session that owns an uploaded (non-seed) file. */
  uploads: Map<string, string>;
  seedTemplate: DemoState | null;
};

// One registry per server process, shared by every route-handler bundle.
const g = globalThis as unknown as { __mlDemoRegistry?: Registry };
const registry: Registry = (g.__mlDemoRegistry ??= { sessions: new Map(), uploads: new Map(), seedTemplate: null });

function template(): DemoState {
  if (!registry.seedTemplate) {
    const seed = createSeedState();
    for (const f of seed.files) {
      if (f.art) f.size_bytes = new TextEncoder().encode(renderArt(f.art)).byteLength;
    }
    registry.seedTemplate = seed;
  }
  return registry.seedTemplate;
}

function sweep(now: number): void {
  for (const [sid, entry] of registry.sessions) {
    if (now - entry.touched > IDLE_TTL_MS) dropSession(sid);
  }
  while (registry.sessions.size > MAX_SESSIONS) {
    const oldest = registry.sessions.keys().next().value;
    if (oldest === undefined) break;
    dropSession(oldest);
  }
}

function dropSession(sid: string): void {
  registry.sessions.delete(sid);
  for (const [fileId, owner] of registry.uploads) if (owner === sid) registry.uploads.delete(fileId);
}

/** The session's state, seeded on first touch (also after a server restart). */
export function stateFor(sid: string): DemoState {
  const now = Date.now();
  let entry = registry.sessions.get(sid);
  if (!entry) {
    sweep(now);
    entry = { state: structuredClone(template()), touched: now };
    registry.sessions.set(sid, entry);
  } else {
    entry.touched = now;
    // Re-insert to keep Map order = least recently used first.
    registry.sessions.delete(sid);
    registry.sessions.set(sid, entry);
  }
  return entry.state;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------- uploads */

export function registerUpload(sid: string, fileId: string): boolean {
  let count = 0;
  for (const owner of registry.uploads.values()) if (owner === sid) count += 1;
  if (count >= MAX_UPLOADS_PER_SESSION) return false;
  registry.uploads.set(fileId, sid);
  return true;
}

export function uploadOwner(fileId: string): string | undefined {
  return registry.uploads.get(fileId);
}

export { MAX_UPLOAD_BYTES };

/** The pristine seed, read-only (anonymous reads of the data plane). */
export function seedSnapshot(): DemoState {
  return template();
}

/** A seeded file's artwork by id — the same for every session. */
export function seedArtFor(fileId: string): string | null {
  const file = template().files.find((f) => f.id === fileId);
  return file?.art ? renderArt(file.art) : null;
}

/** Look a file up in the owning session without touching its idle clock. */
export function peekSessionFile(sid: string, fileId: string) {
  return registry.sessions.get(sid)?.state.files.find((f) => f.id === fileId) ?? null;
}
