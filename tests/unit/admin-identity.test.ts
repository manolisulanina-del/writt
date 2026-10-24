import { afterEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "6ad8efea0d06d6d33928f26c";
const OTHER_ID = "6ad8efea0d06d6d33928f26d";

/** Loads the admin rules with a given environment (config reads env on import). */
async function load(env: { email?: string; id?: string }) {
  vi.resetModules();
  vi.stubEnv("ADMIN_EMAIL", env.email ?? "");
  vi.stubEnv("ADMIN_USER_ID", env.id ?? "");
  return import("@/lib/auth/admin-identity");
}

afterEach(() => vi.unstubAllEnvs());

describe("isAdmin", () => {
  it("is true only for the ADMIN_EMAIL account with the ADMIN role", async () => {
    const { isAdmin } = await load({ email: "anna@example.com", id: ADMIN_ID });
    expect(isAdmin({ id: ADMIN_ID, email: "anna@example.com", role: "ADMIN" })).toBe(true);
    expect(isAdmin({ id: ADMIN_ID, email: "Anna@Example.com ", role: "ADMIN" })).toBe(true);
  });

  it("ignores a stored ADMIN role on any other account", async () => {
    const { isAdmin } = await load({ email: "anna@example.com", id: ADMIN_ID });
    expect(isAdmin({ id: OTHER_ID, email: "someone@example.com", role: "ADMIN" })).toBe(false);
  });

  it("requires the pinned id even when the email matches", async () => {
    const { isAdmin } = await load({ email: "anna@example.com", id: ADMIN_ID });
    expect(isAdmin({ id: OTHER_ID, email: "anna@example.com", role: "ADMIN" })).toBe(false);
  });

  it("requires the stored role to be ADMIN", async () => {
    const { isAdmin } = await load({ email: "anna@example.com", id: ADMIN_ID });
    expect(isAdmin({ id: ADMIN_ID, email: "anna@example.com", role: "USER" })).toBe(false);
  });

  it("grants nothing when ADMIN_EMAIL is not configured", async () => {
    const { isAdmin } = await load({});
    expect(isAdmin({ id: ADMIN_ID, email: "", role: "ADMIN" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("role assignment", () => {
  it("gives existing accounts ADMIN only when email and pinned id both match", async () => {
    const { roleForAccount } = await load({ email: "anna@example.com", id: ADMIN_ID });
    expect(roleForAccount(ADMIN_ID, "anna@example.com")).toBe("ADMIN");
    expect(roleForAccount(OTHER_ID, "anna@example.com")).toBe("USER");
    expect(roleForAccount(ADMIN_ID, "other@example.com")).toBe("USER");
  });

  it("never makes a new account admin once ADMIN_USER_ID pins the admin", async () => {
    const { roleForNewAccount } = await load({ email: "anna@example.com", id: ADMIN_ID });
    expect(roleForNewAccount("anna@example.com")).toBe("USER");
  });

  it("without a pinned id, only ADMIN_EMAIL becomes admin at sign-up", async () => {
    const { roleForNewAccount } = await load({ email: "anna@example.com" });
    expect(roleForNewAccount("anna@example.com")).toBe("ADMIN");
    expect(roleForNewAccount("someone@example.com")).toBe("USER");
  });
});
