"use client";

import * as React from "react";

import { createEmptySaunaSchema } from "../../index";
import type { SaunaNodeId, SaunaSchema } from "../../schema/types";
import type { SaunaComponentCatalog, SaunaComponentCatalogItem } from "../catalog";
import { isCatalogItemAllowed } from "../catalog";
import { SaunaRenderer } from "../renderer";
import type { SaunaContext, SaunaRegistry } from "../types";
import { createInitialNodeConfig } from "./schema-ops";

export type SaunaAddChildModalProps = {
  open: boolean;
  onClose: () => void;

  schema: SaunaSchema;
  parentId: SaunaNodeId;

  registry: SaunaRegistry;
  context?: SaunaContext;

  catalog: SaunaComponentCatalog;
  onPick: (item: SaunaComponentCatalogItem) => void;
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function matches(item: SaunaComponentCatalogItem, q: string) {
  const hay = [
    item.type,
    item.title ?? "",
    item.description ?? "",
    ...(item.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function SaunaAddChildModal({
  open,
  onClose,
  schema,
  parentId,
  registry,
  context,
  catalog,
  onPick,
}: SaunaAddChildModalProps) {
  const parentType = schema.nodes[parentId]?.type ?? "Unknown";
  const [q, setQ] = React.useState("");
  const [openGroupId, setOpenGroupId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setOpenGroupId(
      catalog.groups.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.id ?? null
    );
  }, [open, catalog.groups]);

  if (!open) return null;

  const qq = normalize(q);
  const allowedItems = catalog.items.filter((it) =>
    isCatalogItemAllowed(catalog, { parentType, childType: it.type, item: it })
  );
  const filtered = qq ? allowedItems.filter((it) => matches(it, qq)) : allowedItems;

  const groupsSorted = catalog.groups
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const itemsByGroup = new Map<string, SaunaComponentCatalogItem[]>();
  for (const it of filtered) {
    const arr = itemsByGroup.get(it.groupId) ?? [];
    arr.push(it);
    itemsByGroup.set(it.groupId, arr);
  }

  const effectiveGroupId =
    openGroupId && itemsByGroup.get(openGroupId)?.length
      ? openGroupId
      : groupsSorted.find((g) => (itemsByGroup.get(g.id)?.length ?? 0) > 0)?.id ?? null;

  const bodyItems = effectiveGroupId ? itemsByGroup.get(effectiveGroupId) ?? [] : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(1200px, 100%)",
          height: "min(720px, 100%)",
          background: "var(--background)",
          color: "var(--foreground)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          boxShadow: "0 16px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "56px 1fr",
          fontFamily: "ui-sans-serif, system-ui",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800 }}>Add component</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Parent: <strong>{parentType}</strong>{" "}
              <span style={{ opacity: 0.6 }}>({String(parentId).slice(0, 8)})</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: "18px",
            }}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", minHeight: 0 }}>
          <div
            style={{
              borderRight: "1px solid var(--border)",
              padding: 12,
              overflow: "auto",
            }}
          >
            <input
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                marginBottom: 10,
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groupsSorted.map((g) => {
                const count = itemsByGroup.get(g.id)?.length ?? 0;
                if (count === 0) return null;
                const isOpen = effectiveGroupId === g.id;

                return (
                  <div
                    key={g.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenGroupId(g.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 10px",
                        background: isOpen ? "var(--muted)" : "var(--background)",
                        color: "var(--foreground)",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{g.title}</span>
                      <span style={{ fontSize: 12, opacity: 0.65 }}>{count}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 12, overflow: "auto", background: "var(--muted)" }}>
            {bodyItems.length === 0 ? (
              <div style={{ padding: 12, opacity: 0.75 }}>
                No components available to add to <strong>{parentType}</strong>.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {bodyItems.map((it) => {
                  const previewSchema =
                    it.previewSchema ??
                    (() => {
                      const s = createEmptySaunaSchema(it.type);
                      const root = s.nodes[s.rootId];
                      s.nodes[s.rootId] = {
                        ...root,
                        ...createInitialNodeConfig(it.type),
                        props: it.initialProps,
                      };
                      return s;
                    })();

                  return (
                    <button
                      key={it.type}
                      type="button"
                      onClick={() => onPick(it)}
                      style={{
                        textAlign: "left",
                        background: "var(--background)",
                        color: "var(--foreground)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        overflow: "hidden",
                        cursor: "pointer",
                        padding: 0,
                        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{it.title ?? it.type}</div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{it.type}</div>
                      </div>
                      <div style={{ padding: 10, background: "var(--muted)" }}>
                        <div
                          // Author-content island: surface comes from the public
                          // palette via studio-admin.css, so the rendered `.ss-*`
                          // preview reads the same way it will on the site. The
                          // admin card tokens that used to sit here inline made
                          // dark mode unreadable (SDL-221 follow-up).
                          data-sauna-author-surface
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: 10,
                            overflow: "hidden",
                          }}
                        >
                          {it.previewImageSrc ? (
                            <img
                              src={it.previewImageSrc}
                              alt={it.title ?? it.type}
                              loading="lazy"
                              style={{ width: "100%", height: "auto", display: "block" }}
                            />
                          ) : (
                            <SaunaRenderer schema={previewSchema} registry={registry} context={context} />
                          )}
                        </div>
                        {it.description ? (
                          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                            {it.description}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

