"use client";

// The 500 page (SDL-685). Plain markup on purpose: the page body may be what
// broke, so this must not depend on the renderer or the kit. The server error
// itself is reported by `onRequestError` (src/instrumentation.ts).
export default function SiteError() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Something went wrong</h1>
      <p style={{ color: "#666" }}>This page could not be shown. Please try again later.</p>
    </main>
  );
}
