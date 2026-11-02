"use client";

import * as React from "react";

import type { SaunaNodeId, SaunaSchema } from "../../schema/types";
import type { SaunaComponentCatalog } from "../catalog";
import { isCatalogItemAllowed } from "../catalog";
import type { SaunaContext, SaunaRegistry } from "../types";
import { SaunaRenderer } from "../renderer";
import { SaunaAddChildModal } from "./add-child-modal";
import { SaunaDetails } from "./details";
import {
  addChildNode,
  duplicateSubtree,
  removeSubtree,
  reorderChildren,
} from "./schema-ops";
import { SaunaTree } from "./tree";

export type SaunaEditorModalProps = {
  open: boolean;
  onClose: () => void;

  schema: SaunaSchema;
  onChange: (next: SaunaSchema) => void;

  registry: SaunaRegistry;
  context?: SaunaContext;

  catalog: SaunaComponentCatalog;
};

function Icon({
  name,
  size = 18,
}: {
  name:
    | "panelLeft"
    | "panelRight"
    | "eye"
    | "eyeOff"
    | "mobile"
    | "tablet"
    | "desktop"
    | "desktopLarge"
    | "minus"
    | "plus"
    | "x";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  } as const;

  const stroke = "currentColor";
  const strokeWidth = 2;
  const strokeLinecap = "round" as const;
  const strokeLinejoin = "round" as const;

  if (name === "panelLeft") {
    return (
      <svg {...common}>
        <path d="M4 5h16v14H4V5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin={strokeLinejoin} />
        <path d="M9 5v14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
      </svg>
    );
  }
  if (name === "panelRight") {
    return (
      <svg {...common}>
        <path d="M4 5h16v14H4V5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin={strokeLinejoin} />
        <path d="M15 5v14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
      </svg>
    );
  }
  if (name === "eye") {
    return (
      <svg {...common}>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin={strokeLinejoin}
        />
        <path
          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin={strokeLinejoin}
        />
      </svg>
    );
  }
  if (name === "eyeOff") {
    return (
      <svg {...common}>
        <path d="M3 3l18 18" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
        <path
          d="M2 12s3.5-7 10-7c2.2 0 4.1.8 5.7 2"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
        />
        <path
          d="M22 12s-3.5 7-10 7c-2.2 0-4.1-.8-5.7-2"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
        />
      </svg>
    );
  }
  if (name === "mobile") {
    return (
      <svg {...common}>
        <path d="M8 3h8v18H8V3Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin={strokeLinejoin} />
        <path d="M11 18h2" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
      </svg>
    );
  }
  if (name === "tablet") {
    return (
      <svg {...common}>
        <path d="M6 4h12v16H6V4Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin={strokeLinejoin} />
        <path d="M11.5 17h1" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
      </svg>
    );
  }
  if (name === "desktop") {
    return (
      <svg {...common}>
        <path d="M4 5h16v11H4V5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin={strokeLinejoin} />
        <path d="M9 19h6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
        <path d="M12 16v3" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
      </svg>
    );
  }
  if (name === "desktopLarge") {
    return (
      <svg {...common}>
        <path d="M3 5h18v11H3V5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin={strokeLinejoin} />
        <path d="M8 19h8" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
        <path d="M12 16v3" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
      </svg>
    );
  }
  if (name === "minus") {
    return (
      <svg {...common}>
        <path d="M6 12h12" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg {...common}>
        <path
          d="M12 5v14M5 12h14"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
        />
      </svg>
    );
  }
  if (name === "x") {
    return (
      <svg {...common}>
        <path
          d="M6 6l12 12M18 6 6 18"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
        />
      </svg>
    );
  }
  return null;
}

