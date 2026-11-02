// Typed block parameters (SDL-718, EP-145) — the contract shared with
// pages-service:
//
//   schema.params?: Array<{ name, nodeId, prop, label?, type?, default?, options? }>
//
// - `type` absent ⇒ "string"; a document written before SDL-718 has none and
//   stays valid as it is.
// - `name`: non-empty, at most 120 characters, unique (uniqueness is the
//   structural check in `validate.ts`, it predates this file).
// - `default` by type: string/text/url/file → string; number → finite number;
//   boolean → boolean; select → one of `options`. May be absent.
// - `options`: required and non-empty for `select` only (non-empty unique
//   strings); present on any other type it is an error.
// - An unknown `type` is an error. Extra keys are not. An orphan (a `nodeId`
//   the block does not have) is NOT this file's business — SDL-501 reports it.
//
// Pure: no React, no DOM, no I/O.

import {
  SAUNA_DEFAULT_PARAM_TYPE,
  SAUNA_PARAM_NAME_MAX,
  SAUNA_PARAM_TYPES,
  type SaunaParamSpec,
  type SaunaParamType,
} from "./types";

export type SaunaParamIssue = { path: string; message: string };

/** Is `value` one of the parameter types the contract knows? */
export function isSaunaParamType(value: unknown): value is SaunaParamType {
  return typeof value === "string" && (SAUNA_PARAM_TYPES as readonly string[]).includes(value);
}

/** The type a spec declares; absent ⇒ `"string"` (SDL-718). */
export function saunaParamType(spec: SaunaParamSpec): SaunaParamType {
  return spec.type === undefined ? SAUNA_DEFAULT_PARAM_TYPE : spec.type;
}

function defaultMatchesType(type: SaunaParamType, value: unknown, options: readonly string[] | null): string | null {
  switch (type) {
    case "string":
    case "text":
    case "url":
    case "file":
      return typeof value === "string" ? null : `param default must be a string for type "${type}"`;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : 'param default must be a finite number for type "number"';
    case "boolean":
      return typeof value === "boolean" ? null : 'param default must be a boolean for type "boolean"';
    case "select":
      if (typeof value !== "string") return 'param default must be a string for type "select"';
      if (options && !options.includes(value)) return `param default "${value}" is not one of the options`;
      return null;
  }
}

/**
 * The typed half of one spec's contract: `name` length, `type`, `options`,
 * `default`. Structure (`name`/`nodeId`/`prop` present, names unique) is
 * `validateSaunaSchema`'s structural pass; this one runs on a spec that
 * already passed it, and `[]` means the spec is fine.
 */
export function saunaParamSpecIssues(raw: unknown, path: string): SaunaParamIssue[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const spec = raw as Record<string, unknown>;
  const out: SaunaParamIssue[] = [];

  if (typeof spec.name === "string" && spec.name.length > SAUNA_PARAM_NAME_MAX) {
    out.push({ path: `${path}.name`, message: `param name must be at most ${SAUNA_PARAM_NAME_MAX} characters` });
  }

  if (spec.type !== undefined && !isSaunaParamType(spec.type)) {
    out.push({
      path: `${path}.type`,
      message: `unknown param type ${JSON.stringify(spec.type)} (one of ${SAUNA_PARAM_TYPES.join(", ")})`,
    });
    // Nothing below has a meaning without a type to measure it against.
    return out;
  }
  const type = saunaParamType(spec as unknown as SaunaParamSpec);

  // `options` — select only, and there it is required.
  let options: string[] | null = null;
  if (type === "select") {
    if (!Array.isArray(spec.options) || spec.options.length === 0) {
      out.push({ path: `${path}.options`, message: 'param options are required and must be a non-empty array for type "select"' });
    } else {
      const seen = new Set<string>();
      let fine = true;
      spec.options.forEach((opt: unknown, idx: number) => {
        if (typeof opt !== "string" || opt.length === 0) {
          out.push({ path: `${path}.options[${idx}]`, message: "param option must be a non-empty string" });
          fine = false;
        } else if (seen.has(opt)) {
          out.push({ path: `${path}.options[${idx}]`, message: `duplicate param option "${opt}"` });
          fine = false;
        } else {
          seen.add(opt);
        }
      });
      if (fine) options = spec.options as string[];
    }
  } else if (spec.options !== undefined) {
    out.push({ path: `${path}.options`, message: `param options are allowed only for type "select", not "${type}"` });
  }

  if (spec.default !== undefined) {
    // A select whose options are broken has no list to check the default
    // against: the options issue above already refuses the spec, and a
    // second message about the default would only repeat it.
    if (type !== "select" || options || typeof spec.default !== "string") {
      const problem = defaultMatchesType(type, spec.default, options);
      if (problem) out.push({ path: `${path}.default`, message: problem });
    }
  }

  return out;
}

/**
 * Every typed-contract issue of a schema's `params` (SDL-718). `[]` when
 * `params` is absent or not an array — that shape is the structural pass's
 * to refuse, not this one's.
 */
export function findParamSpecIssues(params: unknown): SaunaParamIssue[] {
  if (!Array.isArray(params)) return [];
  return params.flatMap((spec: unknown, idx: number) => saunaParamSpecIssues(spec, `$.params[${idx}]`));
}
