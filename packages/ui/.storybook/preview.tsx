import * as React from "react";
import type { Preview, Decorator } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import { MINIMAL_VIEWPORTS } from "storybook/viewport";

// Single CSS entry — preview.css imports the library globals and layers
// the preview-only Tailwind variant overrides in the same graph.
import "./preview.css";

/**
 * The review matrix is two combinations — light/dark (SDL-184). The old
 * second axis (surface treatment) is gone: SDL-182 removed the neumorphic
 * mode entirely, the admin palette is stock shadcn zinc with a single
 * surface mode, so there is nothing left to switch.
 *
 * The bare `data-surface` attribute stays: it is the scope of the admin
 * surface theme (layer 2 in src/ui/internal/styles/globals.css — "Storybook
 * проставляет его декоратором"). Without it stories would silently render
 * the public (layer 1) theme instead of the design system under review.
 */
const withAdminSurface: Decorator = (Story) => (
  <div data-surface className="bg-background text-foreground p-6 min-h-dvh">
    <Story />
  </div>
);

const preview: Preview = {
  /**
   * Autodocs — this is what renders the Source panel (SDL-249).
   *
   * `@storybook/addon-docs` being in `main.ts` only installs the doc blocks;
   * without this tag Storybook generates no docs entry, and the Source panel
   * lives ONLY on a docs page. The stand therefore had exactly one `type=docs`
   * entry in index.json (welcome--docs) while usage.md and llms.txt described
   * a source panel on every story — three tasks (SDL-246/247/248) fixed the
   * `originalSource` those panels show, all of them verified by reading the
   * built chunks, and none of them could have caught that no panel was
   * rendered. `curl /index.json | jq '[.entries[]|select(.type=="docs")]'` is
   * the check, not this comment.
   *
   * Applied globally rather than per-story on purpose: a per-story tag is one
   * more thing a new story can forget, and the invariant is "every component
   * has a docs page", not "these components do".
   */
  tags: ["autodocs"],

  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    a11y: { test: "todo" },
    options: {
      /**
       * "Welcome" first is what makes the welcome page the STAND'S START PAGE
       * (SDL-235), and it is the only mechanism that does: Storybook has no
       * "default story" setting. On a bare `/` the manager takes the first
       * entry of the sorted index whose type is `story` or `docs` and
       * navigates to it, and `storybook build` writes that same sorted order
       * into index.json — so `curl /index.json | head` is the check, not this
       * comment. Without the explicit entry the docs page sorts under W,
       * i.e. last, and the stand would open on Typography.
       *
       * The rest are the kit's layers (SDL-234), and they read bottom-up:
       * typography is what everything else is set in, layout arranges it,
       * components are built from both, and the admin layer is the
       * editor-only surface shipping from a separate entry
       * (`@markerloop/ui/ui/admin`).
       *
       * The order has to be spelled out because the default is alphabetical,
       * which inverts it into Admin → Components → Layout → Typography: the
       * editor-only surface first and the foundation last.
       *
       * The genre level inside Components is nested in the same array and is
       * spelled out for a different reason: anything absent from the list keeps
       * its *insertion* order, which comes from the story glob and is therefore
       * arbitrary — it first rendered as Widgets → Overlays → Primitives →
       * Forms → Data. Listing it makes the second level read simple-to-composed
       * as well.
       *
       * Written inline on purpose — Storybook parses this parameter statically
       * and rejects a reference to a named const ("should be defined inline").
       */
      storySort: {
        order: [
          "Welcome",
          "Typography",
          "Layout",
          "Components",
          ["Primitives", "Forms", "Overlays", "Widgets", "Data"],
          "Admin",
        ],
        locales: "",
      },
    },
    viewport: {
      options: {
        ...MINIMAL_VIEWPORTS,
        desktop: {
          name: "Desktop",
          styles: { width: "1440px", height: "900px" },
        },
        mobile: { name: "Mobile", styles: { width: "390px", height: "844px" } },
      },
    },
  },

  initialGlobals: {
    viewport: { value: "desktop", isRotated: false },
  },

  decorators: [
    // Global decorators apply in declaration order: the admin-surface
    // wrapper wraps the theme class toggle.
    withAdminSurface,
    withThemeByClassName({
      // Empty class for light — the library's dark variant is
      // `@custom-variant dark (&:is(.dark *))`, toggled by the .dark class.
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
  ],
};

export default preview;
