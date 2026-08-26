# Brokerage accounting policy decisions

FrankMoney stores approved, effective-dated policy versions in
`accounting_policy_versions`. Operational ledgers do not change when statutory
presentation changes; the approved policy controls recognition and reporting.

The initial supported policy choices are intentionally narrow:

- Client money is presented either gross as restricted cash plus the matching
  client liability, or as an off-balance-sheet memorandum balance after legal
  and audit confirmation.
- Gateway deposits become available only at finality in the designated client
  bank account.
- A gateway receivable is recognised earlier only when the payment contract
  establishes an enforceable, irrevocable claim.
- Provider fees are paid from operating money. Net settlement must include an
  immediate broker-funded top-up before the client receives available cash.
- Protected client-money resources comprise confirmed designated-bank cash;
  gateway and CSD receivables appear only in wider settlement coverage.
- Collected brokerage and market charges are swept only after they cease to be
  client entitlements and before remittance from the operating account. The
  sweep amount is system-derived from the lower of reconciled protected-money
  surplus, unswept collected charges, and confirmed pooled-account balances;
  operators cannot key an override amount and any shortfall blocks the sweep.
- Withdrawals reduce the client liability at bank-payment finality.

Each broker must approve its policy with an effective date and rationale after
review of its bank mandate, EthSwitch contract, ECMA obligations, and external
auditor advice.

## Investor tax ownership

- Dividend and bond-coupon entitlements are recorded gross in the asset-servicing
  subledger. The issuer withholds the applicable income tax and remits only the
  net amount to client money, so the brokerage does not recognise a second tax
  payable or deduct the tax again.
- The issuer payment or withholding-certificate reference is retained with the
  entitlement and appears on the investor statement as supporting evidence.
- Capital-gains tax is a memorandum estimate against the investor's FIFO tax
  lots. It is payable by the investor, does not reduce sale proceeds, and does
  not create a brokerage tax liability unless the brokerage is separately
  appointed as a withholding agent.
- The estimate applies independently to equity and bond disposals. Bond coupon
  interest is taxed on its gross amount; repayment of principal is not interest,
  while any disposal or redemption gain is assessed under the capital-gain rule.
- Rates, calculation bases, effective dates, and legal evidence are maintained
  in a centrally versioned Platform Admin schedule that applies to all
  brokerages.
