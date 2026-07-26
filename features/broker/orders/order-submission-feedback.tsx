"use client";

import type { OrderSubmissionOutcome } from "../../../lib/order-submission-ux";

export function BrokerOrderOutcomeDialog({ outcome, onClose, onViewOrder, onReturnToEntry }: {
  outcome: OrderSubmissionOutcome;
  onClose: () => void;
  onViewOrder: () => void;
  onReturnToEntry: () => void;
}) {
  const submitted = outcome.kind === "submitted";
  const held = outcome.kind === "held";
  const uncertain = outcome.kind === "submission_uncertain";
  const tone = submitted ? "success" : held || uncertain ? "warning" : "error";
  return <div className="broker-outcome-scrim" role="presentation">
    <section className="broker-outcome-dialog" role={submitted ? "status" : "alertdialog"} aria-modal="true" aria-labelledby="broker-order-outcome-title">
      <div className="broker-outcome-icon" data-tone={tone}>{submitted ? "✓" : held || uncertain ? "!" : "×"}</div>
      <span className="eyebrow">{submitted ? "OMS RECORD CREATED" : held ? "CONTROL HOLD" : uncertain ? "VERIFY BEFORE RETRY" : "NOT SUBMITTED"}</span>
      <h2 id="broker-order-outcome-title">{outcome.title}</h2>
      {outcome.orderId && <div className="broker-outcome-reference"><small>ORDER ID</small><b>{outcome.orderId}</b></div>}
      <p>{outcome.message}</p>
      {outcome.detail && <div className="broker-outcome-detail"><b>Detail</b><span>{outcome.detail}</span></div>}
      <div className="broker-outcome-next"><b>Next step</b><span>{outcome.nextStep}</span></div>
      <div className="broker-outcome-actions">
        {submitted || held || uncertain
          ? <><button className="btn secondary" onClick={onClose}>Close</button><button className="btn primary" onClick={onViewOrder}>{outcome.orderId ? "Open order" : "Check order log"}</button></>
          : <><button className="btn secondary" onClick={onClose}>Close</button><button className="btn primary" onClick={onReturnToEntry}>Return to entry</button></>}
      </div>
    </section>
  </div>;
}
