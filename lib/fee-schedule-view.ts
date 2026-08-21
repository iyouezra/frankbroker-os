type NumericValue = number | string | { toString(): string };

export type BrokerageRuleLike = {
  assetClass: string;
  marketSegment: string;
  brokeragePct: NumericValue;
  minimumFee: NumericValue;
  maximumFee: NumericValue | null;
  tiers?: Array<{ minimumOrderValue: NumericValue; maximumOrderValue: NumericValue | null; brokeragePct: NumericValue }>;
};

export type MarketRuleLike = {
  assetClass: string;
  marketSegment: string;
  regulatorPct: NumericValue;
  exchangePct: NumericValue;
  csdPct: NumericValue;
};

const numeric = (value: NumericValue) => Number(value.toString());

export function composeFeeRules(
  brokerageRules: BrokerageRuleLike[],
  marketRules: MarketRuleLike[],
  settings: { brokerageFeePct: NumericValue; minimumFee: NumericValue } | null,
) {
  if (!settings && !brokerageRules.length) return [];
  return marketRules.flatMap((marketRule) => {
    const brokerageRule = brokerageRules.find((rule) => rule.assetClass === marketRule.assetClass && rule.marketSegment === marketRule.marketSegment)
      ?? brokerageRules.find((rule) => rule.assetClass === marketRule.assetClass);
    if (!brokerageRule && !settings) return [];
    return [{
      assetClass: marketRule.assetClass,
      marketSegment: marketRule.marketSegment,
      brokeragePct: numeric(brokerageRule?.brokeragePct ?? settings!.brokerageFeePct),
      regulatorPct: numeric(marketRule.regulatorPct),
      exchangePct: numeric(marketRule.exchangePct),
      csdPct: numeric(marketRule.csdPct),
      minimumFee: numeric(brokerageRule?.minimumFee ?? settings!.minimumFee),
      maximumFee: brokerageRule?.maximumFee === null || brokerageRule?.maximumFee === undefined ? null : numeric(brokerageRule.maximumFee),
      tiers: (brokerageRule?.tiers ?? []).map((tier) => ({
        minimumOrderValue: numeric(tier.minimumOrderValue),
        maximumOrderValue: tier.maximumOrderValue === null ? null : numeric(tier.maximumOrderValue),
        brokeragePct: numeric(tier.brokeragePct),
      })),
    }];
  });
}
