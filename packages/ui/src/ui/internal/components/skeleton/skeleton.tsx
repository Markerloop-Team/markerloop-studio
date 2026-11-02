import * as React from "react"
import { cn } from "../../utils/cn"

type SkeletonProps = React.ComponentProps<"div"> & {
  width?: number | "full"
  height?: number
}

function Skeleton({ className, width, height, style, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      style={{
        ...(style ?? {}),
        ...(width === "full" ? { width: "100%" } : null),
        ...(typeof width === "number" ? { width } : null),
        ...(typeof height === "number" ? { height } : null),
      }}
      {...props}
    />
  )
}

export { Skeleton }
