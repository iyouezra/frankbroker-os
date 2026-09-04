"use client";

import { useState, useSyncExternalStore } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

import styles from "../../../app/investor/investor.module.css";
import { AppLogo, Button } from "../shared/investor-foundation";
import { LanguageSwitcher } from "../shared/language-switcher";
import { useT } from "../../../lib/i18n/context";

type Challenge = {
  id: string;
  destinationHint?: string | null;
  demoCode?: string;
};

async function authRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/auth/investor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? "Unable to sign in."));
  return data;
}

export function InvestorLogin({ checking, onAuthenticated }: { checking: boolean; onAuthenticated: (fullName?: string) => Promise<void> }) {
  const t = useT();
  const [clientCode, setClientCode] = useState("");
  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const passkeySupported = useSyncExternalStore(
    () => () => undefined,
    () => "PublicKeyCredential" in window,
    () => false,
  );

  const requestCode = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await authRequest({ action: "request", clientCode, login });
      setChallenge({
        id: String(data.id),
        destinationHint: data.destinationHint ? String(data.destinationHint) : null,
        demoCode: data.demoCode ? String(data.demoCode) : undefined,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.error"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      const data = await authRequest({ action: "verify", challengeId: challenge.id, code });
      await onAuthenticated(data.fullName ? String(data.fullName) : undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.error"));
    } finally {
      setBusy(false);
    }
  };

  const signInWithPasskey = async () => {
    setBusy(true);
    setError("");
    try {
      const start = await authRequest({ action: "passkey_login_options" });
      const response = await startAuthentication({
        optionsJSON: start.options as PublicKeyCredentialRequestOptionsJSON,
      });
      const data = await authRequest({ action: "passkey_login_verify", challengeId: start.challengeId, response });
      await onAuthenticated(data.fullName ? String(data.fullName) : undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.passkeyError"));
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.demoSelector}>
    <div className={styles.demoSelectorBrand}><AppLogo /><span>{t("auth.securePortal")}</span></div>
    <div className={styles.demoSelectorIntro}>
      <small>{t("auth.eyebrow")}</small>
      <h1>{checking ? t("auth.checking") : challenge ? t("auth.codeTitle") : t("auth.title")}</h1>
      <p>{checking
        ? t("auth.checkingDetail")
        : challenge
          ? t("auth.codeDetail", { destination: challenge.destinationHint ?? t("auth.registeredContact") })
          : t("auth.detail")}</p>
    </div>
    {!checking && <form className={styles.authForm} onSubmit={(event) => {
      event.preventDefault();
      void (challenge ? verify() : requestCode());
    }}>
      {!challenge && passkeySupported && <>
        <Button type="button" className={styles.full} disabled={busy} onClick={() => void signInWithPasskey()}>
          {busy ? t("auth.working") : t("auth.passkeySignIn")}
        </Button>
        <div className={styles.authDivider}><span>{t("auth.orCode")}</span></div>
      </>}
      {!challenge ? <>
        <label><span>{t("auth.clientCode")}</span><input autoCapitalize="characters" autoComplete="username" value={clientCode} onChange={(event) => setClientCode(event.target.value.toUpperCase())} placeholder="CL-10041" /></label>
        <label><span>{t("auth.contact")}</span><input autoComplete="email tel" value={login} onChange={(event) => setLogin(event.target.value)} placeholder="name@example.et or +251…" /></label>
      </> : <>
        <label><span>{t("auth.code")}</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label>
        {challenge.demoCode && <p className={styles.authDemoCode}>{t("auth.demoCode", { code: challenge.demoCode })}</p>}
      </>}
      {error && <p className={styles.authError} role="alert">{error}</p>}
      <Button type="submit" className={styles.full} disabled={busy || (challenge ? code.length !== 6 : clientCode.trim().length < 4 || login.trim().length < 5)}>
        {busy ? t("auth.working") : challenge ? t("auth.verify") : t("auth.send")}
      </Button>
      {challenge && <button className={styles.authBack} type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(""); setError(""); }}>{t("auth.back")}</button>}
    </form>}
    <LanguageSwitcher />
    <p className={styles.demoSelectorNote}>{t("auth.faydaReady")}</p>
  </div>;
}
