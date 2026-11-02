import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box, Separator } from "@markerloop/ui/ui";
import { readPolicyFlags } from "@/shared/config/product-features";
import {
  localizeSection,
  policySectionRefs,
  resolvePolicySection,
  visiblePolicySections,
} from "@/entities/policy";
import { BackToRules, PolicySectionView, SectionNav } from "../policy-section-view";
import { requestLocale } from "../request-locale";

// A section opens only when every promise it carries is in force on this
// contour, or the contour shows drafts (SDL-658). Otherwise — 404, the same
// answer as a section that does not exist.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section: slug } = await params;
  const section = resolvePolicySection(slug, readPolicyFlags());
  if (!section) return { title: "Markerloop" };
  return { title: `${localizeSection(section, await requestLocale()).title} — Markerloop` };
}

export default async function RulesSectionPage({ params }: Params) {
  const { section: slug } = await params;
  const flags = readPolicyFlags();
  const section = resolvePolicySection(slug, flags);
  if (!section) notFound();

  return (
    <Box gap={8} className="pt-4">
      <BackToRules />
      <PolicySectionView section={section} refs={policySectionRefs(flags)} />
      <Separator />
      <SectionNav sections={visiblePolicySections(flags)} current={section.slug} />
    </Box>
  );
}
