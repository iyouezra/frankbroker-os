export type InvestorStock = {
  ticker: "TELE" | "AWAB" | "WGBX" | "GDAB" | "ABAYB";
  name: string;
  sector: "Telecom" | "Banks";
  price: number;
  delta: number;
  series: number[];
  about: string;
  dividendYield: string;
  pe: string;
  ytd: number;
  revenueGrowth: string;
  nextDividend: string;
  frankTake: string;
  updates: CompanyUpdate[];
  riskNotes: string[];
};

export type MarketRange = "1W" | "1M" | "3M" | "1Y" | "All";
export type PricePoint = { date: string; close: number; volume: number };
export type InvestorHistory = Record<MarketRange, PricePoint[]>;
export type SessionQuote = { open: number; low: number; high: number; volume: number };
export type CompanyUpdate = {
  title: string;
  date: string;
  summary: string;
  source: string;
};
export type MarketSnapshot = {
  status: "open" | "closed";
  statusLabel: string;
  quoteAsOf: string;
  lastTradeAt: string;
  bid: { price: number; quantity: number };
  ask: { price: number; quantity: number };
  spread: number;
  spreadPct: number;
};
export type InvestorBond = {
  ticker: "GB2029" | "GB2031" | "GB2036";
  name: string;
  issuer: string;
  couponRate: number;
  yieldToMaturity: number;
  maturityDate: string;
  maturityLabel: string;
  quotedPricePct: number;
  faceValue: number;
  couponFrequency: "Semiannual";
  nextPayment: string;
  minimumInvestment: number;
  settlementCycle: string;
  liquidity: string;
  status: "tradable" | "halted";
  riskNotes: string[];
};
export type BondOrderAllocation = {
  units: number;
  gross: number;
  fees: number;
  total: number;
  unused: number;
};

