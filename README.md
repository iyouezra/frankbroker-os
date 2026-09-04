# FrankBroker OS

Frank Money is a tenant-aware capital-markets MVP for Ethiopia. The same PostgreSQL model now powers three connected surfaces: the FrankBroker OMS, the investor portal, and the FrankBroker platform admin console.

## Stack

- Next.js 16 and React 19
- Prisma 7 with PostgreSQL
- Tailwind CSS
- Vercel-ready deployment

## Connected workflow

1. Platform Admin configures each tenant’s branding, features, instruments, users, fees, limits, and integration modes.
2. The investor portal reads that tenant configuration, stores only masked KYC references, and submits orders to the broker-owned account.
3. Investor and broker-entered orders share the same validation, order-event, and audit records.
4. FrankBroker reviews, approves, rejects, executes, settles, and reconciles those tenant-scoped orders.
5. The Admin console reads the resulting tenant metrics and audit activity from the same database.

All included clients, balances, instruments, prices, users, and activity are fictional demonstration data.

## Local setup

Requirements: Node.js 20.19+, 22.12+, or 24+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env
npm run db:deploy
npm run db:seed
npm run dev
```

Set `DATABASE_URL` in `.env` before deploying or seeding. Open [http://localhost:3000](http://localhost:3000).

Portal routes:

- `/` — FrankBroker OMS
- `/investor` — investor onboarding, portfolio, markets, and orders
- `/admin` — platform tenant administration

Useful checks:

```bash
npm run build
npm test
npm run db:studio
```

## Deploy to Vercel

1. Import the GitHub repository as a new Vercel project.
2. In the project’s **Storage** tab, create and connect a Prisma Postgres database. This supplies `DATABASE_URL` to the deployment.
3. Deploy or redeploy the project.

That is all. Vercel uses the checked-in build command to apply migrations, run the repeatable demo seed, and build the app automatically. No authentication or demo-mode environment variables are required.

The schema is in `prisma/schema.prisma`; the repeatable demonstration seed is in `prisma/seed.ts`. The seed includes three tenants, tenant policies, instrument entitlements, integrations, broker users, Selam Mekonnen, and Blue Nile Trading PLC.

By default, local and Vercel deployments run as demo/test environments:

- `/` exposes the broker role and tenant switchers.
- `/investor` exposes Selam Mekonnen and Blue Nile Trading PLC.
- `/admin` exposes the platform administration demo.
- OTP is fixed to `246810` unless `FRANK_DEMO_OTP_CODE` overrides it.

The server marks the deployment `insecure-demo` and asks search engines not to index it. Do not connect this build to live customer, investor, financial, or employee data.

### Investor authentication boundary

The investor portal includes registered-contact OTP sign-in plus WebAuthn
passkeys. It binds a verified external identity to an internal investor
principal, issues a short-lived HttpOnly/SameSite session cookie, and derives
client ownership on the server. In protected mode, an investor order requires
device user verification through a passkey followed by an exact-order-bound SMS
OTP to the registered mobile number. Biometric data and credential private keys
never reach Frank's server.

The safe default remains the existing labelled demo. To enable investor sign-in
in a properly secured environment, configure:

```bash
FRANK_DEPLOYMENT_MODE="production"
FRANK_INVESTOR_AUTH_MODE="otp"
FRANK_SESSION_SECRET="at-least-32-random-bytes"
FRANK_OTP_HASH_SECRET="a-different-32-byte-random-secret"
FRANK_OTP_DELIVERY_URL="https://your-ethiopia-hosted-otp-adapter.example/send"
FRANK_OTP_DELIVERY_TOKEN="provider-token"
FRANK_WEBAUTHN_RP_ID="your-frank-domain.example"
FRANK_WEBAUTHN_ORIGINS="https://app.your-frank-domain.example"
FRANK_WEBAUTHN_RP_NAME="Frank Money"
```

Use a stable RP ID and HTTPS origin before enrolling passkeys. A passkey created
for a temporary `*.vercel.app` preview host will not transfer to the production
domain. Investors enroll and revoke passkeys under **Profile → Security** after
signing in through the registered-contact flow. Shared demo personas do not
support passkey enrollment.

The login accepts a client code plus the email or mobile already held on the
client record. VeriFayda can later replace the OTP authenticator: after a Fayda
callback cryptographically verifies `iss`, `aud`, signature, nonce, expiry and
`sub`, it should pass that verified identity to `establishInvestorSession` in
`lib/investor-auth.ts`. The database supports multiple identity providers per
client, so enabling Fayda does not require changing authorization, passkeys, or
the order OTP.
The documented Fayda claim-to-onboarding decisions are recorded in
`docs/fayda-onboarding-field-map.md`; the executable normalization contract is
in `lib/fayda-claims.ts`.

## Roles

The MVP exposes a non-operational Broker access admin plus Broker admin, Trader/dealer, Operations, Compliance, Settlement, Relationship, Client service, Management, and Frank super-admin views. Frank bootstraps up to two broker access administrators; those administrators manage ordinary employee invitations, roles, password-reset requests, suspensions, and restorations inside their tenant. Role, tenant, and investor selectors remain available in demo mode. Investor OTP authentication is opt-in; broker workforce authentication and real user provisioning are still deferred.

## Current boundaries

- ESX routing and CSD settlement are manual/mocked.
- Reconciliation files now retain source evidence, duplicate protection, reprocessing lineage, independent sign-off, and formal end-of-day close/reopen controls; direct ESX, CSD, and bank adapters remain future integrations.
- Contract notes are printable HTML and can be saved as PDF.
- Fee schedules, limits, instrument access, and feature switches are tenant-configurable; the seeded values are illustrative and are not regulatory tariffs.
- Fayda and TIN values entered in the demo are not stored raw. The server retains masked endings and an opaque reference only; production identity verification still needs an Ethiopia-resident provider and formal compliance review.
- In default demo mode, role, tenant, and investor identities are browser-selectable controls, not authentication.
- Before any live use, configure and independently review investor authentication; implement broker workforce authentication, server-derived membership, appropriate MFA, threat modeling, penetration testing, secrets management, backup/recovery procedures, and regulatory review.
- This MVP is not production-certified brokerage software.

Future ESX and CSD adapters can implement the contracts in `lib/integrations.ts` without replacing the order, trade, and settlement domain model.
