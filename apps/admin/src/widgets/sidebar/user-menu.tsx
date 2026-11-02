"use client";

// The account menu of the shell (EP-157, owner 29 Oct 2026): it lives at the
// bottom of the sidebar, as on the canvas «Classic sidebar»
// (design-system/_canvas/classic-shell.tsx, `classic-account`), and on a phone
// behind the avatar of the top bar. It took over what the old header carried
// on its own: the theme and the language menus, and «Markerloop rules» from
// the shell footer. «Account settings» (a duplicate of Profile) and
// «Workspace settings» (the sidebar's Members / Plan items now) are gone.

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BookOpen, Languages, LogOut, Moon, Sun, SunMoon, User } from "lucide-react";
import { Avatar, Box, Button, Menu, Text } from "@markerloop/ui/ui";

import { useCurrentUser } from "@/shared/hooks/use-auth";
import { useLocale, useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { useAuthStore } from "@/shared/store/auth-store";
import { forgetInviteToken } from "@/features/invite/invite-token";

/** Where the account menu's links lead — one list, read by smoke:shell-layout. */
export const USER_MENU_PROFILE_HREF = "/settings/account";
export const USER_MENU_RULES_HREF = "/rules";

const THEMES = ["light", "dark", "system"] as const;

export function ShellUserMenu({
  variant = "sidebar",
  onNavigate,
}: {
  /**
   * "sidebar": avatar, name and email, the full-width row at the bottom of
   * the menu. "avatar": the avatar alone, the phone top bar's.
   */
  variant?: "sidebar" | "avatar";
  /** Closes the phone drawer after a choice. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const { clear } = useAuthStore();
  const t = useTranslations("common");
  const tAuth = useTranslations("auth");
  const tTheme = useTranslations("theme");
  const tLanguages = useTranslations("languages");
  const tShell = useTranslations("shell");
  const { locale, setLocale, locales } = useLocale();
  const { theme, setTheme } = useTheme();

  const name = user?.username || (t("user") as string);
  const initials = (name[0] ?? "U").toUpperCase();

  const go = (href: string) => {
    router.push(href);
    onNavigate?.();
  };

  const handleLogout = async () => {
    await authService.logout();
    // SDL-615: a parked invite belongs to this session; the next person at
    // this tab must not inherit it.
    forgetInviteToken(window.sessionStorage);
    clear();
    router.push("/login");
  };

  const avatar = (
    <Avatar size={8} className="size-7 shrink-0">
      <Avatar.Fallback>{initials}</Avatar.Fallback>
    </Avatar>
  );

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        {variant === "sidebar" ? (
          <Button
            variant="ghost"
            fullWidth
            className="h-auto shrink-0 justify-start gap-2.5 px-2 py-2"
            aria-label={name}
            data-testid="account-menu-trigger"
          >
            {avatar}
            <Box direction="column" align="start" className="min-w-0">
              <Text as="span" size="sm" weight="medium" className="max-w-full truncate">
                {name}
              </Text>
              {user?.email ? (
                <Text as="span" size="xs" variant="muted" className="max-w-full truncate">
                  {user.email}
                </Text>
              ) : null}
            </Box>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={name} data-testid="account-menu-trigger-phone">
            {avatar}
          </Button>
        )}
      </Menu.Trigger>
      <Menu.Content width={240} align={variant === "sidebar" ? "start" : "end"} side={variant === "sidebar" ? "top" : "bottom"}>
        <Menu.Label>
          <Box gap={1}>
            <Text as="div" size="sm" weight="medium">
              {name}
            </Text>
            {user?.email ? (
              <Text as="div" size="xs" variant="muted">
                {user.email}
              </Text>
            ) : null}
          </Box>
        </Menu.Label>
        <Menu.Separator />
        {/* Profile (SDL-767): the account settings, whose first section is «Who you are». */}
        <Menu.Item data-testid="account-menu-profile" onClick={() => go(USER_MENU_PROFILE_HREF)}>
          <User size={16} className="mr-2" aria-hidden="true" />
          <Text as="span">{t("profile") as string}</Text>
        </Menu.Item>
        <Menu.Sub>
          <Menu.SubTrigger data-testid="account-menu-theme">
            <SunMoon size={16} className="mr-2" aria-hidden="true" />
            <Text as="span">{tShell("themeMenu")}</Text>
          </Menu.SubTrigger>
          <Menu.SubContent>
            <Menu.RadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(v)}>
              {THEMES.map((value) => (
                <Menu.RadioItem key={value} value={value} data-testid={`account-menu-theme-${value}`}>
                  {value === "light" ? (
                    <Sun size={16} className="mr-2" aria-hidden="true" />
                  ) : value === "dark" ? (
                    <Moon size={16} className="mr-2" aria-hidden="true" />
                  ) : null}
                  {tTheme(value) as string}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.SubContent>
        </Menu.Sub>
        <Menu.Sub>
          <Menu.SubTrigger data-testid="account-menu-language">
            <Languages size={16} className="mr-2" aria-hidden="true" />
            <Text as="span">{tShell("languageMenu")}</Text>
          </Menu.SubTrigger>
          <Menu.SubContent>
            <Menu.RadioGroup value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
              {locales.map((code) => (
                <Menu.RadioItem key={code} value={code} data-testid={`account-menu-language-${code}`}>
                  {tLanguages(code) as string}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.SubContent>
        </Menu.Sub>
        {/* The product rules (SDL-658), moved here from the shell footer. */}
        <Menu.Item data-testid="account-menu-rules" onClick={() => go(USER_MENU_RULES_HREF)}>
          <BookOpen size={16} className="mr-2" aria-hidden="true" />
          <Text as="span">{t("productRules") as string}</Text>
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item data-testid="account-menu-logout" onClick={handleLogout}>
          <LogOut size={16} className="mr-2" aria-hidden="true" />
          <Text as="span">{tAuth("logout") as string}</Text>
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
