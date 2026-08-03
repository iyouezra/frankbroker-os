import type { TranslationKey } from "./en";

/**
 * Investor-facing status labels.
 *
 * `getInvestorActivityStatus` in `lib/investor-activity.ts` is a plain function
 * that cannot call a hook, so components translate the status themselves using
 * this map. Anything not listed here falls back to that function's English
 * label, which keeps unknown statuses readable rather than blank.
 *
 * The keys are the internal status values and must never be translated.
 */
export const INVESTOR_STATUS_KEYS: Record<string, TranslationKey> = {
  approved: "status.open",
  cancelled: "status.cancelled",
  completed: "status.completed",
  failed: "status.failed",
  filled: "status.completed",
  partially_filled: "status.partlyFilled",
  pending: "status.pending",
  pending_broker_review: "status.waitingForBroker",
  pending_review: "status.underReview",
  pending_verification: "status.pendingVerification",
  rejected: "status.notApproved",
  settlement_pending: "status.settlementPending",
  settled: "status.completed",
  under_review: "status.underReview",
  validation_failed: "status.notApproved",
};
