# Risk & Compliance rollout

## Branches

- Git: `codex/risk-compliance-monitoring`
- Neon preview: `dev/risk-compliance-monitoring`, parented from `production`
- Application runtime uses the preview branch's pooled URL in `DATABASE_URL`.
- Prisma commands use its direct URL in `MIGRATION_DATABASE_URL`.

Keep both URLs in ignored local or Vercel Preview environment settings. Never
commit credentials. Prisma falls back to `DATABASE_URL` when a separate direct
URL is not supplied.

## Migration and release sequence

1. Deploy `20260814120000_risk_compliance_monitoring` to a production-derived
   preview branch and run the fictional demo seed.
2. Run the full build and test suite, cash/order workflow tests, and a Neon
   parent/child schema comparison. The expected difference is 14 additive
   monitoring tables and three nullable columns; no table or column is removed.
3. If production changes while the PR is open, create a fresh temporary branch
   from current production and repeat migration, seed, tests, and schema diff.
4. Before merge, create the agreed point-in-time production backup branch and
   prevent ad-hoc schema changes on production.
5. Merge through a reviewed PR. Production deploys the committed migration; it
   never copies preview data into production.
6. Verify production while `riskComplianceMonitoring` remains `false`.
7. Set `riskComplianceMonitoring` to `true` only for the BBO tenant after the
   verification sign-off. Controls apply to new cash movements and employee
   orders after activation; historical cash is baseline-only.
8. Delete the preview Git and Neon branches after the agreed retention period.

## Access boundary

- Compliance: alert/case detail, client reviews, employee conduct, ECMA returns,
  rule versions, evidence and restricted monitoring audit.
- Broker administrators and management: anonymous aggregate totals only.
- Operations and traders: generic clearance/hold messages in their existing
  workflows; no alert rationale or sensitive identifier data.
- Platform administrators: no monitoring workspace or monitoring API access.

Monitoring detail is deliberately absent from universal search, ordinary audit
exports, investor notifications and operational notification copy.

## Scope guardrails

The only ECMA workbooks remain the existing monthly transactions and quarterly
complaints templates. This release does not add report types, automated STR
submission, whistleblowing, related-person or external employee brokerage
accounts, deal-room controls, expected-income fields, or AML patterns 2, 3 and
6.
