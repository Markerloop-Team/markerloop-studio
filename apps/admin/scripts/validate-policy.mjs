#!/usr/bin/env node
//
// Validator for the product rules, packages/policy (SDL-658).
// Where it runs: `pnpm build` (the `prebuild` hook, next to validate:i18n) and
// the CI job verify:static (`pnpm -C apps/admin run validate:policy`) on every
// MR and master pipeline. NOT in the Dockerfile: it calls `next build`
// directly, so npm's prebuild hook never fires there — verify:static is the
// gate that stands in front of the image.
//
// The rule it enforces (the repository contribution rules, dev-infra docs/domains/policy.md):
// the texts change ONLY on a direct owner request. Technical tasks fix the code
// to keep a promise, never the promise to fit the code. So:
//
//   1. sha256 of every section file equals the sha256 of its LAST revision in
//      manifest.json. Editing a word without adding a revision (new version,
//      effective_date, owner_request) fails here.
//   1b. Against the BASE manifest (already merged): its revisions may not be
//      edited or removed, only appended to. Rewriting the sha256 of v1 in
//      place is therefore refused, and a section whose file differs from the
//      base needs a NEW revision. Base: see baseRef() — MR diff base, the
//      previous tip on a push pipeline, origin/master locally; under a
//      shallow CI clone the script fetches it. No manifest at the base =
//      nothing merged yet, nothing to protect. Base check impossible for any
//      reason: a failure in CI (CI=true), a warning locally.
//   2. Every revision carries a non-empty owner_request; versions grow.
//   3. A limit value never stands in prose as a digit: numbers come only from
//      limits.json through {{limit:key}}, so the table and the prose cannot
//      disagree after a limit changes. Checked in sections and strings.json.
//      Digit groups split by spaces ("1 000", NBSP, thin space) are joined
//      first. Numbers written as WORDS ("тридцать") are not caught — the rule
//      in the contribution rules forbids them instead.
//   4. Every {{...}} placeholder names a key that exists in limits.json.
//   5. Every promise a section or a string carries is declared in
//      manifest.promise_keys; every section file is listed in the manifest.
//   6. A string's `text` is Russian. A string with `translations` (shown on
//      screens that follow the admin's locale — the acceptance screen and the
//      sign-up checkbox, SDL-665) carries exactly the admin's other locales
//      (apps/admin/src/messages/<locale>, minus ru), each non-empty and held
//      to rules 3 and 4 like `text`. A missing one would silently fall back
//      to Russian on that locale; `null` says so on purpose ("reads the
//      Russian text", SDL-784: kk until a Kazakh edition exists).
//   7. A section's `translations` (SDL-784, sections/<locale>/<slug>.md) is
//      the same text in another admin locale, not a revision: of_version must
//      equal the current revision (a Russian edit makes every translation
//      stale until it is redone), sha256 must equal the file, the file has a
//      "# " title and passes rules 3 and 4, and it uses the same
//      set of {{limit:...}} placeholders and [[slug]] references as the
//      Russian file.
//      Every .md under sections/<locale>/ must be some section's translation.
//      A limit's `translations` holds non-empty labels for admin locales only.
//
// Exit 1 on any violation, printing file:line for each.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root =
  process.env.POLICY_ROOT ?? join(here, "..", "..", "..", "packages", "policy");

const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const rel = (p) => relative(process.cwd(), p);

function readJson(name) {
  const path = join(root, name);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(rel(path), `cannot read JSON (${error.message})`);
    return null;
  }
}

const manifest = readJson("manifest.json");
const limits = readJson("limits.json");
const strings = readJson("strings.json");

if (!manifest || !limits || !strings) {
  report();
}

const limitValues = new Set(
  Object.values(limits).map((limit) => String(limit.value))
);
const promiseKeys = new Set(Object.keys(manifest.promise_keys ?? {}));

