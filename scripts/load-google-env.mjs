/**
 * Copies a Google service-account JSON into .env.local.
 * Usage: node scripts/load-google-env.mjs path/to/key.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/load-google-env.mjs path/to/key.json");
  process.exit(1);
}

const key = JSON.parse(readFileSync(resolve(jsonPath), "utf8"));
if (!key.client_email || !key.private_key) {
  console.error("JSON is missing client_email or private_key");
  process.exit(1);
}

const envPath = new URL("../.env.local", import.meta.url);
let env = readFileSync(envPath, "utf8");

const privateKey = String(key.private_key).replace(/\r\n/g, "\n").replace(/\n/g, "\\n");

function setVar(name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(env)) env = env.replace(pattern, line);
  else env += `\n${line}\n`;
}

setVar("GOOGLE_SERVICE_ACCOUNT_EMAIL", key.client_email);
setVar("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", `"${privateKey}"`);

if (/^INGEST_SECRET=\s*$/m.test(env)) {
  setVar("INGEST_SECRET", randomBytes(32).toString("hex"));
}

writeFileSync(envPath, env);
console.error(`Wrote ${key.client_email} into .env.local`);
