export type IdentityDelivery = "sent" | "deferred";

export interface IdentityProvisioningAdapter {
  inviteUser(input: { userId: string; email: string; expiresAt: Date }): Promise<{ delivery: IdentityDelivery }>;
  requestPasswordReset(input: { userId: string; email: string }): Promise<{ delivery: IdentityDelivery }>;
}

// Deliberately records lifecycle intent without storing passwords or issuing a
// fake credential. Replace this adapter when verified authentication is wired.
export const identityProvider: IdentityProvisioningAdapter = {
  async inviteUser() { return { delivery: "deferred" }; },
  async requestPasswordReset() { return { delivery: "deferred" }; },
};
