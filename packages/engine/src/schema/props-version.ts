// The props-schema version of a node (EP-128, SDL-639).
//
// A document node names its Element (`type`) and, optionally, the version of
// that Element's props contract its `props` were written against. The field
// is optional so that every document stored before it existed keeps reading
// as it did: no migration rewrites nodes to say `1`, and none is to be
// added — "absent means 1" IS the compatibility rule.
//
// Server-safe, no zod: the same rule is meant to be read by pages-service.

import type { SaunaNodeConfig } from "./types";

/** The version an Element's props contract starts at, and what an absent `propsVersion` means. */
export const SAUNA_DEFAULT_PROPS_VERSION = 1;

/**
 * The props-schema version a node was written against. An absent field is
 * version 1. A present field is returned as it is — `validateSaunaSchema`
 * has already refused anything that is not an integer >= 1, so a value
 * read off a validated document is always meaningful.
 */
export function saunaNodePropsVersion(node: Pick<SaunaNodeConfig, "propsVersion">): number {
  return node.propsVersion ?? SAUNA_DEFAULT_PROPS_VERSION;
}
