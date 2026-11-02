// The address of a new workspace, <slug>.markerloop.com (SDL-759).
//
// The client only SUGGESTS an address from the name and never decides whether
// it is acceptable: GET /v1/workspaces/name-check answers that (invalid,
// reserved, taken, available — collections-service SDL-758), and the POST
// re-checks it. The suggestion is a plain transliteration, so "Кофейня Арман"
// becomes "kofeynya-arman" instead of an empty field.

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Kazakh letters on top of the Russian alphabet.
  ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** The longest DNS label. */
export const SLUG_MAX_LENGTH = 63;

/** A suggested address for `name`: lower-case latin, digits and single hyphens. */
export function slugFromName(name: string): string {
  const latin = Array.from(name.toLowerCase())
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  return latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
}

/**
 * What a person types into the address field, kept to the characters an
 * address can hold. Hyphens at the ends stay while typing ("my-") — the
 * check, not this, says whether the result is valid.
 */
export function normalizeSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}
