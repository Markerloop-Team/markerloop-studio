"use client";

// Root-layout crash (SDL-685): Next replaces the whole document with this.
export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#666" }}>This page could not be shown. Please try again later.</p>
        </main>
      </body>
    </html>
  );
}
