import type { OrderStatus } from "./frank";

export type DemoOrder = {
  id: string;
  time: string;
  createdAt: string;
  client: string;
  clientCode: string;
  accountId: string;
  instrumentId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  orderType: string;
  estimatedGross: number;
  estimatedFees: number;
  estimatedNet: number;
  status: OrderStatus;
  source: string;
  trader: string;
  riskFlag: "none" | "review" | "high";
  settlementDate?: string;
  tradeId?: string;
};

export const demoClients = [
  { id: "cli_meron", accountId: "acc_meron", code: "CL-10041", name: "Meron Bekele", type: "Individual", kyc: "Approved", status: "Active", cash: 1_840_500, available: 1_526_850, blocked: 313_650, risk: "Standard", holdings: "4 positions" },
  { id: "cli_wegagen", accountId: "acc_wegagen", code: "CL-10008", name: "Wegagen Pension Fund", type: "Institution", kyc: "Approved", status: "Active", cash: 12_400_000, available: 10_172_500, blocked: 2_227_500, risk: "Enhanced", holdings: "7 positions" },
  { id: "cli_selam", accountId: "acc_selam", code: "CL-10052", name: "Selamawit Tesfaye", type: "Individual", kyc: "Review due", status: "Restricted", cash: 428_900, available: 428_900, blocked: 0, risk: "Review", holdings: "2 positions" },
  { id: "cli_blue", accountId: "acc_blue", code: "CL-10017", name: "Blue Nile Trading PLC", type: "Corporate", kyc: "Approved", status: "Active", cash: 4_705_300, available: 4_120_300, blocked: 585_000, risk: "Standard", holdings: "5 positions" },
];

export const demoInstruments = [
  { id: "ins_tele", symbol: "TELE", name: "Ethio Telecom", asset: "Equity", issuer: "Ethio Telecom", status: "Tradable", currency: "ETB", lot: 10, tick: 0.5, cycle: "T+2", price: 305 },
  { id: "ins_awab", symbol: "AWAB", name: "Awash Bank", asset: "Equity", issuer: "Awash Bank", status: "Tradable", currency: "ETB", lot: 10, tick: 0.5, cycle: "T+2", price: 9650 },
  { id: "ins_wgbx", symbol: "WGBX", name: "Wegagen Bank", asset: "Equity", issuer: "Wegagen Bank", status: "Tradable", currency: "ETB", lot: 10, tick: 0.5, cycle: "T+2", price: 1742 },
  { id: "ins_gdab", symbol: "GDAB", name: "Gadaa Bank", asset: "Equity", issuer: "Gadaa Bank", status: "Tradable", currency: "ETB", lot: 10, tick: 0.5, cycle: "T+2", price: 1196 },
  { id: "ins_abayb", symbol: "ABAYB", name: "Abay Bank", asset: "Equity", issuer: "Abay Bank", status: "Tradable", currency: "ETB", lot: 10, tick: 0.5, cycle: "T+2", price: 1808 },
  { id: "ins_goeb_2029", symbol: "GB2029", name: "GoE Treasury Bond 2029", asset: "Bond", issuer: "Federal Democratic Republic of Ethiopia", status: "Tradable", currency: "ETB", lot: 1, tick: 0.01, cycle: "T+2", price: 99.85, coupon: "14.50%", maturity: "15 Jul 2029" },
  { id: "ins_goeb_2031", symbol: "GB2031", name: "GoE Treasury Bond 2031", asset: "Bond", issuer: "Federal Democratic Republic of Ethiopia", status: "Tradable", currency: "ETB", lot: 1, tick: 0.01, cycle: "T+2", price: 100.6, coupon: "15.20%", maturity: "15 Jul 2031" },
  { id: "ins_goeb_2036", symbol: "GB2036", name: "GoE Treasury Bond 2036", asset: "Bond", issuer: "Federal Democratic Republic of Ethiopia", status: "Halted", currency: "ETB", lot: 1, tick: 0.01, cycle: "T+2", price: 101, coupon: "16.00%", maturity: "15 Jul 2036" },
];

