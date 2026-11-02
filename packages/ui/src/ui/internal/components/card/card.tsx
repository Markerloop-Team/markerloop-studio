import * as React from "react"

import { cn } from "../../utils/cn"

type CardProps = React.ComponentProps<"div"> & {
  /** Позволяет сделать карточку на всю ширину без className */
  fullWidth?: boolean
  /** Позволяет задать max-width (px) без className */
  maxWidth?: number
  /** Позволяет задавать col-span на md без className (для Grid) */
  mdColSpan?: 1 | 2 | 3 | 4
  /**
   * Отступ внутри (EP-185, слой 2 редизайна). Не задан — 24 px, а в админке
   * (`[data-surface]`) 16 px: стоковые 24 там велики, 23 экрана обнуляли их
   * вручную. `none` — экран рисует отступ сам. Сайты клиентов атрибута
   * data-surface не ставят и видят прежние 24.
   */
  padding?: "default" | "compact" | "none"
}

const CARD_PADDING = {
  auto: "gap-6 py-6 in-[[data-surface]]:gap-4 in-[[data-surface]]:py-4 in-[[data-surface]]:[&>[data-slot^=card-]]:px-4",
  default: "gap-6 py-6",
  compact: "gap-4 py-4 [&>[data-slot^=card-]]:px-4",
  none: "gap-6 py-0",
} as const

function Card({ className, fullWidth, maxWidth, mdColSpan, padding, style, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-padding={padding}
      className={cn(
        "bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm",
        CARD_PADDING[padding ?? "auto"],
        fullWidth ? "w-full" : undefined,
        mdColSpan === 2
          ? "md:col-span-2"
          : mdColSpan === 3
            ? "md:col-span-3"
            : mdColSpan === 4
              ? "md:col-span-4"
              : undefined,
        className
      )}
      style={{
        ...(style ?? {}),
        ...(typeof maxWidth === "number" ? { maxWidth } : null),
      }}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
