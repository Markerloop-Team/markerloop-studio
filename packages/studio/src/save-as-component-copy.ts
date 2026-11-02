// Naming half of "Save as component" (SDL-341, reworked by SDL-718).
//
// pages-service owns a Component's identity: `POST /pages/blocks` takes a
// `key` and a `name` and answers with the `id` (a UUID) every `Ref` points
// at. So the author types a NAME — free text, what the library shows — and
// the KEY is derived from it here: readable, deterministic, unique in the
// workspace by a numeric suffix. The id is never the client's to choose.
//
// Pure string work, kept out of the dialog so it is tested directly.

import type { SaunaNodeId, SaunaSchema } from "@markerloop/engine";
import { saunaNodeDisplayName } from "@markerloop/engine";

/** pages-service limits (`CreateBlockRequest`): key 1..120, name 1..200. */
export const SAUNA_COMPONENT_KEY_MAX = 120;
export const SAUNA_COMPONENT_NAME_MAX = 200;
/** The key a name with no Latin-able character at all falls back to. */
export const SAUNA_COMPONENT_KEY_FALLBACK = "component";

/**
 * pages-service's key alphabet (`blockKeyPattern`): lowercase Latin, digits,
 * `-` and `_`, starting and ending with a letter or a digit, 1..120 chars.
 */
const KEY_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,118}[a-z0-9])?$/;

export function saunaIsComponentKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

// Russian and Kazakh Cyrillic → Latin. Readability, not reversibility: the
// key is an address an agent or a person may type, the name keeps the
// original spelling.
const TRANSLIT: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

function trimEdges(s: string): string {
  return s.replace(/^[-_]+|[-_]+$/g, "");
}

/**
 * The key a name maps to, before uniqueness: lower-cased, Cyrillic
 * transliterated, accents dropped, every run of anything else one hyphen,
 * no separator at either end, cut to 120. Never empty — a name with nothing
 * to keep (emoji, punctuation) becomes `component`.
 */
export function saunaComponentKey(name: string): string {
  // Transliterate BEFORE normalising: NFKD splits «й» into «и» + breve and
  // «ё» into «е» + diaeresis, and stripping the marks afterwards turned
  // «Йогурт» into `iogurt`. Accents of Latin letters go after.
  let out = "";
  for (const ch of name.toLowerCase()) out += TRANSLIT[ch] ?? ch;
  out = out.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = trimEdges(
    out
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
  );
  const cut = trimEdges(slug.slice(0, SAUNA_COMPONENT_KEY_MAX));
  return cut || SAUNA_COMPONENT_KEY_FALLBACK;
}

/**
 * `saunaComponentKey(name)`, made unique against `taken` by a suffix:
 * `hero`, then `hero-2`, `hero-3`… The base is shortened so the suffixed key
 * still fits 120. Deterministic — same name and same `taken`, same key.
 */
export function saunaUniqueComponentKey(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = saunaComponentKey(name);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const head = trimEdges(base.slice(0, SAUNA_COMPONENT_KEY_MAX - suffix.length)) || SAUNA_COMPONENT_KEY_FALLBACK;
    const key = `${head}${suffix}`;
    if (!used.has(key)) return key;
  }
}

/**
 * What the name field starts with: the node's own name if the author gave
 * it one, otherwise its type — the same string the outline row prints, so
 * the dialog opens saying what the author is looking at.
 */
export function saunaComponentNameSuggestion(schema: SaunaSchema, nodeId: SaunaNodeId): string {
  const node = schema.nodes[nodeId];
  if (!node) return "";
  return saunaNodeDisplayName(node).slice(0, SAUNA_COMPONENT_NAME_MAX);
}

export type SaunaComponentNameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Is this name storable? Trimmed, 1..200 characters (pages-service `name`). */
export function saunaCheckComponentName(raw: string): SaunaComponentNameCheck {
  const name = raw.trim();
  if (!name) return { ok: false, reason: "Give the component a name." };
  if (name.length > SAUNA_COMPONENT_NAME_MAX) {
    return { ok: false, reason: `The name is too long — at most ${SAUNA_COMPONENT_NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

/**
 * What the dialog says when saving failed — words about the Component, never
 * an endpoint or a status line (the owner's rule: everything a person sees
 * says "component"). The technical message goes to the console instead.
 * Duck-typed on `PagesComponentsError` (name guard, not `instanceof`).
 */
export function saunaSaveComponentErrorText(error: unknown): string {
  const e = (typeof error === "object" && error !== null ? error : {}) as {
    name?: unknown;
    status?: unknown;
    code?: unknown;
    issues?: unknown;
  };
  if (e.name !== "PagesComponentsError") return "Couldn't save the component. Please try again.";
  const issues = Array.isArray(e.issues) ? (e.issues as { path?: unknown; message?: unknown }[]) : [];
  const first = issues[0];
  const path = typeof first?.path === "string" ? first.path : "";
  if (e.code === "invalid_name" && typeof first?.message === "string") return first.message;
  if (e.code === "invalid_schema") {
    const param = /^\$\.params\[(\d+)\]\.?(\w+)?/.exec(path);
    if (param) {
      const field = param[2] ?? "definition";
      return `Couldn't save the component: parameter ${Number(param[1]) + 1} has an invalid ${field}.`;
    }
    const node = /^\$\.nodes\.([^.]+)\.props\.?([\w-]+)?/.exec(path);
    if (node) {
      return `Couldn't save the component: the “${node[2] ?? "props"}” value of one of its elements is not allowed.`;
    }
    return "Couldn't save the component: its content is not valid.";
  }
  if (e.code === "block_key_taken") return "Couldn't save the component: that name is taken too often — try another name.";
  if (e.status === 401 || e.status === 403) return "Couldn't save the component: you don't have access to this workspace.";
  return "Couldn't save the component. Please try again.";
}
