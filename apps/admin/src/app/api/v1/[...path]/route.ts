// Showcase only: the in-process mock of the Markerloop gateway. In the
// product `/api/v1/*` never reaches Next.js — the ingress routes it to the
// gateway. Here every call is answered by src/demo/server against the
// visitor's own in-memory workspace. NEXT_PUBLIC_DEMO_MODE=false turns it off.

import { DEMO_MODE } from "@/demo/config";
import { handleDemoApi } from "@/demo/server/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ path: string[] }> };

async function handle(request: Request, { params }: Params): Promise<Response> {
  if (!DEMO_MODE) return new Response("Not found", { status: 404 });
  const { path } = await params;
  return handleDemoApi(request, path ?? []);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD };
