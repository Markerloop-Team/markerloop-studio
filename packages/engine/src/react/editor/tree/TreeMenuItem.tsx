"use client";

import * as React from "react";

import { TreeIcon } from "./TreeIcon";

export function TreeMenuItem({
  icon,
  label,
  disabled,
  danger,
  onClick,
}: {
  icon: "plus" | "trash" | "copy" | "duplicate" | "arrowUp" | "arrowDown";
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      style={{
        width: "100%",
        padding: "10px 10px",
        border: "none",
        background: "var(--background)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: 13,
        color: danger ? "var(--destructive)" : "var(--foreground)",
        textAlign: "left",
      }}
    >
      <span style={{ width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <TreeIcon name={icon} size={16} />
      </span>
      <span>{label}</span>
    </button>
  );
}

