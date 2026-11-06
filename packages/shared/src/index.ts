export * from './money';
export * from './dates';
export * from './errors';
export * from './permissions';
export * from './status';
export * from './services';
export * from './privacy';
export * from './schemas';
export * from './tokens';
export { en } from './i18n/en';
export type { TranslationKey } from './i18n/en';
export { hi } from './i18n/hi';

import { en, type TranslationKey } from './i18n/en';
import { hi } from './i18n/hi';

export const dictionaries = { en, hi } as const;
export type Locale = keyof typeof dictionaries;

/** Translate with `{placeholder}` interpolation; unknown keys fall back to the key itself (custom labels). */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] as Record<string, string>;
  let s = dict[key] ?? (en as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function isTranslationKey(key: string): key is TranslationKey {
  return key in en;
}
