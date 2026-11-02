import * as React from "react";

import { cn } from "../utils/cn";

type StackGap = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
type StackJustify =
  | "start"
  | "center"
  | "end"
  | "between"
  | "around"
  | "evenly";

export const GAP_CLASS: Record<string, string> = {
  "0": "gap-0",
  "0.5": "gap-0.5",
  "1": "gap-1",
  "1.5": "gap-1.5",
  "2": "gap-2",
  "3": "gap-3",
  "4": "gap-4",
  "5": "gap-5",
  "6": "gap-6",
  "8": "gap-8",
  "10": "gap-10",
  "12": "gap-12",
};

export const ALIGN_CLASS: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

export const JUSTIFY_CLASS: Record<StackJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

export type StackProps<T extends React.ElementType = "div"> = {
  as?: T;
  direction?: "row" | "column";
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: boolean;
  fullWidth?: boolean;
  fullHeight?: boolean;
  grow?: boolean;
  /** `false` → `flex-none`: opt out of shrinking inside a flex parent (EP-32 §4.3). */
  shrink?: boolean;
  textAlign?: "left" | "center" | "right";
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">;

export function Stack<T extends React.ElementType = "div">({
  as,
  direction = "column",
  gap = 0,
  align,
  justify,
  wrap,
  fullWidth,
  fullHeight,
  grow,
  shrink,
  textAlign,
  className,
  ...props
}: StackProps<T>) {
  const Comp = (as ?? "div") as React.ElementType;

  return (
    <Comp
      className={cn(
        "flex",
        direction === "row" ? "flex-row" : "flex-col",
        GAP_CLASS[String(gap)],
        align ? ALIGN_CLASS[align] : undefined,
        justify ? JUSTIFY_CLASS[justify] : undefined,
        wrap ? "flex-wrap" : undefined,
        fullWidth ? "w-full" : undefined,
        fullHeight ? "h-full" : undefined,
        grow ? "flex-1" : undefined,
        shrink === false ? "flex-none" : undefined,
        textAlign === "center"
          ? "text-center"
          : textAlign === "right"
            ? "text-right"
            : textAlign === "left"
              ? "text-left"
              : undefined,
        className
      )}
      {...props}
    />
  );
}

export function HStack(
  props: Omit<StackProps<React.ElementType>, "direction">
) {
  return <Stack {...(props as StackProps)} direction="row" />;
}

export function VStack(
  props: Omit<StackProps<React.ElementType>, "direction">
) {
  return <Stack {...(props as StackProps)} direction="column" />;
}

