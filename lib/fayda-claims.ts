import type { VerifiedInvestorIdentity } from "./investor-auth";

/**
 * Claims explicitly shown in the supplied VeriFayda 2.0 relying-party guide.
 * Keep this list narrow: requesting more identity data than onboarding needs
 * would work against the guide's consent-based disclosure model.
 */
export const FAYDA_REQUESTED_USERINFO_CLAIMS = {
  name: { essential: true },
  phone_number: { essential: true },
  email: { essential: true },
  picture: { essential: true },
  gender: { essential: true },
  birthdate: { essential: true },
  address: { essential: true },
} as const;

export const FAYDA_ONBOARDING_FIELD_POLICY = {
  showAndConfirmWhenReturned: ["fullName", "email"],
  prefillIndividualWhenReturned: ["phone", "dateOfBirth", "address"],
  prefillInstitutionRepresentativeWhenReturned: ["representativeName", "phone"],
  retainAsRestrictedIdentityEvidence: ["gender", "picture"],
  collectSeparately: [
    "tin",
    "nationality",
    "countryOfResidence",
    "occupation",
    "employerName",
    "sourceOfFunds",
    "investmentObjective",
    "taxResidency",
    "pepStatus",
    "bankAccounts",
    "brokerageConsents",
    "institutionRegistration",
    "representativeAuthority",
    "beneficialOwners",
    "institutionDocuments",
  ],
} as const;

type FaydaAddress = {
  formatted?: unknown;
  street_address?: unknown;
  locality?: unknown;
  region?: unknown;
  postal_code?: unknown;
  country?: unknown;
};

export type FaydaProfileClaims = {
  fullName?: string;
  phone?: string;
  email?: string;
  pictureUrl?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
};

export type MappedFaydaUserInfo = {
  identity: VerifiedInvestorIdentity;
  profile: FaydaProfileClaims;
  returnedClaims: string[];
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function localizedClaim(claims: Record<string, unknown>, name: string, locales: readonly string[]) {
  const direct = nonEmptyString(claims[name]);
  if (direct) return direct;
  for (const locale of locales) {
    const localized = nonEmptyString(claims[`${name}#${locale}`]);
    if (localized) return localized;
  }
  return undefined;
}

function addressClaim(value: unknown) {
  const direct = nonEmptyString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const address = value as FaydaAddress;
  const formatted = nonEmptyString(address.formatted);
  if (formatted) return formatted;
  const parts = [address.street_address, address.locality, address.region, address.postal_code, address.country]
    .map(nonEmptyString)
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : undefined;
}

function requireExactIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 512) {
    throw new Response(`Verified Fayda user info is missing a valid ${label}.`, { status: 401 });
  }
  return value;
}

function httpsUrl(value: unknown) {
  const candidate = nonEmptyString(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalizes a UserInfo payload only after the OIDC adapter has verified its
 * signature/encryption, issuer, audience, nonce and expiry. This function does
 * not perform cryptographic verification and must never be called on a merely
 * decoded JWT.
 */
export function mapVerifiedFaydaUserInfo(
  claims: Record<string, unknown>,
  options: { expectedIssuer: string; locales?: readonly string[]; assuranceContext?: string | null; authenticationMethods?: string[] },
): MappedFaydaUserInfo {
  const issuer = requireExactIdentifier(claims.iss, "issuer");
  if (issuer !== options.expectedIssuer) {
    throw new Response("The Fayda issuer does not match the configured provider.", { status: 401 });
  }
  const subject = requireExactIdentifier(claims.sub, "subject");
  const locales = options.locales ?? ["en", "am"];
  const phone = localizedClaim(claims, "phone_number", locales) ?? localizedClaim(claims, "phone", locales);
  const birthdate = localizedClaim(claims, "birthdate", locales);
  const profile: FaydaProfileClaims = {
    fullName: localizedClaim(claims, "name", locales),
    phone,
    email: localizedClaim(claims, "email", locales),
    pictureUrl: httpsUrl(claims.picture),
    gender: localizedClaim(claims, "gender", locales)?.slice(0, 64),
    dateOfBirth: birthdate && /^\d{4}-\d{2}-\d{2}$/.test(birthdate) ? birthdate : undefined,
    address: addressClaim(claims.address)
      ?? locales.map((locale) => addressClaim(claims[`address#${locale}`])).find(Boolean),
  };
  const returnedClaims = Object.entries(profile).filter(([, value]) => Boolean(value)).map(([name]) => name);
  return {
    identity: {
      provider: "fayda_esignet",
      issuer,
      subject,
      assuranceContext: options.assuranceContext ?? null,
      authenticationMethods: options.authenticationMethods ?? [],
      gender: profile.gender ?? null,
    },
    profile,
    returnedClaims,
  };
}
