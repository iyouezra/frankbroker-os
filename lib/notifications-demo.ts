/**
 * Offline/demo notifications. The live bells fetch `/api/notifications`; when no
 * database is connected they fall back to these so every portal's bell still
 * demonstrates relevant, role-aware activity.
 */
export type NotificationItem = {
  id: string;
  category: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  read: boolean;
};

const demoBroker: Array<NotificationItem & { roles: string[] }> = [
  { id: "ntf_b1", roles: ["broker_admin", "compliance"], category: "order", severity: "warning", title: "Order awaiting review · TELE", body: "BUY 7,000 TELE for Wegagen Pension Fund · 2,198,437.50 ETB — flagged for enhanced review.", entityType: "order", entityId: "ORD-2026-1048", createdAt: "2026-07-14T10:43:00Z", read: false },
  { id: "ntf_b2", roles: ["broker_admin", "compliance"], category: "kyc", severity: "warning", title: "New client awaiting KYC review", body: "Selamawit Tesfaye (CL-10052) was submitted for onboarding and KYC approval.", entityType: "client", entityId: "cli_selam", createdAt: "2026-07-14T10:12:00Z", read: false },
  { id: "ntf_b3", roles: ["broker_admin", "trader", "operations"], category: "order", severity: "info", title: "Order approved · WGBX", body: "SELL 1,200 WGBX for Meron Bekele is approved and ready to execute.", entityType: "order", entityId: "ORD-2026-1047", createdAt: "2026-07-14T10:21:00Z", read: false },
  { id: "ntf_b4", roles: ["broker_admin", "settlement", "operations"], category: "trade", severity: "info", title: "Trade captured · GB2029", body: "25,000 GB2029 filled at 99.85 ETB. Settlement due 2026-07-16.", entityType: "order", entityId: "ORD-2026-1046", createdAt: "2026-07-14T09:58:00Z", read: false },
  { id: "ntf_b5", roles: ["broker_admin", "settlement", "operations"], category: "reconciliation", severity: "critical", title: "Reconciliation exception opened", body: "Cash variance of 18,250.00 ETB on TRD-2026-0759 needs resolution.", entityType: "reconciliation", entityId: "REC-2026-0714-A", createdAt: "2026-07-14T09:15:00Z", read: true },
  { id: "ntf_b6", roles: ["broker_admin", "operations"], category: "settlement", severity: "success", title: "Settlement confirmed · GB2031", body: "TRD-2026-0768 for order ORD-2026-1045 settled (303,309.00 ETB).", entityType: "order", entityId: "ORD-2026-1045", createdAt: "2026-07-14T09:34:00Z", read: true },
  { id: "ntf_b7", roles: ["broker_admin", "settlement", "operations"], category: "settlement", severity: "warning", title: "Settlement due today · GB2029", body: "TRD-2026-0772 for order ORD-2026-1046 (2,508,731.25 ETB) is due for settlement today.", entityType: "order", entityId: "ORD-2026-1046", createdAt: "2026-07-14T07:05:00Z", read: false },
  { id: "ntf_b8", roles: ["broker_admin", "compliance"], category: "kyc", severity: "info", title: "KYC review due soon · Meron Bekele", body: "Periodic KYC review for CL-10041 is due 2026-07-20.", entityType: "client", entityId: "cli_meron", createdAt: "2026-07-14T07:05:00Z", read: false },
];

const demoInvestor: NotificationItem[] = [
  { id: "ntf_i1", category: "kyc", severity: "success", title: "You're approved to invest", body: "Your account is active. You can now buy and sell shares and bonds on the ESX.", createdAt: "2026-07-14T08:02:00Z", read: false },
  { id: "ntf_i2", category: "order", severity: "success", title: "Order approved", body: "Your buy order for 120 TELE was approved by your broker.", entityType: "order", entityId: "ORD-2026-1050", createdAt: "2026-07-14T10:24:00Z", read: false },
  { id: "ntf_i3", category: "trade", severity: "success", title: "Order executed", body: "120 TELE bought at 305.00 ETB. Settlement is due 2026-07-16.", entityType: "order", entityId: "ORD-2026-1050", createdAt: "2026-07-14T11:02:00Z", read: false },
  { id: "ntf_i4", category: "system", severity: "info", title: "Dividend season is coming", body: "TELE has historically paid in September. You hold 120 shares.", createdAt: "2026-07-13T14:30:00Z", read: true },
  { id: "ntf_i5", category: "settlement", severity: "info", title: "Settlement due today", body: "Your buy of TELE is settling today.", entityType: "order", entityId: "ORD-2026-1050", createdAt: "2026-07-14T07:05:00Z", read: false },
];

const demoPlatform: NotificationItem[] = [
  { id: "ntf_p1", category: "system", severity: "warning", title: "Tenant suspended · Sheba Invest", body: "Trading access paused pending license review.", entityType: "tenant", entityId: "brk_sheba", createdAt: "2026-07-14T09:32:00Z", read: false },
  { id: "ntf_p2", category: "system", severity: "info", title: "Fee schedule changed · Abyssinia Securities", body: "Brokerage fee changed from 0.70% to 0.65%.", entityType: "tenant", entityId: "brk_abyssinia", createdAt: "2026-07-14T11:18:00Z", read: false },
  { id: "ntf_p3", category: "system", severity: "info", title: "Instrument enabled · ABAYB", body: "ABAYB enabled for investor and broker portals on Blue Nile Capital.", entityType: "tenant", entityId: "brk_blue_nile", createdAt: "2026-07-14T10:51:00Z", read: true },
];

export function demoBrokerNotifications(role: string): NotificationItem[] {
  const oversight = role === "management" || role === "super_admin";
  return demoBroker
    .filter((item) => oversight || item.roles.includes(role))
    .map(({ roles: _roles, ...item }) => item);
}

export const demoInvestorNotifications = () => demoInvestor.map((item) => ({ ...item }));
export const demoPlatformNotifications = () => demoPlatform.map((item) => ({ ...item }));

export function timeAgo(iso: string, now = new Date("2026-07-14T11:20:00Z")): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
