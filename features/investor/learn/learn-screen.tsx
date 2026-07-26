"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { Card, Icon, ScreenHeader } from "../shared/investor-foundation";

const lessons = [
  {
    id: "investing",
    title: "Investing 101",
    summary: "Learn what you can own and why prices move.",
    points: [
      ["Stocks", "A stock is a small piece of a company. Its price can rise or fall."],
      ["Bonds", "A bond is money you lend. The issuer pays interest and returns your money at maturity."],
      ["Time", "Prices move from day to day. A longer time frame can give your investment room to grow."],
    ],
  },
  {
    id: "orders",
    title: "Order types",
    summary: "Choose how and when your order can trade.",
    points: [
      ["Market", "Tries to trade now at the best available price. The final price can change."],
      ["Limit", "You set the most you will pay or the least you will accept. The order may not trade."],
      ["Stop-limit", "You set a trigger price and a limit price. When the trigger is reached, a limit order is sent. It may not trade."],
    ],
  },
  {
    id: "dividends",
    title: "Dividends",
    summary: "Some companies share part of their profit with owners.",
    points: [
      ["How they work", "A dividend is a cash payment for each share you own."],
      ["Payment dates", "The company sets who gets paid and when the money is sent."],
      ["Not promised", "A company can lower, delay, or stop a dividend."],
    ],
  },
  {
    id: "risk",
    title: "Spread your risk",
    summary: "Do not let one company or sector carry all the weight.",
    points: [
      ["Mix", "Holding different companies and bonds can soften the effect of one weak investment."],
      ["Fit", "Choose a mix that matches your goal, your time, and how much movement you can accept."],
    ],
  },
] as const;

export function LearnScreen() {
  const [openLesson, setOpenLesson] = useState<string | null>("investing");
  return <div className={styles.screen}>
    <ScreenHeader title="Learn" />
    <p className={styles.learnIntro}>Short lessons to help you make clear choices with your money.</p>
    <div className={styles.lessonList}>{lessons.map((lesson) => {
      const open = openLesson === lesson.id;
      return <Card className={`${styles.lessonCard} ${open ? styles.lessonOpen : ""}`} key={lesson.id}>
        <button onClick={() => setOpenLesson(open ? null : lesson.id)} aria-expanded={open}>
          <span><b>{lesson.title}</b><small>{lesson.summary}</small></span>
          <Icon name="chevron" size={17} />
        </button>
        {open && <div className={styles.lessonBody}>{lesson.points.map(([label, text]) => <div key={label}><b>{label}</b><p>{text}</p></div>)}</div>}
      </Card>;
    })}</div>

    <section className={styles.learningResources} aria-labelledby="learning-resources-title">
      <div className={styles.learningResourcesHeader}>
        <span>CONTINUE LEARNING</span>
        <h2 id="learning-resources-title">Trusted resources</h2>
        <p>Go deeper with structured courses and Ethiopian finance articles.</p>
      </div>
      <div className={styles.learningResourceList}>
        <a className={styles.learningResourceCard} href="https://academy.esx.et/" target="_blank" rel="noopener noreferrer">
          <span className={styles.learningResourceMark}>ESX</span>
          <span className={styles.learningResourceCopy}>
            <small>OFFICIAL COURSES</small>
            <b>ESX Academy</b>
            <p>Study Ethiopian capital markets, financial instruments and regulation through structured courses.</p>
            <em>academy.esx.et</em>
          </span>
          <span className={styles.externalLinkIcon} aria-hidden="true">↗</span>
        </a>
        <a className={styles.learningResourceCard} href="https://www.frankdigest.com/" target="_blank" rel="noopener noreferrer">
          <span className={`${styles.learningResourceMark} ${styles.frankDigestMark}`}>ፍ</span>
          <span className={styles.learningResourceCopy}>
            <small>ARTICLES &amp; INSIGHTS</small>
            <b>ፍራንክ Digest</b>
            <p>Read approachable articles about Ethiopian finance, investing and personal money decisions.</p>
            <em>frankdigest.com</em>
          </span>
          <span className={styles.externalLinkIcon} aria-hidden="true">↗</span>
        </a>
      </div>
      <p className={styles.learningDisclaimer}>External educational resources are provided for general information. Their content does not constitute investment advice or guarantee investment returns.</p>
    </section>
  </div>;
}
