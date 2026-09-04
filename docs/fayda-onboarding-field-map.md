# Fayda eKYC onboarding field map

This map is based on the supplied **VeriFayda 2.0 (eSignet) Relying Party
Integration Documentation** and **Fayda Production Partners Integration &
Onboarding Guide**. It records what the current documents actually promise; it
does not assume additional Fayda attributes.

## Data documented by Fayda

The relying-party guide's sample authorization request asks UserInfo for
`name`, `phone_number`, `email`, `picture`, `gender`, `birthdate`, and `address`.
It also returns the OIDC identity fields `sub` and `iss`. When more than one
locale is requested, fields can be keyed like `name#en` and `name#am`.

The example UserInfo JWT uses `phone`, while the claim request uses
`phone_number`. Frank's mapper accepts both, but this discrepancy must be
confirmed during sandbox certification.

| Frank field | Fayda claim | Onboarding treatment |
| --- | --- | --- |
| Person's legal name | `name` | Prefill the individual investor's name or an institution's representative name from verified UserInfo, but keep the field visible and require confirmation that it is written as on the Fayda ID. It is not the institution's legal name. |
| Mobile | `phone_number` (`phone` in one example) | Prefill. Do not treat it as independently possession-verified unless Fayda confirms the selected ACR proves control of this exact number. |
| Email | `email` | Keep asking for and confirming email even when returned. Email may not have been required when the Fayda ID was issued, and the documentation does not show `email_verified`; verify it separately if Frank will use it as a recovery factor. |
| Date of birth | `birthdate` | Prefill and retain only if required for brokerage KYC. |
| Person's address | `address` | Prefill for an individual, but keep broker review and proof rules until ECMA/compliance confirms Fayda address is sufficient evidence and its structure/freshness is known. It is not an institution's registered address. |
| Gender | `gender` | Request and retain with restricted access as part of the identity record. Do not use it for eligibility, pricing, recommendations, or risk scoring. |
| Portrait | `picture` | Request and retain as restricted identity evidence. Fetch it server-side with an allowlisted Fayda host, validate MIME type and size, copy the bytes into private evidence storage, and retain only the internal reference—not the provider URL. |
| Identity binding | `iss` + `sub` | Store as the external identity key. Do not ask the investor to type a FAN merely to recreate this link. |

## Information Frank must still collect or verify

The supplied Fayda documents do **not** list the following as UserInfo claims:

- TIN and tax evidence
- nationality, country of residence, and tax residency
- occupation, employer, and source of funds
- investment objective and suitability answers
- PEP declaration and sanctions screening
- bank accounts and account-holder verification
- brokerage terms and electronic-delivery consent
- institutional registration, licenses, representative authority, beneficial
  ownership, incorporation documents, and articles of association

An address claim is not proof of tax residency or current residence. A Fayda
authentication result is also not an order instruction.

## OTP decisions

- **Fayda authentication:** choose the required `acr_values`. The guide documents
  generated-code (OTP) and generated-code-or-biometrics contexts.
- **Onboarding contact OTP:** may be skipped only if the production Fayda
  contract confirms that the authentication context proves control of the same
  phone returned in UserInfo. Otherwise retain contact verification.
- **Order OTP:** remains separate and bound to the exact order payload. Token
  interoperability is not needed for this.

## Integration rules

1. Use Authorization Code + PKCE and validate state and nonce.
2. Verify tokens/UserInfo cryptographically. The guide contains a sample that
   decodes with signature verification disabled; that is display-only sample
   code and must not be used in production.
3. Validate issuer, audience, signature, expiry, nonce, and `sub` before calling
   `mapVerifiedFaydaUserInfo` or `establishInvestorSession`.
4. Request name, phone, email, birthdate, address, picture, and gender. Keep
   legal name and email visible for confirmation. Restrict portrait and gender
   access, retention, export, and audit handling as identity evidence.
5. Keep the two demo personas available only in explicitly labelled demo mode.
   Never enable browser-selected demo identity in production.
