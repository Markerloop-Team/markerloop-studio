"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, Toast } from "@markerloop/ui/ui";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import { authService } from "@/shared/lib/api/auth";
import { useAuthStore } from "@/shared/store/auth-store";
import { defaultLocale, locales, type Locale } from "@/i18n";
import { LocaleProvider } from "@/shared/contexts/locale-context";
// Статические импорты для всех локалей для немедленной доступности
import ruMessages from "@/messages/ru/common.json";
import enMessages from "@/messages/en/common.json";
import kkMessages from "@/messages/kk/common.json";

const staticMessages: Record<string, Record<string, unknown>> = {
  ru: ruMessages,
  en: enMessages,
  kk: kkMessages,
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 минут
      retry: 1,
    },
  },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setAuthenticated, setUnauthenticated, setAccessToken, setInitialized } = useAuthStore();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // restoreSession refreshes a token about to expire instead of
        // reporting "no session" (SDL-665 pipeline: a 15-minute access TTL
        // sent every reload in its last 5 minutes to /login).
        const accessToken = await authService.restoreSession();
        console.log("[AuthProvider] accessToken:", accessToken ? `${accessToken.substring(0, 20)}...` : "null");

        if (accessToken) {
          console.log("[AuthProvider] Token valid, setting authenticated");
          setAccessToken(accessToken);
          const payload = authService.getTokenPayload(accessToken);
          if (payload?.user_id) {
            setAuthenticated(payload.user_id, accessToken);
          }
        } else {
          console.log("[AuthProvider] No token or expired, setting unauthenticated");
          setUnauthenticated();
        }
      } catch (err) {
        console.error("[AuthProvider] Error checking auth:", err);
        setUnauthenticated();
      } finally {
        setInitialized();
      }
    };

    checkAuth();
  }, [setAuthenticated, setUnauthenticated, setAccessToken, setInitialized]);

  return <>{children}</>;
}

// Предзагружаем сообщения для быстрого доступа
const messagesCache: Record<string, Record<string, unknown>> = {};

async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  if (messagesCache[locale]) {
    return messagesCache[locale];
  }

  try {
    const localeMessages = await import(`@/messages/${locale}/common.json`);
    messagesCache[locale] = localeMessages.default;
    return localeMessages.default;
  } catch (error) {
    console.error(`Failed to load messages for locale ${locale}:`, error);
    // Fallback на русский
    if (locale !== "ru") {
      return loadMessages("ru");
    }
    // Если даже русский не загрузился, возвращаем пустой объект
    return {};
  }
}

export function Providers({
  children,
  locale: propLocale = defaultLocale,
}: {
  children: React.ReactNode;
  locale?: string;
}) {
  // На сервере всегда используем propLocale, на клиенте читаем из localStorage
  // Это предотвращает проблемы с гидратацией
  const [locale, setLocale] = useState<string>(propLocale);
  const [messages, setMessages] = useState<Record<string, unknown>>(
    staticMessages[propLocale] || staticMessages[defaultLocale]
  );
  const [isHydrated, setIsHydrated] = useState(false);

  // Обработчик изменения локали из контекста
  const handleLocaleChange = useCallback((newLocale: Locale) => {
    // Сохраняем в localStorage (уже сохранено в useLocale, но на всякий случай)
    if (typeof window !== "undefined") {
      localStorage.setItem("locale", newLocale);
    }
    // Обновляем состояние локали и сообщений
    setLocale(newLocale);
    if (staticMessages[newLocale]) {
      setMessages(staticMessages[newLocale]);
    } else {
      // Fallback на асинхронную загрузку для других локалей (если будут добавлены)
      loadMessages(newLocale).then((loadedMessages) => {
        setMessages(loadedMessages);
      });
    }
  }, []);
  
  // Синхронизируем состояние локали с контекстом
  useEffect(() => {
    if (isHydrated && locale) {
      // Обновляем сообщения при изменении локали
      if (staticMessages[locale]) {
        setMessages(staticMessages[locale]);
      }
    }
  }, [locale, isHydrated]);

  // После гидратации обновляем локаль из localStorage
  useEffect(() => {
    setIsHydrated(true);
    if (typeof window !== "undefined") {
      const storedLocale = localStorage.getItem("locale");
      if (storedLocale && locales.includes(storedLocale as Locale)) {
        setLocale(storedLocale as Locale);
        setMessages(staticMessages[storedLocale] || staticMessages[defaultLocale]);
      }
    }
  }, []);

  useEffect(() => {
    // Обновляем сообщения при изменении локали (только после гидратации)
    if (isHydrated && staticMessages[locale]) {
      setMessages(staticMessages[locale]);
    } else if (isHydrated && !staticMessages[locale]) {
      // Fallback на асинхронную загрузку для других локалей (если будут добавлены)
      loadMessages(locale).then((loadedMessages) => {
        setMessages(loadedMessages);
      });
    }
  }, [locale, isHydrated]);

  // Всегда рендерим NextIntlClientProvider, даже с пустыми сообщениями
  // Это необходимо для того, чтобы контекст был доступен сразу
  return (
    <LocaleProvider 
      initialLocale={locale as Locale} 
      onLocaleChange={handleLocaleChange}
    >
      <NextIntlClientProvider 
        locale={locale} 
        messages={messages}
        timeZone="Asia/Almaty"
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              {children}
              <Toast />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </LocaleProvider>
  );
}

// Экспортируем функцию для обновления локали извне
export function updateLocale(newLocale: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("locale", newLocale);
  }
}

