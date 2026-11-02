// The rules of the Group field (EP-175), free of React and the kit: the
// components API (no "use client") and the tests use them too.

/** The distinct groups of a set of Components, trimmed, by name (case-insensitive). */
export function saunaComponentGroups(rows: ReadonlyArray<{ group?: string | null }>): string[] {
  const byLower = new Map<string, string>();
  for (const row of rows) {
    const group = typeof row.group === "string" ? row.group.trim() : "";
    if (group && !byLower.has(group.toLowerCase())) byLower.set(group.toLowerCase(), group);
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

export type SaunaGroupOption =
  | { kind: "none" }
  | { kind: "group"; group: string }
  | { kind: "create"; group: string };

/**
 * What the open list offers for the text typed so far: «No group» while the
 * field is empty, the groups whose name holds the text, and — when the text
 * names no existing group — «Create group "text"». Pure, so a smoke and the
 * package tests execute the rule rather than restate it.
 */
export function saunaGroupOptions(groups: readonly string[], typed: string): SaunaGroupOption[] {
  const text = typed.trim();
  const lower = text.toLowerCase();
  const out: SaunaGroupOption[] = [];
  if (!text) out.push({ kind: "none" });
  for (const group of groups) {
    if (!text || group.toLowerCase().includes(lower)) out.push({ kind: "group", group });
  }
  if (text && !groups.some((group) => group.toLowerCase() === lower)) out.push({ kind: "create", group: text });
  return out;
}

