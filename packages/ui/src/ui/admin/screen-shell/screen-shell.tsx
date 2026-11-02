"use client";

import * as React from "react";

import { cn } from "../../internal/utils/cn";

export type ScreenShellProps = React.ComponentProps<"div">;

/**
 * Admin screen container: the clamp-padded surface every non-editor screen
 * of an admin app sits on. Lifts the `p-[clamp(20px,3vw,40px)]` wrapper that
 * was copy-pasted across seven studio screens (SDL-223). Scrolling and
 * background are the host layout's job — the shell only owns the padding
 * ramp, so it composes with any sidebar/rail arrangement.
 */
export function ScreenShell({ className, ...props }: ScreenShellProps) {
  return (
    <div
      data-slot="screen-shell"
      className={cn("p-[clamp(20px,3vw,40px)]", className)}
      {...props}
    />
  );
}
