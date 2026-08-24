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
import type { ServiceRequestInput } from "../../features/investor/profile/profile-workflow-sheets";
import { SupportScreen, type SupportThreadSummary } from "../../features/investor/support/support-screen";
import { SupportThreadScreen, type SupportThreadDetail } from "../../features/investor/support/support-thread-screen";
import { NewRequestSheet, type NewRequestInput } from "../../features/investor/support/new-request-sheet";
import { ComplaintsScreen, type InvestorComplaint } from "../../features/investor/support/complaints-screen";
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
  submittedOutcome,
  type OrderSubmissionOutcome,
} from "../../lib/order-submission-ux";
import { fetchJsonWithTransientRetry } from "../../lib/fetch-json";
import { useLocale } from "../../lib/i18n/context";
import type { TranslationKey } from "../../lib/i18n/en";
import { LanguageSwitcher } from "../../features/investor/shared/language-switcher";

type InvestorPhase = "select" | "existing" | "onboarding" | "app";
type SubmittedApplication = {
  id: string;
  clientCode: string;
  accountNumber?: string;
  fullName: string;
};

// Names and initials are proper nouns and stay as written in every language;
// only the descriptive labels are translated.
const demoPersonas = [
  {
    id: "cli_investor_demo",
    name: "Selam Mekonnen",
    initials: "SM",
    accountTypeKey: "personas.individualType",
    detailKey: "personas.individualDetail",
  },
  {
    id: "cli_blue",
    name: "Blue Nile Trading PLC",
    initials: "BN",
    accountTypeKey: "personas.corporateType",
    detailKey: "personas.corporateDetail",
  },
] as const satisfies ReadonlyArray<{ id: string; name: string; initials: string; accountTypeKey: TranslationKey; detailKey: TranslationKey }>;

