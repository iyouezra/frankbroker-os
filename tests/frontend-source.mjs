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
  const [app, features] = await Promise.all([
    readFile(new URL(`../${appFile}`, import.meta.url), "utf8"),
    readFeatureTree(new URL(`../features/${portal}/`, import.meta.url)),
  ]);
  return `${app}\n${features}`;
}

export const readBrokerFrontend = () => readPortalSource("broker");
export const readInvestorFrontend = () => readPortalSource("investor");
