export const locales = ['en', 'it', 'es', 'ru', 'zh'] as const;
export type Locale = (typeof locales)[number];
export const localeCookieName = 'doorman_locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.some((locale) => locale === value);
}

function supportedLocale(value: string): Locale | undefined {
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) return undefined;
  const language = value.split('-')[0]!.toLowerCase();
  return isLocale(language) ? language : undefined;
}

export function resolveLocale(value?: string | null): Locale {
  return supportedLocale(value ?? '') ?? 'en';
}

export function negotiateLocale(acceptLanguage?: string | null): Locale {
  const preferences = (acceptLanguage ?? '')
    .slice(0, 8192)
    .split(',')
    .map((part) => {
      const [tag = '', ...parameters] = part.trim().split(';');
      const quality = parameters.length === 0 ? '1' : parameters[0]?.trim().slice(2);
      const valid =
        parameters.length <= 1 &&
        (parameters.length === 0 ||
          /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.test(parameters[0]!.trim()));
      return { locale: supportedLocale(tag.trim()), quality: valid ? Number(quality) : 0 };
    })
    .filter((preference) => preference.locale && preference.quality > 0)
    .sort((a, b) => b.quality - a.quality);
  return preferences[0]?.locale ?? 'en';
}

export function selectLocale(cookie: unknown, acceptLanguage?: string | null): Locale {
  return isLocale(cookie) ? cookie : negotiateLocale(acceptLanguage);
}

export function formatMessage(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
