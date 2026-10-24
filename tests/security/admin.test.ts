// Admin security tests. Run against `npm run dev` on the local dev database:
//   npm run test:security
// A regular account must not be able to use any admin power; the admin
// (@annamanoliadmin, by ADMIN_EMAIL and ADMIN_USER_ID) must be able to use all of them.
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COMMANDS } from "@/lib/admin/catalog";
import { ADMIN_EMAIL, ADMIN_PASSWORD, assertTestServer, callAction, callFormAction, db, get, login, warmUp, type Jar } from "../helpers/server";

const RUN = Date.now().toString(36);
const PW = "Sec-Test-Pass-2026!";
const ADMIN_TABS = ["", "reports", "appeals", "books", "users", "families", "comments", "announcements", "settings", "log"];

type Fixture = {
  attacker: { id: string; username: string };
  target: { id: string; username: string };
  spare: { id: string; username: string };
  book: string;
  removedBook: string;
  removedBook2: string;
  comment: string;
  report: string;
  appeal: string;
  appeal2: string;
};
let fx: Fixture;
let attacker: Jar;
let admin: Jar;
let settingsBefore: { key: string; value: unknown }[];
const started = new Date();

async function makeUser(name: string) {
  return db.user.create({
    data: {
      email: `sec-${RUN}-${name}@example.com`,
      username: `s_${RUN}_${name.slice(0, 3)}`,
      passwordHash: await bcrypt.hash(PW, 10),
      needsSetup: false,
      hasSeenTutorial: true,
      birthDate: new Date("1990-01-01T00:00:00Z"),
      hiddenWarnings: [],
    },
    select: { id: true, username: true },
  });
}

