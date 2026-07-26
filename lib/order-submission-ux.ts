export type OrderEntryChannel = "investor_portal" | "digital" | "phone" | "in_person" | "neway";
export type OrderSubmissionOutcomeKind =
  | "submitted"
  | "held"
  | "authorization_failed"
  | "submission_failed"
  | "submission_uncertain";

export type OrderSubmissionOutcome = {
  kind: OrderSubmissionOutcomeKind;
  audience: "investor" | "broker";
  title: string;
  message: string;
  nextStep: string;
  orderId?: string;
  channel?: OrderEntryChannel;
  detail?: string;
};

export const orderChannelLabels: Record<OrderEntryChannel, string> = {
  investor_portal: "Investor portal",
  digital: "Digital instruction",
  phone: "Phone instruction",
  in_person: "In-person instruction",
  neway: "Neway instruction",
};

export const brokerChannelGuidance: Record<Exclude<OrderEntryChannel, "investor_portal">, {
  heading: string;
  evidence: string;
  authorization: string;
}> = {
  digital: {
    heading: "Digital instruction",
    evidence: "Confirm the digital instruction reference and the client account before continuing.",
    authorization: "The exact instruction still requires a client authorization code before it enters the OMS.",
  },
  phone: {
    heading: "Phone instruction",
    evidence: "Retain the call or dealer reference required by your broker’s record-keeping policy.",
    authorization: "Send an exact-order authorization code to the client’s registered contact while the instruction is being confirmed.",
  },
  in_person: {
    heading: "In-person instruction",
    evidence: "Confirm the client’s identity and retain the signed or witnessed instruction evidence required by policy.",
    authorization: "Use the registered-contact code as the final exact-order authorization before submission.",
  },
  neway: {
    heading: "Neway instruction",
    evidence: "Confirm and retain the originating Neway instruction reference before continuing.",
    authorization: "Bind the client authorization code to the exact instruction before it enters the OMS.",
  },
};

export function submittedOutcome(input: {
  audience: "investor" | "broker";
  orderId: string;
  channel: OrderEntryChannel;
}): OrderSubmissionOutcome {
  if (input.audience === "investor") {
    return {
      kind: "submitted",
      audience: "investor",
      title: "Order submitted",
      message: "Your order was successfully submitted for broker review.",
      nextStep: "You can follow its status from your orders. Submission does not mean the order has executed.",
      orderId: input.orderId,
      channel: input.channel,
    };
  }
  return {
    kind: "submitted",
    audience: "broker",
    title: "Client order recorded",
    message: `${orderChannelLabels[input.channel]} ${input.orderId} was authorized and entered into the OMS.`,
    nextStep: "The existing validation, review, approval, and execution controls remain authoritative.",
    orderId: input.orderId,
    channel: input.channel,
  };
}

export function heldOutcome(input: {
  audience: "investor" | "broker";
  orderId: string;
  channel: OrderEntryChannel;
  detail?: string;
}): OrderSubmissionOutcome {
  return {
    kind: "held",
    audience: input.audience,
    title: input.audience === "investor" ? "Order received but held" : "Order recorded but held",
    message: input.audience === "investor"
      ? "Your instruction was received, but a required check needs attention."
      : `${orderChannelLabels[input.channel]} ${input.orderId} was recorded, but it did not pass every pre-trade check.`,
    nextStep: input.audience === "investor"
      ? "Your broker can review the hold. Do not submit the same order again."
      : "Open the order record to review the failed checks. Do not bypass the existing OMS controls.",
    orderId: input.orderId,
    channel: input.channel,
    detail: input.detail,
  };
}

export function failedOutcome(input: {
  audience: "investor" | "broker";
  stage: "authorization" | "submission";
  channel: OrderEntryChannel;
  detail: string;
}): OrderSubmissionOutcome {
  const uncertain = input.stage === "submission" && /network|fetch|timeout|timed out|connection|unavailable|offline/i.test(input.detail);
  if (uncertain) {
    return {
      kind: "submission_uncertain",
      audience: input.audience,
      title: "Submission status uncertain",
      message: "A connection problem occurred after submission started, so the final order status could not be confirmed.",
      nextStep: input.audience === "investor"
        ? "Check your orders before trying again. The submission reference prevents an accidental duplicate."
        : "Search the order log by submission reference before retrying. Do not create a second instruction until its status is confirmed.",
      channel: input.channel,
      detail: input.detail,
    };
  }
  const authorization = input.stage === "authorization";
  return {
    kind: authorization ? "authorization_failed" : "submission_failed",
    audience: input.audience,
    title: authorization ? "Authorization unsuccessful" : "Order not submitted",
    message: authorization
      ? "The exact-order authorization was not completed, so no order was submitted."
      : "The order could not be submitted.",
    nextStep: authorization
      ? "Review the message below, then request a new code if appropriate."
      : "Correct the issue and submit again. If a submission reference is shown in the order log, do not duplicate it.",
    channel: input.channel,
    detail: input.detail,
  };
}