// The admin's locales other than ru — the ones a translation may be in.
const messagesDir = join(here, "..", "src", "messages");
const translationLocales = readdirSync(messagesDir)
  .filter((dir) => statSync(join(messagesDir, dir)).isDirectory() && dir !== "ru")
  .sort();

// Any {{ ... }} — the known-good shape is {{limit:<key>}}.
const PLACEHOLDER = /\{\{([^}]*)\}\}/g;
// A standalone run of digits (not part of a word, a decimal or a longer number).
const NUMBER = /(?<![\p{L}\p{N}_.,])\d+(?![\p{L}\p{N}_]|[.,]\d)/gu;

// Numbers that are structure, not limits (SDL-784, the English Terms and
// Privacy Policy): a heading number ("## 10.", "### 3.1") or a numbered item
// with its dot ("5. Sub-processors") at the start of a line, a reference to a
// section, annex or article ("section 10", "sections 3–9", "Art. 6",
// "Article 3(2)", "Articles 7 and 8 of") and a legal citation with
// parenthesised parts ("6(1)(b)", "25(2)(8)"). They are removed before rule 3
// looks for limit values; any other digit is checked — "30 days" opening a
// line, "section 9, 24 hours" and "Article 8 or 30 days" still fail.
const STRUCTURAL_NUMBER_LINE_START = /^\s*(?:#{1,6}\s+\d+(?:\.\d+)*\.?|\d+(?:\.\d+)*\.)(?=\s)/;
const REF_NUMBER = String.raw`\d+(?:\.\d+)*(?:\([0-9a-z]+\))*`;
const STRUCTURAL_REFERENCE = new RegExp(
  String.raw`\b(?:[Ss]ections?|[Aa]nnex|[Aa]rt\.|[Aa]rticles?)\s+${REF_NUMBER}` +
    String.raw`(?:\s*[–-]\s*${REF_NUMBER}|\s+and\s+${REF_NUMBER}(?=\s*(?:\(|of\b|[.,;:)]|$)))*`,
  "g"
);
const LEGAL_CITATION = /(?<![\p{L}\p{N}_.,])\d+(?:\([0-9a-z]+\))+/gu;

// [[slug]] — a reference to another section; the page renders it as a link
// only when that section is visible on the contour, otherwise as its title.
const SECTION_REF = /\[\[([^\]]*)\]\]/g;
const allSlugs = new Set((manifest.sections ?? []).map((s) => s.slug));

function checkProse(where, text) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const at = `${where}:${index + 1}`;
    for (const match of line.matchAll(PLACEHOLDER)) {
      const inner = match[1].trim();
      const limit = /^limit:([a-z0-9_]+)$/.exec(inner);
      if (!limit) {
        fail(at, `unknown placeholder {{${match[1]}}} — only {{limit:<key>}}`);
      } else if (!(limit[1] in limits)) {
        fail(at, `{{limit:${limit[1]}}} — no such key in limits.json`);
      }
    }
    for (const match of line.matchAll(SECTION_REF)) {
      if (!allSlugs.has(match[1])) fail(at, `[[${match[1]}]] — no such section in manifest.json`);
    }
    // "1 000" / "1\u00a0000" / "1\u202f000" read as 1000.
    const prose = line
      .replace(PLACEHOLDER, " ")
      .replace(STRUCTURAL_NUMBER_LINE_START, " ")
      .replace(STRUCTURAL_REFERENCE, " ")
      .replace(LEGAL_CITATION, " ")
      .replace(/(\d)[ \u00a0\u202f\u2009](?=\d{3}(?!\d))/g, "$1");
    for (const match of prose.matchAll(NUMBER)) {
      if (limitValues.has(match[0])) {
        fail(
          at,
          `limit value "${match[0]}" written as a digit — use {{limit:<key>}} from limits.json`
        );
      }
    }
  });
}

function checkPromises(where, promises) {
  if (!Array.isArray(promises)) {
    fail(where, "promises must be an array");
    return;
  }
  for (const key of promises) {
    if (!promiseKeys.has(key)) {
      fail(where, `promise "${key}" is not declared in manifest.promise_keys`);
    }
  }
}

