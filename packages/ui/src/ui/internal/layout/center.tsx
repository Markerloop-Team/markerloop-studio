import * as React from "react";

import { cn } from "../utils/cn";

export type CenterProps = React.ComponentProps<"div"> & {
  /** Центрирование по обеим осям */
  inline?: boolean;
  /** Заполнить минимум высоты экрана */
  minHeightScreen?: boolean;
  /** Внутренний отступ вокруг контента (Tailwind p-*) */
  padding?: 0 | 1 | 2 | 3 | 4 | 6 | 8;
};

export const PADDING_CLASS: Record<string, string> = {
  "0": "p-0",
  "1": "p-1",
  "2": "p-2",
  "3": "p-3",
  "4": "p-4",
  "6": "p-6",
  "8": "p-8",
};

export function Center({
  inline,
  minHeightScreen,
  padding = 0,
  className,
  ...props
}: CenterProps) {
  return (
    <div
      className={cn(
        inline ? "inline-flex" : "flex",
        "items-center justify-center",
        minHeightScreen ? "min-h-screen" : undefined,
        PADDING_CLASS[String(padding)],
        "bg-background",
        className
      )}
      {...props}
    />
  );
}

