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

Every local and Vercel deployment is currently a demo/test environment:

- `/` exposes the broker role and tenant switchers.
- `/investor` exposes Selam Mekonnen and Blue Nile Trading PLC.
- `/admin` exposes the platform administration demo.
- OTP is fixed to `246810` unless `FRANK_DEMO_OTP_CODE` overrides it.

The server marks the deployment `insecure-demo` and asks search engines not to index it. Do not connect this build to live customer, investor, financial, or employee data.

## Roles

The MVP exposes a non-operational Broker access admin plus Broker admin, Trader/dealer, Operations, Compliance, Settlement, Relationship, Client service, Management, and Frank super-admin views. Frank bootstraps up to two broker access administrators; those administrators manage ordinary employee invitations, roles, password-reset requests, suspensions, and restorations inside their tenant. The role, tenant, and investor selectors are demonstration controls and are available in every deployment. Authentication and real user provisioning are intentionally deferred.

## Current boundaries

- ESX routing and CSD settlement are manual/mocked.
- Reconciliation files now retain source evidence, duplicate protection, reprocessing lineage, independent sign-off, and formal end-of-day close/reopen controls; direct ESX, CSD, and bank adapters remain future integrations.
- Contract notes are printable HTML and can be saved as PDF.
- Fee schedules, limits, instrument access, and feature switches are tenant-configurable; the seeded values are illustrative and are not regulatory tariffs.
- Fayda and TIN values entered in the demo are not stored raw. The server retains masked endings and an opaque reference only; production identity verification still needs an Ethiopia-resident provider and formal compliance review.
- Role, tenant, and investor identities are browser-selectable demo controls, not authentication.
- Before any live use, implement authentication, server-derived membership, MFA, threat modeling, penetration testing, secrets management, backup/recovery procedures, and regulatory review.
- This MVP is not production-certified brokerage software.

Future ESX and CSD adapters can implement the contracts in `lib/integrations.ts` without replacing the order, trade, and settlement domain model.
