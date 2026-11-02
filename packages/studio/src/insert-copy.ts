// Wording of the Insert modal (SDL-339, board «FinalInsertModal»).
//
// Same reasoning as `node-delete-copy.ts`: the sentences the author reads are
// built from the schema, not written at the call site, so the plurals and the
// "where does this land" phrasing can be pinned by unit tests instead of being
// eyeballed inside a 2000-line component.
//
// The interface speaks English since EP-86 (owner's decision, 28 Aug 2026);
// the comments in this file stay in the language the team writes them in. The
// board's three sentences now read:
//
//   «Insert component into Хиро (Section) · after Text»
//   «6 matches»
//   «ToggleGroup · Not allowed in Section»
//
// Node names («Хиро») are the AUTHOR's content and stay whatever they typed —
// only the frame around them is translated.

/**
 * Plural for a count of search matches: 1 match, anything else matches.
 *
 * This used to be the three-form Russian rule with the 11–14 exception that
 * catches every naive implementation. English degenerates it to a singular of
 * exactly one, so 11 and 111 are plain plurals — and so is 21, which is the
 * half of the old rule that did NOT survive the translation: Russian sent 21
 * back to the singular, English does not.
 */
export function saunaMatchesPhrase(count: number): string {
  return count === 1 ? `${count} match` : `${count} matches`;
}

/**
 * The heading — what the dialog IS. Constant on purpose: the part that
 * changes with the click is the address below, and the board separates the
 * two (SDL-370).
 */
export const SAUNA_INSERT_HEADING = "Insert component";

/**
 * The address alone — «into Хиро (Section) · after Text». The board draws it
 * as a SEPARATE, muted element next to the heading rather than as the tail of
 * one bold sentence: the heading says what the dialog is, the address says
 * where the click lands, and those are two different questions.
 */
export function saunaInsertAddress(args: {
  /** What the author called the node… */
  targetName: string;
  /** …and what the rules run on (SDL-302). */
  targetType: string;
  /** Display name of the target's last child — `addChild` appends, so the
   * fresh node follows it. Absent → «at the top». */
  after?: string;
}): string {
  // SDL-631: the SDL-594 canvas wording (`insertAddress`). The generic word
  // «block» keeps an author-made name in the nominative whatever it is —
  // «Into the “Хиро” block (Section) · after “Text”»; an unnamed node has
  // nothing to disambiguate and reads «Into a Section block».
  const where =
    args.targetName && args.targetName !== args.targetType
      ? `the “${args.targetName}” block (${args.targetType})`
      : `a ${args.targetType} block`;
  const position = args.after ? `after “${args.after}”` : "at the top";
  return `Into ${where} · ${position}`;
}

/**
 * Both halves as one sentence. The modal renders them apart (SDL-370), but
 * a host that overrides the heading passes a single string, and so does any
 * caller that needs the dialog described in one line.
 */
export function saunaInsertTitle(args: {
  targetName: string;
  targetType: string;
  after?: string;
}): string {
  return `${SAUNA_INSERT_HEADING} ${saunaInsertAddress(args)}`;
}

/**
 * Why a card is dimmed rather than gone (board: «ToggleGroup · Not allowed in
 * Section»). The card carries its own name, so the reason only has to carry
 * the place.
 *
 * It names the TYPE, not the author's name for the node, and that is the
 * board's choice as well as the honest one: `allowedParents` is a rule about
 * types, so «Not allowed in Section» stays true if the author renames the
 * node to «Хиро», while «Not allowed in Хиро» would read as a fact about
 * this one node.
 */
export function saunaInsertBlockedReason(targetType: string): string {
  return `Not allowed in ${targetType}`;
}

/**
 * The parent-side refusal (SDL-352): the card's block is fine, the TARGET
 * declares it takes only its own parts — «ToggleGroup accepts only
 * ToggleGroupItem». Named types again, same reasoning as above: the list
 * is `allowedChildren`, a rule about types, and renaming the node must
 * not change the sentence.
 *
 * An empty list falls back to the child-side wording — a target that
 * names no children should never reach this function, but a sentence
 * ending in «accepts only» and nothing would be worse than the
 * generic one.
 */
export function saunaParentAcceptsOnly(
  targetType: string,
  allowedChildren: readonly string[]
): string {
  if (allowedChildren.length === 0) return saunaInsertBlockedReason(targetType);
  return `${targetType} accepts only ${allowedChildren.join(", ")}`;
}

/**
 * Why the store refused to put a node somewhere (SDL-634), returned by
 * `applyOp` for its caller to show. The store holds the rule as a predicate,
 * not the catalog, so it cannot tell which side refused — and a sentence
 * naming both types is true either way.
 */
export function saunaInsertRefusedReason(childType: string, parentType: string): string {
  return `${childType} is not allowed in ${parentType}`;
}

/**
 * Label of the footer's action — the SDL-594 canvas's `insertActionLabel`:
 * «Insert “Button”», «Insert “Pricing card” as a whole» for a build that goes
 * in as one node, «Insert block» when nothing is active.
 */
export function saunaInsertActionLabel(
  blockName: string | undefined,
  compound = false
): string {
  if (!blockName) return "Insert block";
  return compound ? `Insert “${blockName}” as a whole` : `Insert “${blockName}”`;
}

/* ---- «Свои компоненты» (SDL-340) ------------------------------- */

