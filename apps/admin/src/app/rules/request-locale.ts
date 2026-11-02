import { cookies } from "next/headers";
import { defaultLocale, locales, type Locale } from "@/i18n";
import { readSessionCookie } from "@/shared/lib/session-cookies";

/**
 * The interface locale of this request — the cookie the root layout hands to
 * the Providers (SDL-784: the tab title of a rules page follows it, like the
 * text). Russian when absent or unknown.
 */
export async function requestLocale(): Promise<Locale> {
  const value = readSessionCookie(await cookies(), "locale");
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}
