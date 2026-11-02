import type { SaunaId } from "../schema/types";
import { migrateSaunaSchema, validateSaunaSchema } from "../index";
import { SaunaRenderer } from "./renderer";
import type { SaunaProps } from "./sauna-props";
import type { SaunaContext } from "./types";

const defaultEndpoint = (id: SaunaId) => `/api/sauna/${encodeURIComponent(id)}`;

async function fetchSchemaServer(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as unknown;
}

function mergeContext(
  base: SaunaContext | undefined,
  patch: Partial<SaunaContext> | undefined
): SaunaContext | undefined {
  if (!base && !patch) return undefined;
  return { ...(base ?? {}), ...(patch ?? {}) };
}

/**
 * Server-side `<Sauna>`.
 *
 * Server components cannot read React Context, so registry + context
 * must be passed as props. The client variant (`./sauna.client`) reads
 * them from `<SaunaProvider>` when omitted.
 */
export async function Sauna(props: SaunaProps) {
  const { id, registry } = props;
  if (!registry) {
    throw new Error(
      "Sauna (server): `registry` prop is required. Server components cannot read SaunaProvider context."
    );
  }
  const context = mergeContext(props.context, props.extra);

  if (props.schema) {
    return <SaunaRenderer schema={props.schema} registry={registry} context={context} />;
  }

  const endpointFn = props.endpoint ?? defaultEndpoint;
  const url = endpointFn(id);
  if (url.startsWith("/")) {
    throw new Error(
      `Sauna (server): endpoint must return an absolute URL (for example, https://example.com/api/sauna/{id}) ` +
        `or pass the schema prop instead. Received: "${url}".`
    );
  }

  const raw = await fetchSchemaServer(url);
  const validated = validateSaunaSchema(raw);
  if (!validated.ok) throw new Error(validated.error.message);
  const schema = migrateSaunaSchema(validated.value);

  return <SaunaRenderer schema={schema} registry={registry} context={context} />;
}
