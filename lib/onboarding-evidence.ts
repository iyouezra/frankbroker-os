import { Prisma } from "../app/generated/prisma/client";

export const DOCUMENT_TYPES = [
  "proof_of_address",
  "business_license",
  "tin_certificate",
  "certificate_of_incorporation",
  "article_of_association",
] as const;

export type ClientDocumentType = typeof DOCUMENT_TYPES[number];
export type OnboardingSource = "investor_portal" | "digital" | "in_person" | "neway" | "phone";
export type LinkedBankInput = {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
};
export type PreparedDocument = {
  documentType: ClientDocumentType;
  originalName: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  sizeBytes: number;
  bytes: Uint8Array;
};
export interface ClientDocumentStorage {
  put(tx: Prisma.TransactionClient, documentId: string, bytes: Uint8Array): Promise<void>;
}

export const databaseClientDocumentStorage: ClientDocumentStorage = {
  async put(tx, documentId, bytes) {
    await tx.clientDocumentContent.upsert({
      where: { documentId },
      create: { documentId, bytes: Buffer.from(bytes) },
      update: { bytes: Buffer.from(bytes) },
    });
  },
};

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const supportedMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

function fail(message: string, status = 400): never {
  throw new Response(message, { status });
}

export function normalizeBankAccountNumber(value: string) {
  return value.replace(/\s/g, "").trim();
}

export function maskBankAccount(value: string) {
  const normalized = normalizeBankAccountNumber(value);
  const visible = normalized.slice(-6);
  return visible ? `•••••• ${visible}` : "";
}

export function expectedDocumentTypes(clientType: string): ClientDocumentType[] {
  return clientType === "individual"
    ? ["proof_of_address"]
    : ["business_license", "tin_certificate", "certificate_of_incorporation", "article_of_association"];
}

function matchesSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8
      && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function prepareDocument(documentType: ClientDocumentType, file: File): Promise<PreparedDocument> {
  if (!supportedMimeTypes.has(file.type)) fail("Documents must be PDF, PNG, or JPG files.");
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) fail("Each document must be no larger than 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(bytes, file.type)) fail("The document content does not match its file type.");
  const originalName = file.name.trim().slice(0, 240);
  if (!originalName) fail("The uploaded document needs a file name.");
  return {
    documentType,
    originalName,
    mimeType: file.type as PreparedDocument["mimeType"],
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

export async function prepareDocuments(formData: FormData) {
  const documents: PreparedDocument[] = [];
  for (const documentType of DOCUMENT_TYPES) {
    const value = formData.get(documentType);
    if (value instanceof File && value.size > 0) documents.push(await prepareDocument(documentType, value));
  }
  return documents;
}

export function parseLinkedBanks(value: unknown): LinkedBankInput[] {
  let input = value;
  if (typeof value === "string") {
    try {
      input = JSON.parse(value);
    } catch {
      fail("Linked bank details are not valid.");
    }
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) {
    fail("Add between one and three linked bank accounts.");
  }
  const banks = input.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const bankName = String(record.bankName ?? "").trim().slice(0, 120);
    const accountNumber = normalizeBankAccountNumber(String(record.accountNumber ?? "")).slice(0, 64);
    const accountHolderName = String(record.accountHolderName ?? "").trim().slice(0, 160);
    if (bankName.length < 2 || !/^\d{8,64}$/.test(accountNumber) || accountHolderName.length < 3) {
      fail("Each linked bank needs a bank name, account number, and account holder name.");
    }
    return { bankName, accountNumber, accountHolderName };
  });
  const unique = new Set(banks.map((bank) => `${bank.bankName.toLocaleLowerCase()}|${bank.accountNumber}`));
  if (unique.size !== banks.length) fail("The same bank account cannot be linked more than once.");
  return banks;
}

export function validateBankHolderName(banks: LinkedBankInput[], legalName: string) {
  const normalizedName = legalName.trim().toLocaleLowerCase();
  if (banks.some((bank) => bank.accountHolderName.trim().toLocaleLowerCase() !== normalizedName)) {
    fail("Account holder name must match the verified legal name.");
  }
}

export async function saveOnboardingEvidence(
  tx: Prisma.TransactionClient,
  input: {
    brokerId: string;
    clientId: string;
    source: OnboardingSource;
    legalName: string;
    clientType: string;
    documents: PreparedDocument[];
    banks: LinkedBankInput[];
    replaceBanks?: boolean;
    storage?: ClientDocumentStorage;
  },
) {
  validateBankHolderName(input.banks, input.legalName);
  const applicableDocuments = new Set(expectedDocumentTypes(input.clientType));
  if (input.documents.some((document) => !applicableDocuments.has(document.documentType))) {
    fail("One or more documents do not apply to this client type.");
  }
  if (input.replaceBanks) {
    await tx.linkedBankAccount.deleteMany({ where: { clientId: input.clientId } });
  }
  for (const document of input.documents) {
    const existing = await tx.clientDocument.findUnique({
      where: { clientId_documentType: { clientId: input.clientId, documentType: document.documentType } },
    });
    const documentId = existing?.id ?? `DOC-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
    await tx.clientDocument.upsert({
      where: { clientId_documentType: { clientId: input.clientId, documentType: document.documentType } },
      create: {
        id: documentId,
        brokerId: input.brokerId,
        clientId: input.clientId,
        documentType: document.documentType,
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        source: input.source,
      },
      update: {
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        source: input.source,
        status: "pending_review",
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        uploadedAt: new Date(),
      },
    });
    await (input.storage ?? databaseClientDocumentStorage).put(tx, documentId, document.bytes);
  }
  for (const bank of input.banks) {
    await tx.linkedBankAccount.create({
      data: {
        id: `BANK-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
        brokerId: input.brokerId,
        clientId: input.clientId,
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        accountHolderName: bank.accountHolderName,
        source: input.source,
      },
    });
  }
}

export function serializeClientDocument(document: {
  id: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  source: string;
  status: string;
  uploadedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  content?: unknown;
}) {
  return {
    id: document.id,
    type: document.documentType,
    name: document.originalName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    source: document.source,
    status: document.status,
    uploadedAt: document.uploadedAt.toISOString(),
    reviewedAt: document.reviewedAt?.toISOString() ?? null,
    rejectionReason: document.rejectionReason,
    hasFile: document.sizeBytes > 0 && Boolean(document.content),
  };
}

export function serializeLinkedBank(bank: {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  source: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}) {
  return {
    id: bank.id,
    bankName: bank.bankName,
    accountNumberMasked: maskBankAccount(bank.accountNumber),
    accountHolderName: bank.accountHolderName,
    source: bank.source,
    status: bank.status,
    createdAt: bank.createdAt.toISOString(),
    reviewedAt: bank.reviewedAt?.toISOString() ?? null,
    rejectionReason: bank.rejectionReason,
  };
}
