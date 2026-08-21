/**
 * Integration boundaries for the post-MVP market adapters.
 * Manual workflows implement the same contracts today, so an ESX or CSD
 * adapter can be introduced without changing the order domain model.
 */
export interface OrderGateway {
  submit(orderId: string): Promise<{ externalReference: string; acceptedAt: string }>;
  cancel(orderId: string, externalReference: string): Promise<void>;
}

export interface SettlementGateway {
  confirm(tradeId: string): Promise<{
    cashStatus: "pending" | "settled" | "failed";
    securitiesStatus: "pending" | "settled" | "failed";
    externalReference: string;
  }>;
}

export class ManualOrderGateway implements OrderGateway {
  async submit(orderId: string) {
    return { externalReference: `MANUAL-${orderId}`, acceptedAt: new Date().toISOString() };
  }

  async cancel() {
    return Promise.resolve();
  }
}

export class ManualSettlementGateway implements SettlementGateway {
  async confirm(tradeId: string) {
    return {
      cashStatus: "pending" as const,
      securitiesStatus: "pending" as const,
      externalReference: `MANUAL-${tradeId}`,
    };
  }
}

/**
 * Deposits and withdrawals moving through a payment service provider.
 *
 * A confirmed deposit is an event we receive, not a form somebody fills in:
 * the provider tells us funds settled, and the ledger entry follows from that.
 * Until a provider is selected the manual implementation stands in, and the
 * off-gateway path in `lib/cash-service.ts` — officer verification against
 * evidence, under maker-checker — remains how money that never touches a
 * gateway is recorded.
 *
 * `providerEventId` is the provider's own identifier for the event and is what
 * makes redelivery safe: it is carried onto the cash movement's submission
 * reference, which is already unique per broker.
 */
export interface PaymentGateway {
  verifyWebhook(rawBody: string, headers: Headers): Promise<{
    valid: boolean;
    providerEventId: string;
    eventType: string;
    payload: unknown;
  }>;
  describeSettlement(providerEventId: string): Promise<{
    transactionId: string;
    grossAmount: string;
    providerFee: string;
    currency: string;
    reference: string;
    providerStatus: "pending" | "clearing" | "bank_settled" | "failed" | "returned";
    settlementBatchId?: string;
    destinationAccountRef?: string;
    finalityAt?: string;
    originalTransactionId?: string;
  }>;
}

export class ManualPaymentGateway implements PaymentGateway {
  async verifyWebhook() {
    return { valid: false, providerEventId: "", eventType: "unsupported", payload: null };
  }

  async describeSettlement(providerEventId: string) {
    return { transactionId: `MANUAL-${providerEventId}`, grossAmount: "0", providerFee: "0", currency: "ETB", reference: `MANUAL-${providerEventId}`, providerStatus: "pending" as const };
  }
}

/**
 * EthSwitch protocol details are supplied by the contracted transport rather
 * than guessed here. This adapter fixes the domain shape FrankMoney consumes
 * while allowing the signature and settlement endpoints to follow the actual
 * merchant agreement and credentials.
 */
export type EthSwitchTransport = {
  verifySignature(rawBody: string, headers: Headers): Promise<boolean>;
  parseEvent(rawBody: string): { providerEventId: string; eventType: string; payload: unknown };
  fetchSettlement(providerEventId: string): ReturnType<PaymentGateway["describeSettlement"]>;
};

export class EthSwitchPaymentGateway implements PaymentGateway {
  constructor(private readonly transport: EthSwitchTransport) {}

  async verifyWebhook(rawBody: string, headers: Headers) {
    const valid = await this.transport.verifySignature(rawBody, headers);
    const parsed = this.transport.parseEvent(rawBody);
    return { valid, ...parsed };
  }

  describeSettlement(providerEventId: string) {
    return this.transport.fetchSettlement(providerEventId);
  }
}
