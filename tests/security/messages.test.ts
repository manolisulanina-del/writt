// "Message admin": private chats between each user and the admin. Runs against
// `npm run dev:test` (the test database only): npm run test:security
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL, ADMIN_PASSWORD, assertTestServer, callAction, db, get, login, warmUp, type Jar } from "../helpers/server";

const RUN = Date.now().toString(36);
const PW = "Msg-Test-Pass-2026!";

async function makeUser(tag: string) {
  return db.user.create({
    data: {
      email: `msg-${RUN}-${tag}@example.com`,
      username: `m${RUN}_${tag}`.slice(0, 20),
      passwordHash: await bcrypt.hash(PW, 10),
      needsSetup: false,
      hasSeenTutorial: true,
      birthDate: new Date("1995-01-01T00:00:00Z"),
      hiddenWarnings: [],
    },
    select: { id: true, username: true },
  });
}

let alice: { id: string; username: string }, bob: { id: string; username: string };
let aliceJar: Jar, bobJar: Jar, admin: Jar;
const chatOf = (userId: string) => db.conversation.findUnique({ where: { userId }, select: { unreadByAdmin: true, unreadByUser: true, messages: { select: { body: true, fromAdmin: true } } } });

beforeAll(async () => {
  expect(ADMIN_PASSWORD, "TEST_ADMIN_PASSWORD must be set in .env.testdb").not.toBe("");
  await db.rateLimit.deleteMany({});
  [alice, bob] = await Promise.all([makeUser("ali"), makeUser("bob")]);
  aliceJar = await assertTestServer(alice.username, PW);
  [bobJar, admin] = await Promise.all([login(bob.username, PW), login(ADMIN_EMAIL, ADMIN_PASSWORD)]);
  await warmUp(aliceJar, ["/messages"]);
  await warmUp(admin, ["/messages", `/messages/${alice.username}`]);
}, 300_000);

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: "msg-" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const chats = await db.conversation.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  await db.directMessage.deleteMany({ where: { conversationId: { in: chats.map((c) => c.id) } } });
  await db.conversation.deleteMany({ where: { userId: { in: ids } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.account.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.rateLimit.deleteMany({});
  await db.$disconnect();
}, 120_000);

describe("message the admin", () => {
  it("delivers a user's message to the admin only", async () => {
    const sent = await callAction(aliceJar, "/messages", "sendMessageAction", ["Hello! I have an idea for Writt."]);
    expect(sent.body).toContain('"ok":true');
    const chat = await chatOf(alice.id);
    expect(chat?.messages).toEqual([{ body: "Hello! I have an idea for Writt.", fromAdmin: false }]);
    expect(chat?.unreadByAdmin).toBe(1);
    const inbox = await get("/messages", admin);
    expect(inbox.body).toContain("Inbox");
    expect(inbox.body).toContain(alice.username);
  });

  it("can't be sent to anyone but the admin, even by naming another user", async () => {
    await callAction(bobJar, "/messages", "sendMessageAction", ["sneaky", alice.username]);
    expect((await chatOf(alice.id))?.messages.some((m) => m.body === "sneaky")).toBe(false);
    expect((await chatOf(bob.id))?.messages).toEqual([{ body: "sneaky", fromAdmin: false }]);
  });

  it("keeps other people's chats private", async () => {
    const res = await get(`/messages/${alice.username}`, bobJar);
    expect(res.status).toBe(404);
    expect(res.body).not.toContain("Hello! I have an idea");
    const own = await get("/messages", bobJar);
    expect(own.body).toContain("Message the admin");
    expect(own.body).not.toContain("Hello! I have an idea");
  });

  it("lets the admin reply, and tells the user", async () => {
    const reply = await callAction(admin, `/messages/${alice.username}`, "sendMessageAction", ["Thanks, tell me more!", alice.username]);
    expect(reply.body).toContain('"ok":true');
    const chat = await chatOf(alice.id);
    expect(chat?.messages.at(-1)).toEqual({ body: "Thanks, tell me more!", fromAdmin: true });
    expect(chat?.unreadByUser).toBe(1);
    expect(await db.notification.count({ where: { userId: alice.id, kind: "MESSAGE", read: false } })).toBe(1);
    // A second reply before she reads doesn't add another notification.
    await callAction(admin, `/messages/${alice.username}`, "sendMessageAction", ["Any time.", alice.username]);
    expect(await db.notification.count({ where: { userId: alice.id, kind: "MESSAGE" } })).toBe(1);

    expect((await get("/messages", aliceJar)).body).toContain("Thanks, tell me more!");
    await callAction(aliceJar, "/messages", "markChatReadAction", []);
    expect((await chatOf(alice.id))?.unreadByUser).toBe(0);
    expect(await db.notification.count({ where: { userId: alice.id, kind: "MESSAGE", read: false } })).toBe(0);
  });

  it("refuses empty and overly long messages", async () => {
    expect((await callAction(aliceJar, "/messages", "sendMessageAction", ["   "])).body).toContain("Write a message first.");
    expect((await callAction(aliceJar, "/messages", "sendMessageAction", ["x".repeat(2001)])).body).toContain("at most 2,000 characters");
  });
});
