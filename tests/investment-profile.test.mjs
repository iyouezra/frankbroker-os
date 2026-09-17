import assert from "node:assert/strict";
import test from "node:test";
import { parseInvestmentProfile, investmentProfileRows } from "../lib/investment-profile.ts";

const answers = { goal: "income", horizon: "mid", reaction: "wait", sharesExperience: "none", bondsExperience: "experienced", liquidityNeeds: "regular", lossCapacity: "limited" };
const now = new Date("2026-09-17T12:00:00.000Z");

test("all answers survive JSON persistence with independent experience and capacity values", () => {
  const saved = JSON.parse(JSON.stringify(parseInvestmentProfile(answers, now)));
  assert.deepEqual(saved, { ...answers, version: 1, status: "complete", recordedAt: now.toISOString() });
  assert.equal(investmentProfileRows(saved).length, 7);
  assert.ok(investmentProfileRows(saved).every((row) => row.answer !== "suitability.notRecorded"));
});

test("skipping retains submitted answers without inventing unanswered ones", () => {
  const saved = parseInvestmentProfile({ goal: "grow", horizon: "", status: "complete", recordedAt: "forged" }, now);
  assert.equal(saved.status, "incomplete");
  assert.equal(saved.recordedAt, now.toISOString());
  assert.equal(saved.goal, "grow");
  assert.equal(saved.horizon, undefined);
  assert.equal(investmentProfileRows(saved).filter((row) => row.answer === "suitability.notRecorded").length, 6);
  assert.equal(parseInvestmentProfile({}).status, "incomplete");
});

test("untrusted answer shapes and unknown values are rejected", () => {
  for (const invalid of [null, [], "growth", { goal: "constructor" }, { reaction: "aggressive" }, { lossCapacity: {} }, { bondsExperience: 2 }]) {
    assert.throws(() => parseInvestmentProfile(invalid));
  }
});

test("old client records do not acquire fabricated suitability answers", () => {
  assert.deepEqual(investmentProfileRows(null), []);
  assert.equal(investmentProfileRows({ goal: "unknown" })[0].answer, "suitability.notRecorded");
});