// The distinct {{limit:key}} placeholders and [[slug]] references of a text,
// sorted — a translation must use the same set as the Russian text (rule 7).
// A set, not a count: "в течение суток" may read "within {{limit:purge_hours}}
// hours" in English while the Russian names that limit elsewhere.
const markers = (text) => [
  ...new Set(
    [...text.matchAll(PLACEHOLDER), ...text.matchAll(SECTION_REF)].map((m) => m[0].replace(/\s+/g, ""))
  ),
].sort();

const listedTranslations = new Set();
function checkSectionTranslations(where, section, current, russian) {
  if (section.translations === undefined) return;
  if (!section.translations || typeof section.translations !== "object" || Array.isArray(section.translations)) {
    fail(where, "translations must be an object { <locale>: { file, of_version, sha256 } }");
    return;
  }
  for (const [locale, t] of Object.entries(section.translations)) {
    const at = `${where}.translations.${locale}`;
    if (!translationLocales.includes(locale)) {
      fail(at, `not an admin locale other than ru (${translationLocales.join(", ")})`);
      continue;
    }
    if (!t || typeof t.file !== "string" || !t.file.startsWith(`sections/${locale}/`)) {
      fail(at, `file must be sections/${locale}/<name>.md`);
      continue;
    }
    listedTranslations.add(t.file);
    if (current && t.of_version !== current.version) {
      fail(
        at,
        `of_version ${t.of_version} is not the current revision v${current.version} — ` +
          "the Russian text changed, the translation must be redone for it"
      );
    }
    const path = join(root, t.file);
    let raw;
    try {
      raw = readFileSync(path);
    } catch {
      fail(at, `file ${t.file} is missing`);
      continue;
    }
    const actual = createHash("sha256").update(raw).digest("hex");
    if (t.sha256 !== actual) {
      fail(rel(path), `sha256 ${actual} differs from manifest ${at} (${t.sha256})`);
    }
    const text = raw.toString("utf8");
    if (!text.split("\n").some((line) => line.startsWith("# "))) fail(rel(path), 'no "# " title line');
    checkProse(rel(path), text);
    const want = markers(russian).join(" ");
    const got = markers(text).join(" ");
    if (want !== got) {
      fail(rel(path), `placeholders and [[refs]] differ from ${section.file}: expected [${want}], found [${got}]`);
    }
  }
}

const listed = new Set();
const slugs = new Set();
for (const section of manifest.sections ?? []) {
  const where = `manifest.json#${section.slug}`;
  if (slugs.has(section.slug)) fail(where, "duplicate slug");
  slugs.add(section.slug);
  if (!/^[a-z][a-z0-9-]*$/.test(section.slug ?? "")) {
    fail(where, "slug must be lowercase latin, digits and dashes");
  }
  listed.add(section.file);
  checkPromises(where, section.promises);

  const revisions = section.revisions ?? [];
  if (revisions.length === 0) fail(where, "no revisions");
  let previous = 0;
  for (const revision of revisions) {
    const at = `${where} v${revision.version}`;
    if (!Number.isInteger(revision.version) || revision.version <= previous) {
      fail(at, "version must be an integer greater than the previous one");
    }
    previous = revision.version;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revision.effective_date ?? "")) {
      fail(at, "effective_date must be YYYY-MM-DD");
    }
    if (typeof revision.owner_request !== "string" || !revision.owner_request.trim()) {
      fail(at, "owner_request is empty — texts change only on a direct owner request");
    }
  }

  const path = join(root, section.file);
  let raw;
  try {
    raw = readFileSync(path);
  } catch {
    fail(where, `file ${section.file} is missing`);
    continue;
  }
  const actual = createHash("sha256").update(raw).digest("hex");
  const current = revisions[revisions.length - 1];
  if (current && current.sha256 !== actual) {
    fail(
      rel(path),
      `sha256 ${actual} differs from manifest v${current.version} (${current.sha256}). ` +
        "The text changed without a new manifest revision with owner_request — " +
        "texts change only on a direct owner request (contribution rules, «Свод продукта»)"
    );
  }
  const text = raw.toString("utf8");
  if (!text.split("\n").some((line) => line.startsWith("# "))) {
    fail(rel(path), 'no "# " title line');
  }
  checkProse(rel(path), text);
  checkSectionTranslations(where, section, current, text);
}

