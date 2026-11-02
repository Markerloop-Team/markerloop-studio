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
import { PolicySectionView, SectionNav } from "./policy-section-view";
import { requestLocale } from "./request-locale";

// Read per request: the promises in force come from the pod env (SDL-658),
// never from the build — prod runs the image test passed.
export const dynamic = "force-dynamic";

// The tab title in the interface locale (SDL-784); the layout's Russian one
// stays the fallback when the rules section is hidden.
export async function generateMetadata(): Promise<Metadata> {
  const rules = resolvePolicySection("rules", readPolicyFlags());
  if (!rules) return {};
  return { title: `${localizeSection(rules, await requestLocale()).title} — Markerloop` };
}

export default function RulesPage() {
  const flags = readPolicyFlags();
  const rules = resolvePolicySection("rules", flags);
  if (!rules) notFound();
  const sections = visiblePolicySections(flags).filter((s) => s.slug !== "rules");

  return (
    <Box gap={8} className="pt-4">
      <PolicySectionView section={rules} refs={policySectionRefs(flags)} />
      <Separator />
      <SectionNav sections={sections} />
    </Box>
  );
}
