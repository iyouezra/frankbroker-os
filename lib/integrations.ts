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
