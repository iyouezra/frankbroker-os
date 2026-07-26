"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  formatEtb,
  investorBonds,
  investorStocks,
  type InvestorBond,
  type InvestorStock,
} from "../../lib/investor-data";
import styles from "./investor.module.css";
import { demoInvestorNotifications, timeAgo, type NotificationItem } from "../../lib/notifications-demo";
import {
  mergeInvestorActivity,
  type InvestorActivity,
} from "../../lib/investor-activity";
import { demoInvestorActivity } from "../../lib/investor-activity-demo";
import {
  AppLogo,
  BottomNav,
  Button,
  Delta,
  Icon,
  fallbackLinkedBanks,
  INVESTOR_CLIENT_ID,
  investorHeadersFor,
  mergeBondInstrument,
  type CashMovementInput,
  type CashMovementView,
  type InvestorBootstrap,
  type InvestorOrderInput,
  type InvestorKyc,
  type OnboardingSubmission,
  type OrderCheck,
  type PlaceResult,
  type Tab,
} from "../../features/investor/shared/investor-foundation";
import { Onboarding } from "../../features/investor/onboarding/onboarding-flow";
import { ActivityScreen } from "../../features/investor/activity/activity-screen";
import { HomeScreen } from "../../features/investor/home/home-screen";
import { MarketsScreen } from "../../features/investor/markets/markets-screen";
import { PortfolioScreen } from "../../features/investor/portfolio/portfolio-screen";
import { LearnScreen } from "../../features/investor/learn/learn-screen";
import { ProfileScreen } from "../../features/investor/profile/profile-screen";
import { SupportScreen, type SupportThreadSummary } from "../../features/investor/support/support-screen";
import { SupportThreadScreen, type SupportThreadDetail } from "../../features/investor/support/support-thread-screen";
import { NewRequestSheet, type NewRequestInput } from "../../features/investor/support/new-request-sheet";
import { fallbackSupportDetail, fallbackSupportThreads } from "../../features/investor/support/support-demo";
import { CashSheet } from "../../features/investor/cash/cash-sheet";
import { BondDetail, StockDetail } from "../../features/investor/markets/security-detail-screens";
import {
  InvestorOrderOtpDialog,
  InvestorOrderOutcomeDialog,
  type InvestorOtpChallenge,
} from "../../features/investor/orders/order-submission-dialogs";
import {
  failedOutcome,
  heldOutcome,
  submittedOutcome,
  type OrderSubmissionOutcome,
} from "../../lib/order-submission-ux";

type InvestorPhase = "select" | "existing" | "onboarding" | "app";
type SubmittedApplication = {
  id: string;
  clientCode: string;
  accountNumber?: string;
  fullName: string;
};

const demoPersonas = [
  {
    id: "cli_investor_demo",
    name: "Selam Mekonnen",
    initials: "SM",
    accountType: "Individual investor",
    detail: "Active account with holdings, orders and support history",
  },
  {
    id: "cli_blue",
    name: "Blue Nile Trading PLC",
    initials: "BN",
    accountType: "Corporate investor",
    detail: "Active institutional account with larger balances and positions",
  },
] as const;

