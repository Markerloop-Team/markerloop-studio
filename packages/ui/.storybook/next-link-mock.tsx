import * as React from "react";

/**
 * Storybook-мок next/link: вне Next-рантайма настоящий <Link> требует
 * app-router контекст. Мок сохраняет контракт (href + пропсы + ref),
 * рендерит обычный <a> — все состояния (hover/focus-visible) живут на
 * классах самого компонента, так что для стори этого достаточно.
 * Подключается алиасом в main.ts (viteFinal), в библиотечный build не входит.
 */
type MockLinkProps = React.ComponentProps<"a"> & {
  href: string | { pathname?: string };
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
};

const Link = React.forwardRef<HTMLAnchorElement, MockLinkProps>(
  function NextLinkMock(
    { href, prefetch, replace, scroll, shallow, children, ...rest },
    ref
  ) {
    const resolved = typeof href === "string" ? href : (href?.pathname ?? "#");
    return (
      <a ref={ref} href={resolved} {...rest}>
        {children}
      </a>
    );
  }
);

export default Link;
