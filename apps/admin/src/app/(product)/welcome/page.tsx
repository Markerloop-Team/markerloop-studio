"use client";

// /welcome — «Create your first workspace» (SDL-759, EP-155).
//
// Owner decision 8 Oct 2026: signing up makes an account; a workspace is a
// project with an address the person picks, one free per account. A full page
// load of a workspace section by an account with no workspace is answered with
// a 307 here, on the server, before any frame of the section (re-open 16 Oct
// 2026: src/proxy/layers/welcome-check.ts + src/shared/lib/api/welcome-server.ts).
// The product shell draws this route without the rail and the header: there
// is nothing to navigate to yet. The card is shared with the dashboard, which
// draws it in place when the person ends up there without a workspace.

import * as UI from "@markerloop/ui/ui";

import { WelcomeCard } from "@/features/collections-switchers";

export default function WelcomePage() {
  return (
    <UI.Box
      variant="center"
      padding={4}
      className="min-h-dvh"
      data-testid="welcome-screen"
    >
      <WelcomeCard autoFocus />
    </UI.Box>
  );
}
