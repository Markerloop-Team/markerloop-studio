"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "../../utils/cn";
import { Card, CardDescription, CardHeader, CardTitle } from "../card";

export type ActionCardLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "title"
> & {
  href: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
};

export function ActionCardLink({
  href,
  title,
  description,
  icon: Icon,
  className,
  // The rest reaches the root: the pages editor marks nodes through props,
  // and a root that drops them cannot be selected on its canvas (SDL-634).
  ...rest
}: ActionCardLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-xl outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className
      )}
      {...rest}
    >
      <Card className="cursor-pointer transition-colors hover:bg-accent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {Icon ? <Icon size={20} /> : null}
            {title}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      </Card>
    </Link>
  );
}

