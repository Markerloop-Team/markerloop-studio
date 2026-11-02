import { createSaunaNodeId } from "./id";
import type { SaunaSchema } from "./types";

export function createEmptySaunaSchema(rootType: string): SaunaSchema {
  const rootId = createSaunaNodeId();
  return {
    version: 2,
    rootId,
    nodes: {
      [rootId]: {
        type: rootType,
      },
    },
    parents: {
      [rootId]: null,
    },
  };
}

