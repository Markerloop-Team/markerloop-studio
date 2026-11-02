import * as React from "react"

import { cn } from "../../utils/cn"

type NativeImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "loading">

export type ImageProps = NativeImgProps & {
  /**
   * Required for accessibility. Pass empty string only for decorative
   * images that have an adjacent text alternative.
   */
  alt: string
  /**
   * Native lazy/eager hint. Defaults to "lazy" so non-hero images don't
   * block initial paint.
   */
  loading?: "lazy" | "eager"
  /**
   * Object-fit hint mapped to a Tailwind class. Defaults to "cover".
   */
  fit?: "cover" | "contain" | "fill" | "none" | "scale-down"
  /**
   * If true, the image renders inside a fixed-aspect wrapper so layout
   * stays stable while the source loads. Pass a CSS aspect-ratio value
   * (e.g. "16 / 9", "1 / 1") or "auto" to opt out.
   */
  aspect?: string
  /**
   * Rounded-corner preset. "full" for a circle, "none" to opt out.
   */
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full"
}

const FIT_CLASS: Record<NonNullable<ImageProps["fit"]>, string> = {
  cover: "object-cover",
  contain: "object-contain",
  fill: "object-fill",
  none: "object-none",
  "scale-down": "object-scale-down",
}

const ROUNDED_CLASS: Record<NonNullable<ImageProps["rounded"]>, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
}

function Image({
  className,
  alt,
  loading = "lazy",
  fit = "cover",
  rounded = "none",
  aspect,
  src,
  ...props
}: ImageProps) {
  const imgClassName = cn(
    "block h-auto max-w-full",
    FIT_CLASS[fit],
    ROUNDED_CLASS[rounded],
    aspect ? "h-full w-full" : undefined,
    className,
  )

  const img = (
    <img
      data-slot="image"
      alt={alt}
      loading={loading}
      src={src}
      className={imgClassName}
      {...props}
    />
  )

  if (!aspect || aspect === "auto") {
    return img
  }

  return (
    <div
      data-slot="image-frame"
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: aspect }}
    >
      {img}
    </div>
  )
}

export { Image }
