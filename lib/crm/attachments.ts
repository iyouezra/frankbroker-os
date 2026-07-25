/**
 * Conversation attachments. Reuses the onboarding evidence validators rather
 * than duplicating the magic-byte table, so both upload paths enforce identical
 * limits: 10 MB, PDF/PNG/JPEG only, and the declared MIME type must match the
 * file's actual signature.
 */

import { MAX_DOCUMENT_BYTES, matchesSignature, supportedMimeTypes } from "../onboarding-evidence";

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export type PreparedAttachment = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
};

function fail(message: string, status = 400): never {
  throw new Response(message, { status });
}

/** Strips characters that would break a Content-Disposition header. */
export function sanitizeAttachmentName(value: string): string {
  return value.replace(/[\r\n"]/g, "_").trim().slice(0, 240) || "attachment";
}

export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (!supportedMimeTypes.has(file.type)) fail("Attachments must be PDF, PNG, or JPG files.");
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) fail("Each attachment must be no larger than 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(bytes, file.type)) fail("The attachment content does not match its file type.");
  return {
    originalName: sanitizeAttachmentName(file.name || "attachment"),
    mimeType: file.type,
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

/**
 * Reads `attachment0..attachment{n}` from a multipart form. Only these known
 * keys are read, so stray form fields are ignored.
 */
/**
 * Byte response for a stored attachment. Header set matches the existing client
 * document download route so both paths are private, non-sniffable, and safe
 * against header injection through a filename.
 */
export function attachmentResponse(
  attachment: { originalName: string; mimeType: string; sizeBytes: number; content: { bytes: Uint8Array } },
  requestUrl: string,
): Response {
  const disposition = new URL(requestUrl).searchParams.get("download") === "1" ? "attachment" : "inline";
  const safeName = sanitizeAttachmentName(attachment.originalName);
  return new Response(new Uint8Array(attachment.content.bytes), {
    headers: {
      "content-type": attachment.mimeType,
      "content-length": String(attachment.sizeBytes),
      "content-disposition": `${disposition}; filename="${safeName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function prepareAttachments(formData: FormData): Promise<PreparedAttachment[]> {
  const files: File[] = [];
  for (let index = 0; index < MAX_ATTACHMENTS_PER_MESSAGE + 1; index += 1) {
    const entry = formData.get(`attachment${index}`);
    if (entry instanceof File && entry.size > 0) files.push(entry);
  }
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    fail(`Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files to a message.`);
  }
  const prepared: PreparedAttachment[] = [];
  for (const file of files) prepared.push(await prepareAttachment(file));
  return prepared;
}
