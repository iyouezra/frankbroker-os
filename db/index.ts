import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import initialMigration from "../drizzle/0000_exotic_gravity.sql?raw";

let initialization: Promise<void> | null = null;

/**
 * Sites applies migrations during deployment. This small guard also makes a
 * fresh local D1 binding usable on the first API request without a separate
 * Wrangler configuration file.
 */
export async function ensureDb() {
  if (initialization) return initialization;
  initialization = (async () => {
    const exists = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'brokers'")
      .first();
    if (exists) return;

    const statements = initialMigration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  })();
  return initialization;
}

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
