"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";

import styles from "../../../app/investor/investor.module.css";
import { Button } from "../shared/investor-foundation";

type PasskeySummary = {
  id: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

async function passkeyRequest(body?: Record<string, unknown>) {
  const response = await fetch("/api/auth/investor/passkeys", body ? {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  } : undefined);
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? "The passkey request could not be completed."));
  return data;
}

export function PasskeyManager({ enabled }: { enabled: boolean }) {
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => "PublicKeyCredential" in window,
    () => false,
  );
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const data = await passkeyRequest();
    setPasskeys(Array.isArray(data.passkeys) ? data.passkeys as PasskeySummary[] : []);
  };

  useEffect(() => {
    if (!enabled || !supported) return;
    let active = true;
    void passkeyRequest()
      .then((data) => { if (active) setPasskeys(Array.isArray(data.passkeys) ? data.passkeys as PasskeySummary[] : []); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load passkeys."); });
    return () => { active = false; };
  }, [enabled, supported]);

  if (!enabled) return <div className={styles.passkeyNotice}><b>Passkeys are disabled in shared demo mode</b><span>Sign in through the protected investor environment to register a personal device.</span></div>;
  if (!supported) return <div className={styles.passkeyNotice}><b>This browser does not offer passkeys</b><span>You can continue using the registered-contact sign-in flow.</span></div>;

  const register = async () => {
    setBusy(true);
    setError("");
    try {
      const start = await passkeyRequest({ action: "register_options" });
      const response = await startRegistration({ optionsJSON: start.options as PublicKeyCredentialCreationOptionsJSON });
      await passkeyRequest({ action: "register_verify", challengeId: start.challengeId, response, label: "Personal device" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Passkey setup was not completed.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (passkey: PasskeySummary) => {
    if (!window.confirm(`Remove “${passkey.label}”? You will no longer be able to use it to sign in or approve orders.`)) return;
    setBusy(true);
    setError("");
    try {
      await passkeyRequest({ action: "revoke", passkeyId: passkey.id });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The passkey could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.passkeyManager}>
    <div className={styles.passkeyHeading}><span><b>Face ID, fingerprint or passkey</b><small>Your biometric data never leaves your device. A passkey is required before an order OTP is sent.</small></span><Button disabled={busy} onClick={() => void register()}>{busy ? "Please wait…" : "Add passkey"}</Button></div>
    {passkeys.length ? <div className={styles.passkeyList}>{passkeys.map((passkey) => <div key={passkey.id}><span><b>{passkey.label}</b><small>{passkey.backedUp ? "Synced passkey" : "Device passkey"} · Added {new Date(passkey.createdAt).toLocaleDateString("en-GB")}{passkey.lastUsedAt ? ` · Last used ${new Date(passkey.lastUsedAt).toLocaleDateString("en-GB")}` : ""}</small></span><button disabled={busy} onClick={() => void revoke(passkey)}>Remove</button></div>)}</div> : <div className={styles.passkeyNotice}><b>No passkey registered</b><span>Add one before placing orders in the protected investor environment.</span></div>}
    {error && <p className={styles.authError} role="alert">{error}</p>}
  </div>;
}
