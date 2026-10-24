import { describe, expect, it } from "vitest";
import { adminOnlyUsernameError, usernameSchema, usernameSkeleton } from "@/lib/validation";

/** What the server does with a submitted username: validate, then check the reservation. */
function attempt(raw: string, isAdmin = false): string | null {
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues[0].message;
  return adminOnlyUsernameError(parsed.data, isAdmin);
}

describe("the admin username is reserved", () => {
  it.each([
    "annamanoliadmin",
    "AnnaManoliAdmin",
    "ANNAMANOLIADMIN",
    "annamanoliadmin ",
    "  annamanoliadmin",
    "annamanol1admin",
    "annamanoIiadmin",
    "anna.manoli.admin",
    "anna_manoli_admin",
    "annamanoliadmin_",
    "annamanoliadmin2",
    "real.annamanoliadmin",
    "annarnanoliadmin",
    "4nnamanoliadmin",
    "annam4n0liadmin",
  ])("rejects %j for regular users", (name) => {
    expect(attempt(name)).not.toBeNull();
  });

  it("explains why", () => {
    expect(attempt("AnnaManoliAdmin")).toBe("That username is reserved.");
  });

  it("lets the admin keep it", () => {
    expect(attempt("annamanoliadmin", true)).toBeNull();
  });

  it.each(["anna", "manoli_writes", "mira.writes", "admin_fan_42", "annamarie"])("allows ordinary names like %j", (name) => {
    expect(attempt(name)).toBeNull();
  });

  it("compares names by what they look like", () => {
    expect(usernameSkeleton("Anna.Manol1.Admin")).toBe(usernameSkeleton("annamanoliadmin"));
  });
});
