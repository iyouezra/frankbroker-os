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
    grossAmount: string;
    providerFee: string;
    currency: string;
    reference: string;
  }>;
}

export class ManualPaymentGateway implements PaymentGateway {
  async verifyWebhook() {
    return { valid: false, providerEventId: "", eventType: "unsupported", payload: null };
  }

  async describeSettlement(providerEventId: string) {
    return { grossAmount: "0", providerFee: "0", currency: "ETB", reference: `MANUAL-${providerEventId}` };
  }
}