export default function InvestorApp() {
  const [phase, setPhase] = useState<InvestorPhase>("select");
  const [activeClientId, setActiveClientId] = useState(INVESTOR_CLIENT_ID);
  const [onboardingType, setOnboardingType] = useState<InvestorKyc["accountType"]>("retail");
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplication | null>(null);
  const [entryBusy, setEntryBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [stock, setStock] = useState<InvestorStock | null>(null);
  const [bond, setBond] = useState<InvestorBond | null>(null);
  const [toast, setToast] = useState("");
  const [orderOtp, setOrderOtp] = useState<InvestorOtpChallenge | null>(null);
  const [orderOutcome, setOrderOutcome] = useState<OrderSubmissionOutcome | null>(null);
  const orderOtpResolver = useRef<((verificationId: string | null) => void) | null>(null);
  const pendingOtpOrder = useRef<{ order: InvestorOrderInput; submissionReference: string } | null>(null);
  const [profileName, setProfileName] = useState("Selam Mekonnen");
  const [bootstrap, setBootstrap] = useState<InvestorBootstrap | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityInitialItem, setActivityInitialItem] = useState<InvestorActivity | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportThreadId, setSupportThreadId] = useState<string | null>(null);
  const [supportThreads, setSupportThreads] = useState<SupportThreadSummary[]>([]);
  const [supportDetail, setSupportDetail] = useState<SupportThreadDetail | null>(null);
  const [supportUnread, setSupportUnread] = useState(0);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const investorHeaders = useMemo(() => investorHeadersFor(activeClientId), [activeClientId]);
  const featured = useMemo(() => investorStocks.slice(0, 3), []);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const navigate = (next: Tab) => { setTab(next); setStock(null); setBond(null); setActivityOpen(false); setActivityInitialItem(null); setSupportOpen(false); setSupportThreadId(null); };
  const resetWorkspace = () => {
    setTab("home");
    setStock(null);
    setBond(null);
    setBellOpen(false);
    setCashOpen(false);
    setActivityOpen(false);
    setSupportOpen(false);
    setSupportThreadId(null);
    setSubmittedApplication(null);
  };
  const loadInvestor = async (clientId: string) => {
    const response = await fetch("/api/investor", { headers: investorHeadersFor(clientId) });
    if (!response.ok) throw new Error("Unable to open this demo account.");
    const data = await response.json() as InvestorBootstrap;
    setBootstrap({ ...data, activity: data.activity ?? [] });
    if (data.profile?.fullName) setProfileName(data.profile.fullName);
    return data;
  };
  const enterPersona = async (clientId: string) => {
    setEntryBusy(clientId);
    try {
      await loadInvestor(clientId);
      resetWorkspace();
      setActiveClientId(clientId);
      setPhase("app");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to open this demo account.");
    } finally {
      setEntryBusy(null);
    }
  };
  const startApplication = (accountType: InvestorKyc["accountType"]) => {
    resetWorkspace();
    setOnboardingType(accountType);
    setActiveClientId(INVESTOR_CLIENT_ID);
    setPhase("onboarding");
  };
  const openStock = (next: InvestorStock) => { setBond(null); setStock(next); };
  const openBond = (next: InvestorBond) => { setStock(null); setBond(next); };
  const openActivity = (item: InvestorActivity | null = null) => {
    setTab("home");
    setStock(null);
    setBond(null);
    setActivityInitialItem(item);
    setActivityOpen(true);
  };
  useEffect(() => {
    if (phase !== "app") return;
    const controller = new AbortController();
    void fetch("/api/notifications", { headers: investorHeaders, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
      .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
      .catch(() => setNotifications(demoInvestorNotifications()));
    return () => controller.abort();
  }, [investorHeaders, phase]);
  const unreadNotifs = notifications.filter((item) => !item.read).length;
  const markAllNotifsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    void fetch("/api/notifications", { method: "PATCH", headers: { ...investorHeaders, "content-type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
  };
  const openNotification = (item: NotificationItem) => {
    setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read: true } : row));
    void fetch("/api/notifications", { method: "PATCH", headers: { ...investorHeaders, "content-type": "application/json" }, body: JSON.stringify({ id: item.id }) }).catch(() => undefined);
    setBellOpen(false);
    if (item.category === "support") {
      navigate("profile");
      setSupportOpen(true);
      if (item.entityId) void openSupportThread(item.entityId);
      return;
    }
    if (["order", "trade", "settlement"].includes(item.category)) navigate("portfolio");
    else if (item.category === "kyc") navigate("profile");
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/investor", { headers: investorHeaders, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: InvestorBootstrap) => {
        setBootstrap({ ...data, activity: data.activity ?? [] });
        if (data.profile?.fullName) setProfileName(data.profile.fullName);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [investorHeaders]);
  const refreshInvestor = async (clientId = activeClientId) => {
    const data = await loadInvestor(clientId);
    if (clientId !== activeClientId) setActiveClientId(clientId);
    return data;
  };
  /** Sends JSON, or multipart when files are attached (same shape the KYC upload uses). */
  const postInvestor = async (body: unknown, files: File[] = []) => {
    const init: RequestInit = files.length
      ? (() => {
        const formData = new FormData();
        formData.set("payload", JSON.stringify(body));
        files.forEach((file, index) => formData.set(`attachment${index}`, file));
        return { method: "POST", headers: investorHeaders, body: formData };
      })()
      : { method: "POST", headers: { ...investorHeaders, "content-type": "application/json" }, body: JSON.stringify(body) };
    const response = await fetch("/api/investor", init);
    const data = await response.json().catch(() => ({})) as { id?: string; demoCode?: string; destinationHint?: string; deliveryChannel?: "sms" | "email"; expiresAt?: string; error?: string; order?: { id: string; status: string }; checks?: OrderCheck[]; request?: { id: string; status: string }; cashMovement?: CashMovementView; account?: { id: string; totalCash: number; availableCash: number; blockedCash: number }; profile?: { id: string; clientCode: string; accountNumber?: string; fullName: string; kycStatus: string } };
    if (!response.ok) throw new Error(data.error ?? "Unable to update the investor account.");
    return data;
  };
  const completeOnboarding = async (submission: OnboardingSubmission) => {
    const { profile, linkedBanks, documents } = submission;
    if (!bootstrap) {
      notify("Connect the demo database before submitting an application.");
      return;
    }
    try {
      const challenge = await postInvestor({ action: "request_kyc_otp", phone: profile.phone });
      const code = window.prompt(`Verify ${profile.phone} before submitting KYC.${challenge.demoCode ? `\n\nDemo code: ${challenge.demoCode}` : ""}`);
      if (!code || !challenge.id) {
        notify("Verification cancelled. Your application has not been submitted.");
        return;
      }
      await postInvestor({ action: "confirm_otp", verificationId: challenge.id, code });
      const formData = new FormData();
      formData.set("payload", JSON.stringify({
        action: "kyc",
        newApplication: true,
        ...profile,
        linkedBanks: linkedBanks.map((bank) => ({
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountHolderName: bank.accountHolderName,
        })),
        verificationId: challenge.id,
        termsVersion: bootstrap?.tenant.legalDocument?.version,
      }));
      Object.entries(documents).forEach(([type, file]) => {
        if (file) formData.set(type, file);
      });
      const response = await fetch("/api/investor", { method: "POST", headers: investorHeaders, body: formData });
      const result = await response.json() as { error?: string; profile?: SubmittedApplication };
      if (!response.ok) throw new Error(result.error ?? "Unable to submit onboarding.");
      if (!result.profile) throw new Error("The application was submitted without a client reference.");
      setSubmittedApplication(result.profile);
      setProfileName(result.profile.fullName);
      await refreshInvestor(result.profile.id);
      setPhase("app");
      notify(`${result.profile.clientCode} submitted for broker review.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to submit onboarding.");
    }
  };
  const addLinkedBank = async (bankName: string, accountNumber: string) => {
    try {
      const response = await fetch("/api/investor/bank-accounts", {
        method: "POST",
        headers: { ...investorHeaders, "content-type": "application/json" },
        body: JSON.stringify({ bankName, accountNumber, accountHolderName: profileName }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to link the bank account.");
      await refreshInvestor();
      notify("Bank account sent for review.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to link the bank account.");
    }
  };
  const deleteLinkedBank = async (id: string) => {
    try {
      const response = await fetch(`/api/investor/bank-accounts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: investorHeaders,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to remove the bank account.");
      await refreshInvestor();
      notify("Linked bank account removed.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to remove the bank account.");
    }
  };
  const placeOrder = async (order: InvestorOrderInput): Promise<PlaceResult> => {
    if (submittedApplication && bootstrap?.account?.status !== "active") {
      notify("Broker approval is required before you can place an order.");
      return { status: "validation_failed" };
    }
    let stage: "authorization" | "submission" = "authorization";
    try {
      const submissionReference = crypto.randomUUID();
      const challenge = await postInvestor({ action: "request_order_otp", ...order, submissionReference, deliveryChannel: "sms" });
      if (!challenge.id) throw new Error("An authorization code could not be requested.");
      pendingOtpOrder.current = { order, submissionReference };
      setOrderOtp({
        id: challenge.id,
        deliveryChannel: challenge.deliveryChannel === "email" ? "email" : "sms",
        destinationHint: challenge.destinationHint ?? "your registered mobile",
        expiresAt: challenge.expiresAt,
        demoCode: challenge.demoCode,
        busy: false,
        error: "",
      });
      const verificationId = await new Promise<string | null>((resolve) => { orderOtpResolver.current = resolve; });
      if (!verificationId) return { status: "verification_cancelled" };
      stage = "submission";
      const result = await postInvestor({ action: "order", ...order, submissionReference, verificationId });
      const failed = (result.checks ?? []).filter((check) => !check.passed);
      if (result.order?.status === "validation_failed") {
        setOrderOutcome(heldOutcome({ audience: "investor", orderId: result.order.id, channel: "investor_portal", detail: failed[0]?.message }));
      } else {
        setOrderOutcome(submittedOutcome({ audience: "investor", orderId: result.order?.id ?? "Order", channel: "investor_portal" }));
      }
      await refreshInvestor().catch(() => undefined);
      return { status: result.order?.status, checks: result.checks };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The order could not be submitted.";
      setOrderOutcome(failedOutcome({ audience: "investor", stage, channel: "investor_portal", detail: message }));
      return { status: "error" };
    }
  };

  const verifyInvestorOrderOtp = async (code: string) => {
    if (!orderOtp) return;
    setOrderOtp((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      await postInvestor({ action: "confirm_otp", verificationId: orderOtp.id, code });
      setOrderOtp(null);
      orderOtpResolver.current?.(orderOtp.id);
      orderOtpResolver.current = null;
      pendingOtpOrder.current = null;
    } catch (error) {
      setOrderOtp((current) => current ? { ...current, busy: false, error: error instanceof Error ? error.message : "The verification code was not accepted." } : current);
    }
  };

  const resendInvestorOrderOtp = async (deliveryChannel = orderOtp?.deliveryChannel ?? "sms") => {
    if (!orderOtp || !pendingOtpOrder.current) return;
    setOrderOtp((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      const { order, submissionReference } = pendingOtpOrder.current;
      const challenge = await postInvestor({ action: "request_order_otp", ...order, submissionReference, deliveryChannel });
      if (!challenge.id) throw new Error("A new code could not be requested.");
      setOrderOtp({
        id: challenge.id,
        deliveryChannel: challenge.deliveryChannel === "email" ? "email" : "sms",
        destinationHint: challenge.destinationHint ?? (deliveryChannel === "email" ? "your registered email" : "your registered mobile"),
        expiresAt: challenge.expiresAt,
        demoCode: challenge.demoCode,
        busy: false,
        error: "",
      });
    } catch (error) {
      setOrderOtp((current) => current ? { ...current, busy: false, error: error instanceof Error ? error.message : "A new code could not be sent." } : current);
    }
  };

  const cancelInvestorOrderOtp = () => {
    setOrderOtp(null);
    pendingOtpOrder.current = null;
    orderOtpResolver.current?.(null);
    orderOtpResolver.current = null;
  };
  // Support conversations. Reads use a dedicated endpoint because messages
  // paginate; writes reuse the existing postInvestor transport.
  const loadSupport = useCallback(async () => {
    setSupportLoading(true);
    try {
      const response = await fetch("/api/investor/support", { headers: investorHeaders });
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json() as { threads: SupportThreadSummary[]; summary: { unread: number } };
      setSupportThreads(data.threads);
      setSupportUnread(data.summary.unread);
    } catch {
      setSupportThreads(fallbackSupportThreads);
      setSupportUnread(fallbackSupportThreads.reduce((total, thread) => total + thread.unread, 0));
    } finally {
      setSupportLoading(false);
    }
  }, [investorHeaders]);

  useEffect(() => {
    if (phase !== "app") return;
    const load = async () => { await loadSupport(); };
    void load();
  }, [loadSupport, phase]);

  const openSupportThread = async (threadId: string) => {
    setSupportThreadId(threadId);
    setSupportDetail(null);
    try {
      const response = await fetch(`/api/investor/support?threadId=${encodeURIComponent(threadId)}`, { headers: investorHeaders });
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json() as { thread: SupportThreadDetail };
      setSupportDetail(data.thread);
      await postInvestor({ action: "support_thread_read", threadId });
      void loadSupport();
    } catch {
      setSupportDetail(fallbackSupportDetail(threadId));
    }
  };

  const sendSupportReply = async (body: string, files: File[]) => {
    if (!supportThreadId) return false;
    setSupportBusy(true);
    try {
      await postInvestor({ action: "support_thread_reply", threadId: supportThreadId, body }, files);
      await openSupportThread(supportThreadId);
      notify("Message sent to your broker.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Your message could not be sent.");
      return false;
    } finally {
      setSupportBusy(false);
    }
  };

  const createSupportRequest = async (input: NewRequestInput) => {
    setSupportBusy(true);
    try {
      await postInvestor({ action: "support_thread_create", category: input.category, subject: input.subject, body: input.body }, input.files);
      setNewRequestOpen(false);
      await loadSupport();
      notify("Request sent. Your broker will reply here.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Your request could not be sent.");
      return false;
    } finally {
      setSupportBusy(false);
    }
  };

  const createServiceRequest = async (requestType: "trade_discrepancy" | "account_closure" | "profile_correction", orderId?: string) => {
    const description = requestType === "trade_discrepancy"
      ? `Please review the confirmation and execution details for ${orderId}.`
      : requestType === "account_closure"
        ? "Please review my account for closure and tell me which balances, holdings, or open instructions must be cleared."
        : "Please contact me to review and correct my identity, tax, or contact records.";
    try {
      const result = await postInvestor({ action: "service_request", requestType, orderId, description });
      if (result.request) {
        setBootstrap((current) => current ? { ...current, serviceRequests: [{
          id: result.request!.id,
          requestType,
          status: result.request!.status,
          subject: requestType === "trade_discrepancy" ? `Order discrepancy · ${orderId}` : requestType === "account_closure" ? "Account closure request" : "Profile correction request",
          description,
          orderId,
          submittedAt: new Date().toISOString(),
        }, ...current.serviceRequests] } : current);
      }
      notify("Request sent to your broker for controlled review.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to submit the request.");
    }
  };
  const createCashMovement = async (input: CashMovementInput) => {
    if (submittedApplication && bootstrap?.account?.status !== "active") {
      notify("Broker approval is required before you can add or withdraw money.");
      return false;
    }
    try {
      const result = await postInvestor({ action: "cash_movement", ...input, submissionReference: crypto.randomUUID() });
      if (result.cashMovement) {
        setBootstrap((current) => current ? {
          ...current,
          account: current.account && result.account ? { ...current.account, ...result.account } : current.account,
          cashMovements: [result.cashMovement!, ...current.cashMovements.filter((item) => item.id !== result.cashMovement!.id)],
        } : current);
      }
      await refreshInvestor().catch(() => undefined);
      notify(input.movementType === "deposit" ? "Deposit sent for independent bank verification." : "Withdrawal reserved and sent for broker approval.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to submit the cash instruction.");
      return false;
    }
  };
  const feePct = bootstrap?.tenant.brokerageFeePct ?? .5;
  const minimumFee = bootstrap?.tenant.minimumFee ?? 25;
  const equityFeeRule = bootstrap?.tenant.feeSchedule?.rules.find((rule) => rule.assetClass === "equity") ?? {
    assetClass: "equity", marketSegment: "main", brokeragePct: feePct, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee, maximumFee: null,
  };
  const bondFeeRule = bootstrap?.tenant.feeSchedule?.rules.find((rule) => rule.assetClass === "bond") ?? {
    assetClass: "bond", marketSegment: "main", brokeragePct: feePct, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee, maximumFee: null,
  };
  const allowedOrderTypes = bootstrap?.tenant.allowedOrderTypes ?? ["Market", "Limit", "Stop-loss"];
  const enabledTickers = bootstrap ? bootstrap.instruments.map((instrument) => instrument.ticker) : null;
  const availableBonds = investorBonds.map((item) => mergeBondInstrument(item, bootstrap?.instruments.find((instrument) => instrument.ticker === item.ticker)));
  const bondsEnabled = bootstrap?.tenant.features.bonds ?? true;
  const theme = { "--investor-accent": bootstrap?.tenant.primaryColor ?? "#0c8189" } as CSSProperties;
  const activity = mergeInvestorActivity(
    bootstrap?.activity ?? [],
    activeClientId === INVESTOR_CLIENT_ID ? demoInvestorActivity : [],
  );
  const applicationActive = bootstrap?.profile?.status === "active"
    && bootstrap?.profile?.kycStatus === "approved"
    && bootstrap?.account?.status === "active";
  const restrictedAccess = Boolean(submittedApplication && !applicationActive);
  const linkedBanks = bootstrap?.linkedBanks?.length
    ? bootstrap.linkedBanks
    : activeClientId === INVESTOR_CLIENT_ID
      ? fallbackLinkedBanks
      : [];

  return <main className={styles.investorPage} style={theme}>
    <section className={styles.desktopStory}>
      <AppLogo />
      <span className={styles.licenseBadge}>Platform demo</span>
      <h1>Own a piece of Ethiopia&apos;s growth</h1>
      <p>{bootstrap?.tenant.welcomeMessage ?? "Buy shares on the Ethiopian Securities Exchange, explore government bonds, and learn which mix may fit your goals."}</p>
      <Button onClick={() => setPhase("select")}>Choose a demo journey</Button>
      <div className={styles.desktopTickers}>{featured.map((item) => <span key={item.ticker}><b>{item.ticker}</b><small>{formatEtb(item.price)}</small><Delta value={item.delta} /></span>)}</div>
      <small className={styles.riskCopy}>Prices move. Invest money you won&apos;t need soon. Demo data only.</small>
    </section>
    <section className={styles.appFrame} aria-label="Frank Money investor app">
      <div className={styles.appViewport}>
        {phase === "app" && restrictedAccess && submittedApplication && <div className={styles.restrictedAccessBanner} role="status">
          <span><Icon name="shield" size={18} /></span>
          <div><b>Restricted access</b><small>Your application is pending broker approval. Trading and money movement are unavailable.</small></div>
          <button onClick={() => void refreshInvestor(submittedApplication.id)}>Refresh</button>
        </div>}
        {phase === "select" ? <div className={styles.demoSelector}>
          <div className={styles.demoSelectorBrand}><AppLogo /><span>PLATFORM DEMO</span></div>
          <div className={styles.demoSelectorIntro}>
            <small>INVESTOR PORTAL</small>
            <h1>How would you like to begin?</h1>
            <p>Continue with an active demo account or complete a new investor application.</p>
          </div>
          <div className={styles.entryChoiceList}>
            <button className={styles.entryChoiceCard} onClick={() => setPhase("existing")}>
              <i><Icon name="profile" size={22} /></i>
              <span><b>Use an existing account</b><small>Open Selam or Blue Nile as an approved investor.</small></span>
              <Icon name="chevron" size={17} />
            </button>
            <button className={styles.entryChoiceCard} onClick={() => startApplication("retail")}>
              <i><Icon name="plus" size={22} /></i>
              <span><b>Open a new account</b><small>Complete the full onboarding and broker approval journey.</small></span>
              <Icon name="chevron" size={17} />
            </button>
          </div>
          <p className={styles.demoSelectorNote}>New applications remain restricted until the broker completes approval.</p>
        </div>
          : phase === "existing" ? <div className={styles.demoSelector}>
            <div className={styles.demoSelectorBack}><button className={styles.iconButton} onClick={() => setPhase("select")} aria-label="Return to account options"><Icon name="back" size={20} /></button></div>
            <div className={styles.demoSelectorIntro}>
              <small>USE AN EXISTING ACCOUNT</small>
              <h1>Choose an investor</h1>
              <p>Both demo investors are approved and have active trading accounts.</p>
            </div>
            <div className={styles.demoPersonaList}>
              {demoPersonas.map((persona) => <button key={persona.id} className={styles.demoPersonaCard} disabled={Boolean(entryBusy)} onClick={() => void enterPersona(persona.id)}>
                <i>{persona.initials}</i>
                <span><b>{persona.name}</b><small>{persona.accountType}</small><em>{persona.detail}</em></span>
                <strong>{entryBusy === persona.id ? "Opening" : "Open"} <Icon name="chevron" size={15} /></strong>
              </button>)}
            </div>
          </div>
          : phase === "onboarding" ? <Onboarding initialAccountType={onboardingType} onBack={() => setPhase("select")} onDone={(profile) => void completeOnboarding(profile)} legalDocument={bootstrap?.tenant.legalDocument ?? null} />
          : stock ? <StockDetail key={stock.ticker} stock={stock} account={bootstrap?.account ?? null} restricted={restrictedAccess} onBack={() => setStock(null)} placeOrder={placeOrder} feeRule={equityFeeRule} allowedOrderTypes={allowedOrderTypes} />
            : bond ? <BondDetail key={bond.ticker} bond={bond} account={bootstrap?.account ?? null} restricted={restrictedAccess} onBack={() => setBond(null)} placeOrder={placeOrder} feeRule={bondFeeRule} allowedOrderTypes={allowedOrderTypes} />
              : <>
                <div className={`${styles.scrollArea} ${restrictedAccess ? styles.restrictedScroll : ""}`}>
                  {supportOpen
                    ? (supportThreadId
                        ? <SupportThreadScreen thread={supportDetail} sending={supportBusy} onBack={() => setSupportThreadId(null)} onSend={sendSupportReply} />
                        : <SupportScreen threads={supportThreads} loading={supportLoading} officer={bootstrap?.relationshipOfficer ?? null} onBack={() => setSupportOpen(false)} onOpenThread={openSupportThread} onNewRequest={() => setNewRequestOpen(true)} />)
                    : activityOpen
                    ? <ActivityScreen activity={activity} initialItem={activityInitialItem} onBack={() => { setActivityOpen(false); setActivityInitialItem(null); }} />
                    : tab === "home"
                      ? <HomeScreen openStock={openStock} go={navigate} account={bootstrap?.account ?? null} activity={activity} restricted={restrictedAccess} demoFallback={activeClientId === INVESTOR_CLIENT_ID} unread={unreadNotifs} onBell={() => setBellOpen(true)} onCash={() => restrictedAccess ? notify("Broker approval is required before you can add or withdraw money.") : setCashOpen(true)} onActivity={() => openActivity()} onActivityItem={(item) => openActivity(item)} />
                      : tab === "markets"
                        ? <MarketsScreen openStock={openStock} openBond={openBond} enabledTickers={enabledTickers} bondsEnabled={bondsEnabled} bonds={availableBonds} />
                        : tab === "portfolio"
                          ? <PortfolioScreen openStock={openStock} account={bootstrap?.account ?? null} demoFallback={activeClientId === INVESTOR_CLIENT_ID} />
                          : tab === "learn"
                            ? <LearnScreen />
                            : <ProfileScreen notify={notify} name={profileName} profile={bootstrap?.profile ?? null} accountNumber={bootstrap?.account?.accountNumber ?? null} orders={bootstrap?.account?.orders ?? []} requests={bootstrap?.serviceRequests ?? []} legalDocument={bootstrap?.tenant.legalDocument ?? null} linkedBanks={linkedBanks} supportUnread={supportUnread} onOpenSupport={() => setSupportOpen(true)} onAddBank={addLinkedBank} onDeleteBank={deleteLinkedBank} onRequest={(requestType, orderId) => void createServiceRequest(requestType, orderId)} />}
                </div>
                <BottomNav active={tab} onChange={navigate} />
              </>}
        {cashOpen && !restrictedAccess && <CashSheet pools={bootstrap?.cashPools ?? []} movements={bootstrap?.cashMovements ?? []} linkedBanks={linkedBanks} availableCash={bootstrap?.account?.availableCash ?? 0} onClose={() => setCashOpen(false)} onSubmit={createCashMovement} onViewActivity={() => { setCashOpen(false); openActivity(); }} />}
        {bellOpen && <div className={styles.sheetBackdrop} onClick={() => setBellOpen(false)}><section className={styles.notifSheet} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Notifications"><i className={styles.sheetHandle} /><div className={styles.notifHead}><h2>Notifications</h2>{unreadNotifs > 0 && <button onClick={markAllNotifsRead}>Mark all read</button>}</div><div className={styles.notifList}>{notifications.length === 0 ? <p className={styles.notifEmpty}>Nothing new right now.</p> : notifications.map((item) => <button key={item.id} className={`${styles.notifItem} ${item.read ? "" : styles.notifUnread}`} onClick={() => openNotification(item)}><i className={styles.notifDot} data-sev={item.severity} /><div><b>{item.title}</b><p>{item.body}</p><small>{timeAgo(item.createdAt)}</small></div></button>)}</div></section></div>}
        {newRequestOpen && <NewRequestSheet busy={supportBusy} onClose={() => setNewRequestOpen(false)} onSubmit={createSupportRequest} />}
        {orderOtp && <InvestorOrderOtpDialog key={orderOtp.id} challenge={orderOtp} onVerify={(code) => void verifyInvestorOrderOtp(code)} onResend={() => void resendInvestorOrderOtp()} onDeliveryChange={(channel) => { if (channel !== orderOtp.deliveryChannel) void resendInvestorOrderOtp(channel); }} onCancel={cancelInvestorOrderOtp} />}
        {orderOutcome && <InvestorOrderOutcomeDialog outcome={orderOutcome} onClose={() => setOrderOutcome(null)} onViewOrders={() => { setOrderOutcome(null); setStock(null); setBond(null); setTab("profile"); }} />}
        {toast && <div className={styles.toast} role="status"><Icon name="check" size={18} /><span><b>{toast}</b><small>Shared tenant workflow updated.</small></span></div>}
      </div>
    </section>
  </main>;
}
