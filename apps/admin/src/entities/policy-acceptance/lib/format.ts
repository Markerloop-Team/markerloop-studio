/**
 * Time is shown in UTC with an explicit label: the journal is read as
 * evidence, where nobody should guess the time zone, and the server and the
 * browser render the same string.
 */
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatAcceptedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${DATE_TIME.format(d)} UTC`;
}

/**
 * «Chrome 129 · macOS». The full header stays in the tooltip — it is the
 * evidence, this is for the eye. Order matters: Edge carries «Chrome», an
 * iPhone carries «Mac OS X».
 */
export function shortUserAgent(ua: string): string {
  const browser =
    match(ua, /Edg\/(\d+)/, "Edge") ??
    match(ua, /Firefox\/(\d+)/, "Firefox") ??
    match(ua, /Chrome\/(\d+)/, "Chrome") ??
    match(ua, /Version\/(\d+).*Safari/, "Safari");
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (!browser && !os) return "Other";
  return [browser, os].filter(Boolean).join(" · ");
}

function match(ua: string, re: RegExp, name: string): string | null {
  const m = re.exec(ua);
  return m ? `${name} ${m[1]}` : null;
}
