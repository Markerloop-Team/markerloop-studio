import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Props manifest generator (SDL-632 S1; ported from the frozen reference
 * `sunday-sauna/packages/sunday-sauna/scripts/props-manifest.mjs`, where it
 * was SDL-290 + SDL-291, EP-48 layers 1–3).
 *
 * Extracts author-facing props from the kit sources with
 * react-docgen-typescript (layer 1), classifies each one into an editor
 * control and a semantic group (layer 2) — the raw material the Studio
 * properties panel (`@markerloop/studio`, `properties/descriptors.ts`) reads
 * instead of a hand-written schema per block — and then merges the manual
 * overlay (layer 3): field captions, group/order overrides, hidden props,
 * `children` declared as a content field where a component's only meaningful
 * input is its text, and the per-prop content decisions whose `true` becomes
 * the manifest's `content: true` flag. The overlay DATA lives in
 * `src/ui/catalog-meta/props-meta.json` — JSON, not TypeScript, so this
 * plain-ESM script reads it with `readFileSync`; the typed wrapper for TS
 * consumers is `src/ui/catalog-meta/props-meta.ts`.
 *
 * The overlay is validated, never silently dropped: naming a component the
 * extraction does not know, or a prop a component does not have, throws with
 * the offending key — `children` being the one additive exception.
 *
 * The output `props-manifest.json` is CHECKED IN and exported as
 * `@markerloop/ui/props-manifest.json`: consumers read a generated artifact,
 * not the TypeScript sources. Freshness is guarded by
 * `scripts/props-manifest-check.mjs` (`pnpm --filter @markerloop/ui
 * props:manifest:check`, run in CI), which rebuilds the manifest in memory
 * and compares. Regenerate with:
 *
 *   pnpm --filter @markerloop/ui props:manifest
 *
 * react-docgen-typescript is CJS — hence createRequire in this ESM script.
 *
 * `import.meta.url` is only trusted when it is a file: URL (a bundler may
 * rewrite it), so every path either derives from an explicit `root` argument
 * or falls back to cwd.
 */

function defaultRoot() {
  if (import.meta.url.startsWith("file:")) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  }
  return process.cwd();
}

export function manifestPath(root = defaultRoot()) {
  return path.join(root, "props-manifest.json");
}

export function overlayPath(root = defaultRoot()) {
  return path.join(root, "src", "ui", "catalog-meta", "props-meta.json");
}

/** The layer-3 overlay as checked in — the same data `propsMeta` exports. */
export function loadPropsOverlay(root = defaultRoot()) {
  return JSON.parse(readFileSync(overlayPath(root), "utf8"));
}

/** Only the author-facing trees — admin chrome and icons stay invisible. */
const SOURCE_DIRS = [
  "src/ui/internal/components",
  "src/ui/internal/layout",
  "src/ui/internal/typography",
];

/**
 * Components declared in the public barrel itself (SDL-380).
 *
 * `src/ui/index.tsx` is mostly re-exports, but four catalog types are BORN
 * there and exist nowhere under `src/ui/internal`:
 *
 *   Box, ListHeader — written inline in the barrel;
 *   Alert, Code     — `export const Alert = InlineAlertRoot` aliases, whose
 *                     catalog type name differs from the internal
 *                     `displayName` the extraction keys on.
 *
 * Without the barrel in the parse set, all four resolved to no manifest entry
 * at all, and the Studio properties panel fell through to its raw-JSON
 * textarea — `Box` with its nineteen layout props included.
 *
 * The file is appended AFTER `SOURCE_DIRS` is sorted, deliberately: docgen
 * parses the barrel's re-exports too, so it re-declares ~90 names that the
 * internal trees already own (`Text`, `Button`, `Card`…). `extractProps`
 * resolves a duplicate `displayName` by first-parse-wins, so parsing the
 * barrel last means every pre-existing entry keeps the shape it had, and only
 * names the internal trees do NOT define are added.
 */
const SOURCE_FILES = ["src/ui/index.tsx"];

/** Editors the properties panel knows how to render. */
export const EDITORS = [
  "segmented",
  "select",
  "switch",
  "number",
  "text",
  "link",
];

