"use client";

import * as React from "react";

export function TreeIcon({
  name,
  size = 16,
}: {
  name: "chevron" | "plus" | "dots" | "trash" | "copy" | "duplicate" | "arrowUp" | "arrowDown";
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

  if (name === "chevron") {
    return (
      <svg {...common}>
        <path
          d="M9 6l6 6-6 6"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
        />
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
  if (name === "dots") {
    return (
      <svg {...common}>
        <path
          d="M5 12h.01M12 12h.01M19 12h.01"
          stroke={stroke}
          strokeWidth={strokeWidth + 1}
          strokeLinecap={strokeLinecap}
        />
      </svg>
    );
  }
  if (name === "trash") {
    return (
      <svg {...common}>
        <path d="M4 7h16" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
        <path d="M10 11v6M14 11v6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
        <path
          d="M6 7l1 14h10l1-14"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin={strokeLinejoin}
        />
        <path
          d="M9 7V4h6v3"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin={strokeLinejoin}
        />
      </svg>
    );
  }
  if (name === "copy") {
    return (
      <svg {...common}>
        <path
          d="M9 9h10v10H9V9Z"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin={strokeLinejoin}
        />
        <path
          d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
        />
      </svg>
    );
  }
  if (name === "duplicate") {
    return (
      <svg {...common}>
        <path
          d="M8 8h12v12H8V8Z"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin={strokeLinejoin}
        />
        <path
          d="M4 16V4h12"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
        />
      </svg>
    );
  }
  if (name === "arrowUp") {
    return (
      <svg {...common}>
        <path d="M12 5v14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
        <path
          d="M7 10l5-5 5 5"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
        />
      </svg>
    );
  }
  if (name === "arrowDown") {
    return (
      <svg {...common}>
        <path d="M12 5v14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} />
        <path
          d="M7 14l5 5 5-5"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
        />
      </svg>
    );
  }
  return null;
}

