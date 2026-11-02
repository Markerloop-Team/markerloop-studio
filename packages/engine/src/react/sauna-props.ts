import type { SaunaId, SaunaSchema } from "../schema/types";
import type { SaunaComponentCatalog } from "./catalog";
import type { SaunaContext, SaunaRegistry } from "./types";

export type SaunaProps = {
  id: SaunaId;
  /**
   * Optional. Falls back to `<SaunaProvider registry>` when omitted.
   * If neither is supplied, `<Sauna>` renders an error.
   */
  registry?: SaunaRegistry;
  catalog?: SaunaComponentCatalog;
  /**
   * Per-instance context override. Merges shallow-on-top of the
   * provider's context for this `<Sauna>` only.
   */
  context?: SaunaContext;
  /**
   * Per-instance context augmentation. Same shape as `context`, but
   * semantically a "patch" — merged on top of the resolved context for
   * this instance only.
   */
  extra?: Partial<SaunaContext>;
  schema?: SaunaSchema;
  endpoint?: (id: SaunaId) => string;
  editable?: boolean;
};
