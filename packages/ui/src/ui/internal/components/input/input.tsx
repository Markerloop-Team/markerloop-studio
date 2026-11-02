import * as React from "react"

import { cn } from "../../utils/cn"

type InputProps = React.ComponentProps<"input"> & {
  /** Добавляет отступ слева под иконку (аналог pl-9) без className */
  leftInset?: "icon"
}

function Input({ className, type, leftInset, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 max-md:text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "hover:border-border-strong read-only:bg-muted/50 read-only:hover:border-input",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        leftInset === "icon" ? "pl-9" : undefined,
        className
      )}
      {...props}
    />
  )
}

export { Input }
