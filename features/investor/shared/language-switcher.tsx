"use client";

import styles from "../../../app/investor/investor.module.css";
import { useLocale } from "../../../lib/i18n/context";
import { LOCALES, LOCALE_LABELS } from "../../../lib/i18n/locales";

/**
 * Language control for the investor portal.
 *
 * `segmented` is the compact three-way switch shown on the entry screen;
 * `row` is the settings-style variant used inside Profile. Each language is
 * labelled in its own script so it is recognisable without reading English.
 */
export function LanguageSwitcher({ variant = "segmented" }: { variant?: "segmented" | "row" }) {
  const { locale, setLocale, t } = useLocale();
  const className = variant === "row" ? styles.languageRow : styles.languageSwitch;

  return <div className={className} role="group" aria-label={t("language.change")}>
    {variant === "row" && <span className={styles.languageRowLabel}>{t("language.label")}</span>}
    <div className={styles.languageOptions}>
      {LOCALES.map((option) => <button
        key={option}
        type="button"
        lang={option}
        className={option === locale ? styles.languageActive : undefined}
        aria-pressed={option === locale}
        onClick={() => setLocale(option)}
      >{LOCALE_LABELS[option].name}</button>)}
    </div>
  </div>;
}
