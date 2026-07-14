interface Fetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

type D1Database = import("@cloudflare/workers-types").D1Database;

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    ASSETS: Fetcher;
  };
}

declare module "*.sql?raw" {
  const sql: string;
  export default sql;
}
