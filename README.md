# FrankBroker OS

FrankBroker OS is an initial broker back-office MVP for Ethiopia’s emerging capital market. It supports manual capture, validation, approval, execution, settlement, reconciliation, and reporting for securities orders.

## Stack

- Next.js 16 and React 19
- Prisma 7 with PostgreSQL
- Tailwind CSS
- Vercel-ready deployment

## Included workflow

1. Create a client buy or sell instruction.
2. Run pre-trade KYC, account, instrument, lot, tick, cash, and holdings checks.
3. Approve or reject the order.
4. Capture a full or partial manual execution.
5. Confirm cash and securities settlement.
6. Review reconciliation exceptions, audit activity, reports, and contract notes.

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

Useful checks:

```bash
npm run build
npm test
npm run db:studio
```

## Deploy to Vercel

1. Import the GitHub repository as a new Vercel project.
2. In the project’s **Storage** tab, create and connect a Prisma Postgres database. This supplies `DATABASE_URL` to the deployment.
3. Apply `prisma/migrations/20260714130000_init/migration.sql` with `npm run db:deploy` against that database.
4. Run `npm run db:seed` once if you want the fictional MVP records.
5. Deploy or redeploy the project. Standard Next.js settings require no framework overrides.

The schema is in `prisma/schema.prisma`; the repeatable demonstration seed is in `prisma/seed.ts`.

## Roles

The MVP exposes Broker admin, Trader/dealer, Operations, Compliance, Settlement, Management, and Frank super-admin views. The role selector and `x-frank-demo-role` header are demonstration controls, not production authentication.

Keep any public deployment protected until verified server-side authentication and user provisioning are implemented. Before live brokerage use, also complete threat modeling, penetration testing, segregation-of-duties controls, configurable fees and limits, secrets management, backup and recovery procedures, regulatory review, and independent ledger/reconciliation validation.

## Current boundaries

- ESX routing and CSD settlement are manual/mocked.
- Reconciliation upload is a UI placeholder; production parsing is not enabled.
- Contract notes are printable HTML and can be saved as PDF.
- The illustrative 0.50% fee is not a regulatory or broker tariff.
- This MVP is not production-certified brokerage software.

Future ESX and CSD adapters can implement the contracts in `lib/integrations.ts` without replacing the order, trade, and settlement domain model.
