"use client";

import * as React from "react";

import type { SaunaNodeConfig, SaunaNodeId, SaunaSchema } from "../../schema/types";
import { updateNodeConfig } from "./schema-ops";

export type SaunaDetailsProps = {
  schema: SaunaSchema;
  selectedId: SaunaNodeId | null;
  onChange: (next: SaunaSchema) => void;
};

export function SaunaDetails({ schema, selectedId, onChange }: SaunaDetailsProps) {
  const node = selectedId ? schema.nodes[selectedId] : null;
  const [draft, setDraft] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setError(null);
    setDraft(node ? JSON.stringify(node, null, 2) : "");
  }, [selectedId, node]);

  if (!selectedId || !node) {
    return <div style={{ opacity: 0.7 }}>Select a node on the left.</div>;
  }

  const apply = () => {
    try {
      const parsed = JSON.parse(draft) as SaunaNodeConfig;
      if (!parsed || typeof parsed !== "object") throw new Error("invalid object");
      if (typeof parsed.type !== "string" || parsed.type.length === 0) {
        throw new Error("The type field is required");
      }
      setError(null);
      onChange(updateNodeConfig(schema, selectedId, parsed));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "JSON error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "ui-sans-serif, system-ui", fontSize: 13 }}>
        <div>
          <strong>{node.type}</strong>
        </div>
        <div style={{ opacity: 0.7 }}>{selectedId}</div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: 240,
          width: "100%",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--background)",
          color: "var(--foreground)",
          padding: 10,
        }}
      />

      {error ? (
        <div style={{ color: "var(--destructive)", fontFamily: "ui-sans-serif, system-ui", fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={apply}
        style={{
          alignSelf: "flex-start",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--background)",
          color: "var(--foreground)",
          cursor: "pointer",
        }}
      >
        Apply changes
      </button>
    </div>
  );
}

