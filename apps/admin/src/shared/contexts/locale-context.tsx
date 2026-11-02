"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { locales, defaultLocale, type Locale } from "@/i18n";

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function LocaleProvider({ 
  children,
  initialLocale,
  onLocaleChange,
}: { 
  children: ReactNode;
  initialLocale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Синхронизируем с внешним состоянием
  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (!locales.includes(newLocale)) {
        console.warn(`Invalid locale: ${newLocale}`);
        return;
      }
      setLocaleState(newLocale);
      onLocaleChange(newLocale);
    },
    [onLocaleChange]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocaleContext must be used within LocaleProvider");
  }
  return context;
}

