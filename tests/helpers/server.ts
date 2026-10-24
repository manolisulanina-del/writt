// Talks to a running `npm run dev:test` server the way a browser would, but with
// full control over requests: logs in through Auth.js, and calls server
// actions directly by id (skipping the UI). Only ever uses the test database.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(__dirname, "../..");
export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const devEnv = readEnv(".env.testdb");
const baseEnv = readEnv(".env");

/** Refuses anything but a database whose name ends in "_dev". */
export function devDatabaseUrl(): string {
  const url = devEnv.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL in .env.testdb (the test database).");
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_dev")) throw new Error(`Refusing to run security tests against "${name}": not a _dev database.`);
  return url;
}

export const db = new PrismaClient({ datasources: { db: { url: devDatabaseUrl() } } });
export const ADMIN_EMAIL = (devEnv.ADMIN_EMAIL ?? baseEnv.ADMIN_EMAIL ?? "").toLowerCase();
export const ADMIN_PASSWORD = devEnv.TEST_ADMIN_PASSWORD ?? "";

export class Jar {
  cookies = new Map<string, string>();
  store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

export async function login(identifier: string, password: string): Promise<Jar> {
  const jar = new Jar();
  let res = await fetch(`${BASE}/api/auth/csrf`);
  jar.store(res);
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ csrfToken, identifier, password }),
  });
  jar.store(res);
  if (![...jar.cookies.keys()].some((k) => k.includes("session-token"))) throw new Error(`Login failed for ${identifier}`);
  return jar;
}

/**
 * Logs in as a user that exists only in the test database. If that fails, the
 * server is running on the real database: stop before any test touches it.
 */
export async function assertTestServer(identifier: string, password: string): Promise<Jar> {
  try {
    return await login(identifier, password);
  } catch {
    throw new Error(`The server at ${BASE} isn't using the test database. Start it with "npm run dev:test", then run the tests again.`);
  }
}

export async function get(pathname: string, jar?: Jar) {
  const res = await fetch(BASE + pathname, { redirect: "manual", headers: jar ? { cookie: jar.header() } : {} });
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
}

// ---- Server action ids, from Next's per-page manifests ----

function manifests(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) manifests(p, out);
    else if (name === "server-reference-manifest.json") out.push(p);
  }
  return out;
}

export function actionId(exportedName: string): string {
  for (const file of manifests(path.join(ROOT, ".next/dev/server/app"))) {
    const m = JSON.parse(readFileSync(file, "utf8")) as { node?: Record<string, { exportedName: string }> };
    for (const [id, entry] of Object.entries(m.node ?? {})) if (entry.exportedName === exportedName) return id;
  }
  throw new Error(`Server action ${exportedName} not compiled yet; open a page that uses it first.`);
}

export type ActionResult = { status: number; body: string; notFound: boolean; redirect: string | null };

/** Calls a server action that takes plain arguments. */
export async function callAction(jar: Jar, pathname: string, name: string, args: unknown[]): Promise<ActionResult> {
  const res = await fetch(BASE + pathname, {
    method: "POST",
    redirect: "manual",
    headers: { "next-action": actionId(name), "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", cookie: jar.header() },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  return { status: res.status, body, notFound: res.status === 404 || body.includes("NEXT_HTTP_ERROR_FALLBACK;404"), redirect: res.headers.get("x-action-redirect") };
}

/**
 * Calls a form action (useActionState: `(prevState, formData)`) with any fields,
 * encoded exactly as the browser sends it: the form's fields prefixed "_1_",
 * then the argument list as JSON under "0" with the form referenced as "$K1".
 */
export async function callFormAction(
  jar: Jar,
  pathname: string,
  name: string,
  fields: Record<string, string>,
  /** Arguments bound with .bind(null, ...) in the page, sent before the form state. */
  bound: unknown[] = [],
): Promise<ActionResult> {
  const id = actionId(name);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(`_1_${key}`, value);
  form.append("0", JSON.stringify([...bound, {}, "$K1"]));
  const res = await fetch(BASE + pathname, {
    method: "POST",
    redirect: "manual",
    headers: { "next-action": id, accept: "text/x-component", cookie: jar.header() },
    body: form,
  });
  const body = await res.text();
  return { status: res.status, body, notFound: res.status === 404 || body.includes("NEXT_HTTP_ERROR_FALLBACK;404"), redirect: res.headers.get("x-action-redirect") };
}

/** Opens pages once so the dev server compiles them and records their action ids. */
export async function warmUp(jar: Jar, pages: string[]) {
  for (const p of pages) await get(p, jar);
}
