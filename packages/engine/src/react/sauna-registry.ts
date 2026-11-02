import type { SaunaAnyComponent, SaunaRegistry } from "./types";
import { isRenderableComponent } from "./is-renderable-component";

export type CreateSaunaRegistryOptions = {
  include?: string[];
  exclude?: string[];
};

function isProbablyComponent(name: string, value: unknown): value is SaunaAnyComponent {
  return isRenderableComponent(name, value);
}

export function createSaunaRegistry(
  ui: Record<string, unknown>,
  options?: CreateSaunaRegistryOptions
): SaunaRegistry {
  const include = new Set(options?.include ?? []);
  const exclude = new Set(options?.exclude ?? []);
  const out: SaunaRegistry = {};

  for (const [name, value] of Object.entries(ui)) {
    if (exclude.has(name)) continue;
    if (include.size > 0 && !include.has(name)) continue;
    if (!isProbablyComponent(name, value)) continue;
    out[name] = value;
  }

  return out;
}

