import { createHash } from "node:crypto";

/**
 * A stable, non-reversible reference for a client's legal identity.
 *
 * Its only job is to stop the same person or organization being onboarded twice
 * at one broker. We hash the identifying number rather than store it: the
 * reference dedupes reliably while the raw national ID is never persisted, which
 * matches how the rest of onboarding already treats Fayda (only the last seven
 * digits are kept for display). Because the hash is deterministic, the broker
 * and the investor self-onboarding paths land on the same value for the same
 * person, so a duplicate is caught whichever door they came through.
 *
 * Individuals are keyed by their Fayda FAN; organizations by their business
 * registration number. An organization's authorized representative may share a
 * Fayda across several entities, so the entity — not the representative — is what
 * we key on.
 */
export function clientIdentityReference(input: {
  clientType: string;
  faydaId?: string | null;
  businessRegistrationNumber?: string | null;
}): string {
  const organization = input.clientType === "institution" || input.clientType === "corporate";
  const basis = organization
    ? `org:${(input.businessRegistrationNumber ?? "").trim().toLowerCase()}`
    : `ind:${(input.faydaId ?? "").replace(/\D/g, "")}`;
  return createHash("sha256").update(basis).digest("hex");
}

/**
 * The reference a pre-existing client *should* have, for the one-off backfill.
 *
 * Returns null when it cannot be recomputed: individuals are keyed by the Fayda
 * FAN, which onboarding never stored, so their reference can only be set the
 * next time the raw number is captured. Organizations are keyed by their
 * business registration number, which is stored in full, so they can be fixed.
 */
export function backfillIdentityReference(client: {
  clientType: string;
  businessRegistrationNumber?: string | null;
}): string | null {
  const organization = client.clientType === "institution" || client.clientType === "corporate";
  if (!organization) return null;
  if (!(client.businessRegistrationNumber ?? "").trim()) return null;
  return clientIdentityReference({ clientType: client.clientType, businessRegistrationNumber: client.businessRegistrationNumber });
}

export type BackfillClient = {
  id: string;
  brokerId: string;
  clientType: string;
  identityReference: string | null;
  businessRegistrationNumber?: string | null;
};

export type BackfillPlan = {
  updates: Array<{ id: string; brokerId: string; from: string | null; to: string }>;
  alreadyCorrect: string[];
  skippedIndividuals: string[];
  skippedNoRegistration: string[];
  collisions: Array<{ brokerId: string; reference: string; clientIds: string[] }>;
};

/**
 * Decides, without touching the database, what the backfill would change.
 * Two organizations at one broker that resolve to the same reference are a real
 * duplicate the constraint would reject, so they are surfaced as a collision and
 * left untouched for a human to resolve rather than half-applied.
 */
export function planIdentityBackfill(clients: BackfillClient[]): BackfillPlan {
  const plan: BackfillPlan = { updates: [], alreadyCorrect: [], skippedIndividuals: [], skippedNoRegistration: [], collisions: [] };
  const byReference = new Map<string, BackfillClient[]>();

  for (const client of clients) {
    const organization = client.clientType === "institution" || client.clientType === "corporate";
    if (!organization) { plan.skippedIndividuals.push(client.id); continue; }
    const intended = backfillIdentityReference(client);
    if (!intended) { plan.skippedNoRegistration.push(client.id); continue; }
    const key = `${client.brokerId}::${intended}`;
    const group = byReference.get(key) ?? [];
    group.push(client);
    byReference.set(key, group);
  }

  for (const [key, group] of byReference) {
    const [brokerId, reference] = [key.slice(0, key.indexOf("::")), key.slice(key.indexOf("::") + 2)];
    if (group.length > 1) {
      plan.collisions.push({ brokerId, reference, clientIds: group.map((client) => client.id) });
      continue;
    }
    const [client] = group;
    if (client.identityReference === reference) plan.alreadyCorrect.push(client.id);
    else plan.updates.push({ id: client.id, brokerId, from: client.identityReference, to: reference });
  }

  return plan;
}
