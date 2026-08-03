"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { am } from "./am";
import { en, type Dictionary, type TranslationKey } from "./en";
import { om } from "./om";
import { DEFAULT_LOCALE, ETHIOPIC_LOCALES, isLocale, type Locale } from "./locales";

const DICTIONARIES: Record<Locale, Dictionary> = { en, am, om };
const STORAGE_KEY = "frank.investor.locale";
/** Set by `?pseudo=1`. A layout stress-test aid, never offered in the switcher. */
const PSEUDO_KEY = "frank.investor.pseudo";

export type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * The chosen language lives in localStorage, which is an external store rather
 * than React state. Reading it through `useSyncExternalStore` keeps the server
 * render on the default language and swaps to the stored preference on the
 * client without a hydration mismatch.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Private browsing or blocked storage.
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // The preference simply will not persist across reloads.
  }
}

function getLocaleSnapshot(): Locale {
  const stored = read(STORAGE_KEY);
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

function getPseudoSnapshot() {
  return read(PSEUDO_KEY) === "1";
}

const getServerLocale = () => DEFAULT_LOCALE;
const getServerPseudo = () => false;

/** Replaces {name} placeholders with their values. */
function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match);
}

/**
 * Stretches a string to roughly the width Amharic or Afaan Oromoo can reach, so
 * layout breakage shows up before any real translation exists. Accents make
 * untranslated (still hardcoded) strings obvious; the padding reproduces the
 * expansion those languages cause.
 */
function pseudoize(value: string) {
  const accented = value.replace(/[aeiouAEIOU]/g, (vowel) =>
    ({ a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" })[vowel] ?? vowel);
  const padding = "·".repeat(Math.max(2, Math.ceil(value.length * 0.4)));
  return `[${accented} ${padding}]`;
}

type LocaleContextValue = { locale: Locale; setLocale: (next: Locale) => void; t: Translate };

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocaleSnapshot, getServerLocale);
  const pseudo = useSyncExternalStore(subscribe, getPseudoSnapshot, getServerPseudo);

  // `?pseudo=1` turns the stress test on, `?pseudo=0` turns it off.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("pseudo");
    if (param !== "1" && param !== "0") return;
    write(PSEUDO_KEY, param === "1" ? "1" : null);
    emit();
  }, []);

  // Keeps assistive tech, hyphenation and font selection in sync with the language.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    document.documentElement.dataset.script = ETHIOPIC_LOCALES.includes(locale) ? "ethiopic" : "latin";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    write(STORAGE_KEY, next);
    emit();
  }, []);

  const t = useCallback<Translate>((key, vars) => {
    const source = en[key];
    const translated = locale === "en" ? source : DICTIONARIES[locale][key] ?? source;
    return pseudo ? pseudoize(interpolate(source, vars)) : interpolate(translated, vars);
  }, [locale, pseudo]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside a LocaleProvider.");
  return context;
}

/** Convenience hook for components that only need to translate. */
export function useT(): Translate {
  return useLocale().t;
}
