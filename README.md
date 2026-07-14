# FrankBroker OS

FrankBroker OS is a broker back-office order management system for Ethiopia’s emerging capital market. This repository contains the initial MVP: a controlled operating workspace for manually capturing, validating, approving, executing, settling, reconciling, and reporting client securities orders.

The product is intentionally broker/admin first. It does not include a retail mobile app, direct ESX ATS connectivity, direct CSD connectivity, margin, derivatives, short selling, crypto, forex, or advisory features.

## What is included

- Workspace-authenticated broker dashboard with seven operational roles
- Client profiles, trading accounts, KYC, cash, and holdings summaries
- Equity, T-bill, and bond instrument master with settlement and bond terms
- Searchable order blotter with risk flags and workflow status
- Manual order entry with buy/sell pre-trade validation
- Server-side order validation and permission checks
- Approval/rejection workflow with cash or holdings blocking
- Manual full and partial trade capture
- Cash and securities settlement confirmation and ledger posting
- Printable contract note with browser PDF support
- CSV report export and Excel/CSV reconciliation upload placeholder
- Reconciliation batches and exception resolution surface
- Immutable audit event model and audit timeline
- Responsive desktop/mobile layout using the FrankScore brand system
- D1/SQLite relational persistence, Drizzle schema, migration, and seed records

## Core workflow demo

1. Open **Order blotter** and select **New order**.
2. Choose a client and instrument, enter quantity and price, then run validation.
3. Submit a valid instruction for broker review.
4. Change the demo role in the top-right role selector to explore the permissions model.
5. Open a pending order as Broker admin or Compliance officer and approve it.
6. Open an approved order as Trader/dealer and capture a full or partial execution.
7. Open a pending settlement as Settlement officer and confirm both legs.
8. Open the contract note and use **Print / Save PDF**.

The preloaded `ORD-2026-1048` starts at broker review. `ORD-2026-1047` is ready for trade capture. `ORD-2026-1046` is ready for settlement and contract-note review.

## Roles

| Role | Primary MVP capabilities |
| --- | --- |
| Broker admin | Full broker workflow and adjustments |
| Trader / dealer | Order entry, trade capture, reports |
| Operations officer | Order entry, ledgers, reconciliation, reports |
| Compliance officer | Approve/reject, risk review, reports |
| Settlement officer | Settlement, ledger posting, reconciliation |
| Read-only management | Dashboard and reports only |
| Frank super admin | Cross-broker administration scaffold |

Hosted requests derive authorization from workspace identity on the server. The role selector is a local demo aid; it cannot override a hosted user’s server-side role mapping.

## Setup

Requirements: Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. The app creates and seeds a fresh local D1 binding on the first order API request; hosted deployments apply the generated migration before serving traffic.

Useful checks:

```bash
npm run build
npm test
npm run db:generate
```

## Data model

The relational schema is in `db/schema.ts`. It contains 15 tables covering brokers, users, clients, accounts, instruments, holdings, orders, validation results, trades, settlements, cash/securities ledgers, reconciliation, and audit logs.

- Generated migration: `drizzle/0000_exotic_gravity.sql`
- Readable demo seed source: `db/seed.sql`
- Hosted persistence binding: `DB` in `.openai/hosting.json`

The deployed MVP uses D1/SQLite because it is the managed persistence layer for this preview environment. The domain schema is deliberately portable: a production broker deployment can map the same entities and constraints to PostgreSQL/Prisma once hosting, tenancy, backup, and data-residency requirements are agreed.

## Validation and fee assumptions

The API validates client/account existence, KYC, account status, tradability, lot size, tick size, available cash, and available unblocked holdings. The MVP uses a clearly marked illustrative fee rate of 0.50% to demonstrate gross/fee/net calculations. It is not a statement of regulatory or broker tariffs; production fees must be configuration-driven and approved by the broker.

## Manual and mocked boundaries

- ESX order routing is represented by a manual market workflow.
- Trade execution is captured from an external confirmation by a dealer.
- CSD cash and securities settlement legs are confirmed manually.
- CSV/Excel upload is staged in the UI; production parsing and mapping are not enabled yet.
- Contract notes are printable HTML and can be saved as PDF from the browser.
- Demo balances, holdings, clients, instruments, users, and activity are fictional.
- Hosted workspace identity is real; broker user provisioning and role administration remain an MVP follow-up.

The future adapter contracts live in `lib/integrations.ts`. ESX and CSD connectors can implement those interfaces without rewriting the order, trade, or settlement model.

## Recommended next build sequence

1. Broker tenant provisioning, user administration, and four-eyes role policy configuration
2. Configurable commissions, taxes, levies, limits, and KYC/risk rules
3. Production reconciliation parser with file validation and deterministic matching
4. Formal accounting sub-ledger posting, reversals, and end-of-day close controls
5. Contract-note numbering, signature, retention, and regulator-approved template
6. ESX certification adapter, idempotent routing, execution acknowledgements, and replay handling
7. CSD adapter, settlement instruction lifecycle, and exception automation
8. PostgreSQL high-availability deployment, backups, encryption policy, monitoring, and disaster recovery

## Security notes

This is an initial MVP, not a production-certified brokerage system. Before live use, complete threat modeling, penetration testing, broker-specific segregation of duties, secrets management, retention policy, regulatory review, operational runbooks, and independent ledger/reconciliation validation.
