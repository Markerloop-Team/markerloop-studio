"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "../../utils/cn"

type AccordionRootProps = React.ComponentProps<typeof AccordionPrimitive.Root>

/**
 * `type` is optional, unlike raw Radix: omitting it means `"multiple"`
 * (EP-48 / SDL-284 — editor panel sections open independently, so the
 * many-open-at-once mode is the kit's default). The classic one-at-a-time
 * accordion is still one prop away: `type="single"` (+ `collapsible`).
 *
 * Moved in from `@markerloop/studio`'s kit-compat (SDL-633). `collapsible`
 * only means something to `type="single"`; a page node may still carry it
 * with `type="multiple"`, and Radix would pass it on to the DOM `<div>` as an
 * unknown attribute (React warns "Received `true` for a non-boolean
 * attribute `collapsible`"). The multiple branch drops it.
 */
export type AccordionProps =
  | Extract<AccordionRootProps, { type: "single" }>
  | (Omit<Extract<AccordionRootProps, { type: "multiple" }>, "type"> & {
      type?: "multiple"
      /** Ignored: only a single accordion collapses. Accepted so a stored node never leaks it. */
      collapsible?: boolean
    })

function Accordion(props: AccordionProps) {
  if (props.type === "single") {
    return <AccordionPrimitive.Root data-slot="accordion" {...props} />
  }
  // `type` is `"multiple" | undefined` on this branch; the trailing literal
  // pins the runtime value without a cast.
  const { collapsible: _ignored, ...rest } = props
  return (
    <AccordionPrimitive.Root data-slot="accordion" {...rest} type="multiple" />
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