/** Semantic groups the panel arranges fields into. */
export const GROUPS = ["content", "appearance", "layout", "state", "advanced"];

// Group classification: first matching rule wins, in exactly this order
// (appearance → layout → content → state). Order is part of the contract —
// e.g. `textAlign` is layout (align) even though it also contains `text`.
const GROUP_RULES = [
  ["appearance", /variant|tone|color|background|shadow|radius|appearance/i],
  [
    "layout",
    /padding|gap|align|justify|direction|columns|wrap|grow|shrink|size|width|height|fullWidth|maxWidth|inset|span/i,
  ],
  [
    "content",
    /text|label|title|description|children|src|alt|href|placeholder/i,
  ],
  ["state", /disabled|loading|error|required|checked|open|active|selected/i],
];

// Non-authorable props never reach the manifest: callbacks and render
// functions, domain data the panel cannot edit, styling escape hatches, and
// ref plumbing. `children` as a content field is an overlay decision
// (SDL-291), not an extraction one.
const DROPPED_NAMES = new Set([
  "className",
  "asChild",
  "style",
  "ref",
  "columns",
  "data",
  "icons",
  "filter",
  "render",
]);

/**
 * Native props that ARE a component's authoring fields (SDL-328).
 *
 * The node_modules filter below is right about the general case — it drops
 * the several hundred DOM attributes every element inherits — but a handful
 * of those attributes are the whole point of the component. `Image` is the
 * one found in the field: its `src` and `alt` come from
 * `React.ImgHTMLAttributes` in @types/react, so the panel offered no way to
 * set a picture's source except a field badged `unknown`.
 *
 * The list is keyed BY COMPONENT, not by prop name, because the prop-name
 * version measured leaky (21 Aug 2026 run of the extraction over
 * `src/ui/internal`, counting props whose parent is in node_modules):
 *
 *   title        122 components — a global HTML attribute, on everything
 *   type          24 components — form plumbing on every Radix trigger and
 *                                 <button>; submit/reset is not an authoring
 *                                 decision
 *   placeholder    7 — Input, Textarea, CommandInput, SelectValue…
 *   src / alt      6 — Image, AvatarImage, and three <input> elements that
 *                      accept them only for `type="image"`
 *   href           0 — the link wrappers declare it themselves, so it was
 *                      never lost (ActionCardLink, RowLink carry it today)
 *
 * `SelectValue.placeholder` is deliberately NOT here even though it reads
 * like one of these: Radix types it as `ReactNode`, which `classifyType`
 * cannot represent, so the entry would pass the filter and then be dropped
 * one step later — a line that looks like it does something and does not.
 * A placeholder for Select is overlay territory (layer 3).
 *
 * A global `["src","alt","href","placeholder","type","title"]` would have
 * put `title` on all 107 catalogued components and `src` on a checkbox.
 * Naming the pairs keeps every addition a deliberate, reviewable line —
 * and `assertNativeAllowlist` below makes a stale entry throw instead of
 * quietly doing nothing, the same contract the layer-3 overlay has.
 */
const NATIVE_AUTHOR_PROPS = new Map([
  ["Image", ["alt", "src"]],
  ["AvatarImage", ["alt", "src"]],
  ["Input", ["placeholder"]],
  ["InputGroupInput", ["placeholder"]],
  ["InputGroupTextarea", ["placeholder"]],
  ["Textarea", ["placeholder"]],
  ["CommandInput", ["placeholder"]],
]);

/** Is this inherited DOM attribute an authoring field for this component? */
function isNativeAuthorProp(componentName, propName) {
  return NATIVE_AUTHOR_PROPS.get(componentName)?.includes(propName) ?? false;
}

/**
 * A stale allowlist entry is a silent no-op, which is exactly the failure
 * mode the reference repo's rule 7 exists to prevent — so it throws instead. Runs
 * against the docs BEFORE the manifest is assembled, so a component renamed
 * out from under the list fails the generator and the drift test alike.
 */
