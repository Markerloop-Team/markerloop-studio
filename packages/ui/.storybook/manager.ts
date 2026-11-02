import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

import pkg from "../package.json";

/**
 * The stand's header carries the package name and version, read from
 * package.json at build time, so "which kit am I looking at?" is answered on
 * every page (inherited from the reference stand, SDL-237).
 */
addons.setConfig({
  theme: create({
    base: "light",
    brandTitle: `${pkg.name} ${pkg.version}`,
    // No brandUrl: the title is a label, and a link out of the manager frame
    // from the sidebar heading is not what a reader expects there.
  }),
});
