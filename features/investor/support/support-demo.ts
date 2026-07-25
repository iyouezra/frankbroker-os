import type { SupportThreadSummary } from "./support-screen";
import type { SupportThreadDetail } from "./support-thread-screen";

/**
 * Offline demonstration conversations for the investor support centre, so the
 * portal still renders without a database. These contain only investor-visible
 * content — there is no internal-note concept on this side at all.
 */
export const fallbackSupportThreads: SupportThreadSummary[] = [
  {
    id: "THR-DEMO01", subject: "Why was my TELE order held?", category: "order", status: "pending_broker",
    statusLabel: "Waiting for broker", relatedType: "order", relatedId: "ORD-INV-0003", messageCount: 2,
    lastMessageAt: "2026-07-24T09:12:00Z", lastMessagePreview: "I expected it to fill yesterday — can you check?",
    unread: 0, createdAt: "2026-07-24T08:40:00Z",
  },
  {
    id: "THR-DEMO04", subject: "Adding a second bank account", category: "kyc", status: "pending_client",
    statusLabel: "Waiting for you", relatedType: null, relatedId: null, messageCount: 2,
    lastMessageAt: "2026-07-23T11:15:00Z", lastMessagePreview: "Could you send a recent bank statement?",
    unread: 1, createdAt: "2026-07-23T10:02:00Z",
  },
  {
    id: "THR-DEMO05", subject: "How are my fees calculated?", category: "portfolio", status: "resolved",
    statusLabel: "Resolved", relatedType: null, relatedId: null, messageCount: 2,
    lastMessageAt: "2026-07-20T16:40:00Z", lastMessagePreview: "Brokerage is 0.65% with a 25 ETB minimum.",
    unread: 0, createdAt: "2026-07-20T15:58:00Z",
  },
];

const details: Record<string, SupportThreadDetail> = {
  "THR-DEMO01": {
    id: "THR-DEMO01", subject: "Why was my TELE order held?", status: "pending_broker", statusLabel: "Waiting for broker",
    relatedType: "order", relatedId: "ORD-INV-0003",
    messages: [
      { id: "M1", body: "I placed a buy order for TELE yesterday and it still has not filled. Can you check what happened?", createdAt: "2026-07-24T08:40:00Z", mine: true, authorLabel: "You", attachments: [] },
      { id: "M2", body: "I expected it to fill yesterday — can you check?", createdAt: "2026-07-24T09:12:00Z", mine: true, authorLabel: "You", attachments: [] },
    ],
  },
  "THR-DEMO04": {
    id: "THR-DEMO04", subject: "Adding a second bank account", status: "pending_client", statusLabel: "Waiting for you",
    relatedType: null, relatedId: null,
    messages: [
      { id: "M3", body: "I would like to add a second bank account for withdrawals.", createdAt: "2026-07-23T10:02:00Z", mine: true, authorLabel: "You", attachments: [] },
      { id: "M4", body: "Could you send a recent bank statement showing the account name?", createdAt: "2026-07-23T11:15:00Z", mine: false, authorLabel: "Your broker", attachments: [] },
    ],
  },
  "THR-DEMO05": {
    id: "THR-DEMO05", subject: "How are my fees calculated?", status: "resolved", statusLabel: "Resolved",
    relatedType: null, relatedId: null,
    messages: [
      { id: "M5", body: "Can you explain the fees on my last trade?", createdAt: "2026-07-20T15:58:00Z", mine: true, authorLabel: "You", attachments: [] },
      { id: "M6", body: "Brokerage is 0.65% with a 25 ETB minimum. Exchange and regulatory fees are shown separately on your contract note.", createdAt: "2026-07-20T16:40:00Z", mine: false, authorLabel: "Your broker", attachments: [] },
    ],
  },
};

export const fallbackSupportDetail = (threadId: string): SupportThreadDetail | null => details[threadId] ?? null;
