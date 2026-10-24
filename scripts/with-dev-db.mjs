// Runs a command against the test database only (npm run dev:test, test scripts, builds).
//   node scripts/with-dev-db.mjs <command> [...args]
// Loads every variable from .env.testdb (DATABASE_URL, ADMIN_USER_ID, ...), which win over
// .env (Prisma and Next load that on their own), and refuses to run unless the database
// name ends in "_dev", so tests can never reach the real database. Plain `npm run dev`
// doesn't read .env.testdb: it uses your real database and account.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function devEnv() {
  let text;
  try {
    text = readFileSync(new URL("../.env.testdb", import.meta.url), "utf8");
  } catch {
    throw new Error("Missing .env.testdb with a DATABASE_URL for the test database.");
  }
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
  return env;
}

export function devDatabaseUrl() {
  const url = devEnv().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in .env.testdb.");
  const db = new URL(url).pathname.replace(/^\//, "");
  if (!db.endsWith("_dev")) throw new Error(`Refusing to run: database "${db}" doesn't end in "_dev".`);
  return url;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("with-dev-db.mjs")) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.error("Usage: node scripts/with-dev-db.mjs <command> [...args]");
    process.exit(2);
  }
  const url = devDatabaseUrl();
  console.log(`Using dev database: ${new URL(url).pathname.slice(1)}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: { ...process.env, ...devEnv(), DATABASE_URL: url } });
  process.exit(result.status ?? 1);
}
