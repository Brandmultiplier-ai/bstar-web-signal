import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Puts `.env.local` onto `process.env` before any other script import reads it.
 * Next.js does this automatically; tsx does not.
 */
const envPath = resolve(process.cwd(), ".env.local");
const raw = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq);
  let value = trimmed.slice(eq + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (process.env[key] === undefined) process.env[key] = value;
}
