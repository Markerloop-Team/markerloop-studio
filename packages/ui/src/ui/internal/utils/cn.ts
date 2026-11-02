import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// `text-caption` is a font-size step of the admin type scale (globals.css,
// EP-184). tailwind-merge only knows the stock steps, so without this it reads
// `text-caption` as a text colour and drops it next to `text-success-foreground`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["caption"] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
