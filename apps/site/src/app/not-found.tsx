// One 404 for every miss (SDL-685): unknown host, a workspace without an
// address, an unpublished route — the visitor cannot tell them apart.
export default function NotFound() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Page not found</h1>
      <p style={{ color: "#666" }}>There is nothing published at this address.</p>
    </main>
  );
}