const historyCache = new Map<string, InvestorHistory>();
const rangeLengths: Record<MarketRange, number> = { "1W": 6, "1M": 22, "3M": 66, "1Y": 260, All: 390 };
const marketProfiles: Record<InvestorStock["ticker"], { drift: number; volatility: number; volume: number }> = {
  TELE: { drift: 0.00034, volatility: 0.0082, volume: 24_180 },
  AWAB: { drift: 0.00021, volatility: 0.0058, volume: 3_840 },
  WGBX: { drift: -0.00008, volatility: 0.0069, volume: 6_420 },
  GDAB: { drift: 0.00038, volatility: 0.0091, volume: 8_760 },
  ABAYB: { drift: 0.00006, volatility: 0.0064, volume: 5_310 },
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function previousTradingDays(count: number) {
  const dates: string[] = [];
  const cursor = new Date("2026-07-23T12:00:00Z");
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

export function getInvestorHistory(stock: InvestorStock): InvestorHistory {
  const cached = historyCache.get(stock.ticker);
  if (cached) return cached;

  const profile = marketProfiles[stock.ticker];
  const random = seededRandom([...stock.ticker].reduce((seed, char) => seed * 31 + char.charCodeAt(0), 17));
  const dates = previousTradingDays(rangeLengths.All);
  const reversed: PricePoint[] = [];
  let price = stock.price;

  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const activity = 0.62 + random() * 0.82;
    reversed.push({
      date: dates[index],
      close: Number(price.toFixed(stock.price >= 1_000 ? 0 : 2)),
      volume: Math.round(profile.volume * activity),
    });
    const noise = (random() + random() + random() - 1.5) * profile.volatility;
    const cycle = Math.sin(index * 0.31 + stock.ticker.length) * profile.volatility * 0.18;
    price /= 1 + profile.drift + noise + cycle;
  }

  const all = reversed.reverse();
  all[all.length - 1] = { ...all[all.length - 1], close: stock.price, volume: profile.volume };
  const history = Object.fromEntries(
    (Object.keys(rangeLengths) as MarketRange[]).map((range) => [range, all.slice(-rangeLengths[range])]),
  ) as InvestorHistory;
  historyCache.set(stock.ticker, history);
  return history;
}

export function getInvestorSession(stock: InvestorStock): SessionQuote {
  const profile = marketProfiles[stock.ticker];
  const open = stock.price / (1 + stock.delta / 100);
  const spread = Math.max(stock.price * profile.volatility * 0.75, stock.price >= 1_000 ? 4 : 0.75);
  return {
    open: Number(open.toFixed(stock.price >= 1_000 ? 0 : 2)),
    low: Number((Math.min(open, stock.price) - spread).toFixed(stock.price >= 1_000 ? 0 : 2)),
    high: Number((Math.max(open, stock.price) + spread * 0.8).toFixed(stock.price >= 1_000 ? 0 : 2)),
    volume: profile.volume,
  };
}

const snapshotProfiles: Record<InvestorStock["ticker"], Pick<MarketSnapshot, "bid" | "ask" | "lastTradeAt">> = {
  TELE: { bid: { price: 304.5, quantity: 420 }, ask: { price: 305.5, quantity: 280 }, lastTradeAt: "2026-07-23T09:39:00Z" },
  AWAB: { bid: { price: 9_640, quantity: 18 }, ask: { price: 9_660, quantity: 12 }, lastTradeAt: "2026-07-23T09:31:00Z" },
  WGBX: { bid: { price: 1_738, quantity: 85 }, ask: { price: 1_746, quantity: 60 }, lastTradeAt: "2026-07-23T09:27:00Z" },
  GDAB: { bid: { price: 1_192, quantity: 150 }, ask: { price: 1_200, quantity: 110 }, lastTradeAt: "2026-07-23T09:36:00Z" },
  ABAYB: { bid: { price: 1_804, quantity: 72 }, ask: { price: 1_812, quantity: 45 }, lastTradeAt: "2026-07-23T09:24:00Z" },
};

export const investorMarketContext = {
  status: "open" as const,
  statusLabel: "ESX open",
  quoteAsOf: "2026-07-23T09:42:00Z",
};

export function getMarketSnapshot(stock: InvestorStock): MarketSnapshot {
  const profile = snapshotProfiles[stock.ticker];
  const spread = Number((profile.ask.price - profile.bid.price).toFixed(2));
  const midpoint = (profile.ask.price + profile.bid.price) / 2;
  return {
    ...investorMarketContext,
    lastTradeAt: profile.lastTradeAt,
    bid: profile.bid,
    ask: profile.ask,
    spread,
    spreadPct: Number(((spread / midpoint) * 100).toFixed(2)),
  };
}

export function formatMarketTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Addis_Ababa",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export const investorStocks: InvestorStock[] = [
  {
    ticker: "TELE",
    name: "Ethio Telecom",
    sector: "Telecom",
    price: 305,
    delta: 2.4,
    series: [286, 290, 288, 294, 291, 297, 296, 301, 299, 303, 302, 305],
    about: "Ethiopia’s national telecom operator and the first state-owned enterprise on the ESX. Listed May 2026.",
    dividendYield: "3.2%",
    pe: "11.4",
    ytd: 6.8,
    revenueGrowth: "+21% yr",
    nextDividend: "Sep 2026",
    frankTake: "A near-monopoly with more than 78 million subscribers and a fast-growing digital payments business. A steady dividend story, though policy can move the price.",
    updates: [
      { title: "Latest result", date: "15 Jul 2026", summary: "Revenue and mobile money activity grew in the latest reported period.", source: "Company results" },
      { title: "Dividend update", date: "8 Jul 2026", summary: "The next expected dividend window is September, subject to company approval.", source: "Company notice" },
    ],
    riskNotes: ["Government policy can affect prices and profitability.", "A large part of the business depends on Ethiopia’s telecom market.", "The share price can move when trading is light."],
  },
  {
    ticker: "AWAB",
    name: "Awash Bank",
    sector: "Banks",
    price: 9650,
    delta: 0.6,
    series: [9480, 9520, 9500, 9560, 9540, 9600, 9580, 9610, 9590, 9630, 9620, 9650],
    about: "Ethiopia’s largest private commercial bank. Joined the ESX Main Market in April 2026.",
    dividendYield: "4.1%",
    pe: "6.2",
    ytd: 4.2,
    revenueGrowth: "+18% yr",
    nextDividend: "Nov 2026",
    frankTake: "The largest private bank has a long record of profit growth. Its high per-share price makes amount-based investing especially useful.",
    updates: [
      { title: "Latest result", date: "11 Jul 2026", summary: "The latest update showed continued loan and deposit growth.", source: "Company results" },
      { title: "Dividend update", date: "3 Jul 2026", summary: "The next expected dividend window is November, subject to company approval.", source: "Company notice" },
    ],
    riskNotes: ["Loan losses can reduce profits.", "Banking rules and interest rates can affect earnings.", "The high price per share can make smaller orders harder."],
  },
  {
    ticker: "WGBX",
    name: "Wegagen Bank",
    sector: "Banks",
    price: 1742,
    delta: -0.8,
    series: [1790, 1782, 1786, 1770, 1775, 1762, 1768, 1755, 1760, 1748, 1752, 1742],
    about: "The first company listed on the Ethiopian Securities Exchange in January 2025.",
    dividendYield: "3.8%",
    pe: "7.1",
    ytd: -2.1,
    revenueGrowth: "+9% yr",
    nextDividend: "Oct 2026",
    frankTake: "The ESX pioneer. Growth has been slower than peers lately, so its next results will matter before adding more.",
    updates: [
      { title: "Latest result", date: "10 Jul 2026", summary: "Profit grew more slowly than several listed banking peers in the latest period.", source: "Company results" },
      { title: "Dividend update", date: "2 Jul 2026", summary: "The next expected dividend window is October, subject to company approval.", source: "Company notice" },
    ],
    riskNotes: ["Slower growth may weigh on future returns.", "Loan quality can change as economic conditions move.", "Some trading days may have few buyers or sellers."],
  },
  {
    ticker: "GDAB",
    name: "Gadaa Bank",
    sector: "Banks",
    price: 1196,
    delta: 1.1,
    series: [1150, 1162, 1158, 1170, 1166, 1178, 1174, 1182, 1180, 1190, 1186, 1196],
    about: "The second bank to list on the ESX, registering more than 1.2 million ordinary shares.",
    dividendYield: "2.9%",
    pe: "8.8",
    ytd: 8.4,
    revenueGrowth: "+24% yr",
    nextDividend: "Dec 2026",
    frankTake: "A young, fast-growing bank. There is more room to grow and more movement along the way, so position size matters.",
    updates: [
      { title: "Latest result", date: "14 Jul 2026", summary: "The latest update showed strong growth from a smaller starting point.", source: "Company results" },
      { title: "Dividend update", date: "6 Jul 2026", summary: "The next expected dividend window is December, subject to company approval.", source: "Company notice" },
    ],
    riskNotes: ["Fast growth can bring higher credit risk.", "A shorter operating record makes long-term comparison harder.", "The share price can move sharply when trading is light."],
  },
  {
    ticker: "ABAYB",
    name: "Abay Bank",
    sector: "Banks",
    price: 1808,
    delta: -0.3,
    series: [1830, 1822, 1826, 1815, 1820, 1810, 1816, 1806, 1812, 1804, 1810, 1808],
    about: "An ESX-listed Ethiopian bank with around 70% of transactions running through digital channels.",
    dividendYield: "3.5%",
    pe: "7.6",
    ytd: 1.2,
    revenueGrowth: "+15% yr",
    nextDividend: "Nov 2026",
    frankTake: "Digital-first for an Ethiopian bank. As a newer listing, trading can still be thin on some days.",
    updates: [
      { title: "Latest result", date: "9 Jul 2026", summary: "Digital transactions remained an important part of the bank’s latest growth update.", source: "Company results" },
      { title: "Dividend update", date: "1 Jul 2026", summary: "The next expected dividend window is November, subject to company approval.", source: "Company notice" },
    ],
    riskNotes: ["Digital growth requires continued technology investment.", "Loan losses and banking rules can affect profits.", "Some trading days may have few buyers or sellers."],
  },
];

