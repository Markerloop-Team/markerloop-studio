import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isSaunaConflictError,
  isSaunaNotFoundError,
  type SaunaConflictError,
} from "../providers/errors";
import type { SaunaProvider } from "../providers/types";
import { migrateSaunaSchema } from "../schema/migrate";
import { validateSaunaSchema, type SaunaValidationIssue } from "../schema/validate";

class SaunaRouteError extends Error {
  status: number;
  issues?: SaunaValidationIssue[];
  constructor(status: number, message: string, issues?: SaunaValidationIssue[]) {
    super(message);
    this.status = status;
    if (issues) this.issues = issues;
  }
}

/** The error body; a refused write names every offending path (SDL-681). */
function routeErrorBody(e: SaunaRouteError): { error: string; issues?: SaunaValidationIssue[] } {
  return e.issues ? { error: e.message, issues: e.issues } : { error: e.message };
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function withETag(res: NextResponse, version?: string): NextResponse {
  if (version) res.headers.set("ETag", version);
  return res;
}

/**
 * Wires a `SaunaProvider` onto a Next.js route. The handlers honour the
 * concurrency contract:
 *   - GET sets `ETag` from the snapshot's version.
 *   - PUT reads `If-Match` and forwards it to the provider; 412 maps to
 *     a `SaunaConflictError` from the provider, which we surface as
 *     HTTP 412 with the latest version in the `ETag` response header.
 */
export function createSaunaRouteHandlers(provider: SaunaProvider) {
  return {
    async GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
      try {
        const { id } = await ctx.params;
        const snapshot = await provider.get(id);
        return withETag(json(200, snapshot.schema), snapshot.version);
      } catch (e: unknown) {
        // Name-based guards — `instanceof` is unreliable across the
        // package's CJS+ESM dual build under Next.js (the class
        // identity diverges between the provider's bundled context
        // and this handler's bundled context). See
        // memory/feedback_instanceof_across_bundles.md.
        if (isSaunaNotFoundError(e)) return json(404, { error: e.message });
        if (e instanceof SaunaRouteError) return json(e.status, routeErrorBody(e));
        return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    async PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
      try {
        const { id } = await ctx.params;
        const raw = (await req.json()) as unknown;
        // Strict on write (SDL-681): an unsafe URL or raw-HTML prop is a 400
        // here, whatever the provider behind it checks on its own. The body
        // carries `issues` — `{ path, message }` per refused prop.
        const validated = validateSaunaSchema(raw, { mode: "write" });
        if (!validated.ok) throw new SaunaRouteError(400, validated.error.message, validated.error.issues);
        const schema = migrateSaunaSchema(validated.value);

        const ifMatch = req.headers.get("if-match") ?? undefined;
        const result = await provider.put(
          id,
          schema,
          ifMatch !== undefined ? { ifMatch } : undefined
        );
        return withETag(json(200, { ok: true }), result.version);
      } catch (e: unknown) {
        if (isSaunaConflictError(e)) {
          // Cast just to access the typed `latestVersion` field —
          // the guard already confirmed the shape.
          const conflict = e as SaunaConflictError;
          return withETag(
            json(412, { error: e.message, latestVersion: conflict.latestVersion }),
            conflict.latestVersion
          );
        }
        if (isSaunaNotFoundError(e)) return json(404, { error: e.message });
        if (e instanceof SaunaRouteError) return json(e.status, routeErrorBody(e));
        return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
      }
    },
  };
}
