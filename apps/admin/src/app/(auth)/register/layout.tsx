import { currentPolicyEdition, PolicyEditionProvider } from "@/entities/policy";
import { readPolicyFlags } from "@/shared/config/product-features";

// Server half of /register (SDL-665): the rules edition in force on this
// contour comes from the pod env, read per request — the form accepts exactly
// this edition and links exactly these sections.
export const dynamic = "force-dynamic";

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PolicyEditionProvider edition={currentPolicyEdition(readPolicyFlags())}>
      {children}
    </PolicyEditionProvider>
  );
}
