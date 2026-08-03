/**
 * Investor portal languages.
 *
 * English is the source of truth: every key is defined in `en`, and the other
 * dictionaries are partial. Anything a translator has not covered yet renders
 * the English string rather than a missing-key placeholder, so a half-finished
 * Amharic or Afaan Oromoo file is always safe to ship.
 */
export const LOCALES = ["en", "am", "om"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Shown in the language switcher — each label is written in its own language. */
export const LOCALE_LABELS: Record<Locale, { name: string; english: string }> = {
  en: { name: "English", english: "English" },
  am: { name: "አማርኛ", english: "Amharic" },
  om: { name: "Afaan Oromoo", english: "Afaan Oromoo" },
};

/**
 * Amharic uses the Ethiopic (Ge'ez) script and needs both a font that covers it
 * and more line height than Latin text. Afaan Oromoo is written in Qubee (Latin),
 * so it needs no special typography — only room for longer words.
 */
export const ETHIOPIC_LOCALES: readonly Locale[] = ["am"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
