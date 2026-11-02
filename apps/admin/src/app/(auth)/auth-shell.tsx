"use client";

import { useLocale } from "@/shared/hooks";
import { useTranslations } from "@/shared/hooks";
import { Box, Button, Menu, Text } from "@markerloop/ui/ui";
import { Languages } from "lucide-react";

/**
 * Рамка публичных auth-страниц: вход, регистрация, подтверждение почты,
 * восстановление пароля.
 *
 * EP-51, кластер F — две находки аудита закрыты здесь, потому что обе
 * общие для всех auth-экранов и в отдельных страницах разъехались бы:
 *
 *  1. **Не было ни логотипа, ни имени продукта.** Человек приходил на
 *     голую карточку с полями и не видел, куда он вообще попал — особенно
 *     по ссылке из письма. Теперь знак Markerloop стоит по центру над
 *     карточкой (`shared/components/auth-center.tsx`, по канвасу
 *     `AuthShell`, просьба владельца 2 Oct 2026); здесь, в рамке, остался
 *     только языковой свитчер.
 *  2. **Языковой свитчер был глифом ~14px без подписи и состояния.**
 *     Теперь у него подпись — код текущей локали, — то есть он сообщает
 *     не только «тут можно переключить язык», но и «сейчас вот этот».
 *
 * Клиентская половина: серверный `layout.tsx` рядом читает флаги контура
 * (SDL-754) и оборачивает эту рамку.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, locales } = useLocale();
  const tLanguages = useTranslations("languages");
  const tTheme = useTranslations("theme");

  return (
    <Box className="relative min-h-dvh bg-background">
      <Box
        direction="row"
        align="center"
        justify="end"
        gap={2}
        className="absolute inset-x-0 top-0 z-10 px-4 py-4"
      >
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={tTheme("toggleLanguage") as string}
              suppressHydrationWarning
            >
              <Languages size={16} />
              {/* Подпись = текущая локаль. Без неё кнопка не отвечала на
                  единственный вопрос, который к ней есть: «а сейчас-то
                  какой язык?» */}
              <Text as="span" size="sm" className="uppercase">
                {locale}
              </Text>
            </Button>
          </Menu.Trigger>
          <Menu.Content align="end">
            {locales.map((code) => (
              <Menu.Item key={code} onClick={() => setLocale(code)} active={locale === code}>
                {tLanguages(code) as string}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Root>
      </Box>
      {children}
    </Box>
  );
}