for (const file of readdirSync(join(root, "sections"))) {
  if (file.endsWith(".md") && !listed.has(`sections/${file}`)) {
    fail(`sections/${file}`, "not listed in manifest.json");
  }
  const dir = join(root, "sections", file);
  if (!statSync(dir).isDirectory()) continue;
  for (const inner of readdirSync(dir)) {
    if (inner.endsWith(".md") && !listedTranslations.has(`sections/${file}/${inner}`)) {
      fail(`sections/${file}/${inner}`, "not a translation of any section in manifest.json");
    }
  }
}

// A section that refers to another ([[slug]]) makes that section's claims its
// own, so it must carry every promise of the section it refers to — otherwise
// the referring section could be live on a contour where the claim is not.
const bySlug = new Map((manifest.sections ?? []).map((s) => [s.slug, s]));
for (const section of manifest.sections ?? []) {
  let text = "";
  try {
    text = readFileSync(join(root, section.file), "utf8");
  } catch {
    continue;
  }
  for (const match of text.matchAll(SECTION_REF)) {
    const target = bySlug.get(match[1]);
    if (!target) continue;
    const missing = (target.promises ?? []).filter((p) => !(section.promises ?? []).includes(p));
    if (missing.length > 0) {
      fail(
        `manifest.json#${section.slug}`,
        `refers to [[${match[1]}]] but does not carry its promises: ${missing.join(", ")}`
      );
    }
  }
}

for (const [key, entry] of Object.entries(strings)) {
  const where = `strings.json#${key}`;
  if (typeof entry.text !== "string" || !entry.text.trim()) fail(where, "empty text");
  else checkProse(where, entry.text);
  if (!slugs.has(entry.section)) fail(where, `unknown section "${entry.section}"`);
  checkPromises(where, entry.promises);
  if (entry.translations === undefined) continue;
  if (!entry.translations || typeof entry.translations !== "object" || Array.isArray(entry.translations)) {
    fail(where, "translations must be an object { <locale>: text }");
    continue;
  }
  const given = Object.keys(entry.translations).sort();
  const missing = translationLocales.filter((locale) => !given.includes(locale));
  const extra = given.filter((locale) => !translationLocales.includes(locale));
  if (missing.length > 0) fail(where, `translations miss locale(s) ${missing.join(", ")} — they would show Russian`);
  if (extra.length > 0) {
    fail(where, `translations for ${extra.join(", ")} — not an admin locale other than ru (ru is "text")`);
  }
  for (const [locale, text] of Object.entries(entry.translations)) {
    // null: this locale reads the Russian text on purpose (SDL-784, kk).
    if (text === null) continue;
    if (typeof text !== "string" || !text.trim()) fail(`${where}.${locale}`, "empty translation");
    else checkProse(`${where}.${locale}`, text);
  }
}

for (const [key, limit] of Object.entries(limits)) {
  if (!Number.isFinite(limit.value)) fail(`limits.json#${key}`, "value must be a number");
  if (limit.translations === undefined) continue;
  for (const [locale, label] of Object.entries(limit.translations ?? {})) {
    if (!translationLocales.includes(locale)) fail(`limits.json#${key}.${locale}`, "not an admin locale other than ru");
    else if (typeof label !== "string" || !label.trim()) fail(`limits.json#${key}.${locale}`, "empty label");
  }
}


// ---- 1b. Merged revisions are append-only (against the base manifest) ----

