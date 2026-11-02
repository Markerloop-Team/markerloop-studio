// SDL-950, review of !402: removing the LAST custom colour must not leave an
// error behind for the next added colour. React + react-hook-form in jsdom,
// the card's field names and rules (labels by customColorLabelValid, hex).
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;

import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { DEFAULT_THEME, cloneTheme, customColorLabelValid, customColors, isHex, type CustomColor, type SiteTheme } from "@/entities/site-theme";
import { removeCustomColorFromForm } from "./custom-colors-form";

function Card({ onForm }: { onForm: (f: UseFormReturn<SiteTheme>) => void }) {
  const form = useForm<SiteTheme>({
    mode: "onChange",
    defaultValues: { ...cloneTheme(DEFAULT_THEME), customColors: [{ key: "sea", label: "Sea", light: "#00aaaa", dark: "#007777" }] },
  });
  onForm(form);
  const colors = customColors(form.watch());
  return (
    <div>
      {colors.map((c, index) => (
        <div key={c.key}>
          <Controller
            control={form.control}
            name={`customColors.${index}.label` as const}
            rules={{ validate: (v: unknown) => customColorLabelValid(v) || "labelInvalid" }}
            render={({ field }) => <input {...field} value={String(field.value ?? "")} />}
          />
          {(["light", "dark"] as const).map((mode) => (
            <Controller
              key={mode}
              control={form.control}
              name={`customColors.${index}.${mode}` as const}
              rules={{ validate: (v: unknown) => (typeof v === "string" && isHex(v)) || "hexInvalid" }}
              render={({ field }) => <input {...field} value={String(field.value ?? "")} />}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// react-dom/client is loaded after the jsdom globals above (static imports are hoisted).
const createRoot = async (host: HTMLElement) => (await import("react-dom/client")).createRoot(host);

const tick = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

test("SDL-950 review: remove the only colour, add one — no error on the new colour", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = await createRoot(host);
  let form!: UseFormReturn<SiteTheme>;
  try {
    await act(async () => root.render(<Card onForm={(f) => (form = f)} />));
    const only = customColors(form.getValues());
    await act(async () => removeCustomColorFromForm(form, only, "sea"));
    await tick();
    assert.deepEqual(customColors(form.getValues()), []);
    assert.equal(form.formState.errors.customColors, undefined, "no error after removing the last colour");
    const added: CustomColor = { key: "brandBlue", label: "Brand blue", light: "#1d4ed8", dark: "#60a5fa" };
    await act(async () => form.setValue("customColors", [added], { shouldDirty: true }));
    await tick();
    assert.equal(host.querySelectorAll("input").length, 3, "the new row is drawn");
    assert.equal(form.formState.errors.customColors, undefined, "the new, valid colour shows no stale error");
    assert.equal(await form.trigger(["customColors.0.label", "customColors.0.light", "customColors.0.dark"]), true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("SDL-950 review: removing one of two keeps the remaining row's own error and nothing of the removed one", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = await createRoot(host);
  let form!: UseFormReturn<SiteTheme>;
  try {
    await act(async () => root.render(<Card onForm={(f) => (form = f)} />));
    const two: CustomColor[] = [
      { key: "bad", label: "  ", light: "#000000", dark: "#000000" },
      { key: "ok", label: "Ok", light: "#111111", dark: "#222222" },
    ];
    await act(async () => form.setValue("customColors", two));
    await tick();
    await act(async () => { await form.trigger("customColors.0.label"); });
    assert.ok(form.formState.errors.customColors?.[0]?.label, "the bad name is an error");
    await act(async () => removeCustomColorFromForm(form, two, "bad"));
    await tick();
    assert.equal(form.formState.errors.customColors, undefined, "the removed row's error does not move to «Ok»");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
