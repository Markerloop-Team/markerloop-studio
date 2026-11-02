"use client";

// The announcement strip of the product shell (SDL-744, EP-142). The text and
// its end date come from the pod env (PRODUCT_NOTICE, PRODUCT_NOTICE_UNTIL),
// read on the server by app/(product)/layout.tsx and handed down as a prop —
// this file never reads the environment.
//
// The strip is the kit's Alert (InlineAlert), like the e-mail verification
// banner next to it; no hand-rolled banner.
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Alert, Box, Button, Text } from "@markerloop/ui/ui";
import {
  isProductNoticeExpired,
  productNoticeText,
  type ProductNotice,
} from "@/shared/config/product-notice";
import { useTranslations } from "@/shared/hooks";
import {
  browserNoticeStorage,
  dismissProductNotice,
  isProductNoticeDismissed,
} from "./dismissal";

/** setTimeout's ceiling (~24.8 days); a farther end date is caught on the next load. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export type ProductNoticeViewProps = {
  text: string;
  regionLabel: string;
  hideLabel: string;
  hideAriaLabel: string;
  onHide: () => void;
};

/** Presentational: what the strip draws. Rendered by the smoke as is. */
export function ProductNoticeView({
  text,
  regionLabel,
  hideLabel,
  hideAriaLabel,
  onHide,
}: ProductNoticeViewProps) {
  return (
    <Alert
      role="region"
      aria-label={regionLabel}
      data-testid="product-notice"
      className="mx-6 mt-4"
    >
      <Box direction="row" align="center" justify="between" gap={3}>
        <Text size="sm" className="min-w-0 break-words" data-testid="product-notice-text">
          {text}
        </Text>
        <Button
          size="sm"
          variant="outline"
          onClick={onHide}
          aria-label={hideAriaLabel}
          className="whitespace-nowrap"
          data-testid="product-notice-hide"
        >
          {hideLabel}
        </Button>
      </Box>
    </Alert>
  );
}

export function ProductNoticeBanner({ notice }: { notice: ProductNotice | null }) {
  const locale = useLocale();
  const t = useTranslations("productNotice");
  // null = not read yet. Storage is read after mount only, so the server
  // render and the first client render agree (nothing drawn), and a strip
  // the person already hid never flashes.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [expired, setExpired] = useState(false);
  const id = notice?.id ?? null;
  const until = notice?.until ?? null;

  useEffect(() => {
    if (id === null) return;
    setDismissed(isProductNoticeDismissed(browserNoticeStorage(), id));
  }, [id]);

  // A tab left open past the end date drops the strip at that moment.
  useEffect(() => {
    if (until === null) {
      setExpired(false);
      return;
    }
    const left = Date.parse(until) - Date.now();
    if (left <= 0) {
      setExpired(true);
      return;
    }
    setExpired(false);
    if (left > MAX_TIMEOUT_MS) return;
    const timer = setTimeout(() => setExpired(true), left);
    return () => clearTimeout(timer);
  }, [until]);

  if (!notice || dismissed !== false || expired || isProductNoticeExpired(notice)) {
    return null;
  }
  const text = productNoticeText(notice, locale);
  if (!text) return null;

  return (
    <ProductNoticeView
      text={text}
      regionLabel={t("region")}
      hideLabel={t("hide")}
      hideAriaLabel={t("hideAria")}
      onHide={() => {
        // Hidden for this page view even when the browser refuses to store it.
        dismissProductNotice(browserNoticeStorage(), notice.id);
        setDismissed(true);
      }}
    />
  );
}