export const investorBonds: InvestorBond[] = [
  {
    ticker: "GB2029",
    name: "GoE Treasury Bond 2029",
    issuer: "Federal Democratic Republic of Ethiopia",
    couponRate: 14.5,
    yieldToMaturity: 14.6,
    maturityDate: "2029-07-15",
    maturityLabel: "15 Jul 2029",
    quotedPricePct: 99.85,
    faceValue: 1_000,
    couponFrequency: "Semiannual",
    nextPayment: "15 Jan 2027",
    minimumInvestment: 5_000,
    settlementCycle: "T+2",
    liquidity: "Limited",
    status: "tradable",
    riskNotes: ["Selling before maturity may return more or less than you paid.", "There may not be a buyer when you want to sell.", "Payments depend on the issuer meeting its obligations."],
  },
  {
    ticker: "GB2031",
    name: "GoE Treasury Bond 2031",
    issuer: "Federal Democratic Republic of Ethiopia",
    couponRate: 15.2,
    yieldToMaturity: 15.0,
    maturityDate: "2031-07-15",
    maturityLabel: "15 Jul 2031",
    quotedPricePct: 100.6,
    faceValue: 1_000,
    couponFrequency: "Semiannual",
    nextPayment: "15 Jan 2027",
    minimumInvestment: 5_000,
    settlementCycle: "T+2",
    liquidity: "Limited",
    status: "tradable",
    riskNotes: ["Selling before maturity may return more or less than you paid.", "A longer term means the price can react more to rate changes.", "Payments depend on the issuer meeting its obligations."],
  },
  {
    ticker: "GB2036",
    name: "GoE Treasury Bond 2036",
    issuer: "Federal Democratic Republic of Ethiopia",
    couponRate: 16,
    yieldToMaturity: 15.8,
    maturityDate: "2036-07-15",
    maturityLabel: "15 Jul 2036",
    quotedPricePct: 101,
    faceValue: 1_000,
    couponFrequency: "Semiannual",
    nextPayment: "15 Jan 2027",
    minimumInvestment: 10_000,
    settlementCycle: "T+2",
    liquidity: "Trading paused",
    status: "halted",
    riskNotes: ["Trading is currently paused, so new orders cannot be placed.", "A longer term means the price can react more to rate changes.", "Payments depend on the issuer meeting its obligations."],
  },
];

