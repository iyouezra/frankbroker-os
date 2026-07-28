export type FrankCoachTip = {
  id: string;
  category: "portfolio" | "bonds" | "education";
  priority: number;
  title: string;
  body: string;
};

export type FrankCoachHolding = {
  ticker: string;
  name: string;
  assetClass: "equity" | "bond" | string;
  sector: string | null;
  quantity: number;
  averageCost: number;
  marketPrice: number;
  marketValue: number;
  faceValue: number | null;
  couponRate: number | null;
  couponFrequency: string | null;
  maturityDate: string | null;
};

export type FrankCoachSnapshot = {
  availableCash: number;
  asOf: string;
  holdings: FrankCoachHolding[];
};

type HoldingValueInput = Pick<FrankCoachHolding, "assetClass" | "quantity" | "marketPrice" | "faceValue">;

const evergreenTips: Record<string, FrankCoachTip> = {
  understand: {
    id: "education-understand",
    category: "education",
    priority: 20,
    title: "Start with what you understand",
    body: "Learn how an investment makes money. Know what could change its value.",
  },
  redDays: {
    id: "education-red-days",
    category: "education",
    priority: 19,
    title: "Red days are normal",
    body: "Prices move up and down. Focus on why you invested and how long you plan to stay invested.",
  },
  stocksAndBonds: {
    id: "education-stocks-bonds",
    category: "education",
    priority: 18,
    title: "Stocks and bonds work differently",
    body: "Bonds usually pay set coupons. Stocks share in a company’s results.",
  },
  spread: {
    id: "education-spread",
    category: "education",
    priority: 17,
    title: "Spread the weight",
    body: "Different investments move in different ways. A mix can reduce the effect of one weak holding.",
  },
  bondPrices: {
    id: "education-bond-prices",
    category: "education",
    priority: 16,
    title: "Bond prices can move",
    body: "A bond’s price can change before maturity. Selling early may give a different result.",
  },
};

const isPositiveNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const roundedPercent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

const formatWholeEtb = (value: number) =>
  `ETB ${Math.round(value).toLocaleString("en-US")}`;

export function getFrankCoachHoldingValue(input: HoldingValueInput) {
  if (!isPositiveNumber(input.quantity) || !isPositiveNumber(input.marketPrice)) return 0;
  const unitValue = input.assetClass === "bond"
    ? isPositiveNumber(input.faceValue) ? input.faceValue * input.marketPrice / 100 : 0
    : input.marketPrice;
  return Number((input.quantity * unitValue).toFixed(2));
}

function normalizedHoldings(holdings: FrankCoachHolding[]) {
  return holdings
    .map((holding) => ({
      ...holding,
      marketValue: isPositiveNumber(holding.marketValue)
        ? holding.marketValue
        : getFrankCoachHoldingValue(holding),
    }))
    .filter((holding) => isPositiveNumber(holding.quantity) && isPositiveNumber(holding.marketValue));
}

function getEvergreenOrder(holdings: FrankCoachHolding[]) {
  const hasStocks = holdings.some((holding) => holding.assetClass === "equity");
  const hasBonds = holdings.some((holding) => holding.assetClass === "bond");
  if (hasBonds && !hasStocks) {
    return [evergreenTips.stocksAndBonds, evergreenTips.bondPrices, evergreenTips.spread, evergreenTips.understand, evergreenTips.redDays];
  }
  if (hasStocks && !hasBonds) {
    return [evergreenTips.stocksAndBonds, evergreenTips.redDays, evergreenTips.understand, evergreenTips.spread, evergreenTips.bondPrices];
  }
  return [evergreenTips.redDays, evergreenTips.understand, evergreenTips.bondPrices, evergreenTips.spread, evergreenTips.stocksAndBonds];
}

