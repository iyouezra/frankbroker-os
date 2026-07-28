import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getFrankCoachHoldingValue,
  getFrankCoachTips,
} from "../lib/frank-coach.ts";

const equity = (overrides = {}) => ({
  ticker: "TELE",
  name: "Ethio Telecom",
  assetClass: "equity",
  sector: "Telecom",
  quantity: 10,
  averageCost: 280,
  marketPrice: 305,
  marketValue: 3_050,
  faceValue: null,
  couponRate: null,
  couponFrequency: null,
  maturityDate: null,
  ...overrides,
});

const bond = (overrides = {}) => ({
  ticker: "GB2029",
  name: "GoE Treasury Bond 2029",
  assetClass: "bond",
  sector: null,
  quantity: 10,
  averageCost: 99.5,
  marketPrice: 99.85,
  marketValue: 9_985,
  faceValue: 1_000,
  couponRate: 14.5,
  couponFrequency: "semi_annual",
  maturityDate: "2029-07-15",
  ...overrides,
});

const snapshot = (holdings, availableCash = 0, asOf = "2026-07-28T00:00:00Z") => ({
  holdings,
  availableCash,
  asOf,
});

test("empty and cash-only accounts receive evergreen coaching", () => {
  for (const tips of [
    getFrankCoachTips(snapshot([])),
    getFrankCoachTips(snapshot([], 50_000)),
  ]) {
    assert.deepEqual(tips.map((tip) => tip.title), [
      "Start with what you understand",
      "Red days are normal",
      "Stocks and bonds work differently",
      "Spread the weight",
    ]);
    assert.ok(tips.every((tip) => tip.category === "education"));
  }
});

test("equity concentration and cash use current portfolio values", () => {
  const tips = getFrankCoachTips(snapshot([
    equity({ marketValue: 7_000 }),
    equity({ ticker: "AWAB", name: "Awash Bank", sector: "Banks", marketValue: 3_000 }),
  ], 5_000));
  assert.match(tips[0].body, /Ethio Telecom is 70%/);
  assert.ok(tips.some((tip) => tip.body.includes("Cash makes up 33%")));
  assert.ok(!tips.some((tip) => tip.id.startsWith("sector-concentration")));
});

test("sector coaching requires complete classifications and two holdings", () => {
  const bankHoldings = [
    equity({ ticker: "AWAB", name: "Awash Bank", sector: "Banks", marketValue: 4_000 }),
    equity({ ticker: "WGBX", name: "Wegagen Bank", sector: "Banks", marketValue: 3_500 }),
    equity({ ticker: "TELE", name: "Ethio Telecom", sector: "Telecom", marketValue: 2_500 }),
  ];
  const tips = getFrankCoachTips(snapshot(bankHoldings));
  assert.ok(tips.some((tip) => tip.body.includes("Banks make up 75%")));

  const incomplete = getFrankCoachTips(snapshot([
    ...bankHoldings.slice(0, 2),
    bankHoldings[2] && { ...bankHoldings[2], sector: null },
  ]));
  assert.ok(!incomplete.some((tip) => tip.id.startsWith("sector-concentration")));
});

test("new stock symbols receive sector coaching from instrument metadata", () => {
  const tips = getFrankCoachTips(snapshot([
    equity({ ticker: "NEW1", name: "New Bank One", sector: "Banks", marketValue: 4_000 }),
    equity({ ticker: "NEW2", name: "New Bank Two", sector: "Banks", marketValue: 3_500 }),
    equity({ ticker: "NEW3", name: "New Manufacturer", sector: "Manufacturing", marketValue: 2_500 }),
  ]));
  assert.ok(tips.some((tip) => tip.body.includes("Banks make up 75%")));
});

test("bond value uses face value and quoted price percentage", () => {
  assert.equal(getFrankCoachHoldingValue(bond({ marketValue: 0 })), 9_985);
  assert.equal(getFrankCoachHoldingValue(equity({ marketValue: 0 })), 3_050);
  assert.equal(getFrankCoachHoldingValue(bond({ faceValue: null, marketValue: 0 })), 0);
});

test("owned bonds receive concentration, maturity, and coupon coaching", () => {
  const tips = getFrankCoachTips(snapshot([
    bond({ marketValue: 8_000, maturityDate: "2027-05-01" }),
    bond({
      ticker: "GB2031",
      name: "GoE Treasury Bond 2031",
      marketValue: 2_000,
      quantity: 2,
      couponRate: 15.2,
      maturityDate: "2028-04-01",
    }),
    equity({ marketValue: 6_000 }),
    equity({ ticker: "AWAB", name: "Awash Bank", sector: "Banks", marketValue: 4_000 }),
  ]));
  assert.ok(tips.some((tip) => tip.id === "bond-concentration-GB2029"));
  assert.ok(tips.some((tip) => tip.id === "bond-maturities-close"));
  assert.ok(tips.some((tip) => tip.id === "bond-near-maturity-GB2029"));
  assert.ok(tips.every((tip) => !tip.body.includes("GB2036")));

  const couponTips = getFrankCoachTips(snapshot([bond()]));
  assert.ok(couponTips.some((tip) => tip.id === "bond-coupon-income"));
  assert.ok(couponTips.some((tip) => tip.body.includes("ETB 1,450 yearly")));
});

test("stock-only and bond-only accounts keep useful cross-asset education", () => {
  const stockTips = getFrankCoachTips(snapshot([equity()]));
  const bondTips = getFrankCoachTips(snapshot([bond()]));
  assert.ok(stockTips.some((tip) => tip.id === "education-stocks-bonds"));
  assert.ok(bondTips.some((tip) => tip.id === "education-stocks-bonds"));
  assert.ok(bondTips.some((tip) => tip.category === "bonds"));
});

test("all generated copy follows the Frank tone rules", () => {
  const emDash = String.fromCharCode(8212);
  const scenarios = [
    snapshot([]),
    snapshot([equity()], 2_000),
    snapshot([bond()]),
    snapshot([
      equity({ marketValue: 6_000 }),
      equity({ ticker: "AWAB", name: "Awash Bank", sector: "Banks", marketValue: 5_000 }),
      bond({ marketValue: 4_000 }),
    ], 7_000),
  ];
  const banned = /\b(order|trade|settlement|deposit|withdrawal|kyc|restriction|support|activity|buy|sell)\b/i;
  for (const tip of scenarios.flatMap((item) => getFrankCoachTips(item))) {
    assert.ok(tip.title.trim().split(/\s+/).length <= 7, tip.title);
    assert.ok(!tip.title.includes(emDash) && !tip.body.includes(emDash), `${tip.title}: em dash`);
    assert.ok(!banned.test(`${tip.title} ${tip.body}`), `${tip.title}: banned wording`);
    const sentences = tip.body.match(/[^.!?]+[.!?]+/g) ?? [];
    assert.ok(sentences.length <= 2, `${tip.title}: too many sentences`);
    for (const sentence of sentences) {
      assert.ok(sentence.trim().split(/\s+/).length <= 18, `${tip.title}: long sentence`);
    }
  }
});

test("Frank Coach keeps the existing card structure and stylesheet", async () => {
  const home = await readFile(new URL("../features/investor/home/home-screen.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/investor/investor.module.css", import.meta.url), "utf8");
  assert.match(home, /<Card className=\{styles\.coachCard\}><span><Icon name="bulb" size=\{20\} \/><\/span><div><small>FRANK COACH<\/small>/);
  assert.match(home, /sector: holding\.sector/);
  assert.doesNotMatch(home, /sector: investorStocks\.find/);
  assert.match(css, /\.coachCard \{ display: flex; gap: 12px;/);
});
