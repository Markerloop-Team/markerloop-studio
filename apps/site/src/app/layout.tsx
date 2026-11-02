import type { Metadata } from "next";
import "@markerloop/ui/ui/styles.css";

// The workspace site's shell (SDL-685): no providers, no session, no cookies —
// a visitor's page is the published snapshot and nothing else.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