function assertNativeAllowlist(docs) {
  const byName = new Map();
  for (const doc of docs) {
    if (doc.displayName) byName.set(doc.displayName, doc);
  }
  for (const [component, props] of NATIVE_AUTHOR_PROPS) {
    const doc = byName.get(component);
    if (!doc) {
      throw new Error(
        `NATIVE_AUTHOR_PROPS names "${component}", which the extraction does not know. ` +
          `Renamed or removed? Update the list in scripts/props-manifest.mjs.`
      );
    }
    for (const prop of props) {
      if (!doc.props[prop]) {
        throw new Error(
          `NATIVE_AUTHOR_PROPS lets "${component}.${prop}" through, but ${component} ` +
            `does not accept it. Drop the entry — as written it does nothing.`
        );
      }
    }
  }
}

function isDroppedProp(name, rawType) {
  if (DROPPED_NAMES.has(name)) return true;
  if (/^on[A-Z]/.test(name)) return true;
  if (/Ref$/.test(name)) return true;
  if (rawType.includes("=>")) return true;
  return false;
}

/** Docgen quotes string literals (`"default"`); strip one layer of quotes. */
function unquote(literal) {
  const m = /^"(.*)"$/.exec(literal) ?? /^'(.*)'$/.exec(literal);
  return m ? m[1] : literal;
}

/**
 * Collapse a docgen type into one of the four manifest kinds, or null when
 * the prop is not representable in layer 1/2 (ReactNode, objects, mixed
 * unions — overlay territory).
 */
