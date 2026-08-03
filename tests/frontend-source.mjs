import { readdir, readFile } from "node:fs/promises";

async function readFeatureTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => {
      const target = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
      if (entry.isDirectory()) return readFeatureTree(target);
      if (!/\.(ts|tsx)$/.test(entry.name)) return "";
      return readFile(target, "utf8");
    }));
  return sources.join("\n");
}

async function readPortalSource(portal) {
  const appFile = portal === "broker" ? "app/frankbroker-app.tsx" : "app/investor/investor-app.tsx";
  // Investor copy that has been localised no longer sits in the JSX — the English
  // source strings live in the translation dictionary, so it counts as portal
  // copy for the assertions that check which surfaces still ship.
  const copyFiles = portal === "investor" ? ["lib/i18n/en.ts"] : [];
  const [app, features, ...copy] = await Promise.all([
    readFile(new URL(`../${appFile}`, import.meta.url), "utf8"),
    readFeatureTree(new URL(`../features/${portal}/`, import.meta.url)),
    ...copyFiles.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")),
  ]);
  return [app, features, ...copy].join("\n");
}

export const readBrokerFrontend = () => readPortalSource("broker");
export const readInvestorFrontend = () => readPortalSource("investor");
