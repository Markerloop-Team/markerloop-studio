// Picking a section's language (SDL-784). Pure and free of @markerloop/policy,
// so the client half of /rules does not bundle the rules package: the texts
// reach it as props, every translation included, and the interface locale —
// which switches on the client without a reload — picks one here.

type Localizable = {
  title: string;
  body: string;
  translations?: Readonly<Record<string, { title: string; body: string }>>;
};

/**
 * Title and body of a section in `locale`: its translation when it has one,
 * otherwise its own text — Russian for the product rules (so kk reads Russian
 * until a Kazakh edition exists); the Terms and the Privacy Policy are written
 * in English and have no translation.
 */
export function localizeSection<T extends Localizable>(section: T, locale: string): T {
  const t = section.translations?.[locale];
  return t ? { ...section, title: t.title, body: t.body } : section;
}

type Refs = {
  titles: Readonly<Record<string, string>>;
  titlesByLocale?: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

/** [[slug]] refs with titles in `locale`; a title without a translation stays. */
export function localizeSectionRefs<T extends Refs>(refs: T, locale: string): T {
  const translated = refs.titlesByLocale?.[locale];
  return translated ? { ...refs, titles: { ...refs.titles, ...translated } } : refs;
}