export function getFrankCoachTips(snapshot: FrankCoachSnapshot): FrankCoachTip[] {
  const holdings = normalizedHoldings(snapshot.holdings);
  if (holdings.length === 0) {
    return [evergreenTips.understand, evergreenTips.redDays, evergreenTips.stocksAndBonds, evergreenTips.spread];
  }

  const investedValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const availableCash = isPositiveNumber(snapshot.availableCash) ? snapshot.availableCash : 0;
  const totalValue = investedValue + availableCash;
  const equities = holdings.filter((holding) => holding.assetClass === "equity");
  const bonds = holdings.filter((holding) => holding.assetClass === "bond");
  const equityValue = equities.reduce((sum, holding) => sum + holding.marketValue, 0);
  const bondValue = bonds.reduce((sum, holding) => sum + holding.marketValue, 0);
  const personalized: FrankCoachTip[] = [];

  const largestHolding = [...holdings].sort((left, right) => right.marketValue - left.marketValue)[0];
  const largestShare = roundedPercent(largestHolding.marketValue, investedValue);
  const holdingConcentrated = largestShare >= 50;
  if (holdingConcentrated) {
    personalized.push({
      id: `holding-concentration-${largestHolding.ticker}`,
      category: largestHolding.assetClass === "bond" ? "bonds" : "portfolio",
      priority: 100,
      title: `${largestHolding.ticker} carries most weight`,
      body: `${largestHolding.name} is ${largestShare}% of your invested portfolio. One holding now drives most of your result.`,
    });
  }

  let sectorConcentrated = false;
  if (!holdingConcentrated && equities.length > 0 && equities.every((holding) => holding.sector)) {
    const sectorValues = new Map<string, { value: number; count: number }>();
    for (const holding of equities) {
      const current = sectorValues.get(holding.sector!) ?? { value: 0, count: 0 };
      sectorValues.set(holding.sector!, { value: current.value + holding.marketValue, count: current.count + 1 });
    }
    const leadingSector = [...sectorValues.entries()].sort((left, right) => right[1].value - left[1].value)[0];
    const sectorShare = leadingSector ? roundedPercent(leadingSector[1].value, equityValue) : 0;
    if (leadingSector && leadingSector[1].count >= 2 && sectorShare >= 60) {
      sectorConcentrated = true;
      personalized.push({
        id: `sector-concentration-${leadingSector[0].toLowerCase()}`,
        category: "portfolio",
        priority: 95,
        title: "One sector carries most weight",
        body: `${leadingSector[0]} make up ${sectorShare}% of your stocks. One sector now drives most of your result.`,
      });
    }
  }

  if (bonds.length > 0) {
    const leadingBond = [...bonds].sort((left, right) => right.marketValue - left.marketValue)[0];
    const leadingBondShare = roundedPercent(leadingBond.marketValue, bondValue);
    if (leadingBondShare >= 70 && (!holdingConcentrated || leadingBond.ticker !== largestHolding.ticker)) {
      personalized.push({
        id: `bond-concentration-${leadingBond.ticker}`,
        category: "bonds",
        priority: 94,
        title: `${leadingBond.ticker} leads your bonds`,
        body: `${leadingBond.name} is ${leadingBondShare}% of your bond value. One maturity carries most of that part.`,
      });
    }

    const datedBonds = bonds.filter((holding) => holding.maturityDate && Number.isFinite(Date.parse(holding.maturityDate)));
    if (datedBonds.length === bonds.length && datedBonds.length >= 2) {
      const maturityTimes = datedBonds.map((holding) => Date.parse(holding.maturityDate!));
      const maturityRangeDays = (Math.max(...maturityTimes) - Math.min(...maturityTimes)) / 86_400_000;
      if (maturityRangeDays <= 730) {
        personalized.push({
          id: "bond-maturities-close",
          category: "bonds",
          priority: 92,
          title: "Your bonds mature close together",
          body: "All your bonds mature within two years. Different dates can spread reinvestment timing.",
        });
      }
    }

    const asOfTime = Date.parse(snapshot.asOf);
    if (Number.isFinite(asOfTime)) {
      const nearBond = datedBonds
        .map((holding) => ({ holding, days: (Date.parse(holding.maturityDate!) - asOfTime) / 86_400_000 }))
        .filter(({ days }) => days >= 0 && days <= 365)
        .sort((left, right) => left.days - right.days)[0];
      if (nearBond) {
        personalized.push({
          id: `bond-near-maturity-${nearBond.holding.ticker}`,
          category: "bonds",
          priority: 90,
          title: `${nearBond.holding.ticker} matures within a year`,
          body: "Its face value is due at maturity. Its market price can still move before then.",
        });
      }
    }
  }

  const assetValues = new Map<string, number>();
  for (const holding of holdings) {
    assetValues.set(holding.assetClass, (assetValues.get(holding.assetClass) ?? 0) + holding.marketValue);
  }
  const leadingAsset = [...assetValues.entries()].sort((left, right) => right[1] - left[1])[0];
  const leadingAssetShare = leadingAsset ? roundedPercent(leadingAsset[1], investedValue) : 0;
  const assetConcentrated = leadingAssetShare >= 80;
  if (leadingAsset && assetConcentrated) {
    const label = leadingAsset[0] === "bond" ? "Bonds" : leadingAsset[0] === "equity" ? "Stocks" : "One asset class";
    personalized.push({
      id: `asset-concentration-${leadingAsset[0]}`,
      category: leadingAsset[0] === "bond" ? "bonds" : "portfolio",
      priority: 72,
      title: `${label} lead your portfolio`,
      body: `${label} make up ${leadingAssetShare}% of your invested money. Most of your result comes from one asset class.`,
    });
  }

  const cashShare = roundedPercent(availableCash, totalValue);
  if (cashShare >= 30) {
    personalized.push({
      id: "cash-share-high",
      category: "portfolio",
      priority: 80,
      title: "Much of your money is cash",
      body: `Cash makes up ${cashShare}% of your account. It does not move with market prices.`,
    });
  }

  if (bonds.length > 0 && bonds.every((holding) =>
    isPositiveNumber(holding.faceValue)
    && isPositiveNumber(holding.couponRate)
    && Boolean(holding.couponFrequency)
  )) {
    const annualCoupons = bonds.reduce(
      (sum, holding) => sum + holding.quantity * holding.faceValue! * holding.couponRate! / 100,
      0,
    );
    if (annualCoupons > 0) {
      personalized.push({
        id: "bond-coupon-income",
        category: "bonds",
        priority: 75,
        title: "Your bonds pay scheduled coupons",
        body: `Your bonds may pay ${formatWholeEtb(annualCoupons)} yearly. Payment dates depend on each bond.`,
      });
    }
  }

  if (equities.length > 0 && equities.every((holding) =>
    isPositiveNumber(holding.averageCost) && isPositiveNumber(holding.marketPrice)
  )) {
    const equityCost = equities.reduce((sum, holding) => sum + holding.quantity * holding.averageCost, 0);
    const change = equityCost > 0 ? ((equityValue - equityCost) / equityCost) * 100 : 0;
    if (Math.abs(change) >= 1) {
      const direction = change > 0 ? "above" : "below";
      personalized.push({
        id: `equity-cost-${direction}`,
        category: "portfolio",
        priority: 70,
        title: `Your stocks are ${direction} cost`,
        body: `Your stocks are ${Math.round(Math.abs(change))}% ${direction} their average cost. Prices can still move.`,
      });
    }
  }

  if (bonds.length > 0 && leadingAssetShare < 80) {
    const bondShare = roundedPercent(bondValue, investedValue);
    personalized.push({
      id: "bond-share",
      category: "bonds",
      priority: 65,
      title: "Bonds share the load",
      body: `Bonds make up ${bondShare}% of your invested money. Coupons add a different source of return.`,
    });
  }

  const knownSectors = new Set(equities.map((holding) => holding.sector).filter(Boolean));
  const meaningfullyDiversified = holdings.length >= 3
    && !holdingConcentrated
    && !sectorConcentrated
    && !assetConcentrated
    && (assetValues.size >= 2 || knownSectors.size >= 2);
  if (meaningfullyDiversified) {
    personalized.push({
      id: "portfolio-diversified",
      category: "portfolio",
      priority: 60,
      title: "Your portfolio spreads the weight",
      body: `Your money sits across ${holdings.length} holdings. No single holding carries half the portfolio.`,
    });
  }

  const selected = personalized.sort((left, right) => right.priority - left.priority).slice(0, 3);
  const evergreen = getEvergreenOrder(holdings);
  for (const tip of evergreen) {
    if (selected.length >= 5) break;
    if (selected.length < 3 || selected.filter((item) => item.category === "education").length < 2) {
      selected.push(tip);
    }
  }
  return selected;
}
