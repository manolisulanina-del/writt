// Family accounts, kids' restrictions, coins and themes, end to end against
// `npm run dev:test` (the test database only). Run: npm run test:security
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL, ADMIN_PASSWORD, Jar, assertTestServer, callAction, callFormAction, db, get, login, warmUp } from "../helpers/server";

const RUN = Date.now().toString(36);
const PW = "Fam-Test-Pass-2026!";
const DAY = 24 * 60 * 60_000;

const yearsAgo = (years: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate() - 2));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const words = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}w${i}`).join(" ");
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const num = (body: string, key: string) => Number(body.match(new RegExp(`"${key}":(\\d+)`))?.[1] ?? NaN);

type U = { id: string; username: string; email: string };

async function makeUser(tag: string, age: number, extra: Record<string, unknown> = {}): Promise<U> {
  return db.user.create({
    data: {
      email: `fam-${RUN}-${tag}@example.com`,
      username: `f${RUN}_${tag}`.slice(0, 20),
      passwordHash: await bcrypt.hash(PW, 10),
      needsSetup: false,
      hasSeenTutorial: true,
      birthDate: yearsAgo(age),
      hiddenWarnings: [],
      ...extra,
    },
    select: { id: true, username: true, email: true },
  }) as Promise<U>;
}

/** A child (7 to 15) already approved by `parentId`. */
async function makeChild(tag: string, age: number, parentId: string, extra: Record<string, unknown> = {}) {
  const child = await makeUser(tag, age, { consent: "GRANTED", kidGroup: age < 13 ? "YOUNGER" : "OLDER", ...extra });
  await db.familyLink.create({ data: { parentId, childId: child.id } });
  return child;
}

async function makeBook(authorId: string, title: string, rating: "EVERYONE" | "TEEN" | "MATURE") {
  return db.fanfic.create({
    data: {
      title,
      authorId,
      visibility: "PUBLIC",
      rating,
      warnings: [],
      publishedAt: new Date(),
      announcedAt: new Date(),
      coinsCheckedAt: new Date(),
      chapters: { create: [{ order: 0, publishAt: null, announcedAt: new Date(), coinsChecked: true, pages: { create: [{ order: 0, content: doc("A test page.") }] } }] },
    },
    select: { id: true, title: true },
  });
}

let fandomId = "";
/** The editor's save payload for a one-chapter book. */
function book(title: string, text: string, opts: { visibility?: string; rating?: string; id?: string; chapters?: { id?: string; text: string }[] } = {}) {
  return {
    id: opts.id,
    title,
    summary: "",
    coverUrl: null,
    musicUrl: "",
    musicVolume: 70,
    visibility: opts.visibility ?? "PUBLIC",
    rating: opts.rating ?? "EVERYONE",
    warnings: [],
    status: "ONGOING",
    fandomIds: [fandomId],
    tagIds: [],
    chapters: (opts.chapters ?? [{ text }]).map((c) => ({ id: c.id, title: "", noteStart: "", noteEnd: "", publishAt: null, pages: [{ content: doc(c.text) }] })),
  };
}

const coinsOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id }, select: { coins: true } })).coins;
const ledgerOf = async (userId: string) => (await db.coinTransaction.findMany({ where: { userId }, select: { amount: true } })).reduce((n, t) => n + t.amount, 0);

let admin: Jar;
let parent: U, other: U, writer: U, young: U, older: U;
let parentJar: Jar, otherJar: Jar, youngJar: Jar, olderJar: Jar;
let everyone: { id: string; title: string }, teen: { id: string; title: string }, mature: { id: string; title: string };

const createdEmails: string[] = [];
const run = (cmd: string) => callAction(admin, "/admin", "runAdminCommandAction", [cmd, true]);
const searchAll = (jar: Jar) => get(`/browse?q=${encodeURIComponent(`Fam ${RUN}`)}`, jar);

beforeAll(async () => {
  expect(ADMIN_PASSWORD, "TEST_ADMIN_PASSWORD must be set in .env.testdb").not.toBe("");
  await db.rateLimit.deleteMany({});
  parent = await makeUser("par", 41);
  other = await makeUser("oth", 39);
  writer = await makeUser("wri", 30);
  young = await makeChild("yng", 10, parent.id);
  older = await makeChild("old", 14, parent.id);
  fandomId = (await db.tag.create({ data: { kind: "FANDOM", name: `Fam Fandom ${RUN}`, key: `fam fandom ${RUN}`, createdById: writer.id }, select: { id: true } })).id;
  [everyone, teen, mature] = await Promise.all([
    makeBook(writer.id, `Fam ${RUN} Everyone`, "EVERYONE"),
    makeBook(writer.id, `Fam ${RUN} Teen`, "TEEN"),
    makeBook(writer.id, `Fam ${RUN} Mature`, "MATURE"),
  ]);

  // Fails unless the server is on the test database.
  parentJar = await assertTestServer(parent.username, PW);
  [otherJar, youngJar, olderJar, admin] = await Promise.all([
    login(other.username, PW),
    login(young.username, PW),
    login(older.username, PW),
    login(ADMIN_EMAIL, ADMIN_PASSWORD),
  ]);
  // Open each page once so the dev server compiles it and its actions.
  await warmUp(parentJar, ["/", "/create", "/browse", "/settings", "/shop", `/fanfic/${everyone.id}`, `/family/${young.id}`, "/family"]);
  await warmUp(new Jar(), ["/signup", "/approve/x".padEnd(40, "x")]);
  // The birth-date page only opens for accounts without one, so compile it with such an account.
  const noBirthDate = await makeUser("nob", 30, { birthDate: null });
  await warmUp(await login(noBirthDate.username, PW), ["/confirm-age"]);
  await warmUp(admin, ["/admin"]);
}, 300_000);

afterAll(async () => {
  const users = await db.user.findMany({
    // Every family-test account, including any left by an interrupted run.
    where: { OR: [{ email: { startsWith: "fam-" } }, { email: { in: createdEmails } }] },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const books = (await db.fanfic.findMany({ where: { authorId: { in: ids } }, select: { id: true } })).map((b) => b.id);
  const chapters = (await db.chapter.findMany({ where: { fanficId: { in: books } }, select: { id: true } })).map((c) => c.id);
  const onBooks = { fanficId: { in: books } };
  await db.page.deleteMany({ where: { chapterId: { in: chapters } } });
  await db.chapter.deleteMany({ where: onBooks });
  const commentWhere = { OR: [onBooks, { authorId: { in: ids } }] };
  await db.comment.deleteMany({ where: { ...commentWhere, parentId: { not: null } } });
  await db.comment.deleteMany({ where: commentWhere });
  const mine = { OR: [onBooks, { userId: { in: ids } }] };
  await db.reaction.deleteMany({ where: mine });
  await db.view.deleteMany({ where: mine });
  await db.libraryEntry.deleteMany({ where: mine });
  await db.readingProgress.deleteMany({ where: mine });
  await db.report.deleteMany({ where: { OR: [onBooks, { reporterId: { in: ids } }] } });
  await db.bookTag.deleteMany({ where: onBooks });
  const appeals = (await db.appeal.findMany({ where: { OR: [onBooks, { userId: { in: ids } }] }, select: { id: true } })).map((a) => a.id);
  await db.appealMessage.deleteMany({ where: { appealId: { in: appeals } } });
  await db.appeal.deleteMany({ where: { id: { in: appeals } } });
  await db.follow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] } });
  await db.fanfic.deleteMany({ where: { id: { in: books } } });
  await db.tag.deleteMany({ where: { createdById: { in: ids } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.coinTransaction.deleteMany({ where: { userId: { in: ids } } });
  await db.coinEarning.deleteMany({ where: { userId: { in: ids } } });
  await db.themeOwnership.deleteMany({ where: { userId: { in: ids } } });
  await db.familyLink.deleteMany({ where: { OR: [{ parentId: { in: ids } }, { childId: { in: ids } }] } });
  await db.consentRequest.deleteMany({ where: { childId: { in: ids } } });
  await db.consentRecord.deleteMany({ where: { OR: [{ parentId: { in: ids } }, { childId: { in: ids } }] } });
  await db.loginToken.deleteMany({ where: { userId: { in: ids } } });
  await db.adminLog.deleteMany({ where: { targetId: { in: [...ids, ...books, ...appeals] } } });
  await db.account.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.rateLimit.deleteMany({});
  await db.$disconnect();
}, 120_000);

describe("sign-up age check", () => {
  it("rejects anyone under 7 and saves nothing", async () => {
    const email = `fam-${RUN}-six@example.com`;
    const res = await callFormAction(new Jar(), "/signup", "signupAction", { birthDate: iso(yearsAgo(6)), email, password: PW, confirmPassword: PW });
    expect(res.body).toContain("Sorry, you need to be at least 7 to use Writt.");
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("keeps a 7–15 account locked until a parent approves", async () => {
    const email = `fam-${RUN}-new@example.com`;
    createdEmails.push(email);
    await callFormAction(new Jar(), "/signup", "signupAction", { birthDate: iso(yearsAgo(10)), email, password: PW, confirmPassword: PW });
    const created = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true, consent: true, consentDeadline: true, kidGroup: true } });
    expect(created.consent).toBe("PENDING");
    expect(created.kidGroup).toBe("YOUNGER");
    expect(Math.abs(created.consentDeadline!.getTime() - (Date.now() + 7 * DAY))).toBeLessThan(5 * 60_000);

    // After onboarding, everything sends them to the parent step, and actions are refused.
    await db.user.update({ where: { id: created.id }, data: { needsSetup: false, username: `f${RUN}_new` } });
    const kid = await login(email, PW);
    const home = await get("/", kid);
    expect(`${home.location ?? ""}${home.body}`).toContain("/family-consent");
    const follow = await callAction(kid, `/fanfic/${everyone.id}`, "toggleFollowAction", [writer.username]);
    expect(`${follow.redirect ?? ""}${follow.body}`).toContain("/family-consent");
    expect(await db.follow.count({ where: { followerId: created.id } })).toBe(0);

    // The parent opens the link from the email and approves.
    const token = `t${RUN}`.padEnd(32, "k");
    await db.consentRequest.create({
      data: { childId: created.id, method: "EMAIL", contact: "parent@example.com", tokenHash: createHash("sha256").update(token).digest("hex"), codeHash: null, expiresAt: new Date(Date.now() + 7 * DAY) },
    });
    const approve = await callFormAction(parentJar, `/approve/${token}`, "decideConsentAction", { agree: "on", decision: "approve" }, [token]);
    expect(`${approve.redirect ?? ""}${approve.body}`).toContain(`/family/${created.id}`);
    const after = await db.user.findUniqueOrThrow({ where: { id: created.id }, select: { consent: true } });
    expect(after.consent).toBe("GRANTED");
    expect(await db.familyLink.count({ where: { parentId: parent.id, childId: created.id } })).toBe(1);
    const record = await db.consentRecord.findFirst({ where: { childId: created.id }, select: { parentId: true, method: true, text: true } });
    expect(record).toMatchObject({ parentId: parent.id, method: "EMAIL" });
    expect(record!.text).toContain("I am this child’s parent or guardian and I give permission.");
    const unlocked = await get("/", await login(email, PW));
    expect(`${unlocked.location ?? ""}${unlocked.body}`).not.toContain("/family-consent");
  });

  it("doesn't let a child change their date of birth", async () => {
    const before = (await db.user.findUniqueOrThrow({ where: { id: young.id }, select: { birthDate: true } })).birthDate!.toISOString();
    await callFormAction(youngJar, "/settings", "updateContentPrefsAction", { birthDate: "1990-01-01", hideMature: "on" });
    await callFormAction(youngJar, "/confirm-age", "confirmBirthDateAction", { birthDate: "1990-01-01" });
    const after = (await db.user.findUniqueOrThrow({ where: { id: young.id }, select: { birthDate: true } })).birthDate!.toISOString();
    expect(after).toBe(before);
  });
});

describe("parents", () => {
  it("can only see and manage their own children", async () => {
    const page = await get(`/family/${young.id}`, otherJar);
    expect(page.body).not.toContain("Books waiting for your approval");
    const change = await callAction(otherJar, `/family/${young.id}`, "setControlAction", [young.id, "commentsOff", false]);
    expect(change.notFound).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: young.id }, select: { kidControls: true } })).kidControls).toBeNull();
    expect((await get(`/api/family/export/${young.id}`, otherJar)).status).toBe(404);

    const own = await get(`/family/${young.id}`, parentJar);
    expect(own.body).toContain("Books waiting for your approval");
    const exported = await get(`/api/family/export/${young.id}`, parentJar);
    expect(exported.status).toBe(200);
    expect(exported.body).toContain(young.username);
  });
});

describe("ages 7 to 12 (Younger)", () => {
  it("can't comment, follow or see Teen books", async () => {
    const comment = await callAction(youngJar, `/fanfic/${everyone.id}`, "addCommentAction", [everyone.id, "hello!"]);
    expect(comment.body).toContain("Comments are turned off on your account.");
    const follow = await callAction(youngJar, `/fanfic/${everyone.id}`, "toggleFollowAction", [writer.username]);
    expect(follow.body).toContain("Following is turned off on your account.");
    const search = await searchAll(youngJar);
    expect(search.body).toContain(everyone.title);
    expect(search.body).not.toContain(teen.title);
    expect(search.body).not.toContain(mature.title);
    expect((await get(`/fanfic/${teen.id}`, youngJar)).body).toContain("This book isn’t available on your account");
  });

  it("must rate their books Everyone, and a published book waits for the parent", async () => {
    const teenBook = await callAction(youngJar, "/create", "saveFanficAction", [book(`Fam ${RUN} kid teen`, words(320, "kt"), { rating: "TEEN" })]);
    expect(teenBook.body).toContain("Your books must be rated Everyone.");

    const saved = await callAction(youngJar, "/create", "saveFanficAction", [book(`Fam ${RUN} kid book`, words(320, "kb"))]);
    expect(saved.body).toContain('"awaitingApproval":true');
    const id = saved.body.match(/"id":"([a-f0-9]{24})"/)![1];
    expect(await db.fanfic.findUniqueOrThrow({ where: { id }, select: { visibility: true, awaitingApproval: true } })).toEqual({ visibility: "PRIVATE", awaitingApproval: true });
    expect(await db.notification.count({ where: { userId: parent.id, kind: "BOOK_APPROVAL" } })).toBe(1);
    expect(await coinsOf(young.id)).toBe(0); // nothing until the parent approves

    await callAction(parentJar, `/family/${young.id}`, "approveBookAction", [young.id, id]);
    expect(await db.fanfic.findUniqueOrThrow({ where: { id }, select: { visibility: true, awaitingApproval: true } })).toEqual({ visibility: "PUBLIC", awaitingApproval: false });
    expect(await coinsOf(young.id)).toBe(50); // coins are earned on approval
  });

  it("a parent can turn off one restriction at a time", async () => {
    await callAction(parentJar, `/family/${young.id}`, "setControlAction", [young.id, "commentsOff", false]);
    const comment = await callAction(youngJar, `/fanfic/${everyone.id}`, "addCommentAction", [everyone.id, "hi from a kid"]);
    expect(comment.body).toContain('"comment"');
    // The others stay on.
    const follow = await callAction(youngJar, `/fanfic/${everyone.id}`, "toggleFollowAction", [writer.username]);
    expect(follow.body).toContain("Following is turned off on your account.");
  });

  it("never shows Mature books, even with every restriction off", async () => {
    for (const key of ["everyoneOnly", "approveBooks", "limitedProfile", "noFollow"]) {
      await callAction(parentJar, `/family/${young.id}`, "setControlAction", [young.id, key, false]);
    }
    const search = await searchAll(youngJar);
    expect(search.body).toContain(teen.title); // allowed now
    expect(search.body).not.toContain(mature.title);
    expect((await get(`/fanfic/${mature.id}`, youngJar)).body).toContain("Mature books aren’t available on accounts for readers under 16.");
  });
});

describe("ages 13 to 15 (Older)", () => {
  it("can see Teen books, comment and follow", async () => {
    const search = await searchAll(olderJar);
    expect(search.body).toContain(teen.title);
    expect(search.body).not.toContain(mature.title);
    const comment = await callAction(olderJar, `/fanfic/${everyone.id}`, "addCommentAction", [everyone.id, "great book"]);
    expect(comment.body).toContain('"comment"');
    await callAction(olderJar, `/fanfic/${everyone.id}`, "toggleFollowAction", [writer.username]);
    expect(await db.follow.count({ where: { followerId: older.id, followingId: writer.id } })).toBe(1);
  });

  it("a parent can turn on any restriction, or all of them with “Use younger restrictions”", async () => {
    await callAction(parentJar, `/family/${older.id}`, "setControlAction", [older.id, "commentsOff", true]);
    const comment = await callAction(olderJar, `/fanfic/${everyone.id}`, "addCommentAction", [everyone.id, "again"]);
    expect(comment.body).toContain("Comments are turned off on your account.");

    await callAction(parentJar, `/family/${older.id}`, "applyYoungerRestrictionsAction", [older.id]);
    const stored = (await db.user.findUniqueOrThrow({ where: { id: older.id }, select: { kidControls: true } })).kidControls as Record<string, boolean>;
    for (const key of ["everyoneOnly", "commentsOff", "approveBooks", "limitedProfile", "noFollow"]) expect(stored[key]).toBe(true);
    expect((await searchAll(olderJar)).body).not.toContain(teen.title);
    expect(await db.follow.count({ where: { followerId: older.id } })).toBe(0); // "no following" ended the follow
  });
});

describe("birthdays", () => {
  it("at 13 moves the child to Older, keeps the parent's changes, and tells the parent", async () => {
    const kid = await makeChild("t13", 13, parent.id, { kidGroup: "YOUNGER", kidControls: { commentsOff: false, approveBooks: true } });
    const res = await get("/api/cron/family", admin);
    expect(res.status).toBe(200);
    const after = await db.user.findUniqueOrThrow({ where: { id: kid.id }, select: { kidGroup: true, kidControls: true } });
    expect(after.kidGroup).toBe("OLDER");
    expect(after.kidControls).toEqual({ commentsOff: false, approveBooks: true });
    const note = await db.notification.findFirst({ where: { userId: parent.id, title: `${kid.username} is now 13` }, select: { body: true } });
    expect(note?.body).toBe(
      `${kid.username} is now 13. Their account now uses the restrictions for ages 13 to 15. You can change them in your family dashboard.`,
    );
    // Untouched settings follow the older defaults: Teen books are visible now.
    expect((await searchAll(await login(kid.username, PW))).body).toContain(teen.title);
  });

  it("at 16 ends every restriction and removes the family link", async () => {
    const kid = await makeChild("t16", 16, parent.id, { kidGroup: "OLDER", kidControls: { commentsOff: true } });
    await get("/api/cron/family", admin);
    const after = await db.user.findUniqueOrThrow({ where: { id: kid.id }, select: { consent: true, kidGroup: true, kidControls: true } });
    expect(after).toEqual({ consent: "NOT_REQUIRED", kidGroup: null, kidControls: null });
    expect(await db.familyLink.count({ where: { childId: kid.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: kid.id, title: "Happy 16th birthday!" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: parent.id, title: `${kid.username} is now 16` } })).toBe(1);
    const comment = await callAction(await login(kid.username, PW), `/fanfic/${everyone.id}`, "addCommentAction", [everyone.id, "16 now"]);
    expect(comment.body).toContain('"comment"');
  });
});

describe("coins", () => {
  it("pays 50 for a public book of 300+ words, nothing for a shorter one, and 10 for a new chapter", async () => {
    const w = await makeUser("cw1", 30);
    const jar = await login(w.username, PW);
    const long = await callAction(jar, "/create", "saveFanficAction", [book(`Fam ${RUN} long`, words(320, "l1"))]);
    expect(num(long.body, "coins")).toBe(50);
    const short = await callAction(jar, "/create", "saveFanficAction", [book(`Fam ${RUN} short`, words(120, "s1"))]);
    expect(num(short.body, "coins")).toBe(0);
    expect(await coinsOf(w.id)).toBe(50);

    // A second chapter added later earns 10.
    const id = long.body.match(/"id":"([a-f0-9]{24})"/)![1];
    const first = await db.chapter.findFirstOrThrow({ where: { fanficId: id }, select: { id: true } });
    const more = await callAction(jar, "/create", "saveFanficAction", [
      book(`Fam ${RUN} long`, "", { id, chapters: [{ id: first.id, text: words(320, "l1") }, { text: words(310, "l2") }] }),
    ]);
    expect(num(more.body, "coins")).toBe(10);
    expect(await coinsOf(w.id)).toBe(60);
    expect(await ledgerOf(w.id)).toBe(60);
  });

  it("stops at 3 books a day", async () => {
    const w = await makeUser("cw2", 30);
    const jar = await login(w.username, PW);
    for (let i = 0; i < 4; i++) await callAction(jar, "/create", "saveFanficAction", [book(`Fam ${RUN} daily ${i}`, words(310, `d${i}`))]);
    expect(await coinsOf(w.id)).toBe(150);
  });

  it("doesn't pay twice when a book is deleted and posted again", async () => {
    const w = await makeUser("cw3", 30);
    const jar = await login(w.username, PW);
    const text = words(330, "rp");
    const first = await callAction(jar, "/create", "saveFanficAction", [book(`Fam ${RUN} repost`, text)]);
    const id = first.body.match(/"id":"([a-f0-9]{24})"/)![1];
    await warmUp(jar, [`/fanfic/${id}`]);
    await callAction(jar, `/fanfic/${id}`, "deleteFanficAction", [id]);
    expect(await db.fanfic.count({ where: { id } })).toBe(0);
    const again = await callAction(jar, "/create", "saveFanficAction", [book(`Fam ${RUN} repost again`, text)]);
    expect(num(again.body, "coins")).toBe(0);
    expect(await coinsOf(w.id)).toBe(50);
  });

  it("takes coins back when a book is removed, and gives them back when an appeal is approved", async () => {
    const w = await makeUser("cw4", 30);
    const jar = await login(w.username, PW);
    const saved = await callAction(jar, "/create", "saveFanficAction", [book(`Fam ${RUN} removable`, words(320, "rm"))]);
    const id = saved.body.match(/"id":"([a-f0-9]{24})"/)![1];
    expect(await coinsOf(w.id)).toBe(50);

    expect((await run(`/remove ${id} security test`)).body).toContain('"ok":true');
    expect(await coinsOf(w.id)).toBe(0);
    const notice = await db.notification.findFirst({ where: { userId: w.id, kind: "BOOK_REMOVED" }, select: { body: true } });
    expect(notice?.body).toContain("We took back the 50 coins it earned.");

    const appeal = await db.appeal.create({ data: { userId: w.id, fanficId: id, bookTitle: `Fam ${RUN} removable`, message: "please" }, select: { id: true } });
    expect((await run(`/approve ${appeal.id}`)).body).toContain('"ok":true');
    expect(await coinsOf(w.id)).toBe(50);
    expect(await ledgerOf(w.id)).toBe(50);
  });
});

describe("theme shop", () => {
  it("refuses to buy without enough coins, and the balance never goes below 0", async () => {
    const b = await makeUser("buy", 30);
    const jar = await login(b.username, PW);
    const broke = await callAction(jar, "/shop", "buyThemeAction", ["emo"]);
    expect(broke.body).toContain("You need 200 more coins.");
    expect(await coinsOf(b.id)).toBe(0);

    await run(`/givecoins @${b.username} 160`);
    // Several purchases at once: only what the balance covers goes through.
    const results = await Promise.all([
      callAction(jar, "/shop", "buyThemeAction", ["pastel"]),
      callAction(jar, "/shop", "buyThemeAction", ["pastel"]),
      callAction(jar, "/shop", "buyThemeAction", ["emo"]),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]); // a clear answer each, never a server error
    const coins = await coinsOf(b.id);
    expect(coins).toBe(10);
    expect(await ledgerOf(b.id)).toBe(coins);
    expect(await db.themeOwnership.count({ where: { userId: b.id } })).toBe(1);
  });

  it("keeps Analog Horror from anyone under 12, even through direct requests", async () => {
    await run(`/givecoins @${young.username} 400`);
    expect((await callAction(youngJar, "/shop", "buyThemeAction", ["analog-horror"])).body).toContain("Analog Horror is available when you turn 12.");
    expect((await callAction(youngJar, "/shop", "applyThemeAction", ["analog-horror"])).body).toContain("Analog Horror is available when you turn 12.");
    const preview = await get("/?preview=analog-horror", youngJar);
    expect(preview.body).toContain("Analog Horror is available when you turn 12.");
    expect(preview.body).not.toContain('data-home-theme="analog-horror"');
    expect((await run(`/givetheme @${young.username} analog-horror`)).body).toContain("can’t have Analog Horror");
    // Even if it were stored somehow, the homepage won't use it.
    await db.user.update({ where: { id: young.id }, data: { homeTheme: "analog-horror" } });
    expect((await get("/", youngJar)).body).not.toContain('data-home-theme="analog-horror"');
    expect(await db.themeOwnership.count({ where: { userId: young.id } })).toBe(0);
  });

  it("gives the admin unlimited coins: themes cost nothing, and the balance shows ∞", async () => {
    const me = await db.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL }, select: { id: true, coins: true } });
    await db.themeOwnership.deleteMany({ where: { userId: me.id, theme: "emo" } });
    const bought = await callAction(admin, "/shop", "buyThemeAction", ["emo"]);
    expect(bought.body).toContain('"ok":true');
    expect(await coinsOf(me.id)).toBe(me.coins);
    expect(await db.coinTransaction.count({ where: { userId: me.id, reason: "THEME_PURCHASE" } })).toBe(0);
    expect((await get("/shop", admin)).body).toContain("∞");
    await db.themeOwnership.deleteMany({ where: { userId: me.id, theme: "emo", source: "ADMIN" } });
  });

  it("refuses purchases when a parent turned the shop off", async () => {
    await callAction(parentJar, `/family/${young.id}`, "setControlAction", [young.id, "shop", false]);
    const res = await callAction(youngJar, "/shop", "buyThemeAction", ["pastel"]);
    expect(res.body).toContain("The shop is turned off on your account.");
    expect((await get("/shop", youngJar)).body).toContain("The shop is turned off on your account.");
    expect(await db.themeOwnership.count({ where: { userId: young.id } })).toBe(0);
  });
});
