import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CASES, type EngineUnderTest } from "./fixtures";

/** Renders every fixture through the given engine: `{ caseName: html }`. */
export async function renderAll(engine: EngineUnderTest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of CASES) {
    out[c.name] = renderToStaticMarkup(<>{await c.render(engine)}</>);
  }
  return out;
}
