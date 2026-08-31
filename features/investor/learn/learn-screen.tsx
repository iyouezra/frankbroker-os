"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { Card, Icon, ScreenHeader } from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";

// `id` is the open/closed state key and stays in English; every visible string
// is a translation key resolved at render time.
const lessons = [
  {
    id: "investing",
    titleKey: "learn.investing.title",
    summaryKey: "learn.investing.summary",
    points: [
      ["learn.investing.stocks", "learn.investing.stocksText"],
      ["learn.investing.bonds", "learn.investing.bondsText"],
      ["learn.investing.time", "learn.investing.timeText"],
    ],
  },
  {
    id: "orders",
    titleKey: "learn.orders.title",
    summaryKey: "learn.orders.summary",
    points: [
      ["learn.orders.market", "learn.orders.marketText"],
      ["learn.orders.limit", "learn.orders.limitText"],
      ["learn.orders.stopLimit", "learn.orders.stopLimitText"],
      ["learn.orders.howLong", "learn.orders.howLongText"],
      ["learn.orders.day", "learn.orders.dayText"],
      ["learn.orders.gtc", "learn.orders.gtcText"],
      ["learn.orders.gtd", "learn.orders.gtdText"],
    ],
  },
  {
    id: "dividends",
    titleKey: "learn.dividends.title",
    summaryKey: "learn.dividends.summary",
    points: [
      ["learn.dividends.how", "learn.dividends.howText"],
      ["learn.dividends.dates", "learn.dividends.datesText"],
      ["learn.dividends.notPromised", "learn.dividends.notPromisedText"],
    ],
  },
  {
    id: "risk",
    titleKey: "learn.risk.title",
    summaryKey: "learn.risk.summary",
    points: [
      ["learn.risk.mix", "learn.risk.mixText"],
      ["learn.risk.fit", "learn.risk.fitText"],
    ],
  },
] as const satisfies ReadonlyArray<{ id: string; titleKey: TranslationKey; summaryKey: TranslationKey; points: ReadonlyArray<readonly [TranslationKey, TranslationKey]> }>;

export function LearnScreen() {
  const t = useT();
  const [openLesson, setOpenLesson] = useState<string | null>("investing");
  return <div className={styles.screen}>
    <ScreenHeader title={t("learn.title")} />
    <p className={styles.learnIntro}>{t("learn.intro")}</p>
    <div className={styles.lessonList}>{lessons.map((lesson) => {
      const open = openLesson === lesson.id;
      return <Card className={`${styles.lessonCard} ${open ? styles.lessonOpen : ""}`} key={lesson.id}>
        <button onClick={() => setOpenLesson(open ? null : lesson.id)} aria-expanded={open}>
          <span><b>{t(lesson.titleKey)}</b><small>{t(lesson.summaryKey)}</small></span>
          <Icon name="chevron" size={17} />
        </button>
        {open && <div className={styles.lessonBody}>{lesson.points.map(([labelKey, textKey]) => <div key={labelKey}><b>{t(labelKey)}</b><p>{t(textKey)}</p></div>)}</div>}
      </Card>;
    })}</div>

    <section className={styles.learningResources} aria-labelledby="learning-resources-title">
      <div className={styles.learningResourcesHeader}>
        <span>{t("learn.continueLearning")}</span>
        <h2 id="learning-resources-title">{t("learn.trustedResources")}</h2>
        <p>{t("learn.resourcesIntro")}</p>
      </div>
      <div className={styles.learningResourceList}>
        <a className={styles.learningResourceCard} href="https://academy.esx.et/" target="_blank" rel="noopener noreferrer">
          <span className={styles.learningResourceMark}>ESX</span>
          <span className={styles.learningResourceCopy}>
            <small>{t("learn.officialCourses")}</small>
            <b>ESX Academy</b>
            <p>{t("learn.esxAcademyDesc")}</p>
            <em>academy.esx.et</em>
          </span>
          <span className={styles.externalLinkIcon} aria-hidden="true">↗</span>
        </a>
        <a className={styles.learningResourceCard} href="https://www.frankdigest.com/" target="_blank" rel="noopener noreferrer">
          <span className={`${styles.learningResourceMark} ${styles.frankDigestMark}`}>ፍ</span>
          <span className={styles.learningResourceCopy}>
            <small>{t("learn.articlesInsights")}</small>
            <b>ፍራንክ Digest</b>
            <p>{t("learn.frankDigestDesc")}</p>
            <em>frankdigest.com</em>
          </span>
          <span className={styles.externalLinkIcon} aria-hidden="true">↗</span>
        </a>
      </div>
      <p className={styles.learningDisclaimer}>{t("learn.disclaimer")}</p>
    </section>
  </div>;
}