export function getBondPricePerUnit(bond: Pick<InvestorBond, "faceValue" | "quotedPricePct">) {
  return Number(((bond.faceValue * bond.quotedPricePct) / 100).toFixed(2));
}

export function getBondCouponPayment(bond: Pick<InvestorBond, "faceValue" | "couponRate" | "couponFrequency">) {
  const paymentsPerYear = bond.couponFrequency === "Semiannual" ? 2 : 1;
  return Number(((bond.faceValue * bond.couponRate) / 100 / paymentsPerYear).toFixed(2));
}

export function calculateBondOrder(
  amount: number,
  pricePerBond: number,
  feeForGross: (gross: number) => number,
): BondOrderAllocation {
  if (!Number.isFinite(amount) || !Number.isFinite(pricePerBond) || amount <= 0 || pricePerBond <= 0) {
    return { units: 0, gross: 0, fees: 0, total: 0, unused: Math.max(0, Number.isFinite(amount) ? amount : 0) };
  }

  let low = 0;
  let high = Math.floor(amount / pricePerBond);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const gross = middle * pricePerBond;
    if (gross + feeForGross(gross) <= amount) low = middle;
    else high = middle - 1;
  }
  const gross = Number((low * pricePerBond).toFixed(2));
  const fees = low > 0 ? Math.round((feeForGross(gross) + Number.EPSILON) * 100) / 100 : 0;
  const total = Number((gross + fees).toFixed(2));
  return { units: low, gross, fees, total, unused: Number(Math.max(0, amount - total).toFixed(2)) };
}

export const investorHoldings = [
  { ticker: "TELE", quantity: 120, averageCost: 287.5 },
  { ticker: "AWAB", quantity: 2, averageCost: 9200 },
  { ticker: "GDAB", quantity: 15, averageCost: 1105 },
] as const;

export const formatEtb = (value: number) =>
  `ETB ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
