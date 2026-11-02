import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../utils/cn"

// Transitions name their properties (SDL-756): the catch-all list animated
// layout too (width and padding when a label or an icon changes). The press
// is listed as the CSS scale property because that is what Tailwind v4 scale
// utilities write. The press feedback is motion, so it sits behind the
// motion-safe variant: with prefers-reduced-motion only the colour changes.
// (Prose here is scanned by Tailwind, so no utility names in this comment.)
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity,scale] duration-100 ease-out motion-safe:active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          // The local `--ring` override is load-bearing (SDL-192): themes may
          // set --ring to the same ink as --primary (the admin surface does,
          // deliberately — ink is what clears 3:1 on its light surfaces), and
          // on the one control FILLED with primary the standard ring then
          // composites to 1.00:1 — declared but invisible. On the fill, the
          // ring paints in primary-foreground, which contrasts with the fill
          // by construction in any theme. Same pattern as the destructive
          // variant's own ring override below.
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 [--ring:var(--primary-foreground)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/70 dark:bg-input/30 dark:border-input dark:hover:bg-input/50 dark:active:bg-input/70",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/70 dark:hover:bg-accent/50 dark:active:bg-accent/70",
        // Quiet delete (EP-185): red text, no fill — "Delete…" in panels and rows.
        "ghost-destructive":
          "text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15 focus-visible:ring-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Позволяет сделать кнопку на всю ширину без className */
  fullWidth?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", asChild = false, fullWidth, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }), fullWidth ? "w-full" : undefined)}
      {...props}
    />
  )
})

export { Button, buttonVariants }
