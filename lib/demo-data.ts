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
  { id: "ins_ethio_telecom", symbol: "ETTEL", name: "Ethio telecom", asset: "Equity", issuer: "Ethio telecom", status: "Tradable", currency: "ETB", lot: 10, tick: 0.5, cycle: "T+2", price: 312.5 },
  { id: "ins_wegagen", symbol: "WEGA", name: "Wegagen Bank S.C.", asset: "Equity", issuer: "Wegagen Bank", status: "Tradable", currency: "ETB", lot: 10, tick: 0.5, cycle: "T+2", price: 186 },
  { id: "ins_tbill_182", symbol: "TB182-26", name: "Treasury Bill 182D", asset: "T-bill", issuer: "FDRE Ministry of Finance", status: "Tradable", currency: "ETB", lot: 1, tick: 0.01, cycle: "T+1", price: 94.35 },
  { id: "ins_cbe_bond", symbol: "CBE5Y30", name: "CBE 5-Year Bond 2030", asset: "Bond", issuer: "Commercial Bank of Ethiopia", status: "Tradable", currency: "ETB", lot: 1, tick: 0.01, cycle: "T+2", price: 101.2, coupon: "9.25%", maturity: "30 Jun 2030" },
  { id: "ins_green_bond", symbol: "EEU7Y32", name: "EEU Green Bond 2032", asset: "Bond", issuer: "Ethiopian Electric Utility", status: "Halted", currency: "ETB", lot: 1, tick: 0.01, cycle: "T+2", price: 99.1, coupon: "10.10%", maturity: "15 Mar 2032" },
];

export const initialOrders: DemoOrder[] = [
  { id: "ORD-2026-1048", time: "10:42", createdAt: "2026-07-14T10:42:00Z", client: "Wegagen Pension Fund", clientCode: "CL-10008", accountId: "acc_wegagen", instrumentId: "ins_ethio_telecom", symbol: "ETTEL", side: "buy", quantity: 7000, price: 312.5, orderType: "Limit", estimatedGross: 2187500, estimatedFees: 10937.5, estimatedNet: 2198437.5, status: "pending_broker_review", source: "Manual", trader: "Dawit A.", riskFlag: "review" },
  { id: "ORD-2026-1047", time: "10:19", createdAt: "2026-07-14T10:19:00Z", client: "Meron Bekele", clientCode: "CL-10041", accountId: "acc_meron", instrumentId: "ins_wegagen", symbol: "WEGA", side: "sell", quantity: 1200, price: 186, orderType: "Limit", estimatedGross: 223200, estimatedFees: 1116, estimatedNet: 222084, status: "approved", source: "Manual", trader: "Dawit A.", riskFlag: "none" },
  { id: "ORD-2026-1046", time: "09:54", createdAt: "2026-07-14T09:54:00Z", client: "Blue Nile Trading PLC", clientCode: "CL-10017", accountId: "acc_blue", instrumentId: "ins_tbill_182", symbol: "TB182-26", side: "buy", quantity: 25000, price: 94.35, orderType: "Limit", estimatedGross: 2358750, estimatedFees: 11793.75, estimatedNet: 2370543.75, status: "settlement_pending", source: "Manual", trader: "Hana K.", riskFlag: "review", settlementDate: "2026-07-15", tradeId: "TRD-2026-0772" },
  { id: "ORD-2026-1045", time: "09:31", createdAt: "2026-07-14T09:31:00Z", client: "Meron Bekele", clientCode: "CL-10041", accountId: "acc_meron", instrumentId: "ins_cbe_bond", symbol: "CBE5Y30", side: "buy", quantity: 3000, price: 101.2, orderType: "Limit", estimatedGross: 303600, estimatedFees: 1518, estimatedNet: 305118, status: "settled", source: "Manual", trader: "Hana K.", riskFlag: "none", settlementDate: "2026-07-14", tradeId: "TRD-2026-0768" },
  { id: "ORD-2026-1044", time: "09:08", createdAt: "2026-07-14T09:08:00Z", client: "Selamawit Tesfaye", clientCode: "CL-10052", accountId: "acc_selam", instrumentId: "ins_ethio_telecom", symbol: "ETTEL", side: "buy", quantity: 500, price: 311, orderType: "Limit", estimatedGross: 155500, estimatedFees: 777.5, estimatedNet: 156277.5, status: "validation_failed", source: "Manual", trader: "Unassigned", riskFlag: "high" },
  { id: "ORD-2026-1043", time: "08:52", createdAt: "2026-07-14T08:52:00Z", client: "Blue Nile Trading PLC", clientCode: "CL-10017", accountId: "acc_blue", instrumentId: "ins_wegagen", symbol: "WEGA", side: "sell", quantity: 3000, price: 185, orderType: "Limit", estimatedGross: 555000, estimatedFees: 2775, estimatedNet: 552225, status: "rejected", source: "Manual", trader: "Dawit A.", riskFlag: "none" },
  { id: "ORD-2026-1042", time: "08:37", createdAt: "2026-07-14T08:37:00Z", client: "Wegagen Pension Fund", clientCode: "CL-10008", accountId: "acc_wegagen", instrumentId: "ins_cbe_bond", symbol: "CBE5Y30", side: "buy", quantity: 22000, price: 101.25, orderType: "Limit", estimatedGross: 2227500, estimatedFees: 11137.5, estimatedNet: 2238637.5, status: "partially_filled", source: "Manual", trader: "Hana K.", riskFlag: "review", settlementDate: "2026-07-16", tradeId: "TRD-2026-0769" },
  { id: "ORD-2026-1041", time: "08:12", createdAt: "2026-07-14T08:12:00Z", client: "Meron Bekele", clientCode: "CL-10041", accountId: "acc_meron", instrumentId: "ins_tbill_182", symbol: "TB182-26", side: "buy", quantity: 1500, price: 94.4, orderType: "Limit", estimatedGross: 141600, estimatedFees: 708, estimatedNet: 142308, status: "cancelled", source: "Manual", trader: "Dawit A.", riskFlag: "none" },
];

export const demoAudit = [
  { time: "10:43:12", actor: "Mekdes T.", action: "ORDER_VALIDATED", detail: "7/7 checks passed for ORD-2026-1048", entity: "Order" },
  { time: "10:42:51", actor: "Mekdes T.", action: "ORDER_CREATED", detail: "Buy 7,000 ETTEL @ 312.50 ETB", entity: "Order" },
  { time: "10:21:04", actor: "Dawit A.", action: "ORDER_APPROVED", detail: "ORD-2026-1047 approved; holdings blocked", entity: "Order" },
  { time: "09:58:37", actor: "Hana K.", action: "TRADE_CAPTURED", detail: "TRD-2026-0772 linked to ORD-2026-1046", entity: "Trade" },
  { time: "09:33:18", actor: "Rahel G.", action: "SETTLEMENT_UPDATED", detail: "Cash and securities confirmed for TRD-2026-0768", entity: "Settlement" },
  { time: "08:05:42", actor: "System", action: "USER_LOGIN", detail: "Successful workspace sign-in for Mekdes T.", entity: "Security" },
];
