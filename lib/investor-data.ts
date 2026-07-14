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
