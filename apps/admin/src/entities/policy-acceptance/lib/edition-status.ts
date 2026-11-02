/**
 * Where an accepted edition stands against the contour's edition in force
 * (SDL-752). One rule for the journal, a person's history and the «Rules
 * edition» column in Users. An edition in force that is unknown — no provider
 * (null) or a contour with no section in force (the empty string, as in
 * `needsPolicyAcceptance`) — draws neither «Current» nor «Outdated», never a
 * guess.
 */
export type EditionStatus = "none" | "current" | "outdated" | "unknown";

/** The contour's edition in force, or null when it is unknown ("" included). */
export function editionInForce(
  version: string | null | undefined
): string | null {
  return version || null;
}

export function editionStatus(
  accepted: string | null | undefined,
  inForce: string | null | undefined
): EditionStatus {
  if (!accepted) return "none";
  const current = editionInForce(inForce);
  if (current === null) return "unknown";
  return accepted === current ? "current" : "outdated";
}
