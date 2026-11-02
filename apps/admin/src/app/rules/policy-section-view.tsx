"use client";

// Client half of /rules (SDL-658): the strings of the frame come from
// next-intl (ru/en/kk), which in this app is provided to client components by
// the root Providers. The pages themselves stay server components — they read
// the contour flags and hand plain data down.
//
// SDL-784: a section comes with its translations, and the text follows the
// interface locale here, on the client — en reads English, ru and kk read
// Russian (no Kazakh edition yet) — so it always matches the frame around it,
// whose locale can switch without a reload. The Terms and the Privacy Policy
// are English in every locale.
import Link from "next/link";
import { Alert, Badge, Box, Text } from "@markerloop/ui/ui";
import { useLocale, useTranslations } from "@/shared/hooks";
import {
  formatEffectiveDate,
  localizeSection,
  localizeSectionRefs,
  PolicyMarkdown,
  type SectionRefs,
  type VisiblePolicySection,
} from "@/entities/policy";

export function RulesHeader() {
  const t = useTranslations("rules");
  return (
    <Box
      as="header"
      direction="row"
      align="center"
      justify="between"
      gap={2}
      className="mx-auto w-full max-w-3xl px-4 py-4"
    >
      <Link href="/rules" className="flex items-center gap-2">
        <Box
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
        >
          <Text as="span" size="sm" weight="bold">
            M
          </Text>
        </Box>
        <Text as="span" weight="bold">
          Markerloop
        </Text>
      </Link>
      <Link href="/login" className="text-sm text-primary underline">
        {t("signIn")}
      </Link>
    </Box>
  );
}

export function BackToRules() {
  const t = useTranslations("rules");
  return (
    <Link href="/rules" className="text-sm text-primary underline">
      {t("backToAll")}
    </Link>
  );
}

/** Banner on a section whose promises are not all in force (test contour). */
export function DraftBanner() {
  const t = useTranslations("rules");
  return (
    <Alert data-testid="policy-draft-banner">
      <Text weight="semibold">{t("draftTitle")}</Text>
      <Text size="sm" variant="muted">
        {t("draftBody")}
      </Text>
    </Alert>
  );
}

export function SectionMeta({ section }: { section: VisiblePolicySection }) {
  const t = useTranslations("rules");
  const { locale } = useLocale();
  return (
    <Box direction="row" align="center" gap={2} className="flex-wrap">
      <Text size="sm" variant="muted" data-testid="policy-version">
        {t("revision", {
          version: section.version,
          date: formatEffectiveDate(section.effective_date, locale),
        })}
      </Text>
      {section.status === "draft" ? (
        <Badge variant="outline">{t("draftBadge")}</Badge>
      ) : null}
    </Box>
  );
}

export function SectionNav({
  sections,
  current,
}: {
  sections: VisiblePolicySection[];
  current?: string;
}) {
  const t = useTranslations("rules");
  const { locale } = useLocale();
  return (
    <Box as="nav" aria-label={t("navLabel")} gap={2}>
      <Text variant="kicker">{t("sections")}</Text>
      <ul className="space-y-2" data-testid="policy-nav">
        {sections.map((section) => localizeSection(section, locale)).map((section) => (
          <li key={section.slug}>
            <Box direction="row" align="center" gap={2} className="flex-wrap">
              {section.slug === current ? (
                <Text as="span" weight="semibold" aria-current="page">
                  {section.title}
                </Text>
              ) : (
                <Link
                  href={`/rules/${section.slug}`}
                  className="text-primary underline"
                >
                  {section.title}
                </Link>
              )}
              {section.status === "draft" ? (
                <Badge variant="outline">{t("draftBadge")}</Badge>
              ) : null}
            </Box>
          </li>
        ))}
      </ul>
    </Box>
  );
}

export function PolicySectionView({
  section,
  refs,
}: {
  section: VisiblePolicySection;
  refs: SectionRefs;
}) {
  const { locale } = useLocale();
  const text = localizeSection(section, locale);
  return (
    <Box as="article" gap={4} data-testid={`policy-section-${section.slug}`}>
      <Text as="h1" size="3xl" weight="bold">
        {text.title}
      </Text>
      <SectionMeta section={section} />
      {section.status === "draft" ? <DraftBanner /> : null}
      <PolicyMarkdown body={text.body} refs={localizeSectionRefs(refs, locale)} />
    </Box>
  );
}
