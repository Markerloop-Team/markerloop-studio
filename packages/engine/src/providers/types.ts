import type { SaunaId, SaunaSchema } from "../schema/types";

/**
 * Opaque token identifying a particular committed version of a schema.
 * Concrete providers pick the encoding:
 *   - LocalFile  → `mtime:<modifiedMs>`
 *   - HTTP       → the response's `ETag` header (server-defined string)
 *
 * Treat as a black box. Compare with `===`. Never parse.
 */
export type SaunaVersion = string;

/**
 * Schema + the version that was current when it was read. The Studio
 * passes `version` back as `ifMatch` on its next save to detect
 * concurrent writes.
 */
export type SaunaSnapshot = {
  schema: SaunaSchema;
  version: SaunaVersion;
};

export type SaunaPutOptions = {
  /**
   * Optimistic concurrency. When supplied, the put fails with
   * `SaunaConflictError` if the stored version differs. Omit for
   * unconditional writes (initial save, force-overwrite).
   */
  ifMatch?: SaunaVersion;
};

export type SaunaPutResult = {
  version: SaunaVersion;
};

export type SaunaProvider = {
  get(id: SaunaId): Promise<SaunaSnapshot>;
  put(
    id: SaunaId,
    schema: SaunaSchema,
    options?: SaunaPutOptions
  ): Promise<SaunaPutResult>;
};