export const initialOrders: DemoOrder[] = [
  { id: "ORD-2026-1048", time: "10:42", createdAt: "2026-07-14T10:42:00Z", client: "Wegagen Pension Fund", clientCode: "CL-10008", accountId: "acc_wegagen", instrumentId: "ins_tele", symbol: "TELE", side: "buy", quantity: 7000, price: 312.5, orderType: "Limit", estimatedGross: 2187500, estimatedFees: 10937.5, estimatedNet: 2198437.5, status: "pending_broker_review", source: "Manual", trader: "Dawit A.", riskFlag: "review" },
  { id: "ORD-2026-1047", time: "10:19", createdAt: "2026-07-14T10:19:00Z", client: "Meron Bekele", clientCode: "CL-10041", accountId: "acc_meron", instrumentId: "ins_wgbx", symbol: "WGBX", side: "sell", quantity: 1200, price: 1735, orderType: "Limit", estimatedGross: 2082000, estimatedFees: 10410, estimatedNet: 2071590, status: "approved", source: "Manual", trader: "Dawit A.", riskFlag: "review" },
  { id: "ORD-2026-1046", time: "09:54", createdAt: "2026-07-14T09:54:00Z", client: "Blue Nile Trading PLC", clientCode: "CL-10017", accountId: "acc_blue", instrumentId: "ins_goeb_2029", symbol: "GB2029", side: "buy", quantity: 25000, price: 99.85, orderType: "Limit", estimatedGross: 2496250, estimatedFees: 12481.25, estimatedNet: 2508731.25, status: "settlement_pending", source: "Manual", trader: "Hana K.", riskFlag: "review", settlementDate: "2026-07-16", tradeId: "TRD-2026-0772" },
  { id: "ORD-2026-1045", time: "09:31", createdAt: "2026-07-14T09:31:00Z", client: "Meron Bekele", clientCode: "CL-10041", accountId: "acc_meron", instrumentId: "ins_goeb_2031", symbol: "GB2031", side: "buy", quantity: 3000, price: 100.6, orderType: "Limit", estimatedGross: 301800, estimatedFees: 1509, estimatedNet: 303309, status: "settled", source: "Manual", trader: "Hana K.", riskFlag: "none", settlementDate: "2026-07-14", tradeId: "TRD-2026-0768" },
  { id: "ORD-2026-1044", time: "09:08", createdAt: "2026-07-14T09:08:00Z", client: "Selamawit Tesfaye", clientCode: "CL-10052", accountId: "acc_selam", instrumentId: "ins_tele", symbol: "TELE", side: "buy", quantity: 500, price: 311, orderType: "Limit", estimatedGross: 155500, estimatedFees: 777.5, estimatedNet: 156277.5, status: "validation_failed", source: "Manual", trader: "Unassigned", riskFlag: "high" },
  { id: "ORD-2026-1043", time: "08:52", createdAt: "2026-07-14T08:52:00Z", client: "Blue Nile Trading PLC", clientCode: "CL-10017", accountId: "acc_blue", instrumentId: "ins_wgbx", symbol: "WGBX", side: "sell", quantity: 3000, price: 1728, orderType: "Limit", estimatedGross: 5184000, estimatedFees: 25920, estimatedNet: 5158080, status: "rejected", source: "Manual", trader: "Dawit A.", riskFlag: "review" },
  { id: "ORD-2026-1042", time: "08:37", createdAt: "2026-07-14T08:37:00Z", client: "Wegagen Pension Fund", clientCode: "CL-10008", accountId: "acc_wegagen", instrumentId: "ins_goeb_2031", symbol: "GB2031", side: "buy", quantity: 22000, price: 100.55, orderType: "Limit", estimatedGross: 2212100, estimatedFees: 11060.5, estimatedNet: 2223160.5, status: "partially_filled", source: "Manual", trader: "Hana K.", riskFlag: "review", settlementDate: "2026-07-16", tradeId: "TRD-2026-0769" },
  { id: "ORD-2026-1041", time: "08:12", createdAt: "2026-07-14T08:12:00Z", client: "Meron Bekele", clientCode: "CL-10041", accountId: "acc_meron", instrumentId: "ins_goeb_2029", symbol: "GB2029", side: "buy", quantity: 1500, price: 99.9, orderType: "Limit", estimatedGross: 149850, estimatedFees: 749.25, estimatedNet: 150599.25, status: "cancelled", source: "Manual", trader: "Dawit A.", riskFlag: "none" },
];

export const demoAudit = [
  { time: "10:43:12", actor: "Mekdes T.", action: "ORDER_VALIDATED", detail: "7/7 checks passed for ORD-2026-1048", entity: "Order" },
  { time: "10:42:51", actor: "Mekdes T.", action: "ORDER_CREATED", detail: "Buy 7,000 TELE @ 312.50 ETB", entity: "Order" },
  { time: "10:21:04", actor: "Dawit A.", action: "ORDER_APPROVED", detail: "ORD-2026-1047 approved; holdings blocked", entity: "Order" },
  { time: "09:58:37", actor: "Hana K.", action: "TRADE_CAPTURED", detail: "TRD-2026-0772 linked to ORD-2026-1046", entity: "Trade" },
  { time: "09:33:18", actor: "Rahel G.", action: "SETTLEMENT_UPDATED", detail: "Cash and securities confirmed for TRD-2026-0768", entity: "Settlement" },
  { time: "08:05:42", actor: "System", action: "USER_LOGIN", detail: "Successful workspace sign-in for Mekdes T.", entity: "Security" },
];