async function makeBook(authorId: string, title: string, removed = false) {
  return db.fanfic.create({
    data: {
      title,
      authorId,
      visibility: "PUBLIC",
      rating: "EVERYONE",
      warnings: [],
      removed,
      removedAt: removed ? new Date() : null,
      publishedAt: new Date(),
      announcedAt: new Date(),
      chapters: {
        create: [
          {
            order: 0,
            publishAt: null,
            announcedAt: new Date(),
            pages: { create: [{ order: 0, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fixture." }] }] } }] },
          },
        ],
      },
    },
    select: { id: true },
  });
}

/** Everything an admin command could change, to prove a blocked call changed nothing. */
async function snapshot() {
  const ids = [fx.attacker.id, fx.target.id, fx.spare.id];
  const [users, books, comments, reports, settings, logs, appeals, messages, notes, tags] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" }, select: { username: true, role: true, image: true, bannedUntil: true, mutedUntil: true, createBlockedUntil: true } }),
    db.fanfic.findMany({ where: { authorId: { in: ids } }, orderBy: { id: "asc" }, select: { removed: true, featured: true, hotMode: true, visibility: true, commentsLocked: true } }),
    db.comment.count({ where: { fanficId: fx.book } }),
    db.report.findMany({ where: { fanficId: fx.book }, select: { status: true } }),
    db.siteSetting.findMany({ orderBy: { key: "asc" }, select: { key: true, value: true } }),
    db.adminLog.count(),
    db.appeal.findMany({ where: { userId: fx.target.id }, orderBy: { id: "asc" }, select: { status: true } }),
    db.appealMessage.count({ where: { appealId: { in: [fx.appeal, fx.appeal2] } } }),
    db.notification.count({ where: { userId: { in: ids } } }),
    db.tag.count(),
  ]);
  return JSON.stringify({ users, books, comments, reports, settings, logs, appeals, messages, notes, tags });
}

/** Example arguments for every admin command, aimed at the fixtures. */
function commandsFor(name: string): string[] {
  const t = `@${fx.target.username}`;
  const examples: Record<string, string[]> = {
    remove: [`/remove ${fx.book} security test`],
    restore: [`/restore ${fx.book}`],
    delete: [`/delete ${fx.removedBook2}`],
    feature: [`/feature ${fx.book}`],
    unfeature: [`/unfeature ${fx.book}`],
    hot: [`/hot ${fx.book}`],
    unhot: [`/unhot ${fx.book}`],
    hide: [`/hide ${fx.book}`],
    setrating: [`/setrating ${fx.book} mature`, `/setrating ${fx.book} everyone`],
    setbirthdate: [`/setbirthdate ${t} 2001-02-03`],
    family: [`/family ${t}`],
    families: ["/families"],
    coins: [`/coins ${t}`],
    givecoins: [`/givecoins ${t} 120 security test gift`],
    takecoins: [`/takecoins ${t} 20 security test`, `/takecoins ${t} 5000`],
    themeprice: ["/themeprice pastel 175", "/themeprice pastel 150"],
    givetheme: [`/givetheme ${t} emo`],
    reports: ["/reports", `/reports ${fx.book}`],
    clearreports: [`/clearreports ${fx.book}`],
    threshold: ["/threshold 21"],
    appeals: ["/appeals"],
    appeal: [`/appeal ${fx.appeal}`],
    reply: [`/reply ${fx.appeal} security test reply`],
    approve: [`/approve ${fx.appeal} approved in test`],
    deny: [`/deny ${fx.appeal2} denied in test`],
    lookup: [`/lookup ${t}`],
    ban: [`/ban ${t} 1 test`],
    unban: [`/unban ${t}`],
    block: [`/block ${t} 1 test`],
    unblock: [`/unblock ${t}`],
    mute: [`/mute ${t} 1 test`],
    unmute: [`/unmute ${t}`],
    warn: [`/warn ${t} security test warning`],
    resetpfp: [`/resetpfp ${t}`],
    rename: [`/rename ${t} s_${RUN}_ren`],
    deleteuser: [`/deleteuser @${fx.spare.username}`],
    deletecomment: [`/deletecomment ${fx.comment}`],
    clearcomments: [`/clearcomments ${fx.book}`],
    lockcomments: [`/lockcomments ${fx.book}`],
    unlockcomments: [`/unlockcomments ${fx.book}`],
    announce: ["/announce security test banner"],
    unannounce: ["/unannounce"],
    maintenance: ["/maintenance on", "/maintenance off"],
    stats: ["/stats"],
    help: ["/help"],
    tags: ["/tags"],
    renametag: [`/renametag "Sec Fixture ${RUN}" Sec Fixture Renamed ${RUN}`],
    mergetag: [`/mergetag "Sec Fixture Renamed ${RUN}" Sec Merge Target ${RUN}`],
    deletetag: [`/deletetag "Sec Merge Target ${RUN}"`],
    bantag: [`/bantag zzsecword${RUN}`],
  };
  const list = examples[name];
  if (!list) throw new Error(`No test example for /${name}: add one to commandsFor().`);
  return list;
}

beforeAll(async () => {
  expect(ADMIN_EMAIL, "ADMIN_EMAIL must be set").not.toBe("");
  expect(ADMIN_PASSWORD, "TEST_ADMIN_PASSWORD must be set in .env.testdb").not.toBe("");
  settingsBefore = await db.siteSetting.findMany({ select: { key: true, value: true } });

  const [a, t, s] = await Promise.all([makeUser("attacker"), makeUser("target"), makeUser("spare")]);
  const [book, removedBook, removedBook2] = await Promise.all([
    makeBook(t.id, `Sec target ${RUN}`),
    makeBook(t.id, `Sec removed ${RUN}`, true),
    makeBook(t.id, `Sec removed two ${RUN}`, true),
  ]);
  const comment = await db.comment.create({ data: { body: "fixture comment", fanficId: book.id, authorId: t.id, parentId: null }, select: { id: true } });
  // Threads with replies, so every comment-deleting command meets one:
  // /deletecomment (fixture comment), /clearcomments (book), /delete (removedBook2), /deleteuser (spare's comment).
  const thread = async (fanficId: string, authorId: string, replierId: string, parentId?: string) => {
    const top = parentId ?? (await db.comment.create({ data: { body: "fixture thread", fanficId, authorId, parentId: null }, select: { id: true } })).id;
    await db.comment.create({ data: { body: "fixture reply", fanficId, authorId: replierId, parentId: top } });
  };
  await thread(book.id, t.id, s.id, comment.id);
  await thread(book.id, a.id, t.id);
  await thread(removedBook2.id, t.id, a.id);
  await thread(removedBook.id, s.id, a.id);
  await db.fanfic.update({ where: { id: book.id }, data: { commentCount: 3 } });
  const report = await db.report.create({ data: { fanficId: book.id, reporterId: a.id, reason: "SPAM_SCAM" }, select: { id: true } });
  const appeal = await db.appeal.create({ data: { userId: t.id, fanficId: removedBook.id, bookTitle: "Sec removed", message: "fixture appeal" }, select: { id: true } });
  const appeal2 = await db.appeal.create({ data: { userId: t.id, fanficId: removedBook2.id, bookTitle: "Sec removed two", message: "fixture appeal 2" }, select: { id: true } });
  await db.tag.create({ data: { kind: "TAG", name: `Sec Fixture ${RUN}`, key: `sec fixture ${RUN}`, createdById: t.id } });
  await db.tag.create({ data: { kind: "TAG", name: `Sec Merge Target ${RUN}`, key: `sec merge target ${RUN}`, createdById: t.id } });
  fx = {
    attacker: a,
    target: t,
    spare: s,
    book: book.id,
    removedBook: removedBook.id,
    removedBook2: removedBook2.id,
    comment: comment.id,
    report: report.id,
    appeal: appeal.id,
    appeal2: appeal2.id,
  };

  // First: this fails unless the server is on the test database, before anything runs.
  attacker = await assertTestServer(fx.attacker.username, PW);
  admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  // Compile the pages whose server actions the tests call.
  await warmUp(admin, ["/admin", `/fanfic/${fx.book}`, "/settings/profile", `/appeals/${fx.appeal}`, "/appeals/new", "/notifications"]);
  await warmUp(await login(fx.target.username, PW), [`/appeals/${fx.appeal}`]);
});

afterAll(async () => {
  if (!fx) return;
  const ids = [fx.attacker.id, fx.target.id, fx.spare.id];
  const books = await db.fanfic.findMany({ where: { authorId: { in: ids } }, select: { id: true } });
  const bookIds = books.map((b) => b.id);
  const chapters = await db.chapter.findMany({ where: { fanficId: { in: bookIds } }, select: { id: true } });
  const appeals = await db.appeal.findMany({ where: { OR: [{ userId: { in: ids } }, { fanficId: { in: bookIds } }] }, select: { id: true } });
  await db.page.deleteMany({ where: { chapterId: { in: chapters.map((c) => c.id) } } });
  await db.chapter.deleteMany({ where: { fanficId: { in: bookIds } } });
  await db.appealMessage.deleteMany({ where: { appealId: { in: appeals.map((a) => a.id) } } });
  await db.appeal.deleteMany({ where: { id: { in: appeals.map((a) => a.id) } } });
  // Replies first: a comment can't be deleted while replies point at it.
  for (const where of [{ fanficId: { in: bookIds } }, { authorId: { in: ids } }]) {
    await db.comment.deleteMany({ where: { ...where, parentId: { not: null } } });
    await db.comment.deleteMany({ where });
  }
  await db.report.deleteMany({ where: { OR: [{ fanficId: { in: bookIds } }, { reporterId: { in: ids } }] } });
  await db.bookTag.deleteMany({ where: { fanficId: { in: bookIds } } });
  await db.tag.deleteMany({ where: { OR: [{ createdById: { in: ids } }, { key: { contains: `sec fixture ${RUN}` } }, { key: { contains: `sec merge target ${RUN}` } }] } });
  await db.fanfic.deleteMany({ where: { id: { in: bookIds } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.adminLog.deleteMany({ where: { createdAt: { gte: started } } });
  await db.rateLimit.deleteMany({ where: { key: { contains: RUN } } });
  // Put site settings back exactly as they were.
  await db.siteSetting.deleteMany({});
  for (const s of settingsBefore) await db.siteSetting.create({ data: { key: s.key, value: s.value as never } });
  await db.$disconnect();
});

describe("a regular user", () => {
  it.each(ADMIN_TABS)("gets 404 for /admin?tab=%s", async (tab) => {
    const res = await get(`/admin${tab ? `?tab=${tab}` : ""}`, attacker);
    expect(res.status).toBe(404);
    expect(res.body).not.toContain("Admin command box");
  });

  it("gets 404 for /admin when logged out", async () => {
    expect((await get("/admin")).status).toBe(404);
  });

  it("sees no Admin menu or Admin badge", async () => {
    const book = await get(`/fanfic/${fx.book}`, attacker);
    const own = await get(`/u/${fx.attacker.username}`, attacker);
    expect(book.body).not.toContain("Admin tools");
    expect(own.body).not.toContain('title="Writt admin"');
    expect((await get("/", attacker)).body).not.toContain('aria-label="Admin panel"');
  });

  it("is refused every admin command, through any page", async () => {
    for (const def of COMMANDS) {
      for (const command of commandsFor(def.name)) {
        for (const page of ["/admin", `/fanfic/${fx.book}`]) {
          const before = await snapshot();
          const res = await callAction(attacker, page, "runAdminCommandAction", [command, true]);
          expect(await snapshot(), `${command} via ${page} changed data`).toBe(before);
          expect(res.body, `${command} via ${page} succeeded`).not.toContain('"ok":true');
          expect(res.body).not.toContain(`sec-${RUN}-target@example.com`);
        }
      }
    }
  });

  it("can't change report statuses or delete other people's comments", async () => {
    const before = await snapshot();
    await callAction(attacker, `/fanfic/${fx.book}`, "updateReportStatusAction", [fx.report, "DISMISSED"]);
    const del = await callAction(attacker, `/fanfic/${fx.book}`, "deleteCommentAction", [fx.comment]);
    expect(await snapshot()).toBe(before);
    expect(del.body).toContain("You can only delete your own comments.");
  });

  it('can\'t become admin by sending role: "ADMIN" in a profile update', async () => {
    const res = await callFormAction(attacker, "/settings/profile", "updateProfileAction", {
      username: fx.attacker.username,
      nickname: "Role Probe",
      bio: "",
      phone: "",
      image: "",
      securityQuestion: "",
      role: "ADMIN",
      isAdmin: "true",
    });
    // The update itself went through (the nickname changed, proving the action ran), but the role didn't.
    expect(res.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { id: fx.attacker.id }, select: { role: true, nickname: true } });
    expect(user.nickname).toBe("Role Probe");
    expect(user.role).toBe("USER");
    expect((await get("/admin", attacker)).status).toBe(404);
  });

  it.each(["annamanoliadmin", "AnnaManoliAdmin", "annamanoliadmin ", "annamanol1admin", "anna.manoli.admin"])(
    "can't take the username %j",
    async (name) => {
      const res = await callFormAction(attacker, "/settings/profile", "updateProfileAction", {
        username: name,
        nickname: "",
        bio: "",
        phone: "",
        image: "",
        securityQuestion: "",
      });
      const user = await db.user.findUniqueOrThrow({ where: { id: fx.attacker.id }, select: { username: true } });
      expect(user.username).toBe(fx.attacker.username);
      expect(res.body).toContain("That username is reserved.");
    },
  );

  it("can't message anyone but the admin (no writing into other people's appeals)", async () => {
    const before = await db.appealMessage.count({ where: { appealId: fx.appeal } });
    const res = await callAction(attacker, `/appeals/${fx.appeal}`, "replyToAppealAction", [fx.appeal, "hello other user"]);
    expect(res.body).toContain("Appeal not found.");
    expect(await db.appealMessage.count({ where: { appealId: fx.appeal } })).toBe(before);
  });

  it("can't report the same book twice", async () => {
    const res = await callAction(attacker, `/fanfic/${fx.book}`, "reportAction", [{ fanficId: fx.book, reason: "SPAM_SCAM", details: "" }]);
    expect(res.body).toContain("already reported");
    expect(await db.report.count({ where: { fanficId: fx.book, reporterId: fx.attacker.id } })).toBe(1);
  });
});

describe("the admin", () => {
  it("can open every admin tab", async () => {
    for (const tab of ADMIN_TABS) {
      const res = await get(`/admin${tab ? `?tab=${tab}` : ""}`, admin);
      expect(res.status, `/admin?tab=${tab}`).toBe(200);
    }
  });

  it("can use every admin command", async () => {
    // Order matters: e.g. restore after remove, and destructive commands last.
    const order = [
      "help", "stats", "reports", "appeals", "appeal", "reply", "lookup", "tags",
      "feature", "unfeature", "hot", "unhot", "lockcomments", "unlockcomments", "hide", "setrating",
      "remove", "restore", "clearreports", "threshold", "announce", "unannounce", "maintenance",
      "ban", "unban", "block", "unblock", "mute", "unmute", "warn", "resetpfp", "setbirthdate", "family", "families", "coins", "givecoins", "takecoins", "themeprice", "givetheme", "rename",
      "approve", "deny", "renametag", "mergetag", "deletetag", "bantag",
      "deletecomment", "clearcomments", "delete", "deleteuser",
    ];
    const covered = new Set<string>();
    for (const name of order) {
      if (!COMMANDS.some((c) => c.name === name)) continue;
      for (const command of commandsFor(name)) {
        const res = await callAction(admin, "/admin", "runAdminCommandAction", [command, true]);
        expect(res.body, command).toContain('"ok":true');
      }
      covered.add(name);
    }
    const missing = COMMANDS.map((c) => c.name).filter((n) => !covered.has(n));
    expect(missing, "commands without an admin test").toEqual([]);
    // Threads went with their replies, including replies to the deleted user's comment.
    expect(await db.comment.count({ where: { fanficId: { in: [fx.book, fx.removedBook2] } } })).toBe(0);
    expect(await db.comment.count({ where: { fanficId: fx.removedBook } })).toBe(0);
  });
});
