// Keys of packages/policy/strings.json the admin reads (SDL-666). A plain
// module: the server resolver and the client provider both import it, and a
// constant exported from a "use client" file would reach the server as a
// client reference, not as the array.

/**
 * key → the sentence in force on this contour, or null when it is not.
 * A string with `translations` in strings.json also has `key@<locale>` for
 * every admin locale other than ru (SDL-743); usePolicyString picks it.
 */
export type PolicyStrings = Readonly<Record<string, string | null>>;

export const POLICY_STRING_KEYS = [
  "workspace_delete_consequence",
  "workspace_delete_forever",
  "item_delete_consequence",
  "account_delete_consequence",
  "limit_write_refused",
] as const;

export type PolicyStringKey = (typeof POLICY_STRING_KEYS)[number];
