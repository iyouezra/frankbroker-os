import type { TranslationKey } from "./i18n/en";

export const investmentOptions = {
  goal: { grow: "strategy.growLabel", big: "strategy.bigLabel", income: "strategy.incomeLabel", learn: "strategy.learnLabel" },
  horizon: { short: "strategy.shortLabel", mid: "strategy.midLabel", long: "strategy.longLabel" },
  reaction: { sell: "strategy.sellLabel", wait: "strategy.waitLabel", buy: "strategy.buyLabel" },
  sharesExperience: { none: "suitability.none", some: "suitability.some", experienced: "suitability.experienced" },
  bondsExperience: { none: "suitability.none", some: "suitability.some", experienced: "suitability.experienced" },
  liquidityNeeds: { regular: "suitability.regular", occasional: "suitability.occasional", none: "suitability.noWithdrawals" },
  lossCapacity: { none: "suitability.noLoss", limited: "suitability.limitedLoss", substantial: "suitability.substantialLoss" },
} as const satisfies Record<string, Record<string, TranslationKey>>;
export type InvestmentAnswers = { [K in keyof typeof investmentOptions]: keyof typeof investmentOptions[K] };
export type InvestmentProfile = Partial<InvestmentAnswers> & { version: 1; status: "complete" | "incomplete"; recordedAt: string };
export const investmentFields: Array<[keyof InvestmentAnswers, TranslationKey]> = [
  ["goal", "suitability.objective"], ["horizon", "suitability.horizon"], ["reaction", "suitability.reaction"],
  ["sharesExperience", "suitability.shares"], ["bondsExperience", "suitability.bonds"],
  ["liquidityNeeds", "suitability.liquidity"], ["lossCapacity", "suitability.capacity"],
];

/** Validate raw answers and stamp completion on the server, never trust client metadata. */
export function parseInvestmentProfile(value: unknown, now = new Date()): InvestmentProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Investment profile must be an object.");
  const raw = value as Record<string, unknown>;
  const answers: Partial<InvestmentAnswers> = {};
  for (const [key] of investmentFields) {
    const answer = raw[key];
    if (answer === undefined || answer === "") continue;
    if (typeof answer !== "string" || !Object.hasOwn(investmentOptions[key], answer)) throw new Error(`Invalid investment answer: ${key}.`);
    Object.assign(answers, { [key]: answer });
  }
  return { ...answers, version: 1, status: investmentFields.every(([key]) => answers[key]) ? "complete" : "incomplete", recordedAt: now.toISOString() };
}

export function investmentProfileRows(value: unknown): Array<{ label: TranslationKey; answer: TranslationKey }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = value as Record<string, unknown>;
  return investmentFields.map(([key, label]) => {
    const options: Record<string, TranslationKey> = investmentOptions[key];
    const answer = raw[key];
    return { label, answer: typeof answer === "string" && Object.hasOwn(options, answer) ? options[answer] : "suitability.notRecorded" as TranslationKey };
  });
}
