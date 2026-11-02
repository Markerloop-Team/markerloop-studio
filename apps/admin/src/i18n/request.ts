import { DEMO_MODE } from "@/demo/config";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";


export const locales = ["ru", "en", "kk"] as const;
export type Locale = (typeof locales)[number];

// The showcase is English-first; the product defaults to Russian.
export const defaultLocale: Locale = DEMO_MODE ? "en" : "ru";

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  const validLocale = locale || defaultLocale;
  if (!locales.includes(validLocale as Locale)) {
    notFound();
  }

  return {
    locale: validLocale,
    messages: (await import(`../messages/${validLocale}/common.json`)).default,
    timeZone: "Asia/Almaty", // Временная зона для Казахстана
  };
});

