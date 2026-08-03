"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import type { OrderSubmissionOutcome } from "../../../lib/order-submission-ux";
import { Button, Icon } from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";

// The investor-facing outcome copy is generated in lib/order-submission-ux.ts,
// which is shared with the broker portal and stays English. Mirroring it by
// `kind` here lets the investor dialog translate without touching that module
// or the broker's wording.
const OUTCOME_COPY: Record<string, { title: TranslationKey; message: TranslationKey; nextStep: TranslationKey }> = {
  submitted: { title: "outcome.submittedTitle", message: "outcome.submittedMessage", nextStep: "outcome.submittedNext" },
  held: { title: "outcome.heldTitle", message: "outcome.heldMessage", nextStep: "outcome.heldNext" },
  submission_uncertain: { title: "outcome.uncertainTitle", message: "outcome.uncertainMessage", nextStep: "outcome.uncertainNext" },
  authorization_failed: { title: "outcome.authFailedTitle", message: "outcome.authFailedMessage", nextStep: "outcome.authFailedNext" },
  submission_failed: { title: "outcome.failedTitle", message: "outcome.failedMessage", nextStep: "outcome.failedNext" },
};

export type InvestorOtpChallenge = {
  id: string;
  deliveryChannel: "sms" | "email";
  destinationHint: string;
  expiresAt?: string;
  demoCode?: string;
  busy: boolean;
  error: string;
};

export function InvestorOrderOtpDialog({ challenge, onVerify, onResend, onDeliveryChange, onCancel, context = "order" }: {
  challenge: InvestorOtpChallenge;
  onVerify: (code: string) => void;
  onResend: () => void;
  onDeliveryChange?: (channel: "sms" | "email") => void;
  onCancel: () => void;
  context?: "order" | "onboarding";
}) {
  const t = useT();
  const [code, setCode] = useState("");
  const onboarding = context === "onboarding";
  const expiry = challenge.expiresAt
    ? new Date(challenge.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;
  return <div className={`${styles.sheetBackdrop} ${styles.otpBackdrop}`}>
    <section className={`${styles.orderSheet} ${styles.otpSheet}`} role="dialog" aria-modal="true" aria-labelledby="investor-otp-title">
      <i className={styles.sheetHandle} />
      <div className={styles.dialogIcon} data-tone="secure"><Icon name="shield" size={22} /></div>
      <span className={styles.dialogEyebrow}>{t(onboarding ? "otp.eyebrowApplicant" : "otp.eyebrowOrder")}</span>
      <h2 id="investor-otp-title">{t(onboarding ? "otp.titleOnboarding" : "otp.titleOrder")}</h2>
      <p className={styles.otpIntro}>{t("otp.introPrefix", { channel: t(challenge.deliveryChannel === "email" ? "otp.byEmail" : "otp.byText") })}<b>{challenge.destinationHint}</b>{t(onboarding ? "otp.introSuffixOnboarding" : "otp.introSuffixOrder")}</p>
      {onDeliveryChange && <div className={styles.deliveryChoice} aria-label={t("otp.deliveryLabel")}>
        <button type="button" aria-pressed={challenge.deliveryChannel === "sms"} disabled={challenge.busy} onClick={() => onDeliveryChange("sms")}>{t("otp.textMessage")}</button>
        <button type="button" aria-pressed={challenge.deliveryChannel === "email"} disabled={challenge.busy} onClick={() => onDeliveryChange("email")}>{t("otp.email")}</button>
      </div>}
      <label className={styles.otpField}>
        <span>{t("otp.codeLabel")}</span>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={Boolean(challenge.error)} />
        <small>{expiry ? t("otp.expiresAt", { time: expiry }) : t("otp.expiresShortly")}{challenge.demoCode ? t("otp.demoCode", { code: challenge.demoCode }) : ""}</small>
      </label>
      {challenge.error && <div className={styles.otpError} role="alert"><b>{t("otp.notAccepted")}</b><span>{challenge.error}</span></div>}
      <button className={styles.resendButton} disabled={challenge.busy} onClick={onResend}>{t("otp.resend", { channel: t(challenge.deliveryChannel === "email" ? "otp.channelEmail" : "otp.channelText") })}</button>
      <div className={styles.dialogActions}><Button variant="secondary" disabled={challenge.busy} onClick={onCancel}>{t("order.cancel")}</Button><Button disabled={challenge.busy || code.length !== 6} onClick={() => onVerify(code)}>{t(challenge.busy ? "otp.verifying" : onboarding ? "onboarding.verifyContinue" : "otp.verifySubmit")}</Button></div>
      <p className={styles.otpSafety}>{t("otp.safety")}</p>
    </section>
  </div>;
}

export function InvestorOrderOutcomeDialog({ outcome, onClose, onViewOrders }: {
  outcome: OrderSubmissionOutcome;
  onClose: () => void;
  onViewOrders: () => void;
}) {
  const t = useT();
  const copy = outcome.audience === "investor" ? OUTCOME_COPY[outcome.kind] : undefined;
  const positive = outcome.kind === "submitted";
  const held = outcome.kind === "held";
  const uncertain = outcome.kind === "submission_uncertain";
  const tone = positive ? "success" : held || uncertain ? "warning" : "error";
  return <div className={styles.dialogBackdrop}>
    <section className={`${styles.confirmDialog} ${styles.outcomeDialog}`} role={positive ? "status" : "alertdialog"} aria-modal="true" aria-labelledby="order-outcome-title">
      <div className={styles.dialogIcon} data-tone={tone}><Icon name={positive ? "check" : "shield"} size={23} /></div>
      <span className={styles.dialogEyebrow}>{t(positive ? "outcome.received" : held ? "outcome.actionRequired" : uncertain ? "outcome.checkBeforeRetry" : "outcome.notSubmitted")}</span>
      <h2 id="order-outcome-title">{copy ? t(copy.title) : outcome.title}</h2>
      {outcome.orderId && <div className={styles.orderReference}><small>{t("outcome.orderReference")}</small><b>{outcome.orderId}</b></div>}
      <p>{copy ? t(copy.message) : outcome.message}</p>
      {outcome.detail && <div className={styles.outcomeDetail}>{outcome.detail}</div>}
      <div className={styles.nextStep}><b>{t("onboarding.whatNext")}</b><span>{copy ? t(copy.nextStep) : outcome.nextStep}</span></div>
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>{t(positive || held ? "outcome.done" : "outcome.backToOrder")}</Button>
        {(positive || held || uncertain) && <Button onClick={onViewOrders}>{t("outcome.viewOrders")}</Button>}
      </div>
    </section>
  </div>;
}