function classifyType(type) {
  if (type.name === "boolean") return { kind: "boolean" };
  if (type.name === "number") return { kind: "number" };
  if (type.name === "string") return { kind: "string" };

  if (Array.isArray(type.value)) {
    // cva variants are `"a" | "b" | null`; optionality adds `undefined`.
    // Neither is an authorable choice — the panel clears to the default.
    const literals = type.value
      .map((v) => v.value)
      .filter((v) => v !== "null" && v !== "undefined");
    if (literals.length === 0) return null;
    if (literals.every((v) => v === "false" || v === "true")) {
      return { kind: "boolean" };
    }
    if (!literals.every((v) => /^["'].*["']$/.test(v))) {
      // Mixed union (string | number, literals | ReactNode…) — not enum.
      return null;
    }
    return { kind: "enum", enumValues: literals.map(unquote) };
  }

  // cva variants (`VariantProps<typeof …>`) reach docgen as mapped types:
  // no literal array, no `raw`, just the union TEXT in `type.name`
  // (`'"line" | "default" | null'`). Parse it — this is where variant/size
  // of every cva component comes from.
  const tokens = type.name.split("|").map((t) => t.trim());
  const named = tokens.filter((t) => t !== "null" && t !== "undefined");
  if (
    tokens.length > 1 &&
    named.length > 0 &&
    named.every((t) => /^"[^"]*"$/.test(t))
  ) {
    return { kind: "enum", enumValues: named.map(unquote) };
  }

  return null;
}

function editorFor(kind, name, enumValues) {
  switch (kind) {
    case "enum":
      return enumValues.length <= 4 ? "segmented" : "select";
    case "boolean":
      return "switch";
    case "number":
      return "number";
    case "string":
      return /^(href|src|to)$/.test(name) ? "link" : "text";
  }
}

function groupFor(name) {
  for (const [group, rule] of GROUP_RULES) {
    if (rule.test(name)) return group;
  }
  return "advanced";
}

function normalizeDefault(kind, value) {
  if (value === null || value === undefined) return undefined;
  if (kind === "boolean") {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return undefined;
  }
  if (kind === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return typeof value === "string" ? unquote(value) : undefined;
}

function sourceFiles(root) {
  const files = [];
  for (const dir of SOURCE_DIRS) {
    const abs = path.join(root, dir);
    for (const entry of readdirSync(abs, { recursive: true })) {
      const rel = String(entry);
      if (!rel.endsWith(".tsx")) continue;
      if (/\.stories\./.test(rel)) continue;
      files.push(path.join(abs, rel));
    }
  }
  // Sort the trees, THEN append the barrel — see SOURCE_FILES for why the
  // order is the contract and not a detail.
  return [...files.sort(), ...SOURCE_FILES.map((rel) => path.join(root, rel))];
}

/**
 * Parse the kit sources, naming the file when one cannot be read — never a
 * raw stack trace and, worse, never a manifest built from a broken file.
 *
 * TypeScript recovers from git conflict markers silently (it keeps one side
 * and parses on), so every file is first checked for syntax diagnostics on
 * its own. The extraction itself stays ONE `parse` over one program: docgen
 * caches per parse call, and parsing file by file changes the output (a
 * description appears on `Image.alt`). If that single parse throws, the files
 * are re-parsed one by one only to find which one to name.
 */
function parseKitSources(root, ts, parser, files) {
  const tsconfig = path.join(root, "tsconfig.json");
  const { options } = ts.parseJsonConfigFileContent(
    ts.readConfigFile(tsconfig, ts.sys.readFile).config,
    ts.sys,
    root,
    {},
    tsconfig,
  );
  const program = ts.createProgram(files, options);
  const named = (file, error) =>
    new Error(
      `cannot parse kit source ${path.relative(root, file)} — ${error instanceof Error ? error.message : String(error)}`,
    );

  for (const file of files) {
    try {
      const source = program.getSourceFile(file);
      if (!source) throw new Error("not found");
      const [diagnostic] = program.getSyntacticDiagnostics(source);
      if (diagnostic) {
        const { line } = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
        throw new Error(
          `line ${line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
        );
      }
    } catch (error) {
      throw named(file, error);
    }
  }

  try {
    return parser.parseWithProgramProvider(files, () => program);
  } catch (error) {
    for (const file of files) {
      try {
        parser.parseWithProgramProvider(file, () => program);
      } catch (fileError) {
        throw named(file, fileError);
      }
    }
    throw new Error(
      `cannot parse kit sources — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Layers 1–2: extraction + rule classification, no overlay applied.
 *
 * Returns `components` (only symbols with own props — the checked-in shape
 * before SDL-291) and `componentNames` — EVERY component docgen parsed,
 * including the ~46 compound parts with no own props at all (CardTitle,
 * DialogTitle…). The overlay may declare `children` on any parsed name, so
 * validity of an overlay key is judged against `componentNames`, while
 * validity of a prop key is judged against `components`.
 */
export function extractProps(root = defaultRoot()) {
  // react-docgen-typescript is CJS; base the require on a real on-disk file
  // so it also works when this module itself was served by Vite.
  const require = createRequire(path.join(root, "package.json"));
  const docgen = require("react-docgen-typescript");
  // The TypeScript docgen itself resolves, so the program and its parser agree.
  const ts = createRequire(require.resolve("react-docgen-typescript"))("typescript");

  const parser = docgen.withCustomConfig(path.join(root, "tsconfig.json"), {
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    // Everything inherited from node_modules (DOM attributes, Radix internals)
    // is noise; a prop with no parent is declared inline on the component.
    // The exception is NATIVE_AUTHOR_PROPS — the few inherited attributes a
    // given component exists to set, `Image.src` first among them (SDL-328).
    propFilter: (prop, component) =>
      !prop.parent ||
      !/node_modules/.test(prop.parent.fileName) ||
      isNativeAuthorProp(component.name, prop.name),
  });

  const docs = parseKitSources(root, ts, parser, sourceFiles(root));
  assertNativeAllowlist(docs);

  const components = {};
  const componentNames = new Set();
  for (const doc of docs) {
    if (!doc.displayName || !/^[A-Z]/.test(doc.displayName)) continue;
    componentNames.add(doc.displayName);
    // Symbols with no own props at all (46 compound parts — CardHeader,
    // DialogPortal…) carry nothing extractable; their `children`-as-content
    // story is the SDL-291 overlay. Symbols WITH own props stay even when
    // every prop is filtered out (an asChild-only Radix wrapper) — the empty
    // list is the signal the overlay builds on.
    if (Object.keys(doc.props).length === 0) continue;

    const props = [];
    for (const name of Object.keys(doc.props).sort()) {
      const prop = doc.props[name];
      const rawType = prop.type.raw ?? prop.type.name ?? "";
      if (isDroppedProp(name, rawType)) continue;

      const classified = classifyType(prop.type);
      if (!classified) continue;

      const { kind, enumValues } = classified;
      const editor = editorFor(kind, name, enumValues);
      const entry = {
        name,
        type: kind,
        editor,
        group: groupFor(name),
        ...(enumValues ? { enumValues } : {}),
        required: Boolean(prop.required),
      };

      const def = normalizeDefault(kind, prop.defaultValue?.value);
      if (def !== undefined) entry.default = def;
      if (prop.description) entry.description = prop.description;

      props.push(entry);
    }

    // Duplicate displayName across files (re-exported wrappers): first parse
    // wins; file order is sorted, so the outcome is deterministic.
    if (components[doc.displayName]) continue;
    components[doc.displayName] = { props };
  }

  const sorted = {};
  for (const name of Object.keys(components).sort()) {
    sorted[name] = components[name];
  }

  return {
    components: sorted,
    componentNames: [...componentNames].sort(),
  };
}

/** Sections of one component's entry in props-meta.json — nothing else is read. */
export const OVERLAY_SECTIONS = ["children", "props", "noProps", "hide", "label", "group", "content", "order"];
/** Keys of a `children` declaration. */
export const OVERLAY_CHILDREN_KEYS = ["editor", "group", "label"];
/** Keys of one declared prop under `props`. */
export const OVERLAY_PROP_DECL_KEYS = ["type", "editor", "group", "label", "enumValues", "required", "default", "description"];

function rejectUnknownKeys(value, allowed, where, fail) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${where} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(
      `${where} has unknown key(s) ${unknown.map((k) => `"${k}"`).join(", ")} — ` +
        `expected one of ${allowed.join(", ")}. A misspelled section is skipped silently otherwise.`,
    );
  }
}

/**
 * Layer 3: merge the manual overlay into the extracted components.
 *
 * Pure — the input is not mutated. Strict — an overlay key that matches
 * nothing throws instead of being dropped: a silently ignored override is
 * exactly the failure mode the reference repo's rule 7 forbids, and a renamed kit
 * prop must turn the build red, not stale. `children` is the one additive
 * exception: it may be declared on any component docgen parsed (that is what
 * `componentNames` is for), including the compound parts whose only
 * meaningful input is their text and who therefore have no extracted entry.
 */
export function applyPropsOverlay(extraction, overlay) {
  const { components, componentNames } = extraction;
  const known = new Set(componentNames);
  const merged = {};
  for (const [name, component] of Object.entries(components)) {
    merged[name] = { props: component.props.map((p) => ({ ...p })) };
  }

  const fail = (message) => {
    throw new Error(`props-meta.json: ${message}`);
  };

  for (const [name, meta] of Object.entries(overlay)) {
    if (!known.has(name)) {
      fail(`component "${name}" is not part of the kit extraction`);
    }
    // A section this function does not read is a TYPO, not a no-op
    // (SDL-632): `"lable"` or `"hidden"` used to be skipped in silence, the
    // manifest came out green and the caption / the hiding the author asked
    // for simply never happened. Every level of the overlay is closed.
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
      fail(`"${name}" must be an object`);
    }
    rejectUnknownKeys(meta, OVERLAY_SECTIONS, `"${name}"`, fail);
    if (meta.children !== undefined) {
      rejectUnknownKeys(meta.children, OVERLAY_CHILDREN_KEYS, `"${name}".children`, fail);
    }
    for (const [prop, decl] of Object.entries(meta.props ?? {})) {
      rejectUnknownKeys(decl, OVERLAY_PROP_DECL_KEYS, `"${name}".props."${prop}"`, fail);
    }
    if (!merged[name] && !meta.children && !meta.props && !meta.noProps) {
      fail(
        `component "${name}" has no extracted props and no children/props/noProps declaration — nothing to overlay`,
      );
    }
    // `noProps` is a REVIEWED verdict, not a shrug (SDL-380): the component
    // was looked at and genuinely has nothing an author sets — a compound
    // part that is pure structure (CardHeader, TableRow). It exists because
    // the manifest's absence and its emptiness mean opposite things to the
    // Studio: an absent type falls through to the raw-JSON textarea, an
    // empty one renders "нет авторских пропсов". Without this key the
    // structural parts were indistinguishable from types nobody had gotten
    // to yet. Declaring it on a component that DOES have props throws — a
    // verdict that has quietly gone stale is the rule-7 failure mode.
    if (meta.noProps) {
      if (meta.noProps !== true) {
        fail(`"${name}".noProps must be true or absent`);
      }
      if (merged[name] && merged[name].props.length > 0) {
        fail(
          `"${name}".noProps says the component has no authorable props, but the extraction found ` +
            `${merged[name].props.map((p) => p.name).join(", ")}. Drop the entry.`,
        );
      }
      if (meta.children || meta.props) {
        fail(`"${name}".noProps cannot be combined with children/props`);
      }
    }
    const component = merged[name] ?? (merged[name] = { props: [] });

    if (meta.children) {
      if (
        meta.children.editor !== "text" ||
        !GROUPS.includes(meta.children.group)
      ) {
        fail(`"${name}".children must use editor "text" and a known group`);
      }
      const entry = {
        name: "children",
        type: "string",
        editor: meta.children.editor,
        group: meta.children.group,
        required: false,
      };
      if (meta.children.label) entry.label = meta.children.label;
      // Content first: the text is the field an author reaches for; an
      // explicit `order` below still wins.
      component.props = [
        entry,
        ...component.props.filter((p) => p.name !== "children"),
      ];
    }

    // Props the EXTRACTION cannot represent, declared by hand (SDL-380).
    //
    // `children` above is the first instance of this problem; it is not the
    // only one. Two shapes defeat layer 1 outright:
    //
    //   - `React.ReactNode` — `ListHeader.title` is typed as a node because
    //     the component also accepts an element, but the catalog seeds it
    //     with a string and the component branches on `typeof === "string"`.
    //     `classifyType` returns null and the field disappears.
    //   - a discriminated union — every one of `Box`'s eighteen layout props
    //     reaches docgen as `any`, because `BoxProps` is
    //     `BoxStackProps | BoxCenterProps | BoxPanelProps | BoxGridProps`
    //     and docgen collapses the branches.
    //
    // Both are real authoring fields, and before this key the only way to set
    // them was the raw-JSON textarea. A declaration here is strict in the
    // same direction as everything else in layer 3: it may only ADD a prop
    // the extraction does not already describe, so a kit change that starts
    // extracting the prop properly turns the build red instead of leaving two
    // competing descriptions of one field.
    for (const [prop, decl] of Object.entries(meta.props ?? {})) {
      if (prop === "children") {
        fail(`"${name}".props declares "children" — use the children key`);
      }
      if (component.props.some((p) => p.name === prop)) {
        fail(
          `"${name}".props declares "${prop}", which the extraction already describes. ` +
            `Drop the entry — layer 1 owns it now.`,
        );
      }
      if (!["string", "number", "boolean", "enum"].includes(decl.type)) {
        fail(`"${name}".props."${prop}" has unknown type "${decl.type}"`);
      }
      if (!EDITORS.includes(decl.editor) || !GROUPS.includes(decl.group)) {
        fail(`"${name}".props."${prop}" has unknown editor or group`);
      }
      if (decl.type === "enum" && !(decl.enumValues?.length > 0)) {
        fail(`"${name}".props."${prop}" is an enum without enumValues`);
      }
      const entry = {
        name: prop,
        type: decl.type,
        editor: decl.editor,
        group: decl.group,
        ...(decl.enumValues ? { enumValues: [...decl.enumValues] } : {}),
        required: Boolean(decl.required),
      };
      if (decl.label) entry.label = decl.label;
      if (decl.default !== undefined) entry.default = decl.default;
      if (decl.description) entry.description = decl.description;
      component.props.push(entry);
    }

    const propByName = (prop, what) => {
      const target = component.props.find((p) => p.name === prop);
      if (!target) {
        fail(`"${name}".${what} names unknown prop "${prop}"`);
      }
      return target;
    };

    for (const prop of meta.hide ?? []) {
      propByName(prop, "hide");
      component.props = component.props.filter((p) => p.name !== prop);
    }
    for (const [prop, label] of Object.entries(meta.label ?? {})) {
      propByName(prop, "label").label = label;
    }
    for (const [prop, group] of Object.entries(meta.group ?? {})) {
      if (!GROUPS.includes(group)) {
        fail(`"${name}".group maps "${prop}" to unknown group "${group}"`);
      }
      propByName(prop, "group").group = group;
    }
    // Content decisions (SDL-365): `true` lands in the manifest as
    // `content: true` — the flag the Studio content panel selects by;
    // `false` is a recorded "reviewed, not content" and writes nothing.
    // Runs AFTER `hide` on purpose: a decision on a hidden prop is dead
    // weight and fails as an unknown prop instead of rotting silently.
    for (const [prop, decision] of Object.entries(meta.content ?? {})) {
      if (typeof decision !== "boolean") {
        fail(
          `"${name}".content maps "${prop}" to ${JSON.stringify(decision)} — the decision must be true or false`,
        );
      }
      const target = propByName(prop, "content");
      if (decision) target.content = true;
    }
    if (meta.order) {
      const pos = new Map();
      meta.order.forEach((prop, index) => {
        propByName(prop, "order");
        pos.set(prop, index);
      });
      component.props = component.props
        .map((prop, index) => ({ prop, index }))
        .sort((a, b) => {
          const pa = pos.get(a.prop.name) ?? meta.order.length + a.index;
          const pb = pos.get(b.prop.name) ?? meta.order.length + b.index;
          return pa - pb;
        })
        .map(({ prop }) => prop);
    }
  }

  const sorted = {};
  for (const name of Object.keys(merged).sort()) {
    sorted[name] = merged[name];
  }
  return sorted;
}

export function buildManifest(
  root = defaultRoot(),
  extraction = extractProps(root),
) {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const overlay = loadPropsOverlay(root);

  return {
    package: pkg.name,
    version: pkg.version,
    generatedBy:
      "packages/ui/scripts/props-manifest.mjs — regenerate with `pnpm --filter @markerloop/ui props:manifest`, do not hand-edit",
    components: applyPropsOverlay(extraction, overlay),
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Contract changes between two manifests (SDL-632): what a page authored
 * against `before` may lose under `after`. Only removals count — a removed
 * component, a removed prop, a removed enum value. Additions are harmless:
 * the Studio form simply offers more.
 *
 * These are WARNINGS, not failures. Stored pages keep the old values, the
 * Studio shows a prop the manifest no longer describes with an "unknown"
 * badge instead of dropping it, and the real lock on the props contract —
 * `propsVersion` and migrations — is EP-128's work. Until then the warning is
 * the reviewer's cue.
 */
export function contractChanges(before, after) {
  const changes = [];
  const beforeComponents = before?.components ?? {};
  const afterComponents = after?.components ?? {};
  for (const [name, component] of Object.entries(beforeComponents)) {
    const next = afterComponents[name];
    if (!next) {
      changes.push(`component ${name} removed`);
      continue;
    }
    const nextProps = new Map((next.props ?? []).map((p) => [p.name, p]));
    for (const prop of component.props ?? []) {
      const target = nextProps.get(prop.name);
      if (!target) {
        changes.push(`${name}.${prop.name} removed`);
        continue;
      }
      if (prop.type !== target.type) {
        changes.push(`${name}.${prop.name} type ${prop.type} -> ${target.type}`);
      }
      const values = new Set(target.enumValues ?? []);
      for (const value of prop.enumValues ?? []) {
        if (!values.has(value)) {
          changes.push(`${name}.${prop.name} enum value "${value}" removed`);
        }
      }
    }
  }
  return changes;
}

export function warnContractChanges(changes, against) {
  for (const change of changes) {
    console.warn(
      `WARNING: props contract change, needs propsVersion, see EP-128 — ${change} (vs ${against})`,
    );
  }
}

const isMain =
  import.meta.url.startsWith("file:") &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = defaultRoot();
  let manifest;
  try {
    manifest = buildManifest(root);
  } catch (error) {
    console.error(
      `props:manifest FAILED — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  if (existsSync(manifestPath(root))) {
    const previous = JSON.parse(readFileSync(manifestPath(root), "utf8"));
    warnContractChanges(
      contractChanges(previous, manifest),
      "the props-manifest.json it replaces",
    );
  }
  writeFileSync(manifestPath(root), serializeManifest(manifest));
  const total = Object.values(manifest.components).reduce(
    (sum, c) => sum + c.props.length,
    0,
  );
  console.log(
    `props-manifest.json: ${Object.keys(manifest.components).length} components, ${total} props`,
  );
}
