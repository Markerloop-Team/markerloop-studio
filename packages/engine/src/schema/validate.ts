import type { SaunaAnySchema, SaunaNodeV1, SaunaSchemaV1, SaunaSchemaV2 } from "./types";
import { isSaunaVisibilityMode, SAUNA_SCREENS } from "../core/visibility-mode";
import { findUnsafeProps } from "../core/safe-url";
import { findParamSpecIssues } from "./params";

export type SaunaValidationIssue = {
  path: string;
  message: string;
};

export type SaunaValidationError = {
  message: string;
  issues: SaunaValidationIssue[];
};

export type SaunaValidationResult<T> =
  | {
      ok: true;
      value: T;
      /**
       * Unsafe URLs and raw-HTML props found on READ (SDL-681): reported, not
       * refused — the renderer drops them, so the page degrades by one
       * attribute instead of failing whole. Also a block parameter that
       * breaks the typed contract (SDL-718). Absent when there are none.
       */
      warnings?: SaunaValidationIssue[];
    }
  | { ok: false; error: SaunaValidationError };

/**
 * `read` (default) — what is already in storage: an unsafe URL or raw-HTML
 * prop is a warning. `write` — what is about to be stored: it is an error.
 */
export type SaunaValidationMode = "read" | "write";

function issue(path: string, message: string): SaunaValidationIssue {
  return { path, message };
}

/**
 * `visibility` is the one node field where a wrong SHAPE is a safety
 * problem rather than a rendering one: `evaluateVisibility` reads
 * `.permission` and `.when`, and on a number or an array both come back
 * `undefined`. Before 23 Sep 2026 such a node rendered to everyone — a
 * restriction silently turned into none. The evaluator now fails closed on
 * the same input; this check keeps the document from carrying that shape in
 * the first place, and says so by name.
 *
 * Since SDL-632 the field also holds a MODE string: `"public"`, `"hybrid"`
 * or `"private"`. Those three pass; any other string is refused by name,
 * because the renderer hides it and the public shell cuts it — a typo would
 * otherwise take a section off the site with nothing red in the editor.
 *
 * The rule's CONTENTS stay unvalidated on purpose, for the reason given
 * at `variants` below: the condition grammar lives in the evaluator, and
 * a second copy here would rot away from it.
 */
function validateVisibilityShape(
  value: unknown,
  path: string,
  issues: SaunaValidationIssue[]
): void {
  if (value === undefined) return;
  if (typeof value === "string") {
    if (!isSaunaVisibilityMode(value)) {
      issues.push(issue(path, `visibility must be "public", "hybrid", "private" or an object (VisibilityRule), got "${value}"`));
    }
    return;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    issues.push(issue(path, "visibility must be \"public\", \"hybrid\", \"private\" or an object (VisibilityRule)"));
  }
}

/**
 * No author JavaScript, no raw HTML (SDL-681): a props bag may not carry
 * `dangerouslySetInnerHTML`, `srcDoc`, an `on…` key or a URL attribute in a
 * non-canonical case (`HREF`), nor an `href`/`src` outside
 * http(s)/mailto/tel/relative — `data:image/*` only in a src — nor hold
 * anything but a string under a URL name (`href: ["…"]`). Checked in
 * `props` and every bag layered over it (`member.props`, `screens.*.props`,
 * a variant's `props`). Strict on write, a warning on read: see
 * `SaunaValidationMode`.
 */
function pushUnsafe(props: unknown, path: string, out: SaunaValidationIssue[]): void {
  for (const f of findUnsafeProps(props)) {
    out.push(
      f.reason === "url"
        ? issue(`${path}.${f.path}`, `unsafe URL "${f.value}": only http(s), mailto, tel or a relative address (data:image/* in a src)`)
        : f.reason === "url-type"
          ? issue(`${path}.${f.path}`, `a URL prop must be a string, got ${f.value}`)
          : issue(`${path}.${f.path}`, `"${f.path}" is not allowed: Elements take no raw HTML, no event handlers and no URL attribute in another case`)
    );
  }
}

function bagsOf(n: Record<string, unknown>, path: string, out: SaunaValidationIssue[]): void {
  pushUnsafe(n.props, `${path}.props`, out);
  const member = n.member as Record<string, unknown> | undefined;
  if (isPlainObject(member)) pushUnsafe(member!.props, `${path}.member.props`, out);
  if (isPlainObject(n.screens)) {
    for (const [screen, o] of Object.entries(n.screens as Record<string, unknown>)) {
      if (isPlainObject(o)) pushUnsafe((o as Record<string, unknown>).props, `${path}.screens.${screen}.props`, out);
    }
  }
  if (Array.isArray(n.variants)) {
    n.variants.forEach((v: unknown, i: number) => {
      if (isPlainObject(v)) pushUnsafe((v as Record<string, unknown>).props, `${path}.variants[${i}].props`, out);
    });
  }
}