function git(args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const ZERO_SHA = /^0+$/;

/**
 * Which base the merged revisions are read from:
 *   POLICY_BASE_REF (manual / tests)
 *   → CI_MERGE_REQUEST_DIFF_BASE_SHA (MR pipeline: the target at the fork point)
 *   → CI_COMMIT_BEFORE_SHA (push pipeline, e.g. master: the previous tip), unless
 *     it is the all-zero SHA GitLab sends for a new branch
 *   → origin/master (local runs).
 */
function baseRef() {
  const before = process.env.CI_COMMIT_BEFORE_SHA;
  return (
    process.env.POLICY_BASE_REF ||
    process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ||
    (before && !ZERO_SHA.test(before) ? before : "") ||
    "origin/master"
  );
}

/**
 * Returns { manifest, ref } (manifest null = the package is not at the base:
 * nothing merged yet) or { skipped }. Under CI=true a skip is never silent:
 * every way of not reading the base — no git in PATH, not a checkout, a base
 * that cannot be fetched, a manifest that cannot be read — is a failure,
 * because a gate that quietly steps aside is how "verified" starts to mean
 * nothing. Locally (no CI) it is a warning.
 */
function readBaseManifest() {
  const inCi = process.env.CI === "true";
  const ref = baseRef();
  const skip = (why) => {
    if (inCi) fail("manifest.json", `base check impossible in CI — ${why}`);
    return { skipped: why };
  };
  let top;
  try {
    top = git(["rev-parse", "--show-toplevel"]).trim();
  } catch (error) {
    return skip(
      error && error.code === "ENOENT"
        ? "git is not in PATH"
        : `${root} is not inside a git checkout`
    );
  }
  const manifestPath = relative(top, join(root, "manifest.json"));
  const succeeds = (args) => {
    try {
      git(args);
      return true;
    } catch {
      return false;
    }
  };
  let base = ref;
  if (!succeeds(["cat-file", "-e", `${base}^{commit}`])) {
    // Shallow CI clone (GIT_DEPTH 1): fetch the base itself. `origin` is the
    // runner's clone remote, which already carries the job's credentials.
    const what = ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
    if (succeeds(["fetch", "--quiet", "--depth=1", "origin", what])) base = "FETCH_HEAD";
  }
  if (!succeeds(["cat-file", "-e", `${base}^{commit}`])) {
    return skip(`base ${ref} is not available (not in the clone, fetch failed)`);
  }
  if (!succeeds(["cat-file", "-e", `${base}:${manifestPath}`])) {
    return { manifest: null, ref }; // the package is not at the base yet
  }
  try {
    return { manifest: JSON.parse(git(["show", `${base}:${manifestPath}`])), ref };
  } catch (error) {
    return skip(`cannot read ${manifestPath} at ${ref} (${error.message.split("\n")[0]})`);
  }
}

const baseResult = readBaseManifest();
if (baseResult.skipped) {
  console.warn(`[validate-policy] WARNING: base check skipped — ${baseResult.skipped}`);
} else if (baseResult.manifest) {
  const current = new Map((manifest.sections ?? []).map((s) => [s.slug, s]));
  for (const baseSection of baseResult.manifest.sections ?? []) {
    const where = `manifest.json#${baseSection.slug}`;
    const now = current.get(baseSection.slug);
    if (!now) {
      fail(where, `section merged at ${baseResult.ref} was removed`);
      continue;
    }
    const merged = baseSection.revisions ?? [];
    merged.forEach((revision, index) => {
      if (JSON.stringify(now.revisions?.[index]) !== JSON.stringify(revision)) {
        fail(
          `${where} v${revision.version}`,
          `revision merged at ${baseResult.ref} was edited in place — merged revisions are append-only; add a new revision with a greater version and owner_request`
        );
      }
    });
  }
}

report();

function report() {
  if (errors.length > 0) {
    console.error(`[validate-policy] ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log(
    `[validate-policy] OK — ${manifest.sections.length} sections, ${Object.keys(limits).length} limits, ${Object.keys(strings).length} strings`
  );
  process.exit(0);
}
