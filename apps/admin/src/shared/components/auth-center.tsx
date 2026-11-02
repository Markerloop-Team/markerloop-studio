import { Box, Text } from "@markerloop/ui/ui";
import { BrandMark } from "./brand-mark";

/**
 * The centred column of every public auth screen: the product mark, then the
 * screen's card. Laid out after the approved canvas `AuthShell`
 * (`app/design-system/_canvas/account-parts.tsx`): mark centred above the
 * card, gap 6. It replaces the per-screen `<Box variant="center" …>` so the
 * mark cannot drift between login, register, reset and verify — the old
 * pseudo-mark ("M" in a square) sat in the layout's top-left corner instead.
 */
export function AuthCenter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Box variant="center" minHeightScreen padding={4} className={className}>
      <Box direction="column" align="center" gap={6} fullWidth>
        <Box direction="row" align="center" gap={2} data-testid="product-mark">
          <BrandMark className="h-5 w-10 shrink-0" />
          <Text as="span" size="lg" weight="bold">
            Markerloop
          </Text>
        </Box>
        {children}
      </Box>
    </Box>
  );
}
