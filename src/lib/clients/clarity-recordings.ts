/**
 * Session recordings from Microsoft Clarity.
 *
 * This is the endpoint Microsoft's own MCP server calls for its
 * `list-session-recordings` tool (github.com/microsoft/clarity-mcp-server,
 * src/constants.ts and src/tools.ts). It is not in the Data Export REST docs.
 * The MCP docs say it uses the project's Data Export token, and the 10
 * requests per project per day appear to cover it, so one call per project
 * per day is made. The response's field names are not documented; the parser
 * in src/lib/ingest/clarity-recordings.ts reads them defensively and keeps
 * the raw session object.
 */

const RECORDINGS_URL = "https://clarity.microsoft.com/mcp/recordings/sample";

/** SortOptionsEnum.SessionStart_DESC in the MCP server's src/types.ts. */
const NEWEST_FIRST = 0;
/** The MCP server's schema caps one call at 250 sessions. */
export const MAX_RECORDINGS = 250;

export async function fetchClarityRecordings(
  token: string,
  window: { start: string; end: string },
  count = MAX_RECORDINGS,
): Promise<unknown> {
  if (!token.trim()) throw new Error("Clarity token is empty");

  const response = await fetch(RECORDINGS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sortBy: NEWEST_FIRST,
      start: window.start,
      end: window.end,
      filters: { date: { start: window.start, end: window.end } },
      count: Math.min(Math.max(1, count), MAX_RECORDINGS),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Clarity recordings returned ${response.status}`);
  }
  return response.json();
}
