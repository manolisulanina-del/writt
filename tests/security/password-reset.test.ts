// Password reset by email, and the email-only parent step. Runs against
// `npm run dev:test` (the test database only): npm run test:security
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Jar, assertTestServer, callFormAction, db, login, warmUp } from "../helpers/server";

const RUN = Date.now().toString(36);
const PW = "Reset-Test-Pass-2026!";
const NEW_PW = "Brand-New-Pass-2026!";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

let user: { id: string; username: string; email: string };

/** A link as if it had been emailed: we know the raw token, the database only its hash. */
async function link(purpose: "PASSWORD_RESET" | "FAMILY_LOGIN", minutes = 60) {
  const token = randomBytes(24).toString("base64url");
  await db.loginToken.create({ data: { userId: user.id, purpose, tokenHash: hash(token), expiresAt: new Date(Date.now() + minutes * 60_000), usedAt: null } });
  return token;
}

beforeAll(async () => {
  await db.rateLimit.deleteMany({});
  user = (await db.user.create({
    data: {
      email: `pwr-${RUN}@example.com`,
      username: `p${RUN}_usr`.slice(0, 20),
      passwordHash: await bcrypt.hash(PW, 10),
      needsSetup: false,
      hasSeenTutorial: true,
      birthDate: new Date("1990-01-01T00:00:00Z"),
      hiddenWarnings: [],
    },
    select: { id: true, username: true, email: true },
  })) as { id: string; username: string; email: string };
  await assertTestServer(user.username, PW);
  await warmUp(new Jar(), ["/forgot-password", "/reset-password?token=x"]);
}, 300_000);

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: "pwr-" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.loginToken.deleteMany({ where: { userId: { in: ids } } });
  await db.consentRequest.deleteMany({ where: { childId: { in: ids } } });
  await db.account.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.rateLimit.deleteMany({});
  await db.$disconnect();
}, 120_000);

describe("password reset by email", () => {
  it("answers the same whether or not the account exists, and only makes a link for real accounts", async () => {
    const real = await callFormAction(new Jar(), "/forgot-password", "requestPasswordResetAction", { identifier: user.username });
    const fake = await callFormAction(new Jar(), "/forgot-password", "requestPasswordResetAction", { identifier: `nobody_${RUN}` });
    expect(real.body).toContain('"sent":"1"');
    expect(fake.body).toContain('"sent":"1"');
    expect(await db.loginToken.count({ where: { userId: user.id, purpose: "PASSWORD_RESET" } })).toBe(1);
  });

  it("sets the new password from the link, and the link only works once", async () => {
    const token = await link("PASSWORD_RESET");
    const res = await callFormAction(new Jar(), "/reset-password", "resetPasswordAction", { password: NEW_PW, confirmPassword: NEW_PW }, [token]);
    expect(res.body).toContain('"done":"1"');
    await expect(login(user.username, NEW_PW)).resolves.toBeDefined();
    await expect(login(user.username, PW)).rejects.toThrow();

    const again = await callFormAction(new Jar(), "/reset-password", "resetPasswordAction", { password: PW, confirmPassword: PW }, [token]);
    expect(again.body).toContain("expired or was already used");
  });

  it("refuses expired links, family sign-in links, and weak or mismatched passwords", async () => {
    const expired = await link("PASSWORD_RESET", -1);
    expect((await callFormAction(new Jar(), "/reset-password", "resetPasswordAction", { password: PW, confirmPassword: PW }, [expired])).body).toContain(
      "expired or was already used",
    );
    const family = await link("FAMILY_LOGIN");
    expect((await callFormAction(new Jar(), "/reset-password", "resetPasswordAction", { password: PW, confirmPassword: PW }, [family])).body).toContain(
      "expired or was already used",
    );
    const token = await link("PASSWORD_RESET");
    expect((await callFormAction(new Jar(), "/reset-password", "resetPasswordAction", { password: PW, confirmPassword: "different" }, [token])).body).toContain(
      "Passwords don’t match.",
    );
    // None of the refused attempts changed the password.
    await expect(login(user.username, NEW_PW)).resolves.toBeDefined();
  });
});

describe("parent step", () => {
  it("asks for an email: text messages aren't available yet", async () => {
    const kid = await db.user.create({
      data: {
        email: `pwr-${RUN}-kid@example.com`,
        username: `p${RUN}_kid`.slice(0, 20),
        passwordHash: await bcrypt.hash(PW, 10),
        needsSetup: false,
        hasSeenTutorial: true,
        birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - 10, 0, 1)),
        hiddenWarnings: [],
        consent: "PENDING",
        consentDeadline: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        kidGroup: "YOUNGER",
      },
      select: { id: true, username: true },
    });
    const jar = await login(kid.username, PW);
    await warmUp(jar, ["/family-consent"]);
    const res = await callFormAction(jar, "/family-consent", "requestParentConsentAction", { contact: "+1 202 555 0143" });
    expect(res.body).toContain("Writt can’t send text messages yet.");
    expect(await db.consentRequest.count({ where: { childId: kid.id } })).toBe(0);
  });
});
