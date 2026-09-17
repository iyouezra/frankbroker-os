# Onboarding investment profile

The original objective, time horizon, and response-to-loss questions remain unchanged.
The objective choices already distinguish income and growth. Two additional screens
collect experience (shares and bonds separately) and financial commitments
(expected withdrawals and capacity for loss separately). The source-of-funds
question belongs to KYC and appears for retail and institutional applicants with
different examples.

Answers travel in `OnboardingSubmission.profile.investmentProfile` through the
existing KYC transaction to `clients.investment_profile`. The API validates allowed
answer values, stamps version 1 and the recording time, and derives completion
status. It also writes the objective into the existing `investment_objective`
column. Source of funds uses the existing `source_of_funds` column. The submission
audit entry includes the declared information. Tenant-scoped investor and Client
360 endpoints expose the same saved record.

Skipping the strategy flow preserves answers already given and records remaining
items as incomplete; it does not manufacture answers. Existing clients have a null
profile and display “Not recorded.” AML risk rating is separate from investment
risk tolerance. Limited loss capacity or regular cash needs routes the strategy
result to a broker discussion rather than displaying the existing suggested mix.
This is an onboarding profile, not a full suitability assessment.

## Release

Apply migration `20260917120000_investment_profile` before running the updated
application against a database. It adds one nullable JSONB column without
backfilling historical answers. The normal `vercel-build` script already deploys
pending migrations. On September 17, 2026, this migration was tested on an isolated
Neon branch and applied to the configured FrankBroker database through Prisma
Migrate. The nullable JSONB column and completed migration record were verified.

## Regulatory context

ECMA's customer due-diligence guidance addresses both natural and legal persons,
with checks varying by customer and risk. Source-of-funds collection should not
be assumed to be retail-only. This implementation collects a declaration for both;
it does not replace any risk-based documentary checks or source-of-wealth process.

- [ECMA publication](https://ecma.gov.et/download/guidance-for-ecma-licensees-on-customer-due-diligence-and-reporting-under-aml-cft/)
- [Readable copy of the guidance](https://www.scribd.com/document/951890484/ECMA-Guidance-for-ECMA-Licensees-on-Customer-Due-Diligence-and-Reporting-AML-cft-2025)
