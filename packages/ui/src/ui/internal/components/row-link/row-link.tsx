"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "../../utils/cn";

export type RowLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
};

export function RowLink({ href, children, className }: RowLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className
      )}
    >
      {children}
    </Link>
  );
}

