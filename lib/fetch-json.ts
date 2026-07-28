type JsonErrorBody = {
  error?: unknown;
};

type FetchJsonOptions = {
  fallbackMessage: string;
  retries?: number;
  retryDelayMs?: number;
};

const TRANSIENT_READ_STATUSES = new Set([500, 502, 503, 504]);

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function responseMessage(body: JsonErrorBody, fallbackMessage: string) {
  return typeof body.error === "string" && body.error.trim() ? body.error : fallbackMessage;
}

/**
 * Retry idempotent JSON reads that fail while a remote database or serverless
 * route is waking up. Callers still receive the server's final error message.
 */
export async function fetchJsonWithTransientRetry<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: FetchJsonOptions,
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 2);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 350);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok) return await response.json() as T;

      const body = await response.json().catch(() => ({})) as JsonErrorBody;
      if (!TRANSIENT_READ_STATUSES.has(response.status) || attempt === retries) {
        throw new Error(responseMessage(body, options.fallbackMessage));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof Error && error.message !== "Failed to fetch") throw error;
      if (attempt === retries) throw new Error(options.fallbackMessage);
    }

    await wait(retryDelayMs * (attempt + 1));
  }

  throw new Error(options.fallbackMessage);
}
