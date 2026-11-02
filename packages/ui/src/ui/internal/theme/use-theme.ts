"use client";

import { useTheme as useNextTheme } from "next-themes";

export function useTheme() {
  return useNextTheme();
}

export type Theme = "light" | "dark" | "system";
