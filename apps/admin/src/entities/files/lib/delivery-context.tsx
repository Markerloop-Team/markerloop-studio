"use client";

// The public delivery host of files-service (FILES_PUBLIC_BASE_URL), read on
// the server by the product shell, app/(product)/layout.tsx, and handed down
// here to every product section (SDL-624, prod acceptance 29 Sep 2026): a public
// file answers with the relative /files/<id>, which must not resolve against
// the admin's own host (SDL-624 §6.3).
//
// It lives in the files entity, not in pages-media, because the file-URL
// query itself (fileUrlQuery) resolves against it: every consumer — the
// canvas, the image picker, the /files library — gets the same absolute URL
// from the same cache entry. Outside the provider the base is "" and a public
// file's URL stays relative — which on the admin host is a broken image, so
// the library then shows the glyph instead. Until 29 Sep 2026 the provider sat
// in app/(product)/pages/layout.tsx only, and /files and the collections image
// field were exactly that «outside».

import * as React from "react";

const FilesDeliveryContext = React.createContext<string>("");

export function FilesDeliveryProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <FilesDeliveryContext.Provider value={base}>{children}</FilesDeliveryContext.Provider>;
}

export function useFilesDeliveryBase(): string {
  return React.useContext(FilesDeliveryContext);
}
