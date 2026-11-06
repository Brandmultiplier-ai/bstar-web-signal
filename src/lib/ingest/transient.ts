/** A dropped connection or timeout, as opposed to a bad credential or a rejected request. */
export function isTransient(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up|network error|timed? ?out|\b50[234]\b/i.test(
    message,
  );
}
