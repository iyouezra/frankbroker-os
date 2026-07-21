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
};

export type MarketRange = "1W" | "1M" | "3M" | "1Y" | "All";
export type PricePoint = { date: string; close: number; volume: number };
export type InvestorHistory = Record<MarketRange, PricePoint[]>;
export type SessionQuote = { open: number; low: number; high: number; volume: number };

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
  const cursor = new Date("2026-07-21T12:00:00Z");
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
  },
];

export const investorBonds = [
  { ticker: "GB2029", name: "GoE Treasury Bond 2029", rate: "14.5%", maturity: "3 years", minimum: "ETB 5,000" },
  { ticker: "GB2031", name: "GoE Treasury Bond 2031", rate: "15.2%", maturity: "5 years", minimum: "ETB 5,000" },
  { ticker: "GB2036", name: "GoE Treasury Bond 2036", rate: "16.0%", maturity: "10 years", minimum: "ETB 10,000" },
] as const;

export const investorHoldings = [
  { ticker: "TELE", quantity: 120, averageCost: 287.5 },
  { ticker: "AWAB", quantity: 2, averageCost: 9200 },
  { ticker: "GDAB", quantity: 15, averageCost: 1105 },
] as const;

export const coachTips = [
  { title: "You lean heavily on banks", body: "About 62% of your stocks are in one sector. TELE or a government bond could spread the risk." },
  { title: "Dividend season is coming", body: "TELE has historically paid in September. Dividends arrive as cash you can reinvest." },
  { title: "Red days are normal", body: "The ESX is young and prices move. Your plan already assumes there will be bumpy months." },
  { title: "Your auto-invest is working", body: "Six months of steady ETB 2,000 contributions. Investing on a schedule beats guessing the right day." },
] as const;

export const formatEtb = (value: number) =>
  `ETB ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
