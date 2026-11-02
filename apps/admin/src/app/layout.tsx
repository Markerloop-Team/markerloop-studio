import type { Metadata } from "next";
import { cookies } from "next/headers";
import NextTopLoader from "nextjs-toploader";
import "@markerloop/ui/ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { defaultLocale } from "@/i18n";
import { readSessionCookie } from "@/shared/lib/session-cookies";
import { redirectToWelcomeIfNoWorkspace } from "@/shared/lib/api/welcome-server";

export const metadata: Metadata = {
  title: "Markerloop",
  description: "Admin panel for Markerloop system",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // «No workspace → /welcome» (SDL-759 re-open), decided before anything
  // renders: the proxy marks a full page load of a workspace section
  // (src/proxy/layers/welcome-check.ts), and here — above every Suspense
  // boundary, so the browser gets a 307 and no frame of the section — the
  // account's workspaces are read from the gateway. Unmarked requests (every
  // other path, client navigations) cost nothing. Here and not in
  // app/(product)/layout.tsx: that layout must stay synchronous, the smokes
  // render it with renderToString.
  await redirectToWelcomeIfNoWorkspace();

  // Получаем локаль из next-intl (определенную через middleware)

  const cookieStore = await cookies();
  const locale2 = readSessionCookie(cookieStore, "locale") || defaultLocale;

  return (
    <html lang={locale2} suppressHydrationWarning>
      {/* data-surface включает тему админки из кита (палитра zinc, правки контраста,
          фирменный синий, component/selection) — без него страницы жили на
          публичной теме клиентских сайтов (EP-184, слой 1 редизайна). На body,
          а не на html: тёмный набор кита — `.dark [data-surface]`, класс dark
          ставится на html. */}
      <body data-surface="admin">
        <NextTopLoader
          color="var(--brand)"
          height={3}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px var(--brand),0 0 5px var(--brand)"
        />
        <Providers locale={locale2}>{children}</Providers>
      </body>
    </html>
  );
}