export default function InvestorApp() {
  const { t } = useLocale();
  const insecureDemoUiEnabled = true;
  const [phase, setPhase] = useState<InvestorPhase>(insecureDemoUiEnabled ? "select" : "app");
  const [activeClientId, setActiveClientId] = useState(INVESTOR_CLIENT_ID);
  const [onboardingType, setOnboardingType] = useState<InvestorKyc["accountType"]>("retail");
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplication | null>(null);
  const [entryBusy, setEntryBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [stock, setStock] = useState<InvestorStock | null>(null);
  const [bond, setBond] = useState<InvestorBond | null>(null);
  const [toast, setToast] = useState("");
  const [orderOtp, setOrderOtp] = useState<InvestorOtpChallenge | null>(null);
  const [onboardingOtp, setOnboardingOtp] = useState<(InvestorOtpChallenge & { phone: string }) | null>(null);
  const [orderOutcome, setOrderOutcome] = useState<OrderSubmissionOutcome | null>(null);
  const orderOtpResolver = useRef<((verificationId: string | null) => void) | null>(null);
  const onboardingOtpResolver = useRef<((verificationId: string | null) => void) | null>(null);
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
  const [complaintsOpen, setComplaintsOpen] = useState(false);
  const [complaints, setComplaints] = useState<InvestorComplaint[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const investorHeaders = useMemo(() => investorHeadersFor(activeClientId), [activeClientId]);
  const featured = useMemo(() => investorStocks.slice(0, 3), []);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const navigate = (next: Tab) => { setTab(next); setStock(null); setBond(null); setActivityOpen(false); setActivityInitialItem(null); setSupportOpen(false); setSupportThreadId(null); setComplaintsOpen(false); setSelectedComplaintId(null); };
  const resetWorkspace = () => {
    setTab("home");
    setStock(null);
    setBond(null);
    setBellOpen(false);
    setCashOpen(false);
    setActivityOpen(false);
    setSupportOpen(false);
    setSupportThreadId(null);
    setComplaintsOpen(false);
    setSelectedComplaintId(null);
    setSubmittedApplication(null);
  };
  const loadInvestor = async (clientId: string) => {
    const data = await fetchJsonWithTransientRetry<InvestorBootstrap>(
      "/api/investor",
      { headers: investorHeadersFor(clientId) },
      { fallbackMessage: t("msg.openDemoFailed") },
    );
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
      notify(error instanceof Error ? error.message : t("msg.openDemoFailed"));
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
    const refreshInvestorNotifications = () => {
      void fetch("/api/notifications", { headers: investorHeaders, signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
        .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
        .catch(() => {
          if (!controller.signal.aborted) setNotifications(demoInvestorNotifications());
        });
    };
    refreshInvestorNotifications();
    const interval = window.setInterval(refreshInvestorNotifications, 10_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
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
      if (item.entityType === "service_case") {
        setComplaintsOpen(true);
        setSelectedComplaintId(item.entityId ?? null);
      } else if (item.entityId) void openSupportThread(item.entityId);
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
  useEffect(() => {
    if (phase !== "app") return;
    const controller = new AbortController();
    const refreshVisibleInvestor = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/investor", { headers: investorHeaders, signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data: InvestorBootstrap) => {
          setBootstrap({ ...data, activity: data.activity ?? [] });
          if (data.profile?.fullName) setProfileName(data.profile.fullName);
        })
        .catch(() => undefined);
    };
    const interval = window.setInterval(refreshVisibleInvestor, 30_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [investorHeaders, phase]);
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
    const data = await response.json().catch(() => ({})) as { id?: string; demoCode?: string; destinationHint?: string; deliveryChannel?: "sms" | "email"; expiresAt?: string; error?: string; order?: { id: string; status: string }; checks?: OrderCheck[]; request?: { id: string; status: string; threadId?: string }; cashMovement?: CashMovementView; account?: { id: string; totalCash: number; availableCash: number; blockedCash: number }; profile?: { id: string; clientCode: string; accountNumber?: string; fullName: string; kycStatus: string } };
    if (!response.ok) throw new Error(data.error ?? t("msg.updateAccountFailed"));
    return data;
  };
  const completeOnboarding = async (submission: OnboardingSubmission) => {
    const { profile, linkedBanks, documents } = submission;
    if (!bootstrap) {
      notify(t("msg.connectDatabase"));
      return;
    }
    try {
      if (!profile.verificationId) throw new Error(t("msg.verifyBeforeSubmit"));
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
        verificationId: profile.verificationId,
        termsVersion: bootstrap?.tenant.legalDocument?.version,
      }));
      Object.entries(documents).forEach(([type, file]) => {
        if (file) formData.set(type, file);
      });
      const response = await fetch(new URL("/api/investor", window.location.href).toString(), { method: "POST", headers: investorHeaders, body: formData });
      const responseText = await response.text();
      let result: { error?: string; profile?: SubmittedApplication };
      try {
        result = JSON.parse(responseText) as typeof result;
      } catch {
        result = { error: responseText.trim() || t("msg.submitOnboardingFailed") };
      }
      if (!response.ok) throw new Error(result.error ?? t("msg.submitOnboardingFailed"));
      if (!result.profile) throw new Error(t("msg.missingClientReference"));
      setSubmittedApplication(result.profile);
      setProfileName(result.profile.fullName);
      setActiveClientId(result.profile.id);
      setBootstrap((current) => current ? {
        ...current,
        profile: {
          fullName: result.profile!.fullName,
          email: profile.email,
          phone: profile.phone,
          clientType: profile.accountType === "institution" ? "institution" : "individual",
          status: "pending_approval",
          kycStatus: "pending_review",
          proofOfAddressStatus: documents.proof_of_address ? "received" : "pending",
          termsAcceptedVersion: current.tenant.legalDocument?.version ?? null,
          kycReviewDueAt: null,
        },
        account: null,
        access: {
          restricted: true,
          canTrade: false,
          canMoveCash: false,
          reasons: [{ code: "account_status", message: t("msg.awaitingApproval"), action: null }],
        },
        serviceRequests: [],
        cashMovements: [],
        activity: [],
        linkedBanks: linkedBanks.map((bank) => ({ ...bank, status: "pending_review" })),
        documents: Object.entries(documents).flatMap(([type, file]) => file ? [{ id: `pending-${type}`, type, name: file.name, status: "pending_review", hasFile: true }] : []),
      } : current);
      setPhase("app");
      notify(t("msg.applicationSubmitted", { clientCode: result.profile.clientCode }));
      void refreshInvestor(result.profile.id).catch(() => undefined);
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.submitOnboardingFailed"));
    }
  };
  const verifyOnboardingPhone = async (phone: string) => {
    try {
      const challenge = await postInvestor({ action: "request_kyc_otp", phone });
      if (!challenge.id) throw new Error(t("msg.otpCreateFailed"));
      setOnboardingOtp({
        id: challenge.id,
        phone,
        deliveryChannel: challenge.deliveryChannel ?? "sms",
        destinationHint: challenge.destinationHint ?? t("msg.mobileEnding", { digits: phone.replace(/\D/g, "").slice(-4) }),
        expiresAt: challenge.expiresAt,
        demoCode: challenge.demoCode,
        busy: false,
        error: "",
      });
      return await new Promise<string | null>((resolve) => {
        onboardingOtpResolver.current = resolve;
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.verifyMobileFailed"));
      return null;
    }
  };
  const verifyApplicantOtp = async (code: string) => {
    if (!onboardingOtp) return;
    setOnboardingOtp((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      await postInvestor({ action: "confirm_otp", verificationId: onboardingOtp.id, code });
      const verificationId = onboardingOtp.id;
      setOnboardingOtp(null);
      onboardingOtpResolver.current?.(verificationId);
      onboardingOtpResolver.current = null;
      notify(t("msg.mobileVerified"));
    } catch (error) {
      setOnboardingOtp((current) => current ? { ...current, busy: false, error: error instanceof Error ? error.message : t("msg.otpRejected") } : current);
    }
  };
  const resendApplicantOtp = async () => {
    if (!onboardingOtp) return;
    setOnboardingOtp((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      const challenge = await postInvestor({ action: "request_kyc_otp", phone: onboardingOtp.phone });
      if (!challenge.id) throw new Error(t("msg.otpNewFailed"));
      setOnboardingOtp((current) => current ? {
        ...current,
        id: challenge.id!,
        expiresAt: challenge.expiresAt,
        demoCode: challenge.demoCode,
        destinationHint: challenge.destinationHint ?? current.destinationHint,
        busy: false,
        error: "",
      } : current);
    } catch (error) {
      setOnboardingOtp((current) => current ? { ...current, busy: false, error: error instanceof Error ? error.message : t("msg.otpSendFailed") } : current);
    }
  };
  const cancelApplicantOtp = () => {
    setOnboardingOtp(null);
    onboardingOtpResolver.current?.(null);
    onboardingOtpResolver.current = null;
  };
  const addLinkedBank = async (bankName: string, accountNumber: string) => {
    try {
      const response = await fetch("/api/investor/bank-accounts", {
        method: "POST",
        headers: { ...investorHeaders, "content-type": "application/json" },
        body: JSON.stringify({ bankName, accountNumber, accountHolderName: profileName }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("msg.linkBankFailed"));
      await refreshInvestor();
      notify(t("msg.bankSentForReview"));
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.linkBankFailed"));
    }
  };
  const deleteLinkedBank = async (id: string) => {
    try {
      const response = await fetch(`/api/investor/bank-accounts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: investorHeaders,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("msg.removeBankFailed"));
      await refreshInvestor();
      notify(t("msg.bankRemoved"));
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.removeBankFailed"));
    }
  };
  const placeOrder = async (order: InvestorOrderInput): Promise<PlaceResult> => {
    if (submittedApplication && bootstrap?.account?.status !== "active") {
      notify(t("msg.approvalRequiredForOrder"));
      return { status: "validation_failed" };
    }
    let stage: "authorization" | "submission" = "authorization";
    try {
      const submissionReference = crypto.randomUUID();
      const challenge = await postInvestor({ action: "request_order_otp", ...order, submissionReference, deliveryChannel: "sms" });
      if (!challenge.id) throw new Error(t("msg.authCodeRequestFailed"));
      pendingOtpOrder.current = { order, submissionReference };
      setOrderOtp({
        id: challenge.id,
        deliveryChannel: challenge.deliveryChannel === "email" ? "email" : "sms",
        destinationHint: challenge.destinationHint ?? t("msg.registeredMobile"),
        expiresAt: challenge.expiresAt,
        demoCode: challenge.demoCode,
        busy: false,
        error: "",
      });
      const verificationId = await new Promise<string | null>((resolve) => { orderOtpResolver.current = resolve; });
      if (!verificationId) return { status: "verification_cancelled" };
      stage = "submission";
      const result = await postInvestor({ action: "order", ...order, submissionReference, verificationId });
      // A recorded order is confirmed to the investor as received and being
      // processed. If a pre-trade check holds it, the broker reviews the hold —
      // nothing is required of the investor, so there is no "action required".
      setOrderOutcome(submittedOutcome({ audience: "investor", orderId: result.order?.id ?? "Order", channel: "investor_portal" }));
      await refreshInvestor().catch(() => undefined);
      return { status: result.order?.status, checks: result.checks };
    } catch (error) {
      const message = error instanceof Error ? error.message : t("msg.orderSubmitFailed");
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
      setOrderOtp((current) => current ? { ...current, busy: false, error: error instanceof Error ? error.message : t("msg.otpRejected") } : current);
    }
  };

  const resendInvestorOrderOtp = async (deliveryChannel = orderOtp?.deliveryChannel ?? "sms") => {
    if (!orderOtp || !pendingOtpOrder.current) return;
    setOrderOtp((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      const { order, submissionReference } = pendingOtpOrder.current;
      const challenge = await postInvestor({ action: "request_order_otp", ...order, submissionReference, deliveryChannel });
      if (!challenge.id) throw new Error(t("msg.otpSendFailed"));
      setOrderOtp({
        id: challenge.id,
        deliveryChannel: challenge.deliveryChannel === "email" ? "email" : "sms",
        destinationHint: challenge.destinationHint ?? (deliveryChannel === "email" ? t("msg.registeredEmail") : t("msg.registeredMobile")),
        expiresAt: challenge.expiresAt,
        demoCode: challenge.demoCode,
        busy: false,
        error: "",
      });
    } catch (error) {
      setOrderOtp((current) => current ? { ...current, busy: false, error: error instanceof Error ? error.message : t("msg.otpSendFailed") } : current);
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

  const loadComplaints = useCallback(async () => {
    setComplaintsLoading(true);
    try {
      const response = await fetch("/api/investor/complaints", { headers: investorHeaders });
      const data = await response.json().catch(() => ({})) as { complaints?: InvestorComplaint[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Complaints unavailable");
      setComplaints(data.complaints ?? []);
    } catch {
      setComplaints([]);
    } finally {
      setComplaintsLoading(false);
    }
  }, [investorHeaders]);

  useEffect(() => {
    if (phase !== "app") return;
    const load = async () => { await Promise.all([loadSupport(), loadComplaints()]); };
    void load();
  }, [loadComplaints, loadSupport, phase]);
  useEffect(() => { if (phase === "app" && complaintsOpen) void loadComplaints(); }, [complaintsOpen, loadComplaints, phase]);

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
      notify(t("msg.messageSent"));
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.messageSendFailed"));
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
      if (input.category === "complaint") {
        await loadComplaints();
        setComplaintsOpen(true);
      }
      notify(t("msg.requestSent"));
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.requestSendFailed"));
      return false;
    } finally {
      setSupportBusy(false);
    }
  };
  const actOnComplaint = async (caseId: string, action: "accept_resolution" | "remain_dissatisfied", reason?: string) => {
    setSupportBusy(true);
    try {
      const response = await fetch("/api/investor/complaints", { method: "POST", headers: { ...investorHeaders, "content-type": "application/json" }, body: JSON.stringify({ caseId, action, reason }) });
      const data = await response.json().catch(() => ({})) as { complaint?: InvestorComplaint; error?: string };
      if (!response.ok) throw new Error(data.error ?? "The complaint could not be updated.");
      if (data.complaint) setComplaints((current) => current.map((item) => item.id === data.complaint!.id ? data.complaint! : item));
      await loadSupport();
      notify(action === "accept_resolution" ? "Resolution accepted" : "Further review requested");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "The complaint could not be updated.");
      return false;
    } finally {
      setSupportBusy(false);
    }
  };

  const createServiceRequest = async ({ requestType, orderId, description, files = [], formalComplaint = false }: ServiceRequestInput) => {
    try {
      const result = await postInvestor({ action: "service_request", requestType, orderId, description, formalComplaint }, files);
      if (result.request) {
        setBootstrap((current) => current ? { ...current, serviceRequests: [{
          id: result.request!.id,
          requestType,
          status: result.request!.status,
          subject: requestType === "trade_discrepancy" ? t("request.discrepancySubject", { orderId: orderId ?? "" }) : requestType === "account_closure" ? t("request.closureSubject") : requestType === "profile_correction" ? t("request.correctionSubject") : requestType === "tax_document" ? "Tax document request" : "Security concern",
          description,
          orderId,
          submittedAt: new Date().toISOString(),
          threadId: result.request!.threadId,
        }, ...current.serviceRequests] } : current);
      }
      await loadSupport().catch(() => undefined);
      if (formalComplaint) {
        await loadComplaints().catch(() => undefined);
        setSupportOpen(true);
        setComplaintsOpen(true);
      }
      notify(t("msg.serviceRequestSent"));
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.serviceRequestFailed"));
      return false;
    }
  };
  const downloadStatement = async (from: string, to: string) => {
    try {
      const response = await fetch(`/api/investor/statements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: investorHeaders });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "The statement could not be prepared.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("content-disposition") ?? "";
      link.href = url;
      link.download = disposition.match(/filename="([^"]+)"/)?.[1] ?? `account-statement-${from}-${to}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      notify("Statement downloaded");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "The statement could not be prepared.");
      return false;
    }
  };
  const createCashMovement = async (input: CashMovementInput) => {
    if (bootstrap?.access && !bootstrap.access.canMoveCash) {
      notify(bootstrap.access.reasons[0]?.message ?? t("restricted.cashFallback"));
      return false;
    }
    try {
      const { proofFile, ...cashInput } = input;
      const result = await postInvestor(
        { action: "cash_movement", ...cashInput, submissionReference: crypto.randomUUID() },
        proofFile ? [proofFile] : [],
      );
      if (result.cashMovement) {
        setBootstrap((current) => current ? {
          ...current,
          account: current.account && result.account ? { ...current.account, ...result.account } : current.account,
          cashMovements: [result.cashMovement!, ...current.cashMovements.filter((item) => item.id !== result.cashMovement!.id)],
        } : current);
      }
      await refreshInvestor().catch(() => undefined);
      notify(input.movementType === "deposit" ? t("msg.depositSent") : t("msg.withdrawalSent"));
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : t("msg.cashSubmitFailed"));
      return false;
    }
  };
  const acceptBrokerageTerms = async () => {
    const version = bootstrap?.tenant.legalDocument?.version;
    if (!version) throw new Error(t("msg.noAgreement"));
    await postInvestor({ action: "accept_terms", termsVersion: version, accepted: true });
    await refreshInvestor();
    notify(t("msg.termsAccepted", { version }));
  };
  const updateKycDocuments = async (files: Partial<Record<string, File>>) => {
    const formData = new FormData();
    formData.set("payload", JSON.stringify({ action: "kyc_documents" }));
    Object.entries(files).forEach(([type, file]) => {
      if (file) formData.set(type, file);
    });
    const response = await fetch("/api/investor", { method: "POST", headers: investorHeaders, body: formData });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? t("msg.kycUpdateFailed"));
    await refreshInvestor();
    notify(t("msg.kycSent"));
  };
  const equityFeeRule = bootstrap?.tenant.feeSchedule?.rules.find((rule) => rule.assetClass === "equity") ?? null;
  const bondFeeRule = bootstrap?.tenant.feeSchedule?.rules.find((rule) => rule.assetClass === "bond") ?? null;
  const allowedOrderTypes = bootstrap?.tenant.allowedOrderTypes ?? ["Market", "Limit", "Stop-loss"];
  const enabledTickers = bootstrap ? bootstrap.instruments.map((instrument) => instrument.ticker) : null;
  const availableBonds = investorBonds.map((item) => mergeBondInstrument(item, bootstrap?.instruments.find((instrument) => instrument.ticker === item.ticker)));
  const bondsEnabled = bootstrap?.tenant.features.bonds ?? true;
  const theme = { "--investor-accent": bootstrap?.tenant.primaryColor ?? "#0c8189" } as CSSProperties;
  const activity = mergeInvestorActivity(
    bootstrap?.activity ?? [],
    activeClientId === INVESTOR_CLIENT_ID ? demoInvestorActivity : [],
  );
  const tradeRestricted = bootstrap ? !bootstrap.access.canTrade : false;
  const cashRestricted = bootstrap ? !bootstrap.access.canMoveCash : false;
  const restrictedAccess = Boolean(bootstrap?.access.restricted);
  // `reasons[0].message` is written by the API and stays in English; only the
  // fallback and the scope sentence are ours to translate.
  const restrictionReason = bootstrap?.access.reasons[0]?.message ?? t("restricted.reasonFallback");
  const restrictedScope = tradeRestricted && cashRestricted ? t("restricted.scopeBoth") : tradeRestricted ? t("restricted.scopeTrading") : t("restricted.scopeCash");
  const restrictionCanSelfResolve = Boolean(bootstrap?.access.reasons.some((reason) => reason.action));
  const linkedBanks = bootstrap?.linkedBanks?.length
    ? bootstrap.linkedBanks
    : activeClientId === INVESTOR_CLIENT_ID
      ? fallbackLinkedBanks
      : [];

  return <main className={styles.investorPage} style={theme}>
    <section className={styles.desktopStory}>
      <AppLogo />
      <span className={styles.licenseBadge}>{t("story.badge")}</span>
      <h1>{t("story.headline")}</h1>
      <p>{bootstrap?.tenant.welcomeMessage ?? t("story.welcomeFallback")}</p>
      {insecureDemoUiEnabled && <Button onClick={() => setPhase("select")}>{t("story.cta")}</Button>}
      <div className={styles.desktopTickers}>{featured.map((item) => <span key={item.ticker}><b>{item.ticker}</b><small>{formatEtb(item.price)}</small><Delta value={item.delta} /></span>)}</div>
      <small className={styles.riskCopy}>{t("story.risk")}</small>
    </section>
    <section className={styles.appFrame} aria-label={t("app.frameLabel")}>
      <div className={styles.appViewport}>
        {phase === "app" && restrictedAccess && <div className={styles.restrictedAccessBanner} role="status">
          <span><Icon name="shield" size={18} /></span>
          <div><b>{t("restricted.title")}</b><small>{restrictionReason} {restrictedScope}</small></div>
          <button onClick={() => { setTab("profile"); setStock(null); setBond(null); }}>{restrictionCanSelfResolve ? t("restricted.resolve") : t("restricted.view")}</button>
        </div>}
        {phase === "app" && bootstrap?.tenant.feeSchedule?.commissionPromotion && <div className={styles.promotionBanner} role="status">
          <span><Icon name="check" size={18} /></span>
          <div><b>{bootstrap.tenant.feeSchedule.commissionPromotion.name}</b><small>{t("promotion.active", { date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${bootstrap.tenant.feeSchedule.commissionPromotion.endsOn}T12:00:00Z`)) })}</small><em>{t("promotion.marketFees")}</em></div>
        </div>}
        {phase === "select" ? <div className={styles.demoSelector}>
          <div className={styles.demoSelectorBrand}><AppLogo /><span>{t("entry.brand")}</span></div>
          <div className={styles.demoSelectorIntro}>
            <small>{t("entry.eyebrow")}</small>
            <h1>{t("entry.title")}</h1>
            <p>{t("entry.subtitle")}</p>
          </div>
          <div className={styles.entryChoiceList}>
            <button className={styles.entryChoiceCard} onClick={() => setPhase("existing")}>
              <i><Icon name="profile" size={22} /></i>
              <span><b>{t("entry.existingTitle")}</b><small>{t("entry.existingDetail")}</small></span>
              <Icon name="chevron" size={17} />
            </button>
            <button className={styles.entryChoiceCard} onClick={() => startApplication("retail")}>
              <i><Icon name="plus" size={22} /></i>
              <span><b>{t("entry.newTitle")}</b><small>{t("entry.newDetail")}</small></span>
              <Icon name="chevron" size={17} />
            </button>
          </div>
          <LanguageSwitcher />
          <p className={styles.demoSelectorNote}>{t("entry.note")}</p>
        </div>
          : phase === "existing" ? <div className={styles.demoSelector}>
            <div className={styles.demoSelectorBack}><button className={styles.iconButton} onClick={() => setPhase("select")} aria-label={t("personas.backLabel")}><Icon name="back" size={20} /></button></div>
            <div className={styles.demoSelectorIntro}>
              <small>{t("personas.eyebrow")}</small>
              <h1>{t("personas.title")}</h1>
              <p>{t("personas.subtitle")}</p>
            </div>
            <div className={styles.demoPersonaList}>
              {demoPersonas.map((persona) => <button key={persona.id} className={styles.demoPersonaCard} disabled={Boolean(entryBusy)} onClick={() => void enterPersona(persona.id)}>
                <i>{persona.initials}</i>
                <span><b>{persona.name}</b><small>{t(persona.accountTypeKey)}</small><em>{t(persona.detailKey)}</em></span>
                <strong>{entryBusy === persona.id ? t("personas.opening") : t("personas.open")} <Icon name="chevron" size={15} /></strong>
              </button>)}
            </div>
          </div>
          : phase === "onboarding" ? <Onboarding initialAccountType={onboardingType} onBack={() => setPhase("select")} onVerifyIdentity={verifyOnboardingPhone} onDone={(profile) => void completeOnboarding(profile)} legalDocument={bootstrap?.tenant.legalDocument ?? null} />
          : stock ? <StockDetail key={stock.ticker} stock={stock} account={bootstrap?.account ?? null} restricted={tradeRestricted} onBack={() => setStock(null)} placeOrder={placeOrder} feeRule={equityFeeRule} allowedOrderTypes={allowedOrderTypes} />
            : bond ? <BondDetail key={bond.ticker} bond={bond} account={bootstrap?.account ?? null} restricted={tradeRestricted} onBack={() => setBond(null)} placeOrder={placeOrder} feeRule={bondFeeRule} allowedOrderTypes={allowedOrderTypes} />
              : <>
                <div className={`${styles.scrollArea} ${restrictedAccess ? styles.restrictedScroll : ""}`}>
                  {supportOpen
                    ? (complaintsOpen
                        ? <ComplaintsScreen complaints={complaints} loading={complaintsLoading} selectedId={selectedComplaintId} busy={supportBusy} onBack={() => { setComplaintsOpen(false); setSelectedComplaintId(null); }} onSelect={setSelectedComplaintId} onConversation={(threadId) => { setComplaintsOpen(false); void openSupportThread(threadId); }} onAction={actOnComplaint} />
                        : supportThreadId
                        ? <SupportThreadScreen thread={supportDetail} sending={supportBusy} onBack={() => setSupportThreadId(null)} onSend={sendSupportReply} />
                        : <SupportScreen threads={supportThreads} loading={supportLoading} officer={bootstrap?.relationshipOfficer ?? null} onBack={() => setSupportOpen(false)} onOpenThread={openSupportThread} onNewRequest={() => setNewRequestOpen(true)} onOpenComplaints={() => { setComplaintsOpen(true); setSelectedComplaintId(null); }} complaintCount={complaints.filter((item) => !["resolved", "closed"].includes(item.status)).length} />)
                    : activityOpen
                    ? <ActivityScreen activity={activity} initialItem={activityInitialItem} onBack={() => { setActivityOpen(false); setActivityInitialItem(null); }} />
                    : tab === "home"
                      ? <HomeScreen openStock={openStock} go={navigate} account={bootstrap?.account ?? null} activity={activity} tradeRestricted={tradeRestricted} cashRestricted={cashRestricted} demoFallback={activeClientId === INVESTOR_CLIENT_ID} unread={unreadNotifs} onBell={() => {
                        setBellOpen(true);
                        void fetch("/api/notifications", { headers: investorHeaders })
                          .then((response) => response.ok ? response.json() : Promise.reject())
                          .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
                          .catch(() => undefined);
                      }} onCash={() => cashRestricted ? notify(bootstrap?.access.reasons[0]?.message ?? t("restricted.cashFallback")) : setCashOpen(true)} onActivity={() => openActivity()} onActivityItem={(item) => openActivity(item)} />
                      : tab === "markets"
                        ? <MarketsScreen openStock={openStock} openBond={openBond} enabledTickers={enabledTickers} bondsEnabled={bondsEnabled} bonds={availableBonds} />
                        : tab === "portfolio"
                          ? <PortfolioScreen openStock={openStock} account={bootstrap?.account ?? null} servicing={bootstrap?.servicing ?? null} demoFallback={activeClientId === INVESTOR_CLIENT_ID} />
                          : tab === "learn"
                            ? <LearnScreen />
                            : <ProfileScreen notify={notify} name={profileName} profile={bootstrap?.profile ?? null} accountNumber={bootstrap?.account?.accountNumber ?? null} orders={bootstrap?.account?.orders ?? []} requests={bootstrap?.serviceRequests ?? []} legalDocument={bootstrap?.tenant.legalDocument ?? null} documents={bootstrap?.documents ?? []} linkedBanks={linkedBanks} supportUnread={supportUnread} onOpenSupport={() => setSupportOpen(true)} onOpenRequest={(threadId) => { setSupportOpen(true); void openSupportThread(threadId); }} onAddBank={addLinkedBank} onDeleteBank={deleteLinkedBank} onAcceptTerms={acceptBrokerageTerms} onUpdateKyc={updateKycDocuments} onRequest={createServiceRequest} onDownloadStatement={downloadStatement} />}
                </div>
                <BottomNav active={tab} onChange={navigate} />
              </>}
        {cashOpen && !cashRestricted && <CashSheet pools={bootstrap?.cashPools ?? []} movements={bootstrap?.cashMovements ?? []} linkedBanks={linkedBanks} availableCash={bootstrap?.account?.availableCash ?? 0} onClose={() => setCashOpen(false)} onSubmit={createCashMovement} onViewActivity={() => { setCashOpen(false); openActivity(); }} />}
        {bellOpen && <div className={styles.sheetBackdrop} onClick={() => setBellOpen(false)}><section className={styles.notifSheet} onClick={(event) => event.stopPropagation()} role="dialog" aria-label={t("notifications.label")}><i className={styles.sheetHandle} /><div className={styles.notifHead}><h2>{t("notifications.title")}</h2>{unreadNotifs > 0 && <button onClick={markAllNotifsRead}>{t("notifications.markAllRead")}</button>}</div><div className={styles.notifList}>{notifications.length === 0 ? <p className={styles.notifEmpty}>{t("notifications.empty")}</p> : notifications.map((item) => <button key={item.id} className={`${styles.notifItem} ${item.read ? "" : styles.notifUnread}`} onClick={() => openNotification(item)}><i className={styles.notifDot} data-sev={item.severity} /><div><b>{item.title}</b><p>{item.body}</p><small>{timeAgo(item.createdAt)}</small></div></button>)}</div></section></div>}
        {newRequestOpen && <NewRequestSheet busy={supportBusy} onClose={() => setNewRequestOpen(false)} onSubmit={createSupportRequest} />}
        {onboardingOtp && <InvestorOrderOtpDialog key={onboardingOtp.id} context="onboarding" challenge={onboardingOtp} onVerify={(code) => void verifyApplicantOtp(code)} onResend={() => void resendApplicantOtp()} onCancel={cancelApplicantOtp} />}
        {orderOtp && <InvestorOrderOtpDialog key={orderOtp.id} challenge={orderOtp} onVerify={(code) => void verifyInvestorOrderOtp(code)} onResend={() => void resendInvestorOrderOtp()} onDeliveryChange={(channel) => { if (channel !== orderOtp.deliveryChannel) void resendInvestorOrderOtp(channel); }} onCancel={cancelInvestorOrderOtp} />}
        {orderOutcome && <InvestorOrderOutcomeDialog outcome={orderOutcome} onClose={() => setOrderOutcome(null)} onViewOrders={() => { setOrderOutcome(null); setStock(null); setBond(null); setTab("profile"); }} />}
        {toast && <div className={styles.toast} role="status"><Icon name="check" size={18} /><span><b>{toast}</b><small>{t("toast.subtitle")}</small></span></div>}
      </div>
    </section>
  </main>;
}
