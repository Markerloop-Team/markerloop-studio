import * as React from "react";

import { cn } from "../utils/cn";

export type PanelProps = React.ComponentProps<"div"> & {
  padding?: 0 | 2 | 3 | 4 | 6;
};

export const PADDING_CLASS: Record<string, string> = {
  "0": "p-0",
  "2": "p-2",
  "3": "p-3",
  "4": "p-4",
  "6": "p-6",
};

export function Panel({ padding = 0, className, ...props }: PanelProps) {
  return (
    <div
      className={cn("rounded-md border bg-background", PADDING_CLASS[String(padding)], className)}
      {...props}
    />
  );
}

