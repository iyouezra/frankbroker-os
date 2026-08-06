# Server-side security review

Date: 2026-08-06

## Scope

Reviewed the Next.js pages and API routes, broker and investor authorization, tenant and object ownership, user administration, OTP verification, order/trade/settlement calculations, cash and securities ledgers, fee configuration, Prisma schema, and migrations.

## Findings and remediation

### Accepted demo limitation — browser-controlled identity

Callers can select a broker role, tenant, platform administrator, or investor client through the demo UI and unsigned `x-frank-*` headers. This is intentional while Frank is a demo/test environment and makes the product unsuitable for live data.

Deferred until authentication is implemented:

- Connect an identity provider and MFA.
- Bind broker roles, tenant membership, and investor ownership to authenticated database records.
- Disable browser-selected identities and protect account pages with verified sessions.
- Revalidate notification and object access using the authenticated subject.

Signed-session and database-authority helpers remain in the codebase for that future integration, but they are not required or enforced by this demo build.

### Accepted demo limitation — fixed OTP

Every deployment intentionally defaults to the visible fixed code `246810`. This is presentation behavior, not authentication.

Controls retained for workflow correctness:

- Requests are throttled per investor and purpose, and a new code supersedes prior unconsumed codes.
- Attempt limits, expiry, exact order-payload binding, and one-time consumption remain server enforced.

### High — missing database financial invariants

The application already used exact Decimal calculations and serializable transactions, but PostgreSQL did not reject impossible snapshots written by another future code path.

Fixed in migration `20260806120000_server_security_invariants`:

- Cash must remain nonnegative and `total = available + blocked + unsettled`.
- Holdings must remain nonnegative and conserve total quantity.
- Orders, trades, movements, instruments, fee rules, pooled money, beneficial positions, and OTP attempts receive value/bounds checks.
- Cross-tenant triggers protect orders, cash movements, verification challenges, client documents, and linked bank accounts.

### High — configuration values could bypass UI validation

Platform configuration endpoints accepted several fee, limit, date, order-type, settlement, and instrument-status values without equivalent server validation.

Fixed: configuration writes now validate supported enums, dates, numeric bounds, review periods, fee components, minimum/maximum relationships, and financial controls before persistence. PostgreSQL repeats core nonnegative constraints.

### Medium — overly broad authenticated reads

Audit, work-item, search, and tenant-operation reads previously resolved an actor but did not always require the relevant reporting permission.

Fixed: these reads require server-side `report` permission. Access administrators receive only the tenant identity needed for their isolated user-management workspace, not financial controls or instruments.

### Medium — web and scheduled-job hardening

Fixed:

- Cookie-authenticated writes enforce same-origin/allowlisted-origin CSRF checks.
- The daily notification job is callable without authentication in this demo build.
- Sensitive API responses receive `Cache-Control: no-store`.
- CSP, clickjacking, MIME-sniffing, referrer, browser-permission, opener, HSTS, and server-banner headers are configured.
- All responses are labelled `insecure-demo` and carry a no-index directive.

## Financial trust boundary confirmed

The browser contains display-only estimates, but authoritative values are not accepted from those estimates. PostgreSQL-backed services recompute fees, gross/net amounts, limits, eligibility, reservations, fills, settlement dates, cash, holdings, and beneficial/pooled balances with `Prisma.Decimal` inside serializable, row-locked transactions. Status transitions and maker-checker rules are also enforced in server services.

## Deployment requirements and residual risk

1. Every deployment is currently an unauthenticated demo. Use only an isolated database containing fictional, disposable data.
2. Vercel automatically applies migrations and the repeatable demo seed during deployment.
3. PostgreSQL row-level security is not enabled. Use a least-privilege application role and consider RLS before regulated use.
4. Authentication, MFA, secure OTP delivery, backup/restore testing, dependency scanning, penetration testing, and regulatory validation are required before handling live brokerage data.

## Verification

- Production build and TypeScript compilation: passed.
- ESLint: passed.
- Prisma schema validation: passed.
- Automated tests: 236 passed, 0 failed, including demo role, tenant, and investor switching plus the retained signed-session, database-authority, investor-ownership, and CSRF helpers.
