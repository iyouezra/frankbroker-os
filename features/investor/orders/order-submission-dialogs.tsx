"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import type { OrderSubmissionOutcome } from "../../../lib/order-submission-ux";
import { Button, Icon } from "../shared/investor-foundation";

export type InvestorOtpChallenge = {
  id: string;
  deliveryChannel: "sms" | "email";
  destinationHint: string;
  expiresAt?: string;
  demoCode?: string;
  busy: boolean;
  error: string;
};

export function InvestorOrderOtpDialog({ challenge, onVerify, onResend, onDeliveryChange, onCancel }: {
  challenge: InvestorOtpChallenge;
  onVerify: (code: string) => void;
  onResend: () => void;
  onDeliveryChange: (channel: "sms" | "email") => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const expiry = challenge.expiresAt
    ? new Date(challenge.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;
  return <div className={styles.dialogBackdrop}>
    <section className={`${styles.confirmDialog} ${styles.otpDialog}`} role="dialog" aria-modal="true" aria-labelledby="order-otp-title">
      <div className={styles.dialogIcon} data-tone="secure"><Icon name="shield" size={22} /></div>
      <span className={styles.dialogEyebrow}>SECURE ORDER AUTHORIZATION</span>
      <h2 id="order-otp-title">Enter your verification code</h2>
      <p>We sent a six-digit code by {challenge.deliveryChannel === "email" ? "email" : "text message"} to <b>{challenge.destinationHint}</b>. It authorizes only the order you just reviewed.</p>
      <div className={styles.deliveryChoice} aria-label="Verification delivery method">
        <button type="button" aria-pressed={challenge.deliveryChannel === "sms"} disabled={challenge.busy} onClick={() => onDeliveryChange("sms")}>Text message</button>
        <button type="button" aria-pressed={challenge.deliveryChannel === "email"} disabled={challenge.busy} onClick={() => onDeliveryChange("email")}>Email</button>
      </div>
      <label className={styles.otpField}>
        <span>Verification code</span>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={Boolean(challenge.error)} />
        <small>{expiry ? `Code expires at ${expiry}.` : "The code expires shortly."}{challenge.demoCode ? ` Demo code: ${challenge.demoCode}` : ""}</small>
      </label>
      {challenge.error && <div className={styles.otpError} role="alert"><b>Code not accepted</b><span>{challenge.error}</span></div>}
      <button className={styles.resendButton} disabled={challenge.busy} onClick={onResend}>Send a new code by {challenge.deliveryChannel === "email" ? "email" : "text"}</button>
      <div className={styles.dialogActions}><Button variant="secondary" disabled={challenge.busy} onClick={onCancel}>Cancel</Button><Button disabled={challenge.busy || code.length !== 6} onClick={() => onVerify(code)}>{challenge.busy ? "Verifying…" : "Verify & submit"}</Button></div>
      <p className={styles.otpSafety}>Frank will never ask you to share this code outside this secure order confirmation.</p>
    </section>
  </div>;
}

export function InvestorOrderOutcomeDialog({ outcome, onClose, onViewOrders }: {
  outcome: OrderSubmissionOutcome;
  onClose: () => void;
  onViewOrders: () => void;
}) {
  const positive = outcome.kind === "submitted";
  const held = outcome.kind === "held";
  const uncertain = outcome.kind === "submission_uncertain";
  const tone = positive ? "success" : held || uncertain ? "warning" : "error";
  return <div className={styles.dialogBackdrop}>
    <section className={`${styles.confirmDialog} ${styles.outcomeDialog}`} role={positive ? "status" : "alertdialog"} aria-modal="true" aria-labelledby="order-outcome-title">
      <div className={styles.dialogIcon} data-tone={tone}><Icon name={positive ? "check" : "shield"} size={23} /></div>
      <span className={styles.dialogEyebrow}>{positive ? "ORDER RECEIVED" : held ? "ACTION REQUIRED" : uncertain ? "CHECK BEFORE RETRYING" : "NOT SUBMITTED"}</span>
      <h2 id="order-outcome-title">{outcome.title}</h2>
      {outcome.orderId && <div className={styles.orderReference}><small>ORDER REFERENCE</small><b>{outcome.orderId}</b></div>}
      <p>{outcome.message}</p>
      {outcome.detail && <div className={styles.outcomeDetail}>{outcome.detail}</div>}
      <div className={styles.nextStep}><b>What happens next</b><span>{outcome.nextStep}</span></div>
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>{positive || held ? "Done" : "Back to order"}</Button>
        {(positive || held || uncertain) && <Button onClick={onViewOrders}>View orders</Button>}
      </div>
    </section>
  </div>;
}
