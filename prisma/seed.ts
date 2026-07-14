import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed FrankBroker OS.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  await prisma.broker.createMany({
    data: [{ id: "brk_abyssinia", name: "Abyssinia Securities S.C.", licenseNumber: "ESCA-BR-004", status: "active", baseCurrency: "ETB" }],
    skipDuplicates: true,
  });

  await prisma.user.createMany({
    data: [
      { id: "usr_demo_admin", brokerId: "brk_abyssinia", email: "demo.admin@frankbroker.et", fullName: "Mekdes Tadesse", role: "broker_admin", status: "active" },
      { id: "usr_trader", brokerId: "brk_abyssinia", email: "dawit@frankbroker.et", fullName: "Dawit Alemu", role: "trader", status: "active" },
      { id: "usr_compliance", brokerId: "brk_abyssinia", email: "liya@frankbroker.et", fullName: "Liya Girma", role: "compliance", status: "active" },
      { id: "usr_settlement", brokerId: "brk_abyssinia", email: "rahel@frankbroker.et", fullName: "Rahel Getachew", role: "settlement", status: "active" },
    ],
    skipDuplicates: true,
  });

  await prisma.client.createMany({
    data: [
      { id: "cli_meron", brokerId: "brk_abyssinia", clientCode: "CL-10041", fullName: "Meron Bekele", clientType: "individual", phone: "+251911000041", email: "meron@example.et", kycStatus: "approved", riskRating: "standard", status: "active" },
      { id: "cli_wegagen", brokerId: "brk_abyssinia", clientCode: "CL-10008", fullName: "Wegagen Pension Fund", clientType: "institution", phone: "+251115000008", email: "ops@wegagen-pension.example", kycStatus: "approved", riskRating: "enhanced", status: "active" },
      { id: "cli_selam", brokerId: "brk_abyssinia", clientCode: "CL-10052", fullName: "Selamawit Tesfaye", clientType: "individual", phone: "+251911000052", email: "selam@example.et", kycStatus: "review_due", riskRating: "review", status: "restricted" },
      { id: "cli_blue", brokerId: "brk_abyssinia", clientCode: "CL-10017", fullName: "Blue Nile Trading PLC", clientType: "corporate", phone: "+251115000017", email: "finance@bluenile.example", kycStatus: "approved", riskRating: "standard", status: "active" },
    ],
    skipDuplicates: true,
  });

  await prisma.account.createMany({
    data: [
      { id: "acc_meron", clientId: "cli_meron", accountNumber: "TRD-10041-01", totalCash: 1_840_500, availableCash: 1_526_850, blockedCash: 313_650, unsettledCash: 0, status: "active" },
      { id: "acc_wegagen", clientId: "cli_wegagen", accountNumber: "TRD-10008-01", totalCash: 12_400_000, availableCash: 10_172_500, blockedCash: 2_227_500, unsettledCash: 0, status: "active" },
      { id: "acc_selam", clientId: "cli_selam", accountNumber: "TRD-10052-01", totalCash: 428_900, availableCash: 428_900, blockedCash: 0, unsettledCash: 0, status: "restricted" },
      { id: "acc_blue", clientId: "cli_blue", accountNumber: "TRD-10017-01", totalCash: 4_705_300, availableCash: 4_120_300, blockedCash: 585_000, unsettledCash: 0, status: "active" },
    ],
    skipDuplicates: true,
  });

  await prisma.instrument.createMany({
    data: [
      { id: "ins_tele", symbol: "TELE", name: "Ethio Telecom", assetClass: "equity", issuer: "Ethio Telecom", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 305 },
      { id: "ins_awab", symbol: "AWAB", name: "Awash Bank", assetClass: "equity", issuer: "Awash Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 9_650 },
      { id: "ins_wgbx", symbol: "WGBX", name: "Wegagen Bank", assetClass: "equity", issuer: "Wegagen Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 1_742 },
      { id: "ins_gdab", symbol: "GDAB", name: "Gadaa Bank", assetClass: "equity", issuer: "Gadaa Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 1_196 },
      { id: "ins_abayb", symbol: "ABAYB", name: "Abay Bank", assetClass: "equity", issuer: "Abay Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 1_808 },
      { id: "ins_goeb_2029", symbol: "GB2029", name: "GoE Treasury Bond 2029", assetClass: "bond", issuer: "Federal Democratic Republic of Ethiopia", tradingStatus: "tradable", currency: "ETB", lotSize: 1, tickSize: 0.01, settlementCycle: "T+2", faceValue: 1_000, maturityDate: dateOnly("2029-07-15"), couponRate: 14.5, couponFrequency: "semi_annual", lastPrice: 99.85 },
      { id: "ins_goeb_2031", symbol: "GB2031", name: "GoE Treasury Bond 2031", assetClass: "bond", issuer: "Federal Democratic Republic of Ethiopia", tradingStatus: "tradable", currency: "ETB", lotSize: 1, tickSize: 0.01, settlementCycle: "T+2", faceValue: 1_000, maturityDate: dateOnly("2031-07-15"), couponRate: 15.2, couponFrequency: "semi_annual", lastPrice: 100.6 },
      { id: "ins_goeb_2036", symbol: "GB2036", name: "GoE Treasury Bond 2036", assetClass: "bond", issuer: "Federal Democratic Republic of Ethiopia", tradingStatus: "halted", currency: "ETB", lotSize: 1, tickSize: 0.01, settlementCycle: "T+2", faceValue: 1_000, maturityDate: dateOnly("2036-07-15"), couponRate: 16, couponFrequency: "semi_annual", lastPrice: 101 },
    ],
    skipDuplicates: true,
  });

  await prisma.holding.createMany({
    data: [
      { id: "hld_meron_wgbx", accountId: "acc_meron", instrumentId: "ins_wgbx", totalQuantity: 3_200, availableQuantity: 2_000, blockedQuantity: 1_200, averageCost: 1_685 },
      { id: "hld_meron_gb2031", accountId: "acc_meron", instrumentId: "ins_goeb_2031", totalQuantity: 3_000, availableQuantity: 3_000, averageCost: 100.6 },
      { id: "hld_blue_wgbx", accountId: "acc_blue", instrumentId: "ins_wgbx", totalQuantity: 8_200, availableQuantity: 5_200, blockedQuantity: 3_000, averageCost: 1_710 },
      { id: "hld_wegagen_tele", accountId: "acc_wegagen", instrumentId: "ins_tele", totalQuantity: 18_000, availableQuantity: 18_000, averageCost: 294.1 },
    ],
    skipDuplicates: true,
  });

  await prisma.order.createMany({
    data: [
      { id: "ORD-2026-1048", brokerId: "brk_abyssinia", accountId: "acc_wegagen", instrumentId: "ins_tele", side: "buy", quantity: 7_000, price: 312.5, orderType: "limit", validity: "day", estimatedGross: 2_187_500, estimatedFees: 10_937.5, estimatedNet: 2_198_437.5, status: "pending_broker_review", source: "manual", assignedTraderId: "usr_trader", riskFlag: "review", submittedAt: new Date("2026-07-14T10:42:00Z") },
      { id: "ORD-2026-1047", brokerId: "brk_abyssinia", accountId: "acc_meron", instrumentId: "ins_wgbx", side: "sell", quantity: 1_200, price: 1_735, orderType: "limit", validity: "day", estimatedGross: 2_082_000, estimatedFees: 10_410, estimatedNet: 2_071_590, status: "approved", source: "manual", assignedTraderId: "usr_trader", riskFlag: "review", submittedAt: new Date("2026-07-14T10:19:00Z") },
      { id: "ORD-2026-1046", brokerId: "brk_abyssinia", accountId: "acc_blue", instrumentId: "ins_goeb_2029", side: "buy", quantity: 25_000, price: 99.85, orderType: "limit", validity: "day", estimatedGross: 2_496_250, estimatedFees: 12_481.25, estimatedNet: 2_508_731.25, status: "settlement_pending", source: "manual", assignedTraderId: "usr_trader", riskFlag: "review", submittedAt: new Date("2026-07-14T09:54:00Z") },
      { id: "ORD-2026-1045", brokerId: "brk_abyssinia", accountId: "acc_meron", instrumentId: "ins_goeb_2031", side: "buy", quantity: 3_000, price: 100.6, orderType: "limit", validity: "day", estimatedGross: 301_800, estimatedFees: 1_509, estimatedNet: 303_309, status: "settled", source: "manual", assignedTraderId: "usr_trader", riskFlag: "none", submittedAt: new Date("2026-07-14T09:31:00Z") },
      { id: "ORD-2026-1044", brokerId: "brk_abyssinia", accountId: "acc_selam", instrumentId: "ins_tele", side: "buy", quantity: 500, price: 311, orderType: "limit", validity: "day", estimatedGross: 155_500, estimatedFees: 777.5, estimatedNet: 156_277.5, status: "validation_failed", source: "manual", riskFlag: "high", submittedAt: new Date("2026-07-14T09:08:00Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.orderValidation.createMany({
    data: [
      { id: "val_1048_kyc", orderId: "ORD-2026-1048", ruleCode: "KYC_APPROVED", label: "KYC approved", result: "passed", message: "KYC is current" },
      { id: "val_1048_cash", orderId: "ORD-2026-1048", ruleCode: "SUFFICIENT_CASH", label: "Sufficient available cash", result: "passed", message: "Cash including fees is available" },
      { id: "val_1044_kyc", orderId: "ORD-2026-1044", ruleCode: "KYC_APPROVED", label: "KYC approved", result: "failed", message: "KYC review is due" },
      { id: "val_1044_account", orderId: "ORD-2026-1044", ruleCode: "ACCOUNT_ACTIVE", label: "Account active", result: "failed", message: "Account is restricted" },
    ],
    skipDuplicates: true,
  });

  await prisma.trade.createMany({
    data: [
      { id: "TRD-2026-0772", orderId: "ORD-2026-1046", executionPrice: 99.85, quantityFilled: 25_000, grossAmount: 2_496_250, fees: 12_481.25, netAmount: 2_508_731.25, tradeDate: dateOnly("2026-07-14"), settlementDate: dateOnly("2026-07-16"), capturedBy: "usr_trader" },
      { id: "TRD-2026-0768", orderId: "ORD-2026-1045", executionPrice: 100.6, quantityFilled: 3_000, grossAmount: 301_800, fees: 1_509, netAmount: 303_309, tradeDate: dateOnly("2026-07-10"), settlementDate: dateOnly("2026-07-14"), capturedBy: "usr_trader" },
    ],
    skipDuplicates: true,
  });

  await prisma.settlement.createMany({
    data: [
      { id: "STL-0772", tradeId: "TRD-2026-0772", status: "pending", settlementDate: dateOnly("2026-07-16"), cashStatus: "pending", securitiesStatus: "pending" },
      { id: "STL-0768", tradeId: "TRD-2026-0768", status: "settled", settlementDate: dateOnly("2026-07-14"), cashStatus: "settled", securitiesStatus: "settled", confirmedBy: "usr_settlement", confirmedAt: new Date("2026-07-14T09:33:18Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.reconciliationBatch.createMany({
    data: [{ id: "REC-2026-0714-A", brokerId: "brk_abyssinia", batchDate: dateOnly("2026-07-14"), fileName: "cash-confirmations-2026-07-14.csv", source: "manual_upload", totalRecords: 248, matchedRecords: 246, exceptionRecords: 2, status: "exceptions", uploadedBy: "usr_settlement" }],
    skipDuplicates: true,
  });

  await prisma.reconciliationException.createMany({
    data: [
      { id: "rec_exc_1", batchId: "REC-2026-0714-A", reference: "TRD-2026-0759", exceptionType: "cash_variance", expectedValue: "418250.00", actualValue: "400000.00", status: "open" },
      { id: "rec_exc_2", batchId: "REC-2026-0714-A", reference: "TELE", exceptionType: "quantity_mismatch", expectedValue: "12500", actualValue: "12495", status: "open" },
    ],
    skipDuplicates: true,
  });

  await prisma.auditLog.createMany({
    data: [
      { id: "aud_1", brokerId: "brk_abyssinia", actorId: "usr_demo_admin", action: "ORDER_CREATED", entityType: "order", entityId: "ORD-2026-1048", summary: "Buy 7,000 TELE at 312.50 ETB", createdAt: new Date("2026-07-14T10:42:51Z") },
      { id: "aud_2", brokerId: "brk_abyssinia", actorId: "usr_demo_admin", action: "ORDER_VALIDATED", entityType: "order", entityId: "ORD-2026-1048", summary: "All required pre-trade checks passed", createdAt: new Date("2026-07-14T10:43:12Z") },
      { id: "aud_3", brokerId: "brk_abyssinia", actorId: "usr_trader", action: "TRADE_CAPTURED", entityType: "trade", entityId: "TRD-2026-0772", summary: "Manual trade linked to ORD-2026-1046", createdAt: new Date("2026-07-14T09:58:37Z") },
      { id: "aud_4", brokerId: "brk_abyssinia", actorId: "usr_settlement", action: "SETTLEMENT_UPDATED", entityType: "settlement", entityId: "STL-0768", summary: "Cash and securities legs confirmed", createdAt: new Date("2026-07-14T09:33:18Z") },
    ],
    skipDuplicates: true,
  });

  console.log("FrankBroker OS demo data is ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