/**
 * The empty state. It is a POINTER, not an apology: an author who has
 * never saved a component needs to know where components come from,
 * and both routes to one live on `/studio/components` (the editor) and
 * in the row menu («Save as component», SDL-341).
 */
export const SAUNA_INSERT_OWN_EMPTY =
  "No components of your own yet. Build one in the component editor, or save a page node with «Save as component» in the row menu.";

/** Link text of the empty state's way out. */
export const SAUNA_INSERT_OWN_EMPTY_LINK = "Open the component editor";

/** While a source is still being read and nothing has arrived yet. */
export const SAUNA_INSERT_LOADING = "Reading the catalog…";

/**
 * Why a component of the author's own is dimmed. Unlike the kit's
 * «Not allowed in Section» this is never about the place — a `Ref` is a
 * plain node and fits anywhere the schema allows — it is about
 * IDENTITY: the component being edited cannot stand inside itself,
 * directly or through a chain of other components.
 *
 * The two shapes are separated because the direct case is the one an
 * author hits by accident and the chain is the one they will not
 * believe without being told there is a chain.
 */
export function saunaComponentCycleReason(args: {
  componentName: string;
  hostName: string;
}): string {
  return args.componentName === args.hostName
    ? "A component cannot contain itself"
    : `«${args.componentName}» already contains «${args.hostName}» — that would be a loop`;
}

/**
 * Why a component of the author's own is dimmed for depth (SDL-723): the
 * insertion would nest Components deeper than `component_max_depth`. The
 * number is the limit from limits.json, passed in — never a literal here.
 */
export function saunaComponentDepthReason(args: { componentName: string; limit: number }): string {
  return `Components nest at most ${args.limit} deep — «${args.componentName}» would go past that`;
}

/* ---- Автофильтр доступного (SDL-370) --------------------------- */

/**
 * По умолчанию модалка показывает ТОЛЬКО то, что действительно ложится в
 * текущую цель (решение владельца 23 Aug 2026). Погашенные карточки с
 * причиной никуда не делись — они уехали под разворачивающийся счётчик,
 * потому что причина нужна тому, кто её ищет, а не всем подряд.
 *
 * Раньше здесь были русские числительные (1 скрыт, 2–4 скрыты, 5+ скрыто) —
 * после перевода интерфейса (EP-86) слово «hidden» одно на все числа, и
 * склонять больше нечего. Поэтому функция, а не константа с подстановкой:
 * счётчик остаётся частью фразы, и точка вызова не собирает её сама.
 */
export function saunaHiddenPhrase(count: number): string {
  return `${count} hidden — show`;
}

/** Обратный ход того же переключателя. */
export const SAUNA_INSERT_HIDE_BLOCKED = "Hide unavailable";

/**
 * Пусто ПОТОМУ ЧТО фильтр, а не потому что ничего не нашлось. Разница
 * важная: «Nothing matches» над счётчиком «6 hidden» — половина правды, и
 * автор ищет опечатку в запросе вместо того, чтобы развернуть список.
 */
export const SAUNA_INSERT_ALL_FILTERED =
  "Nothing found here can be inserted — expand the hidden ones to see why.";

/**
 * Keyboard hint in the footer — the SDL-594 canvas's line, verbatim (SDL-631).
 * Arrows still move the active card and a click still inserts (SDL-201); the
 * canvas names the two keys the footer's button stands for.
 */
export const SAUNA_INSERT_KEY_HINT = "Enter to insert, Esc to close";

/* ---- Панель на иконках (SDL-631, канвас SDL-594) ---------------- */

export const SAUNA_INSERT_SEARCH_PLACEHOLDER = "Search catalog";
export const SAUNA_INSERT_SOURCES_LABEL = "Sources";
export const SAUNA_INSERT_GROUP_ALL = "All";
export const SAUNA_INSERT_SOURCE_KIT = "Kit";

/** Empty catalogue: there is nowhere to search, so the text says how to fill it. */
export const SAUNA_INSERT_EMPTY_TITLE = "Catalog is empty";
export const SAUNA_INSERT_EMPTY_BODY =
  "No source returned any components. There's nothing to insert yet: connect a collection or build your own component from page blocks.";

/** A search that found nothing — in a catalogue that is NOT empty. */
export function saunaInsertNoMatches(query: string, total: number): string {
  return `Nothing matches “${query.trim()}”. The catalog isn't empty, though — it has ${total} components.`;
}

export const SAUNA_INSERT_GROUP_EMPTY =
  "Nothing in this group yet — clear the filter or pick another group.";

/** A source did not answer; the catalogue is built from the others and says so. */
export function saunaInsertSourceFailed(sourceTitle: string): string {
  return `The “${sourceTitle}” source didn't respond. The catalog is built from the others — you can insert from them, but your builds aren't visible yet.`;
}

export const SAUNA_INSERT_RETRY = "Try again";

/** The sentence under an own component's name — what it is, never an empty line. */
export const SAUNA_INSERT_OWN_DESCRIPTION =
  "Your build — inserted as a reference, edited in one place.";

/** Footer line for a build: what exactly goes in, and that it goes in whole. */
export function saunaInsertCompoundNote(title: string, chain: readonly string[]): string {
  return `Inserts as a single node — a reference to “${title}”: ${chain.join(" › ")}. The parts stay inside the build and won't be spread out on the canvas.`;
}
