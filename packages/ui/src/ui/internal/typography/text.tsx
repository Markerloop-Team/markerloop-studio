import * as React from "react";

import { cn } from "../utils/cn";

export type TextVariant =
  | "default"
  | "muted"
  | "destructive"
  | "mono"
  | "success"
  | "danger"
  | "kicker"
  | "label"
  | "meta";
export type TextSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
export type TextWeight = "normal" | "medium" | "semibold" | "bold";

// kicker/label/meta are the micro-typography presets from the EP-32 inventory
// (docs/tasks/EP-32-standardize-ui/00-inventory.md §4.1). The exact pixel
// values are kit-internal by design — screens say the name, never the px.
// Arbitrary sizes are legal inside the kit (§0 of the inventory); the presets
// own their font/size/weight/tracking/case and include the muted colour the
// consuming screens used everywhere.
const VARIANT_CLASS: Record<TextVariant, string> = {
  default: "",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
  mono: "font-mono",
  success: "text-success-foreground",
  danger: "text-destructive",
  kicker:
    "font-mono text-caption font-semibold tracking-[0.09em] uppercase text-muted-foreground",
  label:
    "font-mono text-caption font-semibold tracking-[0.1em] uppercase text-muted-foreground",
  meta: "font-mono text-caption font-normal text-muted-foreground",
};

const PRESET_VARIANTS: ReadonlySet<TextVariant> = new Set([
  "kicker",
  "label",
  "meta",
]);

const SIZE_CLASS: Record<TextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
};

const WEIGHT_CLASS: Record<TextWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

export type TextProps<T extends React.ElementType = "p"> = {
  as?: T;
  variant?: TextVariant;
  size?: TextSize;
  weight?: TextWeight;
  wrap?: "normal" | "break";
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">;

export function Text<T extends React.ElementType = "p">({
  as,
  variant = "default",
  size,
  weight,
  wrap = "normal",
  className,
  ...props
}: TextProps<T>) {
  const Comp = (as ?? "p") as React.ElementType;
  // Preset variants define their own size/weight; the md/normal defaults
  // apply only to the plain variants (and an explicit size/weight prop still
  // wins over a preset via twMerge order).
  const isPreset = PRESET_VARIANTS.has(variant);
  const sizeClass = size ? SIZE_CLASS[size] : isPreset ? undefined : SIZE_CLASS.md;
  const weightClass = weight
    ? WEIGHT_CLASS[weight]
    : isPreset
      ? undefined
      : WEIGHT_CLASS.normal;
  return (
    <Comp
      className={cn(
        VARIANT_CLASS[variant],
        sizeClass,
        weightClass,
        variant === "mono" ? "tabular-nums" : undefined,
        wrap === "break" ? "break-words" : undefined,
        className
      )}
      {...props}
    />
  );
}

