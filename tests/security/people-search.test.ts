// Searching "@username" brings up that person's profile. Runs against
// `npm run dev:test` (the test database only): npm run test:security
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertTestServer, db, get, type Jar } from "../helpers/server";

const RUN = Date.now().toString(36);
const PW = "Find-Test-Pass-2026!";
const name = (tag: string) => `q${RUN}_${tag}`.slice(0, 20);

async function make(tag: string, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: {
      email: `find-${RUN}-${tag}@example.com`,
      username: name(tag),
      passwordHash: await bcrypt.hash(PW, 10),
      needsSetup: false,
      hasSeenTutorial: true,
      birthDate: new Date("1990-01-01T00:00:00Z"),
      hiddenWarnings: [],
      ...extra,
    },
    select: { id: true, username: true },
  });
}

let me: { id: string; username: string };
let blocked: { id: string; username: string };
let jar: Jar;

beforeAll(async () => {
  await db.rateLimit.deleteMany({});
  me = await make("me");
  await make("mira");
  await make("miranda");
  blocked = await make("mirabel");
  await make("mirafam", { kind: "FAMILY" });
  await make("miraban", { bannedUntil: new Date(Date.now() + 86_400_000) });
  await make("mirasetup", { needsSetup: true });
  await db.block.create({ data: { blockerId: me.id, blockedId: blocked.id } });
  jar = await assertTestServer(me.username, PW);
}, 300_000);

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: "find-" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
  await db.account.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.rateLimit.deleteMany({});
  await db.$disconnect();
}, 120_000);

const search = (q: string) => get(`/browse?q=${encodeURIComponent(q)}`, jar);

describe("searching for people", () => {
  it('"@name" brings up that profile, best match first', async () => {
    const res = await search(`@${name("mira")}`);
    expect(res.body).toContain("People");
    expect(res.body).toContain(`href="/u/${name("mira")}"`);
    // The exact match is listed before the longer name that merely contains it.
    expect(res.body.indexOf(`/u/${name("mira")}"`)).toBeLessThan(res.body.indexOf(`/u/${name("miranda")}"`));
  });

  it("works without the @, too", async () => {
    const res = await search(name("miranda"));
    expect(res.body).toContain(`href="/u/${name("miranda")}"`);
  });

  it("never shows family accounts, banned or unfinished accounts, or people you blocked", async () => {
    const res = await search(`@${name("mira")}`);
    for (const hidden of ["mirafam", "miraban", "mirasetup", "mirabel"]) expect(res.body).not.toContain(`/u/${name(hidden)}"`);
  });

  it("shows a friendly message when nobody matches", async () => {
    const res = await search("@zzzzqqqqnobody");
    expect(res.body).toContain("No books or people found");
  });
});
