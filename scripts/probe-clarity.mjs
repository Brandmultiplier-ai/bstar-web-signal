/**
 * One-off probe of Clarity's live-insights endpoint, used to confirm the shape
 * of a dimensioned response before wiring the ingestor to it.
 *
 * Clarity allows only 10 requests per day per project, so run this sparingly.
 *   node scripts/probe-clarity.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const url = new URL("https://www.clarity.ms/export-data/api/v1/project-live-insights");
url.searchParams.set("numOfDays", "3");
url.searchParams.set("dimension1", "URL");

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${env.CLARITY_API_TOKEN}` },
});

console.log("status", response.status);
const body = await response.text();

if (!response.ok) {
  console.log(body.slice(0, 500));
  process.exit(1);
}

const metrics = JSON.parse(body);
writeFileSync(new URL("../.clarity-probe.json", import.meta.url), body);
console.log("metrics:", metrics.map((m) => m.metricName).join(", "));

// Only the metrics whose payload shape differs from the click-count family.
for (const name of ["ScrollDepth", "Traffic", "EngagementTime"]) {
  const rows = metrics.find((m) => m.metricName === name)?.information ?? [];
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  console.log("keys:", Object.keys(rows[0] ?? {}).join(", "));
  console.log(JSON.stringify(rows.slice(0, 3), null, 2));
}
