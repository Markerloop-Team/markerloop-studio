"use client";

import * as React from "react";

import type { SaunaAnySchema, SaunaId, SaunaSchema } from "../schema/types";
import { migrateSaunaSchema, validateSaunaSchema } from "../index";
import { createBasicCatalogFromRegistry } from "./catalog";
import { useSaunaContext } from "./sauna-provider";
import type { SaunaProps } from "./sauna-props";
import { SaunaEditorModal } from "./editor/modal";
import { SaunaRenderer } from "./renderer";
import type { SaunaContext } from "./types";

const defaultEndpoint = (id: SaunaId) => `/api/sauna/${encodeURIComponent(id)}`;

async function fetchSchema(url: string): Promise<SaunaAnySchema> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as SaunaAnySchema;
}

function mergeContext(
  base: SaunaContext | undefined,
  override: SaunaContext | undefined,
  patch: Partial<SaunaContext> | undefined
): SaunaContext | undefined {
  if (!base && !override && !patch) return undefined;
  return { ...(base ?? {}), ...(override ?? {}), ...(patch ?? {}) };
}

export function Sauna(props: SaunaProps) {
  const providerValue = useSaunaContext();

  const { id, editable = false } = props;

  const registry = props.registry ?? providerValue?.registry;
  const context = React.useMemo(
    () => mergeContext(providerValue?.context, props.context, props.extra),
    [providerValue?.context, props.context, props.extra]
  );

  const catalog = React.useMemo(
    () =>
      props.catalog ??
      providerValue?.catalog ??
      (registry ? createBasicCatalogFromRegistry(registry) : undefined),
    [props.catalog, providerValue?.catalog, registry]
  );

  const endpointFn = React.useMemo(
    () => props.endpoint ?? providerValue?.endpoint ?? defaultEndpoint,
    [props.endpoint, providerValue?.endpoint]
  );
  const url = React.useMemo(() => endpointFn(id), [endpointFn, id]);

  const [schema, setSchema] = React.useState<SaunaSchema | null>(props.schema ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);

  React.useEffect(() => {
    // Если schema пришла как prop (SSR), то не делаем запрос.
    if (props.schema) {
      setSchema(props.schema);
      setError(null);
      return;
    }

    let cancelled = false;
    setSchema(null);
    setError(null);

    fetchSchema(url)
      .then((raw) => {
        const validated = validateSaunaSchema(raw);
        if (!validated.ok) throw new Error(validated.error.message);
        return migrateSaunaSchema(validated.value);
      })
      .then((normalized) => {
        if (!cancelled) setSchema(normalized);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Unknown error";
        if (!cancelled) setError(msg);
      });

    return () => {
      cancelled = true;
    };
  }, [props.schema, url]);

  if (!registry) {
    return (
      <pre style={{ whiteSpace: "pre-wrap" }}>
        Sauna: registry is required. Pass it as a prop or wrap the tree in
        {" <SaunaProvider registry={...}>"}.
      </pre>
    );
  }

  if (error) {
    return <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>;
  }
  if (!schema) {
    return <div>Loading…</div>;
  }

  return (
    <div style={{ position: "relative" }}>
      {editable ? (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 50,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          Edit
        </button>
      ) : null}

      <SaunaRenderer schema={schema} registry={registry} context={context} />

      {editable && catalog ? (
        <SaunaEditorModal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          schema={schema}
          onChange={setSchema}
          registry={registry}
          context={context}
          catalog={catalog}
        />
      ) : null}
    </div>
  );
}
