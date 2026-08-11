import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portfolio = await readFile(new URL("../features/investor/portfolio/portfolio-screen.tsx", import.meta.url), "utf8");

test("a real empty account never falls back to demo holdings or a demo bond", () => {
  assert.match(portfolio, /!demoFallback && account\?\.holdings\.length === 0/);
  assert.match(portfolio, /const holdings = demoFallback\s*\? investorHoldings/);
  assert.match(portfolio, /const otherValue = demoFallback \? 25_000/);
  assert.doesNotMatch(portfolio, /const total = stockValue \+ 25_000 \+ cash/);
});
