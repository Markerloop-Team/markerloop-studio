import { NextResponse } from "next/server";

import { PAGES_CATALOG_VERSION } from "@/widgets/pages/catalog-version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "markerloop-app",
    // Which image is answering (SDL-97). Comes from the Dockerfile's BUILD_SHA
    // arg, which CI fills with $CI_COMMIT_SHORT_SHA. The e2e stage polls this
    // until it sees its own tag, so a run cannot verify the previous image and
    // report green. "unknown" means the container was built without the arg —
    // local docker builds, and anything older than SDL-97.
    build: process.env.BUILD_SHA ?? "unknown",
    // Which pages Element catalog this image renders with (SDL-668): sha256
    // of src/widgets/pages/element-catalog.json without its own field.
    pagesCatalogVersion: PAGES_CATALOG_VERSION,
    timestamp: new Date().toISOString(),
  });
}

