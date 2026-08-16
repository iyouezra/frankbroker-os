import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { addisBusinessDate } from "../lib/addis-date";
import { ensureChartOfAccounts } from "../lib/gl/chart-seed";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed FrankBroker OS.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const seededPlatformFeeSchedule = {
  id: "platform_fees_1_2",
  name: "ESX market and regulatory fees",
  version: "1.2",
  effectiveFrom: "2026-08-04",
  rules: [
    { assetClass: "equity", marketSegment: "main", regulatorPct: 0.15, exchangePct: 0.36, csdPct: 0 },
    { assetClass: "bond", marketSegment: "main", regulatorPct: 0.005, exchangePct: 0.021, csdPct: 0 },
  ],
};

async function main() {
  await prisma.broker.createMany({
    data: [
      { id: "brk_abyssinia", name: "Abyssinia Securities S.C.", licenseNumber: "ESCA-BR-004", status: "active", baseCurrency: "ETB" },
      { id: "brk_blue_nile", name: "Addis Capital PLC", licenseNumber: "ESCA-BR-011", status: "pilot", baseCurrency: "ETB" },
      { id: "brk_sheba", name: "Sheba Advisory S.C.", licenseNumber: "PILOT-023", status: "pilot", baseCurrency: "ETB" },
    ],
    skipDuplicates: true,
  });

  // Every broker gets its chart of control accounts the moment it exists, so
  // no posting can ever arrive before the accounts it needs.
  for (const brokerId of ["brk_abyssinia", "brk_blue_nile", "brk_sheba"]) {
    await ensureChartOfAccounts(prisma, brokerId);
  }

  await prisma.user.createMany({
    data: [
      { id: "usr_access_admin", brokerId: "brk_abyssinia", employeeId: "ABS-0012", email: "access.admin@frankbroker.et", fullName: "Sara Alemayehu", jobTitle: "People Operations Lead", department: "People & Operations", role: "access_admin", status: "active", mfaEnabled: true, accessReviewDueAt: new Date("2026-10-01T00:00:00Z") },
      { id: "usr_access_admin_backup", brokerId: "brk_abyssinia", employeeId: "ABS-0031", email: "access.backup@frankbroker.et", fullName: "Nahom Bekele", jobTitle: "Information Security Lead", department: "Technology", role: "access_admin", status: "active", mfaEnabled: true, accessReviewDueAt: new Date("2026-10-01T00:00:00Z") },
      { id: "usr_demo_admin", brokerId: "brk_abyssinia", employeeId: "ABS-0004", email: "demo.admin@frankbroker.et", fullName: "Mekdes Tadesse", jobTitle: "Brokerage Operations Director", department: "Operations", role: "broker_admin", status: "active" },
      { id: "usr_trader", brokerId: "brk_abyssinia", employeeId: "ABS-0107", email: "dawit@frankbroker.et", fullName: "Dawit Alemu", jobTitle: "Senior Trader", department: "Trading", role: "trader", status: "active" },
      { id: "usr_operations", brokerId: "brk_abyssinia", employeeId: "ABS-0142", email: "hana@frankbroker.et", fullName: "Hana Kebede", jobTitle: "Operations Officer", department: "Operations", role: "operations", status: "active" },
      { id: "usr_compliance", brokerId: "brk_abyssinia", employeeId: "ABS-0063", email: "liya@frankbroker.et", fullName: "Liya Girma", jobTitle: "Compliance Officer", department: "Compliance", role: "compliance", status: "active" },
      { id: "usr_settlement", brokerId: "brk_abyssinia", employeeId: "ABS-0088", email: "rahel@frankbroker.et", fullName: "Rahel Getachew", jobTitle: "Settlement Officer", department: "Post-trade", role: "settlement", status: "active" },
      { id: "usr_relationship", brokerId: "brk_abyssinia", employeeId: "ABS-0164", email: "kalkidan@frankbroker.et", fullName: "Kalkidan Alemu", jobTitle: "Relationship Officer", department: "Client Services", role: "relationship_officer", status: "active" },
      { id: "usr_service", brokerId: "brk_abyssinia", employeeId: "ABS-0171", email: "bethel@frankbroker.et", fullName: "Bethel Tesfaye", jobTitle: "Client Service Officer", department: "Client Services", role: "service_officer", status: "active" },
      { id: "usr_platform_admin", brokerId: null, email: "platform.admin@frankmoney.et", fullName: "Fikru Yilma", role: "super_admin", status: "active", mfaEnabled: true },
      { id: "usr_blue_admin", brokerId: "brk_blue_nile", employeeId: "ADC-0001", email: "samuel@addiscapital.example", fullName: "Samuel Kebede", jobTitle: "Access Administrator", department: "Operations", role: "access_admin", status: "active", mfaEnabled: true },
      { id: "usr_sheba_admin", brokerId: "brk_sheba", employeeId: "SIS-0001", email: "abel@sheba.example", fullName: "Abel Yohannes", jobTitle: "Access Administrator", department: "Operations", role: "access_admin", status: "active", mfaEnabled: true },
      { id: "usr_blue_tenant_admin", brokerId: "brk_blue_nile", employeeId: "ADC-0002", email: "tenant.admin@addiscapital.example", fullName: "Mimi Solomon", jobTitle: "Tenant Administrator", department: "Operations", role: "broker_admin", status: "active", mfaEnabled: true },
      { id: "usr_sheba_tenant_admin", brokerId: "brk_sheba", employeeId: "SIS-0002", email: "tenant.admin@sheba.example", fullName: "Eden Girma", jobTitle: "Tenant Administrator", department: "Advisory", role: "broker_admin", status: "active", mfaEnabled: true },
      { id: "usr_advisory_lead", brokerId: "brk_blue_nile", email: "lead@addiscapital.example", fullName: "Saron Desta", role: "advisory_lead", status: "active", mfaEnabled: true },
      { id: "usr_advisory_analyst", brokerId: "brk_blue_nile", email: "analyst@addiscapital.example", fullName: "Nahom Bekele", role: "advisory_analyst", status: "active", mfaEnabled: true },
      { id: "usr_sheba_advisory_lead", brokerId: "brk_sheba", email: "lead@sheba.example", fullName: "Meron Tadesse", role: "advisory_lead", status: "active", mfaEnabled: true },
      { id: "usr_sheba_advisory_analyst", brokerId: "brk_sheba", email: "analyst@sheba.example", fullName: "Yared Alemu", role: "advisory_analyst", status: "active", mfaEnabled: true },
    ],
    skipDuplicates: true,
  });

  await prisma.client.createMany({
    data: [
      { id: "cli_meron", brokerId: "brk_abyssinia", clientCode: "CL-10041", fullName: "Meron Bekele", clientType: "individual", phone: "+251911000041", email: "meron@example.et", identityReference: "demo_meron_fayda", address: "Bole, Addis Ababa", proofOfAddressType: "Bank letter", proofOfAddressReference: "POA-MERON-001", proofOfAddressStatus: "received", kycStatus: "approved", kycReviewDueAt: new Date("2027-07-14T08:00:00Z"), riskRating: "standard", status: "active" },
      { id: "cli_wegagen", brokerId: "brk_abyssinia", clientCode: "CL-10008", fullName: "Wegagen Pension Fund", clientType: "institution", phone: "+251115000008", email: "ops@wegagen-pension.example", kycStatus: "approved", riskRating: "enhanced", status: "active" },
      { id: "cli_selam", brokerId: "brk_abyssinia", clientCode: "CL-10052", fullName: "Selamawit Tesfaye", clientType: "individual", phone: "+251911000052", email: "selam@example.et", kycStatus: "pending", riskRating: "review", status: "restricted" },
      { id: "cli_blue", brokerId: "brk_abyssinia", clientCode: "CL-10017", fullName: "Blue Nile Trading PLC", clientType: "corporate", phone: "+251115000017", email: "finance@bluenile.example", kycStatus: "approved", riskRating: "standard", status: "active" },
      { id: "cli_investor_demo", brokerId: "brk_abyssinia", clientCode: "CL-INV-001", fullName: "Selam Mekonnen", clientType: "individual", phone: "+251911000041", email: "selam.mekonnen@example.et", portalAuthSubject: "demo-investor-subject", identityReference: "demo_seed_reference", faydaLast7: "0123456", taxIdLast4: "4908", proofOfAddressType: "Drivers License", proofOfAddressReference: "selam-drivers-license.pdf", proofOfAddressStatus: "received", kycStatus: "approved", riskRating: "standard", status: "active", kycConsentAt: new Date("2026-07-14T08:00:00Z"), electronicDeliveryConsentAt: new Date("2026-07-14T08:00:00Z"), kycReviewDueAt: new Date("2027-07-14T08:00:00Z") },
      { id: "cli_pending_demo", brokerId: "brk_abyssinia", clientCode: "CL-2026-P001", fullName: "Hana Tesfaye", clientType: "individual", phone: "+251911000077", email: "hana.tesfaye@example.et", identityReference: "demo_pending_fayda", faydaLast7: "3451122", taxIdLast4: "7788", address: "Yeka, Addis Ababa", proofOfAddressType: "Bank letter", proofOfAddressReference: "POA-HANA-001", proofOfAddressStatus: "received", kycStatus: "pending_review", riskRating: "standard", status: "pending_approval", kycConsentAt: new Date("2026-07-15T09:00:00Z"), electronicDeliveryConsentAt: new Date("2026-07-15T09:00:00Z"), createdBy: "usr_trader", submittedAt: new Date("2026-07-15T09:05:00Z") },
      { id: "cli_pending_ready", brokerId: "brk_abyssinia", clientCode: "CL-2026-P002", fullName: "Rahel Desta", clientType: "individual", phone: "+251911000082", email: "rahel.desta@example.et", identityReference: "demo_pending_ready_fayda", faydaLast7: "6219084", taxIdLast4: "1432", address: "Bole, Addis Ababa", proofOfAddressType: "Utility bill", proofOfAddressReference: "POA-RAHEL-002", proofOfAddressStatus: "received", kycStatus: "pending_review", riskRating: "standard", status: "pending_approval", kycConsentAt: new Date("2026-07-16T08:20:00Z"), electronicDeliveryConsentAt: new Date("2026-07-16T08:20:00Z"), createdBy: "usr_relationship", submittedAt: new Date("2026-07-16T08:28:00Z"), onboardingChannel: "digital" },
      { id: "cli_pending_evidence", brokerId: "brk_abyssinia", clientCode: "CL-2026-P003", fullName: "Yonas Lemma", clientType: "individual", phone: "+251911000093", email: "yonas.lemma@example.et", identityReference: "demo_pending_evidence_fayda", faydaLast7: "7304195", taxIdLast4: "2851", address: "Nifas Silk, Addis Ababa", proofOfAddressType: "Bank letter", proofOfAddressReference: "POA-YONAS-003", proofOfAddressStatus: "pending", kycStatus: "pending_review", riskRating: "review", status: "pending_approval", kycConsentAt: new Date("2026-07-17T10:05:00Z"), electronicDeliveryConsentAt: new Date("2026-07-17T10:05:00Z"), createdBy: "usr_trader", submittedAt: new Date("2026-07-17T10:12:00Z"), onboardingChannel: "in_person" },
      { id: "cli_pending_corporate", brokerId: "brk_abyssinia", clientCode: "CL-2026-P004", fullName: "Meskel Manufacturing PLC", clientType: "corporate", phone: "+251115500204", email: "finance@meskel-manufacturing.example", identityReference: "demo_pending_corporate_reference", faydaLast7: "8415206", taxIdLast4: "6204", address: "Akaki Kality, Addis Ababa", businessRegistrationNumber: "BR-2026-00482", authorizedRepresentativeName: "Marta Getachew", signatoryAuthorityConfirmed: true, beneficialOwners: [{ name: "Marta Getachew", ownershipPct: 60 }, { name: "Bereket Fikru", ownershipPct: 40 }], proofOfAddressStatus: "pending", kycStatus: "pending_review", riskRating: "enhanced", status: "pending_approval", kycConsentAt: new Date("2026-07-18T07:40:00Z"), electronicDeliveryConsentAt: new Date("2026-07-18T07:40:00Z"), createdBy: "usr_relationship", submittedAt: new Date("2026-07-18T08:05:00Z"), onboardingChannel: "in_person" },
      { id: "cli_recent_approved", brokerId: "brk_abyssinia", clientCode: "CL-2026-A001", fullName: "Saba Wolde", clientType: "individual", phone: "+251911000104", email: "saba.wolde@example.et", identityReference: "demo_recent_approved_fayda", faydaLast7: "9526317", taxIdLast4: "7315", address: "Kirkos, Addis Ababa", proofOfAddressType: "Utility bill", proofOfAddressReference: "POA-SABA-A001", proofOfAddressStatus: "received", kycStatus: "approved", riskRating: "standard", status: "active", kycConsentAt: new Date("2026-07-18T09:15:00Z"), electronicDeliveryConsentAt: new Date("2026-07-18T09:15:00Z"), createdBy: "usr_relationship", submittedAt: new Date("2026-07-18T09:22:00Z"), approvedBy: "usr_compliance", approvedAt: new Date("2026-07-19T08:35:00Z"), kycReviewDueAt: new Date("2027-07-19T08:35:00Z"), onboardingChannel: "digital" },
      { id: "cli_review_due_demo", brokerId: "brk_abyssinia", clientCode: "CL-2025-R001", fullName: "Tesfaye Kassa", clientType: "individual", phone: "+251911000115", email: "tesfaye.kassa@example.et", identityReference: "demo_review_due_fayda", faydaLast7: "1637428", taxIdLast4: "8426", address: "Arada, Addis Ababa", proofOfAddressType: "Bank letter", proofOfAddressReference: "POA-TESFAYE-R001", proofOfAddressStatus: "received", kycStatus: "review_due", riskRating: "review", status: "restricted", kycConsentAt: new Date("2025-07-10T08:00:00Z"), electronicDeliveryConsentAt: new Date("2025-07-10T08:00:00Z"), createdBy: "usr_trader", approvedBy: "usr_compliance", approvedAt: new Date("2025-07-11T09:00:00Z"), kycReviewDueAt: new Date("2026-07-11T09:00:00Z"), onboardingChannel: "in_person" },
      { id: "cli_rejected_demo", brokerId: "brk_abyssinia", clientCode: "CL-2026-X001", fullName: "North Star Import PLC", clientType: "corporate", phone: "+251115500226", email: "admin@northstar-import.example", identityReference: "demo_rejected_corporate_reference", faydaLast7: "2748539", taxIdLast4: "9537", address: "Lideta, Addis Ababa", businessRegistrationNumber: "BR-2026-00917", authorizedRepresentativeName: "Natnael Worku", signatoryAuthorityConfirmed: true, beneficialOwners: [{ name: "Natnael Worku", ownershipPct: 100 }], proofOfAddressStatus: "rejected", kycStatus: "rejected", riskRating: "enhanced", status: "rejected", kycConsentAt: new Date("2026-07-13T12:00:00Z"), createdBy: "usr_relationship", submittedAt: new Date("2026-07-13T12:15:00Z"), rejectionReason: "Beneficial ownership evidence could not be independently verified.", onboardingChannel: "in_person" },
    ],
    skipDuplicates: true,
  });

  await prisma.clientScreening.createMany({
    data: [
      { id: "SCR-DEMO-BACKFILL-cli_meron", brokerId: "brk_abyssinia", clientId: "cli_meron", screeningType: "sanctions_pep", provider: "Frank demo screening fixture", result: "clear", reference: "DEMO-SCR-CL-10041", notes: "Demonstration evidence only. Not produced by an external screening provider.", screenedAt: new Date("2026-07-14T08:30:00Z"), recordedBy: "usr_compliance" },
      { id: "SCR-DEMO-BACKFILL-cli_wegagen", brokerId: "brk_abyssinia", clientId: "cli_wegagen", screeningType: "sanctions_pep", provider: "Frank demo screening fixture", result: "clear", reference: "DEMO-SCR-CL-10008", notes: "Demonstration evidence only. Not produced by an external screening provider.", screenedAt: new Date("2026-07-14T08:32:00Z"), recordedBy: "usr_compliance" },
      { id: "SCR-DEMO-BACKFILL-cli_blue", brokerId: "brk_abyssinia", clientId: "cli_blue", screeningType: "sanctions_pep", provider: "Frank demo screening fixture", result: "clear", reference: "DEMO-SCR-CL-10017", notes: "Demonstration evidence only. Not produced by an external screening provider.", screenedAt: new Date("2026-07-14T08:34:00Z"), recordedBy: "usr_compliance" },
      { id: "SCR-DEMO-BACKFILL-cli_investor_demo", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", screeningType: "sanctions_pep", provider: "Frank demo screening fixture", result: "clear", reference: "DEMO-SCR-CL-INV-001", notes: "Demonstration evidence only. Not produced by an external screening provider.", screenedAt: new Date("2026-07-14T08:36:00Z"), recordedBy: "usr_compliance" },
      { id: "SCR-DEMO-BACKFILL-cli_pending_ready", brokerId: "brk_abyssinia", clientId: "cli_pending_ready", screeningType: "sanctions_pep", provider: "Frank demo screening fixture", result: "clear", reference: "DEMO-SCR-CL-2026-P002", notes: "Demonstration evidence only. Not produced by an external screening provider.", screenedAt: new Date("2026-07-16T09:15:00Z"), recordedBy: "usr_compliance" },
      { id: "SCR-DEMO-BACKFILL-cli_recent_approved", brokerId: "brk_abyssinia", clientId: "cli_recent_approved", screeningType: "sanctions_pep", provider: "Frank demo screening fixture", result: "clear", reference: "DEMO-SCR-CL-2026-A001", notes: "Demonstration evidence only. Not produced by an external screening provider.", screenedAt: new Date("2026-07-19T08:30:00Z"), recordedBy: "usr_compliance" },
    ],
    skipDuplicates: true,
  });

  const seededDocument = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
  const seededDocuments = [
    { id: "DOC-INVESTOR-POA", clientId: "cli_investor_demo", documentType: "proof_of_address", originalName: "selam-drivers-license.pdf", source: "investor_portal", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-14T09:00:00Z"), uploadedAt: new Date("2026-07-14T08:00:00Z"), rejectionReason: null },
    { id: "DOC-PENDING-POA", clientId: "cli_pending_demo", documentType: "proof_of_address", originalName: "hana-kebele-id.pdf", source: "in_person", status: "pending_review", reviewedBy: null, reviewedAt: null, uploadedAt: new Date("2026-07-15T09:03:00Z"), rejectionReason: null },
    { id: "DOC-PENDING-READY-POA", clientId: "cli_pending_ready", documentType: "proof_of_address", originalName: "rahel-utility-bill.pdf", source: "digital", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-16T09:10:00Z"), uploadedAt: new Date("2026-07-16T08:25:00Z"), rejectionReason: null },
    { id: "DOC-PENDING-EVIDENCE-POA", clientId: "cli_pending_evidence", documentType: "proof_of_address", originalName: "yonas-bank-letter.pdf", source: "in_person", status: "pending_review", reviewedBy: null, reviewedAt: null, uploadedAt: new Date("2026-07-17T10:09:00Z"), rejectionReason: null },
    { id: "DOC-CORP-LICENSE", clientId: "cli_pending_corporate", documentType: "business_license", originalName: "meskel-business-license.pdf", source: "in_person", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-18T09:10:00Z"), uploadedAt: new Date("2026-07-18T07:48:00Z"), rejectionReason: null },
    { id: "DOC-CORP-TIN", clientId: "cli_pending_corporate", documentType: "tin_certificate", originalName: "meskel-tin-certificate.pdf", source: "in_person", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-18T09:12:00Z"), uploadedAt: new Date("2026-07-18T07:50:00Z"), rejectionReason: null },
    { id: "DOC-CORP-INCORPORATION", clientId: "cli_pending_corporate", documentType: "certificate_of_incorporation", originalName: "meskel-certificate-of-incorporation.pdf", source: "in_person", status: "pending_review", reviewedBy: null, reviewedAt: null, uploadedAt: new Date("2026-07-18T07:52:00Z"), rejectionReason: null },
    { id: "DOC-APPROVED-POA", clientId: "cli_recent_approved", documentType: "proof_of_address", originalName: "saba-utility-bill.pdf", source: "digital", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-19T08:20:00Z"), uploadedAt: new Date("2026-07-18T09:18:00Z"), rejectionReason: null },
    { id: "DOC-REVIEW-DUE-POA", clientId: "cli_review_due_demo", documentType: "proof_of_address", originalName: "tesfaye-bank-letter.pdf", source: "in_person", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2025-07-11T08:30:00Z"), uploadedAt: new Date("2025-07-10T08:10:00Z"), rejectionReason: null },
    { id: "DOC-REJECTED-LICENSE", clientId: "cli_rejected_demo", documentType: "business_license", originalName: "northstar-business-license.pdf", source: "in_person", status: "rejected", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-14T08:45:00Z"), uploadedAt: new Date("2026-07-13T12:08:00Z"), rejectionReason: "License registry details did not match the submitted ownership record." },
  ];
  for (const item of seededDocuments) {
    const document = await prisma.clientDocument.upsert({
      where: { clientId_documentType: { clientId: item.clientId, documentType: item.documentType } },
      create: { ...item, brokerId: "brk_abyssinia", mimeType: "application/pdf", sizeBytes: seededDocument.byteLength },
      update: { originalName: item.originalName, mimeType: "application/pdf", sizeBytes: seededDocument.byteLength, source: item.source, status: item.status, reviewedBy: item.reviewedBy, reviewedAt: item.reviewedAt, uploadedAt: item.uploadedAt, rejectionReason: item.rejectionReason },
    });
    await prisma.clientDocumentContent.upsert({
      where: { documentId: document.id },
      create: { documentId: document.id, bytes: seededDocument },
      update: { bytes: seededDocument },
    });
  }
  // Resolve the canonical demo bank by its ownership key rather than assuming
  // an older demo database still maps a hard-coded ID to the same investor.
  const investorCbeBank = await prisma.linkedBankAccount.upsert({
    where: {
      clientId_bankName_accountNumber: {
        clientId: "cli_investor_demo",
        bankName: "Commercial Bank of Ethiopia",
        accountNumber: "100057894108",
      },
    },
    create: {
      id: "BANK-SELAM-CBE-DEMO",
      brokerId: "brk_abyssinia",
      clientId: "cli_investor_demo",
      bankName: "Commercial Bank of Ethiopia",
      accountNumber: "100057894108",
      accountHolderName: "Selam Mekonnen",
      source: "investor_portal",
      status: "approved",
      reviewedBy: "usr_compliance",
      reviewedAt: new Date("2026-07-14T09:00:00Z"),
    },
    update: {},
  });

  await prisma.linkedBankAccount.createMany({
    data: [
      { id: "BANK-INVESTOR-AWASH", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", bankName: "Awash Bank", accountNumber: "0132098765432", accountHolderName: "Selam Mekonnen", source: "investor_portal", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-14T09:05:00Z") },
      { id: "BANK-PENDING-CBE", brokerId: "brk_abyssinia", clientId: "cli_pending_demo", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057890077", accountHolderName: "Hana Tesfaye", source: "in_person", status: "pending_review" },
      { id: "BANK-PENDING-READY-CBE", brokerId: "brk_abyssinia", clientId: "cli_pending_ready", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057890082", accountHolderName: "Rahel Desta", source: "digital", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-16T09:12:00Z") },
      { id: "BANK-PENDING-EVIDENCE-AWASH", brokerId: "brk_abyssinia", clientId: "cli_pending_evidence", bankName: "Awash Bank", accountNumber: "0132098700093", accountHolderName: "Yonas Lemma", source: "in_person", status: "pending_review" },
      { id: "BANK-PENDING-CORP-CBE", brokerId: "brk_abyssinia", clientId: "cli_pending_corporate", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057890204", accountHolderName: "Meskel Manufacturing PLC", source: "in_person", status: "pending_review" },
      { id: "BANK-APPROVED-CBE", brokerId: "brk_abyssinia", clientId: "cli_recent_approved", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057890104", accountHolderName: "Saba Wolde", source: "digital", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-19T08:25:00Z") },
      { id: "BANK-REVIEW-DUE-CBE", brokerId: "brk_abyssinia", clientId: "cli_review_due_demo", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057890115", accountHolderName: "Tesfaye Kassa", source: "in_person", status: "approved", reviewedBy: "usr_compliance", reviewedAt: new Date("2025-07-11T08:35:00Z") },
      { id: "BANK-REJECTED-CBE", brokerId: "brk_abyssinia", clientId: "cli_rejected_demo", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057890226", accountHolderName: "North Star Import PLC", source: "in_person", status: "rejected", reviewedBy: "usr_compliance", reviewedAt: new Date("2026-07-14T08:47:00Z"), rejectionReason: "Account ownership could not be verified." },
    ],
    skipDuplicates: true,
  });

  await prisma.account.createMany({
    data: [
      { id: "acc_meron", clientId: "cli_meron", accountNumber: "TRD-10041-01", csdReference: "CSD-ET-10041", totalCash: 1_840_500, availableCash: 1_526_850, blockedCash: 313_650, unsettledCash: 0, status: "active" },
      { id: "acc_wegagen", clientId: "cli_wegagen", accountNumber: "TRD-10008-01", totalCash: 12_400_000, availableCash: 10_172_500, blockedCash: 2_227_500, unsettledCash: 0, status: "active" },
      { id: "acc_selam", clientId: "cli_selam", accountNumber: "TRD-10052-01", totalCash: 428_900, availableCash: 428_900, blockedCash: 0, unsettledCash: 0, status: "restricted" },
      // Cash is net of ORD-2026-1046: the captured but unsettled buy of 25,000
      // GOEB-2029 cost 2,508,731.25 (2,496,250 consideration plus 12,481.25 in
      // fees) and left this account when the trade was captured. The bond sits
      // in hld_blue_gb2029 as unsettled quantity until settlement.
      { id: "acc_blue", clientId: "cli_blue", accountNumber: "TRD-10017-01", totalCash: 2_196_568.75, availableCash: 1_611_568.75, blockedCash: 585_000, unsettledCash: 0, status: "active" },
      { id: "acc_investor_demo", clientId: "cli_investor_demo", accountNumber: "INV-00001-01", totalCash: 75_000, availableCash: 75_000, blockedCash: 0, unsettledCash: 0, status: "active" },
      { id: "acc_pending_demo", clientId: "cli_pending_demo", accountNumber: "TRD-2026-P001-01", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "pending_approval", restrictionReason: "Awaiting client onboarding approval" },
      { id: "acc_pending_ready", clientId: "cli_pending_ready", accountNumber: "TRD-2026-P002-01", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "pending_approval", restrictionReason: "Awaiting final client approval" },
      { id: "acc_pending_evidence", clientId: "cli_pending_evidence", accountNumber: "TRD-2026-P003-01", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "pending_approval", restrictionReason: "Onboarding evidence review in progress" },
      { id: "acc_pending_corporate", clientId: "cli_pending_corporate", accountNumber: "TRD-2026-P004-01", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "pending_approval", restrictionReason: "Corporate authority documents awaiting review" },
      { id: "acc_recent_approved", clientId: "cli_recent_approved", accountNumber: "TRD-2026-A001-01", csdReference: "CSD-ET-20101", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "active" },
      { id: "acc_review_due_demo", clientId: "cli_review_due_demo", accountNumber: "TRD-2025-R001-01", csdReference: "CSD-ET-19115", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "restricted", restrictionReason: "Periodic KYC refresh is overdue", restrictedAt: new Date("2026-07-12T08:00:00Z") },
      { id: "acc_rejected_demo", clientId: "cli_rejected_demo", accountNumber: "TRD-2026-X001-01", totalCash: 0, availableCash: 0, blockedCash: 0, unsettledCash: 0, status: "restricted", restrictionReason: "Onboarding rejected: beneficial ownership evidence unverified", restrictedAt: new Date("2026-07-14T08:50:00Z") },
    ],
    skipDuplicates: true,
  });

  // Physical cash is held in safeguarded omnibus accounts while these
  // positions record each investor's exact beneficial share of each pool.
  await prisma.pooledBankAccount.createMany({
    data: [
      // The book balance is already net of the unsettled GOEB-2029 purchase;
      // the statement balance is not, because that cash only leaves the bank
      // when the trade settles. The 2,508,731.25 gap between them is the trade
      // in flight, which is exactly what reconciliation expects to see.
      { id: "pool_aby_general", brokerId: "brk_abyssinia", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", purpose: "general", bookBalance: 13_940_968.75, statementBalance: 16_449_700, status: "active", lastReconciledAt: new Date("2026-07-14T16:00:00Z") },
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
      { id: "pos_blue_general", accountId: "acc_blue", pooledBankAccountId: "pool_aby_general", balance: 2_196_568.75 },
      { id: "pos_investor_general", accountId: "acc_investor_demo", pooledBankAccountId: "pool_aby_general", balance: 75_000 },
      { id: "pos_pending_general", accountId: "acc_pending_demo", pooledBankAccountId: "pool_aby_general", balance: 0 },
    ],
    skipDuplicates: true,
  });
  await prisma.cashMovement.createMany({
    data: [
      { id: "MOV-DEMO-DEP-001", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", pooledBankAccountId: "pool_aby_general", submissionReference: "INV-DEMO-FUND-001", movementType: "deposit", amount: 15_000, status: "pending_verification", bankReference: "CBE-FT-908231", proofReference: "mobile-transfer-receipt", requestedByChannel: "investor_portal", submittedAt: new Date("2026-07-16T08:42:00Z"), notes: "Awaiting independent bank evidence match" },
      { id: "MOV-DEMO-WDR-001", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", pooledBankAccountId: "pool_aby_general", linkedBankAccountId: investorCbeBank.id, submissionReference: "INV-DEMO-WITHDRAW-001", movementType: "withdrawal", amount: 25_000, status: "completed", destinationBankName: "Commercial Bank of Ethiopia", destinationAccountName: "Selam Mekonnen", destinationAccountMasked: "•••••• 894108", requestedByChannel: "investor_portal", submittedAt: new Date("2026-07-12T07:30:00Z"), reviewedAt: new Date("2026-07-12T08:15:00Z"), completedAt: new Date("2026-07-12T11:20:00Z") },
      { id: "MOV-DEMO-DEP-000", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", pooledBankAccountId: "pool_aby_general", submissionReference: "INV-DEMO-FUND-000", movementType: "deposit", amount: 160_869.84, status: "completed", bankReference: "CBE-FT-612704", proofReference: "bank-transfer-receipt", requestedByChannel: "investor_portal", submittedAt: new Date("2026-07-03T06:45:00Z"), reviewedAt: new Date("2026-07-03T08:10:00Z"), completedAt: new Date("2026-07-03T09:05:00Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.instrument.createMany({
    data: [
      { id: "ins_tele", symbol: "TELE", name: "Ethio Telecom", assetClass: "equity", sector: "Telecom", issuer: "Ethio Telecom", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 305 },
      { id: "ins_awab", symbol: "AWAB", name: "Awash Bank", assetClass: "equity", sector: "Banks", issuer: "Awash Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 9_650 },
      { id: "ins_wgbx", symbol: "WGBX", name: "Wegagen Bank", assetClass: "equity", sector: "Banks", issuer: "Wegagen Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 1_742 },
      { id: "ins_gdab", symbol: "GDAB", name: "Gadaa Bank", assetClass: "equity", sector: "Banks", issuer: "Gadaa Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 1_196 },
      { id: "ins_abayb", symbol: "ABAYB", name: "Abay Bank", assetClass: "equity", sector: "Banks", issuer: "Abay Bank", tradingStatus: "tradable", currency: "ETB", lotSize: 10, tickSize: 0.5, settlementCycle: "T+2", lastPrice: 1_808 },
      { id: "ins_goeb_2029", symbol: "GB2029", name: "GoE Treasury Bond 2029", assetClass: "bond", issuer: "Federal Democratic Republic of Ethiopia", tradingStatus: "tradable", currency: "ETB", lotSize: 1, tickSize: 0.01, settlementCycle: "T+2", faceValue: 1_000, maturityDate: dateOnly("2029-07-15"), couponRate: 14.5, couponFrequency: "semi_annual", lastPrice: 99.85 },
      { id: "ins_goeb_2031", symbol: "GB2031", name: "GoE Treasury Bond 2031", assetClass: "bond", issuer: "Federal Democratic Republic of Ethiopia", tradingStatus: "tradable", currency: "ETB", lotSize: 1, tickSize: 0.01, settlementCycle: "T+2", faceValue: 1_000, maturityDate: dateOnly("2031-07-15"), couponRate: 15.2, couponFrequency: "semi_annual", lastPrice: 100.6 },
      { id: "ins_goeb_2036", symbol: "GB2036", name: "GoE Treasury Bond 2036", assetClass: "bond", issuer: "Federal Democratic Republic of Ethiopia", tradingStatus: "halted", currency: "ETB", lotSize: 1, tickSize: 0.01, settlementCycle: "T+2", faceValue: 1_000, maturityDate: dateOnly("2036-07-15"), couponRate: 16, couponFrequency: "semi_annual", lastPrice: 101 },
    ],
    skipDuplicates: true,
  });

  const tenantSettings = [
    { id: "set_brk_abyssinia", brokerId: "brk_abyssinia", tradingName: "Abyssinia Securities", plan: "Enterprise", domain: "invest.abyssinia.et", supportEmail: "support@abyssinia.example", primaryColor: "#0C8189", welcomeMessage: "Access Ethiopian shares and government bonds through one simple platform.", businessDate: dateOnly(addisBusinessDate()), features: { investorPortal: true, selfDirected: true, bonds: true, recurringInvestments: true, institutionalAccounts: true, manualTradeCapture: true, riskComplianceMonitoring: false }, makerChecker: true, approvalThreshold: 250_000, clientDailyLimit: 2_500_000, brokerageFeePct: .5, minimumFee: 25, settlementCycle: "T+2", allowedOrderTypes: ["Market", "Limit", "Stop-loss"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
    { id: "set_brk_blue_nile", brokerId: "brk_blue_nile", tradingName: "Addis Capital", plan: "Growth", domain: "invest.addiscapital.example", supportEmail: "care@addiscapital.example", primaryColor: "#2277C8", welcomeMessage: "A simpler way to own ESX companies and government bonds.", businessDate: dateOnly(addisBusinessDate()), features: { investorPortal: true, selfDirected: true, bonds: true, recurringInvestments: false, institutionalAccounts: true, manualTradeCapture: true, riskComplianceMonitoring: false }, makerChecker: true, approvalThreshold: 100_000, clientDailyLimit: 750_000, brokerageFeePct: .65, minimumFee: 30, settlementCycle: "T+2", allowedOrderTypes: ["Market", "Limit"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
    { id: "set_brk_sheba", brokerId: "brk_sheba", tradingName: "Sheba Advisory", plan: "Pilot", domain: "sheba.frankbroker.demo", supportEmail: "advisory@sheba.example", primaryColor: "#0E9F5B", welcomeMessage: "Manage Ethiopian issuer readiness with clear ownership and evidence.", businessDate: dateOnly(addisBusinessDate()), features: { investorPortal: false, selfDirected: false, bonds: false, recurringInvestments: false, institutionalAccounts: false, manualTradeCapture: false, riskComplianceMonitoring: false }, makerChecker: true, approvalThreshold: 50_000, clientDailyLimit: 250_000, brokerageFeePct: .75, minimumFee: 35, settlementCycle: "T+2", allowedOrderTypes: ["Limit"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
  ];
  for (const settings of tenantSettings) {
    await prisma.brokerSettings.upsert({ where: { brokerId: settings.brokerId }, update: settings, create: settings });
  }

  await prisma.legalDocument.createMany({
    data: [
      { id: "legal_brk_abyssinia_1_0", brokerId: "brk_abyssinia", documentType: "brokerage_terms", title: "Abyssinia Securities Brokerage Account Terms", version: "1.0", language: "en", summary: "Account operation, order handling, fees, confirmations, settlement, client responsibilities, discrepancies, restriction, and closure.", content: "These demonstration brokerage terms explain how the account is opened and operated, how orders are accepted and reviewed, how transaction fees are disclosed, how confirmations and discrepancies are handled, and how an account may be restricted or closed. Replace this text with counsel-approved tenant terms before production.", status: "published", effectiveAt: dateOnly("2026-07-14"), publishedAt: new Date("2026-07-14T07:00:00Z"), requiresReacceptance: true },
      { id: "legal_brk_blue_nile_1_0", brokerId: "brk_blue_nile", documentType: "brokerage_terms", title: "Addis Capital Brokerage Account Terms", version: "1.0", language: "en", summary: "Account operation, order handling, fees, confirmations, settlement, and closure.", content: "Demonstration terms only. Replace with tenant-approved brokerage terms before production use.", status: "published", effectiveAt: dateOnly("2026-07-14"), publishedAt: new Date("2026-07-14T07:00:00Z"), requiresReacceptance: true },
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

  await prisma.platformFeeSchedule.updateMany({
    where: {
      status: "published",
      effectiveFrom: { lt: dateOnly(seededPlatformFeeSchedule.effectiveFrom) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: dateOnly(seededPlatformFeeSchedule.effectiveFrom) } }],
    },
    data: { effectiveTo: dateOnly("2026-08-03") },
  });
  await prisma.platformFeeSchedule.upsert({
    where: { id: seededPlatformFeeSchedule.id },
    update: { name: seededPlatformFeeSchedule.name, status: "published", effectiveFrom: dateOnly(seededPlatformFeeSchedule.effectiveFrom), effectiveTo: null },
    create: {
      id: seededPlatformFeeSchedule.id,
      name: seededPlatformFeeSchedule.name,
      version: seededPlatformFeeSchedule.version,
      status: "published",
      effectiveFrom: dateOnly(seededPlatformFeeSchedule.effectiveFrom),
    },
  });
  for (const rule of seededPlatformFeeSchedule.rules) {
    const id = `platform_fee_${seededPlatformFeeSchedule.version.replaceAll(".", "_")}_${rule.assetClass}_${rule.marketSegment}`;
    await prisma.platformFeeRule.upsert({
      where: { platformFeeScheduleId_assetClass_marketSegment: {
        platformFeeScheduleId: seededPlatformFeeSchedule.id,
        assetClass: rule.assetClass,
        marketSegment: rule.marketSegment,
      } },
      update: { regulatorPct: rule.regulatorPct, exchangePct: rule.exchangePct, csdPct: rule.csdPct },
      create: { id, platformFeeScheduleId: seededPlatformFeeSchedule.id, ...rule },
    });
  }
  await prisma.clientConsent.createMany({
    data: [
      { id: "consent_investor_terms_1_0", clientId: "cli_investor_demo", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "investor_portal", acceptedAt: new Date("2026-07-14T08:00:00Z"), metadata: { electronicDeliveryConsent: true } },
      { id: "consent_meron_terms_1_0", clientId: "cli_meron", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-10T09:15:00Z") },
      { id: "consent_pending_terms_1_0", clientId: "cli_pending_demo", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-15T09:02:00Z"), metadata: { recordedBy: "usr_trader", electronicDeliveryConsent: true } },
      { id: "consent_pending_ready_terms_1_0", clientId: "cli_pending_ready", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-16T08:24:00Z"), metadata: { recordedBy: "usr_relationship", electronicDeliveryConsent: true } },
      { id: "consent_pending_evidence_terms_1_0", clientId: "cli_pending_evidence", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-17T10:08:00Z"), metadata: { recordedBy: "usr_trader", electronicDeliveryConsent: true } },
      { id: "consent_pending_corporate_terms_1_0", clientId: "cli_pending_corporate", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-18T07:45:00Z"), metadata: { recordedBy: "usr_relationship", electronicDeliveryConsent: true } },
      { id: "consent_recent_approved_terms_1_0", clientId: "cli_recent_approved", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-18T09:18:00Z"), metadata: { recordedBy: "usr_relationship", electronicDeliveryConsent: true } },
      { id: "consent_review_due_terms_1_0", clientId: "cli_review_due_demo", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2025-07-10T08:05:00Z"), metadata: { recordedBy: "usr_trader", electronicDeliveryConsent: true } },
      { id: "consent_rejected_terms_1_0", clientId: "cli_rejected_demo", legalDocumentId: "legal_brk_abyssinia_1_0", consentType: "brokerage_terms", version: "1.0", accepted: true, channel: "broker_desk", acceptedAt: new Date("2026-07-13T12:05:00Z"), metadata: { recordedBy: "usr_relationship", electronicDeliveryConsent: false } },
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
      { id: "ORD-INV-0003", brokerId: "brk_abyssinia", submissionReference: "INV-DEMO-ORDER-003", accountId: "acc_investor_demo", instrumentId: "ins_tele", side: "sell", quantity: 10, remainingQuantity: 10, price: 305, orderType: "limit", validity: "day", estimatedGross: 3_050, estimatedFees: 25, estimatedNet: 3_025, status: "validation_failed", source: "investor_portal", riskFlag: "none", rejectionReason: "The price moved outside your limit before broker review.", submittedAt: new Date("2026-07-15T10:18:00Z") },
      { id: "ORD-INV-0002", brokerId: "brk_abyssinia", submissionReference: "INV-DEMO-ORDER-002", accountId: "acc_investor_demo", instrumentId: "ins_wgbx", side: "buy", quantity: 15, filledQuantity: 15, remainingQuantity: 0, averageFillPrice: 1_685, executedGross: 25_275, executedFees: 126.38, executedNet: 25_401.38, price: 1_685, orderType: "limit", validity: "day", estimatedGross: 25_275, estimatedFees: 126.38, estimatedNet: 25_401.38, status: "settled", source: "investor_portal", assignedTraderId: "usr_trader", riskFlag: "none", submittedAt: new Date("2026-07-10T08:35:00Z") },
      { id: "ORD-INV-0001", brokerId: "brk_abyssinia", submissionReference: "INV-DEMO-ORDER-001", accountId: "acc_investor_demo", instrumentId: "ins_tele", side: "buy", quantity: 120, filledQuantity: 120, remainingQuantity: 0, averageFillPrice: 294.1, executedGross: 35_292, executedFees: 176.46, executedNet: 35_468.46, price: 294.1, orderType: "market", validity: "day", estimatedGross: 35_292, estimatedFees: 176.46, estimatedNet: 35_468.46, status: "settled", source: "investor_portal", assignedTraderId: "usr_trader", riskFlag: "none", submittedAt: new Date("2026-07-05T07:55:00Z") },
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
      { id: "TRD-INV-0002", orderId: "ORD-INV-0002", executionPrice: 1_685, quantityFilled: 15, grossAmount: 25_275, fees: 126.38, netAmount: 25_401.38, tradeDate: dateOnly("2026-07-10"), settlementDate: dateOnly("2026-07-14"), capturedBy: "usr_trader", capturedAt: new Date("2026-07-10T09:02:00Z") },
      { id: "TRD-INV-0001", orderId: "ORD-INV-0001", executionPrice: 294.1, quantityFilled: 120, grossAmount: 35_292, fees: 176.46, netAmount: 35_468.46, tradeDate: dateOnly("2026-07-05"), settlementDate: dateOnly("2026-07-07"), capturedBy: "usr_trader", capturedAt: new Date("2026-07-05T08:14:00Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.settlement.createMany({
    data: [
      { id: "STL-0772", tradeId: "TRD-2026-0772", status: "pending", settlementDate: dateOnly("2026-07-16"), cashStatus: "pending", securitiesStatus: "pending" },
      { id: "STL-0768", tradeId: "TRD-2026-0768", status: "settled", settlementDate: dateOnly("2026-07-14"), cashStatus: "settled", securitiesStatus: "settled", confirmedBy: "usr_settlement", confirmedAt: new Date("2026-07-14T09:33:18Z") },
      { id: "STL-INV-0002", tradeId: "TRD-INV-0002", status: "settled", settlementDate: dateOnly("2026-07-14"), cashStatus: "settled", securitiesStatus: "settled", confirmedBy: "usr_settlement", confirmedAt: new Date("2026-07-14T10:05:00Z") },
      { id: "STL-INV-0001", tradeId: "TRD-INV-0001", status: "settled", settlementDate: dateOnly("2026-07-07"), cashStatus: "settled", securitiesStatus: "settled", confirmedBy: "usr_settlement", confirmedAt: new Date("2026-07-07T10:20:00Z") },
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

  // Investor-servicing conversations. Every row is scoped to brk_abyssinia and to
  // one client, and one thread carries an internal note so the privacy boundary
  // is visible in the demo.
  await prisma.communicationThread.createMany({
    data: [
      { id: "THR-DEMO0001", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", subject: "Why was my TELE order held?", category: "order", priority: "high", status: "pending_broker", relatedType: "order", relatedId: "ORD-INV-0003", assignedToUserId: null, openedBy: "investor", messageCount: 3, lastMessageAt: new Date("2026-07-24T09:12:00Z"), lastMessagePreview: "I expected it to fill yesterday - can you check?", brokerUnreadCount: 2, investorUnreadCount: 0, createdAt: new Date("2026-07-24T08:40:00Z") },
      { id: "THR-DEMO0002", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", subject: "Withdrawal still pending", category: "cash", priority: "normal", status: "pending_client", relatedType: "cash_movement", relatedId: "MOV-DEMO-WDR-001", assignedToUserId: "usr_service", openedBy: "investor", messageCount: 2, lastMessageAt: new Date("2026-07-23T14:02:00Z"), lastMessagePreview: "Could you confirm the destination account name?", brokerUnreadCount: 0, investorUnreadCount: 1, createdAt: new Date("2026-07-23T13:20:00Z") },
      { id: "THR-DEMO0003", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", accountId: "acc_investor_demo", subject: "How are my fees calculated?", category: "portfolio", priority: "low", status: "resolved", relatedType: null, relatedId: null, assignedToUserId: "usr_relationship", openedBy: "investor", messageCount: 2, lastMessageAt: new Date("2026-07-20T16:40:00Z"), lastMessagePreview: "Brokerage is 0.65% with a 25 ETB minimum.", brokerUnreadCount: 0, investorUnreadCount: 0, resolvedAt: new Date("2026-07-20T16:41:00Z"), createdAt: new Date("2026-07-20T15:58:00Z") },
      { id: "THR-DEMO0004", brokerId: "brk_abyssinia", clientId: "cli_meron", accountId: "acc_meron", subject: "Please send my mid-year statement", category: "kyc", priority: "normal", status: "pending_broker", relatedType: null, relatedId: null, assignedToUserId: null, openedBy: "investor", messageCount: 1, lastMessageAt: new Date("2026-07-22T09:05:00Z"), lastMessagePreview: "Could you send the mid-year statement for our records?", brokerUnreadCount: 1, investorUnreadCount: 0, createdAt: new Date("2026-07-22T09:05:00Z") },
      { id: "THR-DEMO0005", brokerId: "brk_abyssinia", clientId: "cli_wegagen", accountId: "acc_wegagen", subject: "Contract note shows the wrong fee", category: "complaint", priority: "urgent", status: "open", relatedType: "order", relatedId: "ORD-2026-1046", assignedToUserId: "usr_relationship", openedBy: "investor", messageCount: 1, lastMessageAt: new Date("2026-07-24T07:30:00Z"), lastMessagePreview: "The brokerage on this note does not match what we agreed.", brokerUnreadCount: 1, investorUnreadCount: 0, createdAt: new Date("2026-07-24T07:30:00Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.communicationMessage.createMany({
    data: [
      { id: "MSG-DEMO001", threadId: "THR-DEMO0001", visibility: "shared", authorType: "investor", authorUserId: null, body: "I placed a buy order for TELE yesterday and it still has not filled. Can you check what happened?", createdAt: new Date("2026-07-24T08:40:00Z") },
      { id: "MSG-DEMO002", threadId: "THR-DEMO0001", visibility: "internal", authorType: "system", authorUserId: "usr_trader", body: "Limit price is 4% below the current market. Confirm with the client before amending - do not amend unilaterally.", createdAt: new Date("2026-07-24T08:55:00Z") },
      { id: "MSG-DEMO003", threadId: "THR-DEMO0001", visibility: "shared", authorType: "investor", authorUserId: null, body: "I expected it to fill yesterday - can you check?", createdAt: new Date("2026-07-24T09:12:00Z") },
      { id: "MSG-DEMO004", threadId: "THR-DEMO0002", visibility: "shared", authorType: "investor", authorUserId: null, body: "My withdrawal has not arrived yet. When will it be paid?", createdAt: new Date("2026-07-23T13:20:00Z") },
      { id: "MSG-DEMO005", threadId: "THR-DEMO0002", visibility: "shared", authorType: "broker", authorUserId: "usr_service", body: "Could you confirm the destination account name so we can match the bank record?", createdAt: new Date("2026-07-23T14:02:00Z") },
      { id: "MSG-DEMO006", threadId: "THR-DEMO0003", visibility: "shared", authorType: "investor", authorUserId: null, body: "Can you explain the fees on my last trade?", createdAt: new Date("2026-07-20T15:58:00Z") },
      { id: "MSG-DEMO007", threadId: "THR-DEMO0003", visibility: "shared", authorType: "broker", authorUserId: "usr_relationship", body: "Brokerage is 0.65% with a 25 ETB minimum. Exchange and regulatory fees appear separately on your contract note.", createdAt: new Date("2026-07-20T16:40:00Z") },
      { id: "MSG-DEMO008", threadId: "THR-DEMO0004", visibility: "shared", authorType: "investor", authorUserId: null, body: "Could you send the mid-year statement for our records?", createdAt: new Date("2026-07-22T09:05:00Z") },
      { id: "MSG-DEMO009", threadId: "THR-DEMO0005", visibility: "shared", authorType: "investor", authorUserId: null, body: "The brokerage on this note does not match what we agreed. Please review and correct it.", createdAt: new Date("2026-07-24T07:30:00Z") },
    ],
    skipDuplicates: true,
  });

  // Phase 2 servicing records: one complaint case raised from THR-DEMO0005, the
  // follow-up tasks officers owe investors, and relationship ownership with one
  // handover already in its history.
  await prisma.serviceCase.createMany({
    data: [
      { id: "CASE-DEMO01", brokerId: "brk_abyssinia", clientId: "cli_wegagen", threadId: "THR-DEMO0005", category: "complaint", severity: "high", status: "under_review", subject: "Contract note shows the wrong fee", assignedToUserId: "usr_compliance", openedAt: new Date("2026-07-24T07:45:00Z"), targetResolutionAt: new Date("2026-07-29T07:45:00Z"), internalFindings: "Fee schedule v2 was applied to a trade dated before it took effect. Confirming with settlement before any adjustment." },
      { id: "CASE-DEMO02", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", threadId: null, category: "service_failure", severity: "medium", status: "resolved", subject: "Withdrawal paid three days late", assignedToUserId: "usr_service", openedAt: new Date("2026-07-16T10:00:00Z"), targetResolutionAt: new Date("2026-07-26T10:00:00Z"), resolutionSummary: "The bank file was rejected for a name mismatch and resubmitted the next business day. The investor was called, the payment cleared on 19 July, and the account-name check was added to the payments checklist.", resolvedAt: new Date("2026-07-19T15:30:00Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.crmTask.createMany({
    data: [
      { id: "TSK-DEMO001", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", threadId: "THR-DEMO0001", title: "Call investor about the held TELE order", description: "Explain that the limit sits 4% below market and ask whether they want to amend or cancel.", taskType: "explain_rejected_order", assignedToUserId: "usr_relationship", createdByUserId: "usr_trader", dueDate: new Date("2026-07-24"), priority: "high", status: "open", createdAt: new Date("2026-07-24T09:00:00Z") },
      { id: "TSK-DEMO002", brokerId: "brk_abyssinia", clientId: "cli_meron", threadId: "THR-DEMO0004", title: "Send mid-year statement", description: "Generate the account statement to 30 June and send it through the conversation.", taskType: "request_document", assignedToUserId: "usr_service", createdByUserId: "usr_service", dueDate: new Date("2026-07-26"), priority: "normal", status: "in_progress", createdAt: new Date("2026-07-22T09:30:00Z") },
      { id: "TSK-DEMO003", brokerId: "brk_abyssinia", clientId: "cli_wegagen", threadId: "THR-DEMO0005", caseId: "CASE-DEMO01", title: "Recalculate brokerage on ORD-2026-1046", description: "Confirm which fee schedule version applied on the trade date and prepare the correction for approval.", taskType: "resolve_complaint", assignedToUserId: "usr_compliance", createdByUserId: "usr_relationship", dueDate: new Date("2026-07-23"), priority: "urgent", status: "open", escalated: true, createdAt: new Date("2026-07-24T08:00:00Z") },
      { id: "TSK-DEMO004", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", threadId: "THR-DEMO0002", title: "Confirm destination account name", description: "The bank record and the linked account name do not match exactly.", taskType: "follow_up_withdrawal", assignedToUserId: "usr_service", createdByUserId: "usr_service", dueDate: new Date("2026-07-28"), priority: "normal", status: "awaiting_investor", createdAt: new Date("2026-07-23T14:05:00Z") },
      { id: "TSK-DEMO005", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", threadId: "THR-DEMO0003", title: "Schedule portfolio review", description: "Half-year review call.", taskType: "portfolio_review", assignedToUserId: "usr_relationship", createdByUserId: "usr_relationship", dueDate: new Date("2026-07-20"), priority: "low", status: "completed", completedAt: new Date("2026-07-20T16:45:00Z"), completedByUserId: "usr_relationship", completionNote: "Reviewed fees and holdings on a 20-minute call. The investor is happy to keep the current allocation.", createdAt: new Date("2026-07-18T11:00:00Z") },
      { id: "TSK-DEMO006", brokerId: "brk_abyssinia", clientId: "cli_meron", title: "Review KYC before the annual refresh", description: "Identity documents are due for refresh in September.", taskType: "review_kyc", assignedToUserId: null, createdByUserId: "usr_compliance", dueDate: new Date("2026-08-14"), priority: "normal", status: "open", createdAt: new Date("2026-07-21T08:00:00Z") },
    ],
    skipDuplicates: true,
  });

  await prisma.investorAssignment.createMany({
    data: [
      { id: "ASG-DEMO001", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", primaryOfficerId: "usr_service", team: "Retail servicing", branch: "Addis Ababa", assignedByUserId: "usr_demo_admin", assignedAt: new Date("2026-05-02T08:00:00Z"), endedAt: new Date("2026-07-01T08:00:00Z"), note: "Initial onboarding owner." },
      { id: "ASG-DEMO002", brokerId: "brk_abyssinia", clientId: "cli_investor_demo", primaryOfficerId: "usr_relationship", backupOfficerId: "usr_service", team: "Retail servicing", branch: "Addis Ababa", assignedByUserId: "usr_demo_admin", assignedAt: new Date("2026-07-01T08:00:00Z"), note: "Moved to relationship management after the account went active." },
      { id: "ASG-DEMO003", brokerId: "brk_abyssinia", clientId: "cli_meron", primaryOfficerId: "usr_service", team: "Retail servicing", branch: "Addis Ababa", assignedByUserId: "usr_demo_admin", assignedAt: new Date("2026-06-11T08:00:00Z") },
      { id: "ASG-DEMO004", brokerId: "brk_abyssinia", clientId: "cli_wegagen", primaryOfficerId: "usr_relationship", team: "Corporate servicing", branch: "Addis Ababa", assignedByUserId: "usr_demo_admin", assignedAt: new Date("2026-04-19T08:00:00Z") },
    ],
    skipDuplicates: true,
  });

  // Tenant capability profiles are additive around the legacy broker records.
  const profiles = [
    { tenantId: "brk_abyssinia", businessType: "securities_dealer", entitlements: ["securities_dealing"], modules: { dealer_operations: true, investor_servicing: true, issuer_advisory: false }, licenseType: "securities_dealer", licenseNumber: "ESCA-BR-004" },
    { tenantId: "brk_blue_nile", businessType: "investment_bank", entitlements: ["securities_dealing", "transaction_advisory"], modules: { dealer_operations: true, investor_servicing: true, issuer_advisory: true }, licenseType: "investment_bank", licenseNumber: "ESCA-BR-011" },
    { tenantId: "brk_sheba", businessType: "securities_investment_adviser", entitlements: ["transaction_advisory"], modules: { dealer_operations: false, investor_servicing: false, issuer_advisory: true }, licenseType: "securities_investment_adviser", licenseNumber: "PILOT-023" },
  ] as const;
  for (const profile of profiles) {
    await prisma.tenantProfile.upsert({ where: { tenantId: profile.tenantId }, update: { businessType: profile.businessType }, create: { tenantId: profile.tenantId, businessType: profile.businessType } });
    await prisma.tenantLicense.upsert({ where: { tenantId_licenseNumber: { tenantId: profile.tenantId, licenseNumber: profile.licenseNumber } }, update: { licenseType: profile.licenseType, status: "active" }, create: { id: `lic_${profile.tenantId}`, tenantId: profile.tenantId, regulator: "ECMA", licenseType: profile.licenseType, licenseNumber: profile.licenseNumber, status: "active", validFrom: dateOnly("2025-01-01") } });
    for (const activityKey of profile.entitlements) await prisma.tenantEntitlement.upsert({ where: { tenantId_activityKey: { tenantId: profile.tenantId, activityKey } }, update: { status: "active" }, create: { id: `ent_${profile.tenantId}_${activityKey}`, tenantId: profile.tenantId, activityKey, basis: profile.licenseNumber, status: "active" } });
    for (const [moduleKey, enabled] of Object.entries(profile.modules)) await prisma.tenantModule.upsert({ where: { tenantId_moduleKey: { tenantId: profile.tenantId, moduleKey } }, update: { enabled }, create: { id: `mod_${profile.tenantId}_${moduleKey}`, tenantId: profile.tenantId, moduleKey, enabled } });
  }

  const sources = {
    publicOffer: { title: "ECMA Public Offering and Trading Directive 1030/2024", url: "https://ecma.gov.et/po/" },
    listing: { title: "ESX Rulebook and Guide to Listing", url: "https://esx.et/wp-content/uploads/2025/04/IPO-Guide-ESX-v3.pdf" },
    demat: { title: "ECMA Dematerialization Directive 1047/2025", url: "https://ecma.gov.et/demat/" },
    otc: { title: "ESX OTC Rules — May 2026 amendment", url: "https://esx.et/wp-content/uploads/2026/05/OTC-rule-Book_First-Amendment-may-6-2026-WC-1.pdf" },
  };
  const ipoItems = [
    ["mandate", "Mandate & appointments", "Confirm the transaction mandate and licensed professional appointments.", "Signed mandate and appointment letters", sources.publicOffer, "Articles 8 and 77"],
    ["issuer_eligibility", "Issuer eligibility", "Confirm the issuer is legally eligible to make a public offer.", "Legal opinion, incorporation records and issuer resolutions", sources.publicOffer, "Article 6"],
    ["market_eligibility", "Market eligibility", "Assess the selected ESX market segment and document every applicable threshold.", "Eligibility assessment with supporting calculations", sources.listing, "Initial listing requirements"],
    ["financial_statements", "Financial reporting", "Collect the required audited financial statements and resolve material qualifications.", "Signed audited financial statements and audit opinion", sources.listing, "Main/Growth financial statement requirements"],
    ["public_float", "Capital and public float", "Evidence fully paid, transferable shares, equal class rights, capitalization and planned public float.", "Capital table and shareholder distribution analysis", sources.listing, "Capital and public float requirements"],
    ["due_diligence", "Due diligence", "Coordinate legal, financial, tax, governance and commercial due diligence.", "Signed due-diligence reports and issue tracker", sources.publicOffer, "Registration statement requirements"],
    ["risks_contracts", "Risks and material matters", "Record material contracts, litigation, related parties and principal risks.", "Material contracts register and risk disclosures", sources.publicOffer, "Prospectus content requirements"],
    ["valuation", "Valuation and expert evidence", "Track the externally prepared valuation, pricing evidence and expert consents.", "Valuation report, pricing memorandum and expert consents", sources.publicOffer, "Prospectus expert disclosures"],
    ["prospectus", "ECMA registration and prospectus", "Track completion, approval and publication of the registration statement and prospectus.", "Filed registration statement and ECMA-approved prospectus", sources.publicOffer, "Articles 8, 34, 51 and 52"],
    ["advertising", "Offer communications", "Confirm public-offer advertisements and communications have required approval.", "Approved advertising and communication register", sources.publicOffer, "Article 53"],
    ["esx_application", "ESX application", "Track listing application documents, fees, comments and admission decision.", "ESX application pack, fee evidence and decision", sources.listing, "Application documents"],
    ["dematerialization", "CSD and dematerialization", "Prepare the share register and dematerialization evidence for CSD readiness.", "CSD confirmation and reconciled shadow register", sources.demat, "Dematerialization and CSD registration"],
    ["offer_readiness", "Offer and trading readiness", "Track allotment, refund and first-day readiness evidence without operating the bookbuild in Frank.", "Allotment controls, reconciliation and launch checklist", sources.publicOffer, "Offer administration requirements"],
  ] as const;
  const otcItems = [
    ["registration_basis", "ECMA registration basis", "Confirm ECMA registration or the applicable exemption and information memorandum route.", "ECMA registration evidence or exemption memorandum", sources.publicOffer, "Articles 4, 29, 30 and 34"],
    ["issuer_approvals", "Issuer and adviser approvals", "Confirm issuer resolutions, mandate and licensed adviser responsibility.", "Board/shareholder resolutions and signed mandate", sources.publicOffer, "Registration statement requirements"],
    ["otc_application", "ESX OTC application", "Complete the prescribed OTC admission application.", "Completed ESX OTC application form", sources.otc, "Rule 3.3(1)(a)"],
    ["offer_document", "Approved offer document", "Provide the ECMA-approved prospectus or relevant information memorandum.", "Approved prospectus or information memorandum", sources.otc, "Rule 3.3(1)(b)"],
    ["ecma_reports", "Current ECMA reports", "Collect the latest periodic and current reports filed with ECMA.", "Latest ECMA filing acknowledgements and reports", sources.otc, "Rule 3.3(1)(c)"],
    ["constitutional_docs", "Constitutional documents", "Collect the issuer's memorandum and constitutional records.", "Memorandum of Association and amendments", sources.otc, "Rule 3.3(1)(d)"],
    ["annual_report", "Latest annual report", "Confirm the latest annual report has been filed and is included.", "Filed annual report", sources.otc, "Rule 3.3(1)(e)"],
    ["dematerialization", "CSD readiness", "Confirm the securities are eligible and admitted for dematerialized settlement.", "CSD admission and reconciled security register", sources.demat, "Directive 1047/2025"],
    ["admission_readiness", "Fees, disclosures and admission queries", "Close ESX queries, evidence fees and confirm ongoing disclosure ownership.", "Fee receipt, query log and disclosure calendar", sources.otc, "Rules 3.3 and ongoing obligations"],
  ] as const;

  const templates = [
    { id: "tpl_ipo_main_v1", code: "ETH-IPO-MAIN", version: "1.0", transactionType: "ipo", marketSegment: "main", title: "Ethiopian IPO — Main Market", items: ipoItems },
    { id: "tpl_ipo_growth_v1", code: "ETH-IPO-GROWTH", version: "1.0", transactionType: "ipo", marketSegment: "growth", title: "Ethiopian IPO — Growth Market", items: ipoItems },
    { id: "tpl_otc_v1", code: "ETH-OTC-ADMISSION", version: "1.0", transactionType: "otc_admission", marketSegment: "otc", title: "Ethiopian OTC Admission", items: otcItems },
  ] as const;
  for (const template of templates) {
    await prisma.checklistTemplate.upsert({ where: { id: template.id }, update: { title: template.title, status: "published" }, create: { id: template.id, code: template.code, version: template.version, transactionType: template.transactionType, marketSegment: template.marketSegment, title: template.title, status: "published", effectiveFrom: dateOnly("2026-05-06"), sourceSet: Object.values(sources) } });
    await prisma.checklistTemplateItem.createMany({ data: template.items.map((item, index) => ({ id: `${template.id}_${item[0]}`, templateId: template.id, itemCode: item[0], section: item[1], title: item[1], guidance: item[2], expectedEvidence: item[3], required: true, sortOrder: (index + 1) * 10, sourceTitle: item[4].title, sourceUrl: item[4].url, sourceReference: item[5] })), skipDuplicates: true });
    for (const tenantId of ["brk_blue_nile", "brk_sheba"]) await prisma.tenantChecklistPack.upsert({ where: { tenantId_templateId: { tenantId, templateId: template.id } }, update: { enabled: true }, create: { id: `pack_${tenantId}_${template.id}`, tenantId, templateId: template.id, enabled: true } });
  }

  await prisma.issuer.createMany({ data: [
    { id: "iss_blue_awash_foods", tenantId: "brk_blue_nile", legalName: "Awash Foods Share Company", tradingName: "Awash Foods", entityType: "share_company", registrationNumber: "SC-AA-2012-4481", tinReference: "TIN-100-884-21", sector: "Consumer goods", contactName: "Marta Alemu", contactEmail: "marta@awashfoods.example", status: "active" },
    { id: "iss_blue_rift_logistics", tenantId: "brk_blue_nile", legalName: "Rift Valley Logistics S.C.", tradingName: "Rift Logistics", entityType: "share_company", registrationNumber: "SC-AA-2018-9021", sector: "Logistics", contactName: "Yonatan Bekele", contactEmail: "yonatan@riftlogistics.example", status: "active" },
    { id: "iss_sheba_highland", tenantId: "brk_sheba", legalName: "Highland Manufacturing S.C.", tradingName: "Highland Manufacturing", entityType: "share_company", registrationNumber: "SC-OR-2015-3308", sector: "Manufacturing", contactName: "Eden Girma", contactEmail: "eden@highland.example", status: "active" },
  ], skipDuplicates: true });

  await prisma.advisoryDeal.createMany({ data: [
    { id: "deal_blue_awash_ipo", tenantId: "brk_blue_nile", issuerId: "iss_blue_awash_foods", checklistTemplateId: "tpl_ipo_main_v1", name: "Awash Foods IPO readiness", transactionType: "ipo", marketSegment: "main", mandateReference: "AC-IB-2026-014", leadUserId: "usr_advisory_lead", stage: "due_diligence", status: "active", targetDate: dateOnly("2026-12-15"), createdByUserId: "usr_advisory_lead" },
    { id: "deal_blue_rift_otc", tenantId: "brk_blue_nile", issuerId: "iss_blue_rift_logistics", checklistTemplateId: "tpl_otc_v1", name: "Rift Logistics OTC admission", transactionType: "otc_admission", marketSegment: "otc", mandateReference: "AC-IB-2026-021", leadUserId: "usr_advisory_lead", stage: "readiness", status: "active", targetDate: dateOnly("2026-10-30"), createdByUserId: "usr_advisory_lead" },
    { id: "deal_sheba_highland_ipo", tenantId: "brk_sheba", issuerId: "iss_sheba_highland", checklistTemplateId: "tpl_ipo_growth_v1", name: "Highland Manufacturing Growth Market", transactionType: "ipo", marketSegment: "growth", mandateReference: "SHA-2026-003", leadUserId: "usr_sheba_advisory_lead", stage: "readiness", status: "active", targetDate: dateOnly("2027-02-15"), createdByUserId: "usr_sheba_advisory_lead" },
  ], skipDuplicates: true });
  for (const deal of [{ id: "deal_blue_awash_ipo", tenantId: "brk_blue_nile", templateId: "tpl_ipo_main_v1" }, { id: "deal_blue_rift_otc", tenantId: "brk_blue_nile", templateId: "tpl_otc_v1" }, { id: "deal_sheba_highland_ipo", tenantId: "brk_sheba", templateId: "tpl_ipo_growth_v1" }]) {
    const items = await prisma.checklistTemplateItem.findMany({ where: { templateId: deal.templateId }, orderBy: { sortOrder: "asc" } });
    const analystId = deal.tenantId === "brk_blue_nile" ? "usr_advisory_analyst" : "usr_sheba_advisory_analyst";
    const leadId = deal.tenantId === "brk_blue_nile" ? "usr_advisory_lead" : "usr_sheba_advisory_lead";
    await prisma.dealChecklistItem.createMany({ data: items.map((item, index) => ({ id: `chk_${deal.id}_${item.itemCode}`, tenantId: deal.tenantId, dealId: deal.id, templateItemId: item.id, itemCode: item.itemCode, section: item.section, title: item.title, guidance: item.guidance, expectedEvidence: item.expectedEvidence, required: item.required, sortOrder: item.sortOrder, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sourceReference: item.sourceReference, ownerUserId: analystId, status: index < 2 ? "satisfied" : index === 2 ? "pending_approval" : index === 5 ? "blocked" : "in_progress", preparedByUserId: index < 3 ? analystId : null, preparedAt: index < 3 ? new Date("2026-07-29T09:00:00Z") : null, reviewedByUserId: index < 2 ? leadId : null, reviewedAt: index < 2 ? new Date("2026-07-30T10:00:00Z") : null, dueDate: new Date(`2026-${String(Math.min(12, 8 + Math.floor(index / 4))).padStart(2, "0")}-${String(10 + index).padStart(2, "0")}`) })), skipDuplicates: true });
  }
  await prisma.dealParty.createMany({ data: [
    { id: "party_awash_issuer", tenantId: "brk_blue_nile", dealId: "deal_blue_awash_ipo", partyRole: "issuer", organization: "Awash Foods S.C.", contactName: "Marta Alemu", email: "marta@awashfoods.example" },
    { id: "party_awash_legal", tenantId: "brk_blue_nile", dealId: "deal_blue_awash_ipo", partyRole: "legal_counsel", organization: "Addis Legal Partners", contactName: "Ruth Worku", email: "ruth@addislegal.example" },
    { id: "party_awash_auditor", tenantId: "brk_blue_nile", dealId: "deal_blue_awash_ipo", partyRole: "auditor", organization: "Meridian Audit LLP", contactName: "Kebede Tadesse" },
  ], skipDuplicates: true });
  await prisma.dealTask.createMany({ data: [
    { id: "dtask_awash_financials", tenantId: "brk_blue_nile", dealId: "deal_blue_awash_ipo", title: "Resolve audit qualification follow-up", assignedToUserId: "usr_advisory_analyst", createdByUserId: "usr_advisory_lead", dueDate: dateOnly("2026-08-08"), priority: "high", status: "in_progress" },
    { id: "dtask_rift_reports", tenantId: "brk_blue_nile", dealId: "deal_blue_rift_otc", title: "Collect latest ECMA periodic reports", assignedToUserId: "usr_advisory_analyst", createdByUserId: "usr_advisory_lead", dueDate: dateOnly("2026-08-12"), priority: "normal", status: "open" },
  ], skipDuplicates: true });
  await prisma.dealSubmission.createMany({ data: [
    { id: "sub_awash_ecma", tenantId: "brk_blue_nile", dealId: "deal_blue_awash_ipo", authority: "ECMA", submissionType: "pre_filing_consultation", reference: "ECMA-PFC-2026-118", status: "response_received", submittedAt: new Date("2026-07-18T08:30:00Z"), submittedBy: "usr_advisory_lead", responseDueAt: dateOnly("2026-08-06") },
  ], skipDuplicates: true });
  await prisma.regulatoryQuery.createMany({ data: [
    { id: "qry_awash_001", tenantId: "brk_blue_nile", submissionId: "sub_awash_ecma", reference: "Q-03", question: "Provide reconciliation between the audited share capital and the latest shareholder register.", ownerUserId: "usr_advisory_analyst", receivedAt: new Date("2026-07-25T10:00:00Z"), dueDate: dateOnly("2026-08-07"), status: "open" },
  ], skipDuplicates: true });
  await prisma.dealDocument.createMany({ data: [
    { id: "doc_awash_valuation", tenantId: "brk_blue_nile", dealId: "deal_blue_awash_ipo", checklistItemId: "chk_deal_blue_awash_ipo_valuation", title: "Independent valuation report", documentType: "valuation_report", ownerUserId: "usr_advisory_analyst", expectedDate: dateOnly("2026-08-20"), status: "linked", externalUrl: "https://data-room.example/awash-foods/valuation" },
    { id: "doc_rift_annual", tenantId: "brk_blue_nile", dealId: "deal_blue_rift_otc", checklistItemId: "chk_deal_blue_rift_otc_annual_report", title: "Latest annual report", documentType: "annual_report", ownerUserId: "usr_advisory_analyst", expectedDate: dateOnly("2026-08-10"), status: "expected" },
  ], skipDuplicates: true });

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
