/**
 * Shared API error handling. Read endpoints degrade to demo data client-side, but
 * write/workflow actions hit the database directly — when none is connected (local
 * demo with no `DATABASE_URL`), this turns the raw Prisma connection error into a
 * clean "read-only demo mode" response instead of leaking a stack trace into a toast.
 */

export function isDatabaseOffline(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "PrismaClientInitializationError" ||
    code === "P1001" ||
    code === "P1017" ||
    code === "ECONNREFUSED" ||
    /can'?t reach database server|econnrefused|connection refused|connection terminated|server has closed the connection|the database server (was|is) not reachable/i.test(message)
  );
}

export function apiError(error: unknown): Response {
  if (error instanceof Response) return error;
  if (isDatabaseOffline(error)) {
    return Response.json(
      { error: "Read-only demo mode: connect a database (set DATABASE_URL) to record this action.", offline: true },
      { status: 503 },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}
