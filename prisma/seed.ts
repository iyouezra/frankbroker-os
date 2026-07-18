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
    data: [
      { id: "brk_abyssinia", name: "Abyssinia Securities S.C.", licenseNumber: "ESCA-BR-004", status: "active", baseCurrency: "ETB" },
      { id: "brk_blue_nile", name: "Blue Nile Capital PLC", licenseNumber: "ESCA-BR-011", status: "pilot", baseCurrency: "ETB" },
      { id: "brk_sheba", name: "Sheba Investment Services S.C.", licenseNumber: "PILOT-023", status: "suspended", baseCurrency: "ETB" },
    ],
    skipDuplicates: true,
  });

  await prisma.user.createMany({
    data: [
      { id: "usr_demo_admin", brokerId: "brk_abyssinia", email: "demo.admin@frankbroker.et", fullName: "Mekdes Tadesse", role: "broker_admin", status: "active" },
      { id: "usr_trader", brokerId: "brk_abyssinia", email: "dawit@frankbroker.et", fullName: "Dawit Alemu", role: "trader", status: "active" },
      { id: "usr_operations", brokerId: "brk_abyssinia", email: "hana@frankbroker.et", fullName: "Hana Kebede", role: "operations", status: "active" },
      { id: "usr_compliance", brokerId: "brk_abyssinia", email: "liya@frankbroker.et", fullName: "Liya Girma", role: "compliance", status: "active" },
      { id: "usr_settlement", brokerId: "brk_abyssinia", email: "rahel@frankbroker.et", fullName: "Rahel Getachew", role: "settlement", status: "active" },
      { id: "usr_platform_admin", brokerId: null, email: "platform.admin@frankmoney.et", fullName: "Fikru Yilma", role: "super_admin", status: "active", mfaEnabled: true },
      { id: "usr_blue_admin", brokerId: "brk_blue_nile", email: "samuel@bluenile.example", fullName: "Samuel Kebede", role: "broker_admin", status: "active", mfaEnabled: true },
      { id: "usr_sheba_admin", brokerId: "brk_sheba", email: "abel@sheba.example", fullName: "Abel Yohannes", role: "broker_admin", status: "suspended", mfaEnabled: true },
    ],
    skipDuplicates: true,
  });

  await prisma.client.createMany({
    data: [
      { id: "cli_meron", brokerId: "brk_abyssinia", clientCode: "CL-10041", fullName: "Meron Bekele", clientType: "individual", phone: "+251911000041", email: "meron@example.et", identityReference: "demo_meron_fayda", address: "Bole, Addis Ababa", proofOfAddressType: "Bank letter", proofOfAddressReference: "POA-MERON-001", proofOfAddressStatus: "received", kycStatus: "approved", kycReviewDueAt: new Date("2027-07-14T08:00:00Z"), riskRating: "standard", status: "active" },
      { id: "cli_wegagen", brokerId: "brk_abyssinia", clientCode: "CL-10008", fullName: "Wegagen Pension Fund", clientType: "institution", phone: "+251115000008", email: "ops@wegagen-pension.example", kycStatus: "approved", riskRating: "enhanced", status: "active" },
      { id: "cli_selam", brokerId: "brk_abyssinia", clientCode: "CL-10052", fullName: "Selamawit Tesfaye", clientType: "individual", phone: "+251911000052", email: "selam@example.et", kycStatus: "pending", riskRating: "review", status: "restricted" },
      { id: "cli_blue", brokerId: "brk_abyssinia", clientCode: "CL-10017", fullName: "Blue Nile Trading PLC", clientType: "corporate", phone: "+251115000017", email: "finance@bluenile.example", kycStatus: "approved", riskRating: "standard", status: "active" },
      { id: "cli_investor_demo", brokerId: "brk_abyssinia", clientCode: "CL-INV-001", fullName: "Selam Mekonnen", clientType: "individual", phone: "+251911000041", email: "selam.mekonnen@example.et", identityReference: "demo_seed_reference", faydaLast4: "9012", taxIdLast4: "4908", address: "Bole, Addis Ababa", proofOfAddressType: "Utility bill", proofOfAddressReference: "DEMO-POA-001", proofOfAddressStatus: "received", kycStatus: "approved", riskRating: "standard", status: "active", kycConsentAt: new Date("2026-07-14T08:00:00Z"), electronicDeliveryConsentAt: new Date("2026-07-14T08:00:00Z"), kycReviewDueAt: new Date("2027-07-14T08:00:00Z") },
      { id: "cli_pending_demo", brokerId: "brk_abyssinia", clientCode: "CL-2026-P001", fullName: "Hana Tesfaye", clientType: "individual", phone: "+251911000077", email: "hana.tesfaye@example.et", identityReference: "demo_pending_fayda", faydaLast4: "1122", taxIdLast4: "7788", address: "Yeka, Addis Ababa", proofOfAddressType: "Bank letter", proofOfAddressReference: "POA-HANA-001", proofOfAddressStatus: "received", kycStatus: "pending_review", riskRating: "standard", status: "pending_approval", kycConsentAt: new Date("2026-07-15T09:00:00Z"), electronicDeliveryConsentAt: new Date("2026-07-15T09:00:00Z"), createdBy: "usr_trader", submittedAt: new Date("2026-07-15T09:05:00Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.account.createMany({
    data: [
      { id: "acc_meron", clientId: "cli_meron", accountNumber: "TRD-10041-01", csdReference: "CSD-ET-10041", totalCash: 1_840_500, availableCash: 1_526_850, blockedCash: 313_650, unsettledCash: 0, status: "active" },
      { id: "acc_wegagen", clientId: "cli_wegagen", accountNumber: "TRD-10008-01", totalCash: 12_400_000, availableCash: 10_172_500, blockedCash: 2_227_500, unsettledCash: 0, status: "active" },
      { id: "acc_selam", clientId: "cli_selam", accountNumber: "TRD-10052-01", totalCash: 428_900, availableCash: 428_900, blockedCash: 0, unsettledCash: 0, status: "restricted" },
      { id: "acc_blue", clientId: "cli_blue", accountNumber: "TRD-10017-01", totalCash: 4_705_300, availableCash: 4_120_300, blockedCash: 585_000, unsettledCash: 0, status: "active" },
      { id: "acc_investor_demo", clientId: "cli_investor_demo", accountNumber: "INV-00001-01", totalCash: 75_000, availableCash: 75_000, blockedCash: 0, unsettledCash: 0, status: "active" },
      { id: "acc_pending_demo", clientId: "cli_pending_demo", accountNumber: "TRD-2026-P001-01", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "pending_approval", restrictionReason: "Awaiting client onboarding approval" },
    ],
    skipDuplicates: true,
  });

  // Physical cash is held in safeguarded omnibus accounts while these
  // positions record each investor's exact beneficial share of each pool.
  await prisma.pooledBankAccount.createMany({
    data: [
      { id: "pool_aby_general", brokerId: "brk_abyssinia", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", purpose: "general", bookBalance: 16_449_700, statementBalance: 16_449_700, status: "active", lastReconciledAt: new Date("2026-07-14T16:00:00Z") },
      { id: "pool_aby_fixed_income", brokerId: "brk_abyssinia", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Fixed Income Client Money", accountNumberMasked: "•••• 7721", purpose: "fixed_income", bookBalance: 3_000_000, statementBalance: 3_000_000, status: "active", lastReconciledAt: new Date("2026-07-14T16:00:00Z") },
    ],
    skipDuplicates: true,
  });
  await prisma.clientMoneyPosition.createMany({
    data: [
      { id: "pos_meron_general", accountId: "acc_meron", pooledBankAccountId: "pool_aby_general", balance: 1_840_500 },
      { id: "pos_wegagen_general", accountId: "acc_wegagen", pooledBankAccountId: "pool_aby_general", balance: 9_400_000 },
      { id: "pos_wegagen_fixed", accountId: "acc_wegagen", pooledBankAccountId: "pool_aby_fixed_income", balance: 3_000_000 },
      { id: "pos_selam_general", accountId: "acc_selam", pooledBankAccountId: "pool_aby_general", balance: 428_900 },
      { id: "pos_blue_general", accountId: "acc_blue", pooledBankAccountId: "pool_aby_general", balance: 4_705_300 },
      { id: "pos_investor_general", accountId: "acc_investor_demo", pooledBankAccountId: "pool_aby_general", balance: 75_000 },
      { id: "pos_pending_general", accountId: "acc_pending_demo", pooledBankAccountId: "pool_aby_general", balance: 0 },
    ],
    skipDuplicates: true,
  });
  await prisma.cashMovement.createMany({
    data: [
      { id: "MOV-DEMO-DEP-001", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", pooledBankAccountId: "pool_aby_general", submissionReference: "INV-DEMO-FUND-001", movementType: "deposit", amount: 15_000, status: "pending_verification", bankReference: "CBE-FT-908231", proofReference: "mobile-transfer-receipt", requestedByChannel: "investor_portal", submittedAt: new Date("2026-07-16T08:42:00Z"), notes: "Awaiting independent bank evidence match" },
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

  const tenantSettings = [
    { id: "set_brk_abyssinia", brokerId: "brk_abyssinia", tradingName: "Abyssinia Securities", plan: "Enterprise", domain: "invest.abyssinia.et", supportEmail: "support@abyssinia.example", primaryColor: "#0C8189", welcomeMessage: "Invest in Ethiopia’s growth with clear guidance at every step.", businessDate: dateOnly("2026-07-14"), features: { investorPortal: true, selfDirected: true, roboPlans: true, bonds: true, fractionalOrders: true, recurringInvestments: true, institutionalAccounts: true, manualTradeCapture: true }, makerChecker: true, approvalThreshold: 250_000, clientDailyLimit: 2_500_000, brokerageFeePct: .5, minimumFee: 25, settlementCycle: "T+2", allowedOrderTypes: ["Market", "Limit", "Stop-loss"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
    { id: "set_brk_blue_nile", brokerId: "brk_blue_nile", tradingName: "Blue Nile Capital", plan: "Growth", domain: "invest.bluenile.example", supportEmail: "care@bluenile.example", primaryColor: "#2277C8", welcomeMessage: "A simpler way to own ESX companies and government bonds.", businessDate: dateOnly("2026-07-14"), features: { investorPortal: true, selfDirected: true, roboPlans: false, bonds: true, fractionalOrders: false, recurringInvestments: false, institutionalAccounts: true, manualTradeCapture: true }, makerChecker: true, approvalThreshold: 100_000, clientDailyLimit: 750_000, brokerageFeePct: .65, minimumFee: 30, settlementCycle: "T+2", allowedOrderTypes: ["Market", "Limit"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
    { id: "set_brk_sheba", brokerId: "brk_sheba", tradingName: "Sheba Invest", plan: "Pilot", domain: "sheba.frankbroker.demo", supportEmail: "operations@sheba.example", primaryColor: "#0E9F5B", welcomeMessage: "Start small, understand every step, and build from there.", businessDate: dateOnly("2026-07-14"), features: { investorPortal: false, selfDirected: true, roboPlans: false, bonds: false, fractionalOrders: false, recurringInvestments: false, institutionalAccounts: false, manualTradeCapture: true }, makerChecker: true, approvalThreshold: 50_000, clientDailyLimit: 250_000, brokerageFeePct: .75, minimumFee: 35, settlementCycle: "T+2", allowedOrderTypes: ["Limit"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
  ];
  for (const settings of tenantSettings) {
    await prisma.brokerSettings.upsert({ where: { brokerId: settings.brokerId }, update: settings, create: settings });
  }

  await prisma.legalDocument.createMany({
    data: [
      { id: "legal_brk_abyssinia_1_0", brokerId: "brk_abyssinia", documentType: "brokerage_terms", title: "Abyssinia Securities Brokerage Account Terms", version: "1.0", language: "en", summary: "Account operation, order handling, fees, confirmations, settlement, client responsibilities, discrepancies, restriction, and closure.", content: "These demonstration brokerage terms explain how the account is opened and operated, how orders are accepted and reviewed, how transaction fees are disclosed, how confirmations and discrepancies are handled, and how an account may be restricted or closed. Replace this text with counsel-approved tenant terms before production.", status: "published", effectiveAt: dateOnly("2026-07-14"), publishedAt: new Date("2026-07-14T07:00:00Z"), requiresReacceptance: true },
      { id: "legal_brk_blue_nile_1_0", brokerId: "brk_blue_nile", documentType: "brokerage_terms", title: "Blue Nile Capital Brokerage Account Terms", version: "1.0", language: "en", summary: "Account operation, order handling, fees, confirmations, settlement, and closure.", content: "Demonstration terms only. Replace with tenant-approved brokerage terms before production use.", status: "published", effectiveAt: dateOnly("2026-07-14"), publishedAt: new Date("2026-07-14T07:00:00Z"), requiresReacceptance: true },
    ],
    skipDuplicates: true,
  });

  await prisma.feeSchedule.createMany({
    data: [
      { id: "fees_brk_abyssinia_1_0", brokerId: "brk_abyssinia", name: "Standard ESX fee schedule", version: "1.0", status: "published", effectiveFrom: dateOnly("2026-07-14") },
      { id: "fees_brk_blue_nile_1_0", brokerId: "brk_blue_nile", name: "Standard ESX fee schedule", version: "1.0", status: "published", effectiveFrom: dateOnly("2026-07-14") },
    ],
    skipDuplicates: true,
  });
  await prisma.feeRule.createMany({
    data: [
      { id: "fee_aby_equity", feeScheduleId: "fees_brk_abyssinia_1_0", assetClass: "equity", marketSegment: "main", brokeragePct: .5, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee: 25 },
      { id: "fee_aby_bond", feeScheduleId: "fees_brk_abyssinia_1_0", assetClass: "bond", marketSegment: "main", brokeragePct: .5, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee: 25 },
      { id: "fee_blue_equity", feeScheduleId: "fees_brk_blue_nile_1_0", assetClass: "equity", marketSegment: "main", brokeragePct: .65, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee: 30 },
      { id: "fee_blue_bond", feeScheduleId: "fees_brk_blue_nile_1_0", assetClass: "bond", marketSegment: "main", brokeragePct: .65, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee: 30 },
    ],
    skipDuplicates: true,
  });
  await prisma.clientConsent.createMany({
    data: [
      { id: "consent_investor_terms_1_0", clientId: "cli_investor_demo", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "investor_portal", acceptedAt: new Date("2026-07-14T08:00:00Z"), metadata: { electronicDeliveryConsent: true } },
      { id: "consent_meron_terms_1_0", clientId: "cli_meron", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-10T09:15:00Z") },
      { id: "consent_pending_terms_1_0", clientId: "cli_pending_demo", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-15T09:02:00Z"), metadata: { recordedBy: "usr_trader", electronicDeliveryConsent: true } },
    ],
    skipDuplicates: true,
  });
  await prisma.clientServiceRequest.createMany({
    data: [
      { id: "REQ-DEMO-001", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", requestType: "profile_correction", status: "open", subject: "Profile correction request", description: "Please review the spelling of my address before the next statement.", submittedBy: "investor_portal", submittedAt: new Date("2026-07-15T11:30:00Z") },
    ],
    skipDuplicates: true,
  });
  await prisma.clientNote.createMany({
    data: [
      { id: "NOTE-DEMO-001", clientId: "cli_meron", noteText: "Client confirmed the WGBX sell instruction by phone; dealer callback completed.", category: "trading", visibility: "internal", createdBy: "usr_trader", createdAt: new Date("2026-07-14T10:12:00Z") },
      { id: "NOTE-DEMO-002", clientId: "cli_meron", noteText: "Annual KYC review is complete. Proof of address reference checked against the client file.", category: "compliance", visibility: "internal", createdBy: "usr_compliance", createdAt: new Date("2026-07-12T08:30:00Z") },
    ],
    skipDuplicates: true,
  });

  const tenantInstrumentIds: Record<string, string[]> = {
    brk_abyssinia: ["ins_tele", "ins_awab", "ins_wgbx", "ins_gdab", "ins_abayb", "ins_goeb_2029", "ins_goeb_2031"],
    brk_blue_nile: ["ins_tele", "ins_awab", "ins_wgbx", "ins_gdab", "ins_goeb_2029"],
    brk_sheba: ["ins_tele", "ins_wgbx"],
  };
  await prisma.brokerInstrument.createMany({
    data: Object.entries(tenantInstrumentIds).flatMap(([brokerId, instrumentIds]) => instrumentIds.map((instrumentId) => ({ id: `bri_${brokerId}_${instrumentId}`, brokerId, instrumentId, enabled: true }))),
    skipDuplicates: true,
  });

  const integrationDefinitions = [
    ["fayda", "Fayda eKYC", "Identity and consent verification"],
    ["esx", "ESX order gateway", "Order routing and execution reports"],
    ["csd", "CSD settlement", "Holdings and settlement instructions"],
    ["bank", "Cash settlement bank", "Funding and cash confirmations"],
    ["notify", "SMS and email", "Investor alerts and confirmations"],
  ];
  await prisma.tenantIntegration.createMany({
    data: Object.keys(tenantInstrumentIds).flatMap((brokerId) => integrationDefinitions.map(([key, name, description]) => ({
      id: `${brokerId}-${key}`, brokerId, key, name, description,
      status: brokerId === "brk_abyssinia" && ["fayda", "bank"].includes(key) ? "sandbox" : key === "notify" && brokerId !== "brk_sheba" ? "connected" : "not_connected",
      mode: brokerId === "brk_abyssinia" && ["fayda", "bank"].includes(key) ? "sandbox" : key === "notify" && brokerId !== "brk_sheba" ? "live" : "manual",
    }))),
    skipDuplicates: true,
  });

  await prisma.holding.createMany({
    data: [
      { id: "hld_meron_wgbx", accountId: "acc_meron", instrumentId: "ins_wgbx", totalQuantity: 3_200, availableQuantity: 2_000, blockedQuantity: 1_200, averageCost: 1_685 },
      { id: "hld_meron_gb2031", accountId: "acc_meron", instrumentId: "ins_goeb_2031", totalQuantity: 3_000, availableQuantity: 3_000, averageCost: 100.6 },
      { id: "hld_blue_wgbx", accountId: "acc_blue", instrumentId: "ins_wgbx", totalQuantity: 8_200, availableQuantity: 5_200, blockedQuantity: 3_000, averageCost: 1_710 },
      { id: "hld_blue_gb2029", accountId: "acc_blue", instrumentId: "ins_goeb_2029", totalQuantity: 25_000, availableQuantity: 0, unsettledQuantity: 25_000, averageCost: 99.85 },
      { id: "hld_wegagen_tele", accountId: "acc_wegagen", instrumentId: "ins_tele", totalQuantity: 18_000, availableQuantity: 18_000, averageCost: 294.1 },
      { id: "hld_investor_tele", accountId: "acc_investor_demo", instrumentId: "ins_tele", totalQuantity: 120, availableQuantity: 120, averageCost: 294.1 },
      { id: "hld_investor_wgbx", accountId: "acc_investor_demo", instrumentId: "ins_wgbx", totalQuantity: 15, availableQuantity: 15, averageCost: 1_685 },
    ],
    skipDuplicates: true,
  });

  await prisma.order.createMany({
    data: [
      { id: "ORD-2026-1048", brokerId: "brk_abyssinia", accountId: "acc_wegagen", instrumentId: "ins_tele", side: "buy", quantity: 7_000, remainingQuantity: 7_000, blockedCash: 2_198_437.5, price: 312.5, orderType: "limit", validity: "day", estimatedGross: 2_187_500, estimatedFees: 10_937.5, estimatedNet: 2_198_437.5, status: "pending_broker_review", source: "manual", assignedTraderId: "usr_trader", riskFlag: "review", submittedAt: new Date("2026-07-14T10:42:00Z") },
      { id: "ORD-2026-1047", brokerId: "brk_abyssinia", accountId: "acc_meron", instrumentId: "ins_wgbx", side: "sell", quantity: 1_200, remainingQuantity: 1_200, blockedQuantity: 1_200, price: 1_735, orderType: "limit", validity: "day", estimatedGross: 2_082_000, estimatedFees: 10_410, estimatedNet: 2_071_590, status: "approved", source: "manual", assignedTraderId: "usr_trader", riskFlag: "review", submittedAt: new Date("2026-07-14T10:19:00Z") },
      { id: "ORD-2026-1046", brokerId: "brk_abyssinia", accountId: "acc_blue", instrumentId: "ins_goeb_2029", side: "buy", quantity: 25_000, filledQuantity: 25_000, remainingQuantity: 0, averageFillPrice: 99.85, executedGross: 2_496_250, executedFees: 12_481.25, executedNet: 2_508_731.25, price: 99.85, orderType: "limit", validity: "day", estimatedGross: 2_496_250, estimatedFees: 12_481.25, estimatedNet: 2_508_731.25, status: "settlement_pending", source: "manual", assignedTraderId: "usr_trader", riskFlag: "review", submittedAt: new Date("2026-07-14T09:54:00Z") },
      { id: "ORD-2026-1045", brokerId: "brk_abyssinia", accountId: "acc_meron", instrumentId: "ins_goeb_2031", side: "buy", quantity: 3_000, filledQuantity: 3_000, remainingQuantity: 0, averageFillPrice: 100.6, executedGross: 301_800, executedFees: 1_509, executedNet: 303_309, price: 100.6, orderType: "limit", validity: "day", estimatedGross: 301_800, estimatedFees: 1_509, estimatedNet: 303_309, status: "settled", source: "manual", assignedTraderId: "usr_trader", riskFlag: "none", submittedAt: new Date("2026-07-14T09:31:00Z") },
      { id: "ORD-2026-1044", brokerId: "brk_abyssinia", accountId: "acc_selam", instrumentId: "ins_tele", side: "buy", quantity: 500, remainingQuantity: 500, price: 311, orderType: "limit", validity: "day", estimatedGross: 155_500, estimatedFees: 777.5, estimatedNet: 156_277.5, status: "validation_failed", source: "manual", riskFlag: "high", submittedAt: new Date("2026-07-14T09:08:00Z") },
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