/** Every unsafe URL / raw-HTML prop of a structurally valid document. */
export function findUnsafeSchemaProps(schema: SaunaAnySchema): SaunaValidationIssue[] {
  const out: SaunaValidationIssue[] = [];
  if (schema.version === 1) {
    const walk = (node: unknown, path: string): void => {
      if (!isPlainObject(node)) return;
      const n = node as Record<string, unknown>;
      bagsOf(n, path, out);
      if (Array.isArray(n.children)) n.children.forEach((c, i) => walk(c, `${path}.children[${i}]`));
    };
    walk((schema as { root?: unknown }).root, "$.root");
  } else {
    for (const [id, node] of Object.entries(schema.nodes)) {
      if (isPlainObject(node)) bagsOf(node as unknown as Record<string, unknown>, `$.nodes.${id}`, out);
    }
  }
  return out;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `member` and `screens` (SDL-632) — SHAPE only. Deliberately NOT checked:
 * whether `member` sits under a hybrid node. A `member` left behind on a node
 * that is no longer hybrid is inert (the renderer ignores it, the public shell
 * strips it), and refusing it would lock the author out of a document that is
 * already in storage — the very editor that clears it could not load it.
 */
function validateBranchShapes(
  n: Record<string, unknown>,
  path: string,
  issues: SaunaValidationIssue[]
): void {
  if (n.member !== undefined) {
    if (!isPlainObject(n.member)) {
      issues.push(issue(`${path}.member`, "member must be an object ({ props })"));
    } else {
      const props = (n.member as Record<string, unknown>).props;
      if (props !== undefined && !isPlainObject(props)) {
        issues.push(issue(`${path}.member.props`, "member props must be an object"));
      }
    }
  }
  if (n.screens !== undefined) {
    if (!isPlainObject(n.screens)) {
      issues.push(issue(`${path}.screens`, "screens must be an object ({ tablet?, mobile? })"));
      return;
    }
    for (const [screen, override] of Object.entries(n.screens as Record<string, unknown>)) {
      if (!(SAUNA_SCREENS as readonly string[]).includes(screen)) {
        issues.push(issue(`${path}.screens.${screen}`, `unknown screen "${screen}" (expected ${SAUNA_SCREENS.join(" | ")})`));
        continue;
      }
      if (!isPlainObject(override)) {
        issues.push(issue(`${path}.screens.${screen}`, "screen override must be an object ({ props })"));
        continue;
      }
      const props = (override as Record<string, unknown>).props;
      if (props !== undefined && !isPlainObject(props)) {
        issues.push(issue(`${path}.screens.${screen}.props`, "screen props must be an object"));
      }
    }
  }
}

function validateNodeV1(node: unknown, path: string, issues: SaunaValidationIssue[]) {
  if (!node || typeof node !== "object") {
    issues.push(issue(path, "node must be an object"));
    return;
  }
  const n = node as Partial<SaunaNodeV1>;
  if (typeof n.type !== "string" || n.type.length === 0) {
    issues.push(issue(`${path}.type`, "type is required"));
  }
  // Same rule as a v2 node (SDL-639): the migration carries it as is (SDL-725).
  if (n.propsVersion !== undefined && (typeof n.propsVersion !== "number" || !Number.isInteger(n.propsVersion) || n.propsVersion < 1)) {
    issues.push(issue(`${path}.propsVersion`, "propsVersion must be an integer >= 1 (absent means 1)"));
  }
  if (n.props && typeof n.props !== "object") {
    issues.push(issue(`${path}.props`, "props must be an object"));
  }
  validateVisibilityShape(n.visibility, `${path}.visibility`, issues);
  if (n.children) {
    if (!Array.isArray(n.children)) {
      issues.push(issue(`${path}.children`, "children must be an array"));
    } else {
      n.children.forEach((c, idx) => validateNodeV1(c, `${path}.children[${idx}]`, issues));
    }
  }
}

function validateSchemaV1(schema: unknown): SaunaValidationResult<SaunaSchemaV1> {
  const issues: SaunaValidationIssue[] = [];
  if (!schema || typeof schema !== "object") {
    return { ok: false, error: { message: "schema must be an object", issues: [issue("$", "schema must be an object")] } };
  }
  const s = schema as Partial<SaunaSchemaV1>;
  if (s.version !== 1) issues.push(issue("$.version", "version must be 1"));
  validateNodeV1((s as { root?: unknown }).root, "$.root", issues);
  if (issues.length) return { ok: false, error: { message: "Invalid schema v1", issues } };
  return { ok: true, value: schema as SaunaSchemaV1 };
}

function validateSchemaV2(schema: unknown): SaunaValidationResult<SaunaSchemaV2> {
  const issues: SaunaValidationIssue[] = [];
  if (!schema || typeof schema !== "object") {
    return { ok: false, error: { message: "schema must be an object", issues: [issue("$", "schema must be an object")] } };
  }
  const s = schema as Partial<SaunaSchemaV2>;
  if (s.version !== 2) issues.push(issue("$.version", "version must be 2"));
  if (typeof s.rootId !== "string" || s.rootId.length === 0) issues.push(issue("$.rootId", "rootId is required"));
  // An ARRAY passes `typeof === "object"`, and `doc.nodes["1"]` on an array
  // works by index — so a document with `nodes: [...]` rendered and cut by
  // two different readings (S4 review, round 2). Refused by name here, and
  // the public shell drops such a body fail-closed.
  if (!isPlainObject(s.nodes)) issues.push(issue("$.nodes", "nodes must be an object (not an array)"));
  if (!isPlainObject(s.parents)) issues.push(issue("$.parents", "parents must be an object (not an array)"));

  if (isPlainObject(s.nodes)) {
    const nodeIds = new Set(Object.keys(s.nodes as Record<string, unknown>));
    for (const [id, node] of Object.entries(s.nodes as Record<string, unknown>)) {
      if (!node || typeof node !== "object") {
        issues.push(issue(`$.nodes.${id}`, "node must be an object"));
        continue;
      }
      const n = node as Record<string, unknown>;
      if (typeof n.type !== "string" || n.type.length === 0) issues.push(issue(`$.nodes.${id}.type`, "type is required"));
      // `name` (SDL-302) is optional and free-form, so the only thing worth
      // checking is that it is text at all — a number or an object here
      // would reach the outline as a React child and throw at render.
      if (n.name !== undefined && typeof n.name !== "string") {
        issues.push(issue(`$.nodes.${id}.name`, "name must be a string"));
      }
      // `propsVersion` (EP-128, SDL-639) is optional — absent means 1 — but
      // when present it must be a whole number from 1 up: `"1"`, `0` or `1.5`
      // would make `saunaNodePropsVersion` answer something no Element ever
      // declared, and the node would be refused by every reader for a
      // reason the author cannot see. Its CONTENTS (which versions exist)
      // are the Element definition's business, not the document's.
      if (n.propsVersion !== undefined && (typeof n.propsVersion !== "number" || !Number.isInteger(n.propsVersion) || n.propsVersion < 1)) {
        issues.push(issue(`$.nodes.${id}.propsVersion`, "propsVersion must be an integer >= 1 (absent means 1)"));
      }
      if (n.props && typeof n.props !== "object") issues.push(issue(`$.nodes.${id}.props`, "props must be an object"));
      if (n.children && !Array.isArray(n.children)) issues.push(issue(`$.nodes.${id}.children`, "children must be an array"));
      validateVisibilityShape(n.visibility, `$.nodes.${id}.visibility`, issues);
      validateBranchShapes(n, `$.nodes.${id}`, issues);

      // variants — structural validation only. `when` is not parsed
      // here: it's the same VisibilityRule type the visibility engine
      // consumes, and that engine is intentionally lenient at runtime
      // (unknown ops degrade to false). Validating it here would
      // duplicate the rule grammar and rot in step with it.
      if (n.variants !== undefined) {
        if (!Array.isArray(n.variants)) {
          issues.push(issue(`$.nodes.${id}.variants`, "variants must be an array"));
        } else {
          const seenVariantIds = new Set<string>();
          n.variants.forEach((v: unknown, idx: number) => {
            const vPath = `$.nodes.${id}.variants[${idx}]`;
            if (!v || typeof v !== "object") {
              issues.push(issue(vPath, "variant must be an object"));
              return;
            }
            const variant = v as Record<string, unknown>;
            if (typeof variant.id !== "string" || variant.id.length === 0) {
              issues.push(issue(`${vPath}.id`, "variant id is required"));
            } else if (seenVariantIds.has(variant.id)) {
              issues.push(issue(`${vPath}.id`, `duplicate variant id "${variant.id}" within node`));
            } else {
              seenVariantIds.add(variant.id);
            }
            if (!variant.when || typeof variant.when !== "object") {
              issues.push(issue(`${vPath}.when`, "variant `when` is required (VisibilityRule)"));
            }
            if (variant.props !== undefined && (variant.props === null || typeof variant.props !== "object" || Array.isArray(variant.props))) {
              issues.push(issue(`${vPath}.props`, "variant props must be an object"));
            }
            if (variant.children !== undefined) {
              if (!Array.isArray(variant.children)) {
                issues.push(issue(`${vPath}.children`, "variant children must be an array"));
              } else {
                variant.children.forEach((childId: unknown, cidx: number) => {
                  if (typeof childId !== "string") {
                    issues.push(issue(`${vPath}.children[${cidx}]`, "child id must be a string"));
                  } else if (!nodeIds.has(childId)) {
                    issues.push(issue(`${vPath}.children[${cidx}]`, `child id "${childId}" not found in nodes`));
                  }
                });
              }
            }
            if (variant.label !== undefined && typeof variant.label !== "string") {
              issues.push(issue(`${vPath}.label`, "variant label must be a string"));
            }
          });
        }
      }
    }
  }

  // params — the block's parameter manifest (SDL-500). Structural only
  // here; the typed half (`type`, `default`, `options`, name length —
  // SDL-718) is `findParamSpecIssues`, strict on write, a warning on read,
  // in the same spirit as `variants` above: shape is checked, meaning is
  // not. Specifically NOT checked here is whether `nodeId`/`prop` still
  // resolve — an unresolvable spec is an ORPHAN, and an orphan is a
  // report to the author (SDL-501), not grounds to refuse a document
  // that is already on disk. Refusing it would lock the author out of
  // the very editor that could fix it.
  //
  // Duplicate `name` IS refused, because a duplicate has no reading at
  // all: two specs claiming the same name make the page's `params` map
  // ambiguous, and ambiguity resolved silently is the failure hard
  // rule 7 exists to prevent.
  if (s.params !== undefined) {
    if (!Array.isArray(s.params)) {
      issues.push(issue("$.params", "params must be an array"));
    } else {
      const seenParamNames = new Set<string>();
      s.params.forEach((raw: unknown, idx: number) => {
        const pPath = `$.params[${idx}]`;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          issues.push(issue(pPath, "param must be an object"));
          return;
        }
        const param = raw as Record<string, unknown>;
        if (typeof param.name !== "string" || param.name.trim().length === 0) {
          issues.push(issue(`${pPath}.name`, "param name is required"));
        } else if (seenParamNames.has(param.name)) {
          issues.push(issue(`${pPath}.name`, `duplicate param name "${param.name}"`));
        } else {
          seenParamNames.add(param.name);
        }
        if (typeof param.nodeId !== "string" || param.nodeId.length === 0) {
          issues.push(issue(`${pPath}.nodeId`, "param nodeId is required"));
        }
        if (typeof param.prop !== "string" || param.prop.length === 0) {
          issues.push(issue(`${pPath}.prop`, "param prop is required"));
        }
        if (param.label !== undefined && typeof param.label !== "string") {
          issues.push(issue(`${pPath}.label`, "param label must be a string"));
        }
      });
    }
  }

  // Page behaviour slots (SDL-690) — `queries`/`state` here, `bind`/`on` on
  // nodes — are deliberately NOT checked and NOT rebuilt: nothing interprets
  // them yet, so there is no shape to refuse, and the value returned below is
  // the input itself, so they travel by value. pages-service holds the same
  // line; the check arrives with the interpreter. A node-level `on` is not an
  // `on…` prop: `findUnsafeSchemaProps` only reads prop bags.

  // Ensure root exists
  if (typeof s.rootId === "string" && isPlainObject(s.nodes)) {
    const nodesObj = s.nodes as Record<string, unknown>;
    if (!nodesObj[s.rootId]) issues.push(issue("$.rootId", "rootId must exist in nodes"));
  }

  if (issues.length) return { ok: false, error: { message: "Invalid schema v2", issues } };
  return { ok: true, value: schema as SaunaSchemaV2 };
}

