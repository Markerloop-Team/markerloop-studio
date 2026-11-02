import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { icons as defaultIcons } from "../../icons";
import { Grid, HStack, Panel, VStack } from "../../layout";
import { Text } from "../../typography";
import { cn } from "../../utils/cn";

export type IconGalleryProps = Omit<React.HTMLAttributes<HTMLElement>, "title"> & {
  icons?: Record<string, LucideIcon>;
  size?: number;
  className?: string;
  title?: string;
  description?: string;
};

export function IconGallery({
  icons = defaultIcons,
  size = 20,
  className,
  title = "Иконки",
  description = "Коллекция иконок на базе lucide-react.",
  // The rest reaches the root: the pages editor marks nodes through props,
  // and a root that drops them cannot be selected on its canvas (SDL-634).
  ...rest
}: IconGalleryProps) {
  const entries = React.useMemo(() => Object.entries(icons), [icons]);

  return (
    <VStack gap={6} className={className} {...rest}>
      <VStack gap={2}>
        <Text as="h1" size="3xl" weight="bold">
          {title}
        </Text>
        <Text variant="muted">{description}</Text>
      </VStack>

      <Grid columns={2} mdColumns={3} lgColumns={4} gap={3}>
        {entries.map(([name, Icon]) => (
          <Panel key={name} padding={3} className="hover:bg-muted/30 transition-colors">
            <HStack gap={3} align="center">
              <div
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-md border bg-background"
                )}
              >
                <Icon size={size} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <Text weight="medium" className="truncate">
                  {name}
                </Text>
                <Text size="sm" variant="muted" className="truncate">
                  lucide-react
                </Text>
              </div>
            </HStack>
          </Panel>
        ))}
      </Grid>
    </VStack>
  );
}

