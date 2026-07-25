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
  if (error && typeof error === "object" && "code" in error && String((error as { code?: unknown }).code) === "P2002") {
    return Response.json({ error: "This request was already recorded. Refresh to view the existing record." }, { status: 409 });
  }
  if (error instanceof Error && ["InvalidOrderTransitionError", "InvalidThreadTransitionError", "LedgerIntegrityError"].includes(error.name)) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (isDatabaseOffline(error)) {
    return Response.json(
      { error: "Read-only demo mode: connect a database (set DATABASE_URL) to record this action.", offline: true },
      { status: 503 },
    );
  }
  // Keep database/driver details out of production responses while preserving
  // useful local diagnostics during MVP development.
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (process.env.NODE_ENV === "production") console.error("Unhandled API error", error);
  return Response.json({ error: process.env.NODE_ENV === "production" ? "Unexpected server error." : message }, { status: 500 });
}