export function validateSaunaSchema(
  schema: unknown,
  options: { mode?: SaunaValidationMode } = {}
): SaunaValidationResult<SaunaAnySchema> {
  const v = (schema as { version?: unknown } | null)?.version;
  if (v === 1 || v === 2) {
    const structural: SaunaValidationResult<SaunaAnySchema> = v === 1 ? validateSchemaV1(schema) : validateSchemaV2(schema);
    if (!structural.ok) return structural;
    const unsafe = findUnsafeSchemaProps(structural.value);
    // Typed block parameters (SDL-718): the same strict-on-write, lenient-on-
    // read split as unsafe props. A stored block with a bad `default` still
    // renders (`applyBlockParams` ignores a default that breaks its type);
    // only a write is refused.
    const params = v === 2 ? findParamSpecIssues((structural.value as SaunaSchemaV2).params) : [];
    if (unsafe.length === 0 && params.length === 0) return structural;
    if (options.mode === "write") {
      const message =
        params.length === 0
          ? "Unsafe URL or raw-HTML prop"
          : unsafe.length === 0
            ? "Invalid block parameters"
            : "Invalid block parameters and unsafe URL or raw-HTML prop";
      return { ok: false, error: { message, issues: [...params, ...unsafe] } };
    }
    return { ok: true, value: structural.value, warnings: [...params, ...unsafe] };
  }
  return {
    ok: false,
    error: {
      message: "Unsupported schema version",
      issues: [issue("$.version", "version must be 1 or 2")],
    },
  };
}