export function SaunaEditorModal({
  open,
  onClose,
  schema,
  onChange,
  registry,
  context,
  catalog,
}: SaunaEditorModalProps) {
  const TOP_BAR_H = 56;
  const LEFT_W = 360;
  const RIGHT_W = 420;

  const [selectedId, setSelectedId] = React.useState<SaunaNodeId | null>(schema.rootId);
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addParentId, setAddParentId] = React.useState<SaunaNodeId | null>(schema.rootId);

  const [device, setDevice] = React.useState<"mobile" | "tablet" | "desktop" | "desktopLarge">("desktop");
  const [previewWidth, setPreviewWidth] = React.useState<number>(1200);
  const [previewHeight, setPreviewHeight] = React.useState<number>(720);
  const [zoom, setZoom] = React.useState<number>(1);

  React.useEffect(() => {
    if (!open) return;
    setSelectedId(schema.rootId);
    setLeftOpen(true);
    setRightOpen(true);
    setAddOpen(false);
    setAddParentId(schema.rootId);
  }, [open, schema.rootId]);

  const preset = (next: typeof device) => {
    setDevice(next);
    if (next === "mobile") {
      setPreviewWidth(390);
      setPreviewHeight(844);
      setZoom(1);
    } else if (next === "tablet") {
      setPreviewWidth(820);
      setPreviewHeight(1180);
      setZoom(0.9);
    } else if (next === "desktop") {
      setPreviewWidth(1200);
      setPreviewHeight(720);
      setZoom(1);
    } else {
      setPreviewWidth(1440);
      setPreviewHeight(900);
      setZoom(1);
    }
  };

  const addChild = (
    parentId: SaunaNodeId,
    item: { type: string; initialProps?: Record<string, unknown> }
  ) => {
    const next = addChildNode(schema, parentId, { type: item.type, props: item.initialProps });
    onChange(next.schema);
    setSelectedId(next.nodeId);
  };

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const zoomIn = () => setZoom((z) => clamp(Math.round((z + 0.1) * 10) / 10, 0.25, 2));
  const zoomOut = () => setZoom((z) => clamp(Math.round((z - 0.1) * 10) / 10, 0.25, 2));

  const canAddChild = React.useCallback(
    (parentId: SaunaNodeId): { ok: boolean; reason?: string } => {
      const parentType = schema.nodes[parentId]?.type;
      if (!parentType) return { ok: false, reason: "Parent not found" };

      const ok = catalog.items.some((it) =>
        isCatalogItemAllowed(catalog, { parentType, childType: it.type, item: it })
      );
      if (!ok) return { ok: false, reason: "This component accepts no child components" };
      return { ok: true };
    },
    [catalog, schema.nodes]
  );

  function openAddFor(parentId: SaunaNodeId) {
    setAddParentId(parentId);
    setAddOpen(true);
  }

  const nodeActions = {
    duplicate: (nodeId: SaunaNodeId) => {
      const next = duplicateSubtree(schema, nodeId);
      onChange(next.schema);
      setSelectedId(next.nodeId);
    },
    remove: (nodeId: SaunaNodeId) => {
      const next = removeSubtree(schema, nodeId);
      onChange(next.schema);
      if (next.parentId) setSelectedId(next.parentId);
    },
    move: (nodeId: SaunaNodeId, dir: "up" | "down") => {
      const parentId = schema.parents[nodeId];
      if (!parentId) return;
      const siblings = schema.nodes[parentId]?.children ?? [];
      const idx = siblings.indexOf(nodeId);
      if (idx < 0) return;
      const to = dir === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= siblings.length) return;
      onChange(reorderChildren(schema, parentId, idx, to));
    },
  };

  // ВАЖНО: хуки выше должны вызываться всегда (даже когда open=false).
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--background)",
        color: "var(--foreground)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: TOP_BAR_H,
          borderBottom: "1px solid var(--border)",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "0 12px",
          gap: 12,
          fontFamily: "ui-sans-serif, system-ui",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setLeftOpen((v) => !v)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: leftOpen ? "var(--muted)" : "var(--background)",
              color: "var(--foreground)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Schema tree"
            title="Schema tree"
          >
            <Icon name="panelLeft" />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => {
              const anyOpen = leftOpen || rightOpen;
              if (anyOpen) {
                setLeftOpen(false);
                setRightOpen(false);
              } else {
                setLeftOpen(true);
                setRightOpen(true);
              }
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label={leftOpen || rightOpen ? "Hide all" : "Show all"}
            title={leftOpen || rightOpen ? "Hide all" : "Show all"}
          >
            <Icon name={leftOpen || rightOpen ? "eyeOff" : "eye"} />
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {(
              [
                ["mobile", "mobile"],
                ["tablet", "tablet"],
                ["desktop", "desktop"],
                ["desktopLarge", "desktopLarge"],
              ] as const
            ).map(([key, iconName]) => (
              <button
                key={key}
                type="button"
                onClick={() => preset(key)}
                style={{
                  padding: "8px 10px",
                  border: "none",
                  background: device === key ? "var(--muted)" : "var(--background)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={key}
                aria-label={key}
              >
                <Icon
                  name={
                    iconName === "mobile"
                      ? "mobile"
                      : iconName === "tablet"
                        ? "tablet"
                        : iconName === "desktop"
                          ? "desktop"
                          : "desktopLarge"
                  }
                />
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ opacity: 0.7, fontSize: 12 }}>W</span>
            <input
              value={String(previewWidth)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setPreviewWidth(clamp(n, 200, 5000));
              }}
              style={{
                width: 84,
                padding: "7px 8px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
              inputMode="numeric"
            />
            <span style={{ opacity: 0.7, fontSize: 12 }}>H</span>
            <input
              value={String(previewHeight)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setPreviewHeight(clamp(n, 200, 5000));
              }}
              style={{
                width: 84,
                padding: "7px 8px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
              inputMode="numeric"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={zoomOut}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Icon name="minus" />
            </button>
            <div style={{ width: 54, textAlign: "center", fontSize: 12, opacity: 0.8 }}>
              {Math.round(zoom * 100)}%
            </div>
            <button
              type="button"
              onClick={zoomIn}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Icon name="plus" />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setRightOpen((v) => !v)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: rightOpen ? "var(--muted)" : "var(--background)",
              color: "var(--foreground)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Details"
            title="Details"
          >
            <Icon name="panelRight" />
          </button>
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
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Close"
            title="Close"
          >
            <Icon name="x" />
          </button>
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "auto",
            background: "var(--muted)",
          }}
        >
          <div
            style={{
              padding: 24,
              minHeight: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: previewWidth,
                height: previewHeight,
                background: "var(--card)",
                color: "var(--card-foreground)",
                borderRadius: 14,
                border: "1px solid var(--border)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                overflow: "auto",
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
              }}
            >
              <div style={{ padding: 16 }}>
                <SaunaRenderer schema={schema} registry={registry} context={context} />
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: LEFT_W,
            // Clamp to the modal body: LEFT_W/RIGHT_W are absolute pixels, so
            // on a 390px phone the 420px details panel used to hang past the
            // frame (SDL-114). max-width resolves the used width to
            // min(panel, container) without touching the desktop case.
            maxWidth: "100%",
            transform: leftOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 180ms ease",
            background: "var(--background)",
            borderRight: "1px solid var(--border)",
            boxShadow: leftOpen ? "6px 0 18px rgba(0,0,0,0.06)" : "none",
            overflow: "auto",
          }}
        >
          <div style={{ fontWeight: 700, fontFamily: "ui-sans-serif, system-ui",             padding: 12,
          }}>Schema</div>
            <SaunaTree
              schema={schema}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorderWithinParent={(parentId, from, to) => onChange(reorderChildren(schema, parentId, from, to))}
              onAddChild={(parentId) => openAddFor(parentId)}
              canAddChild={canAddChild}
              onDuplicate={(id) => nodeActions.duplicate(id)}
              onDelete={(id) => nodeActions.remove(id)}
              onMove={(id, dir) => nodeActions.move(id, dir)}
            />
        </div>

        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: RIGHT_W,
            maxWidth: "100%",
            transform: rightOpen ? "translateX(0)" : "translateX(100%)",
            transition: "transform 180ms ease",
            background: "var(--background)",
            borderLeft: "1px solid var(--border)",
            boxShadow: rightOpen ? "-6px 0 18px rgba(0,0,0,0.06)" : "none",
            overflow: "auto",
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontFamily: "ui-sans-serif, system-ui" }}>Details</div>
          <div style={{ marginTop: 12 }}>
            <SaunaDetails schema={schema} selectedId={selectedId} onChange={onChange} />
          </div>
        </div>

        {addParentId ? (
          <SaunaAddChildModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            schema={schema}
            parentId={addParentId}
            registry={registry}
            context={context}
            catalog={catalog}
            onPick={(item) => {
              addChild(addParentId, item);
              setAddOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

