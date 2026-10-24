import { describe, expect, it } from "vitest";
import { ageFrom, ageGroup, tooYoungFor } from "@/lib/content";
import { birthDateSchema } from "@/lib/validation";

describe("age ranges", () => {
  it.each([
    // [rating, age, too young?]
    ["EVERYONE", 5, false],
    ["TEEN", 12, true],
    ["TEEN", 13, false],
    ["MATURE", 17, true],
    ["MATURE", 18, false],
    ["MATURE", 40, false],
  ] as const)("%s at age %i → too young: %s", (rating, age, expected) => {
    expect(tooYoungFor(rating, age)).toBe(expected);
  });

  it("treats an unknown age as a child", () => {
    expect(tooYoungFor("EVERYONE", null)).toBe(false);
    expect(tooYoungFor("TEEN", null)).toBe(true);
    expect(tooYoungFor("MATURE", null)).toBe(true);
  });

  it("never hides books with no age range", () => {
    expect(tooYoungFor(null, 3)).toBe(false);
  });

  it("counts birthdays exactly", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(ageFrom(new Date("2008-06-15T00:00:00Z"), now)).toBe(18);
    expect(ageFrom(new Date("2008-06-16T00:00:00Z"), now)).toBe(17);
  });
});

describe("age groups and minimum age", () => {
  it.each([
    [7, "Kids"],
    [12, "Kids"],
    [13, "Teens"],
    [17, "Teens"],
    [18, "Adults"],
  ] as const)("age %i is in %s", (age, label) => {
    expect(ageGroup(age).label).toBe(label);
  });

  const yearsAgo = (years: number, days = 0) => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate() + days)).toISOString().slice(0, 10);
  };

  it("refuses dates of birth under 7", () => {
    expect(birthDateSchema.safeParse(yearsAgo(6)).success).toBe(false);
    expect(birthDateSchema.safeParse(yearsAgo(7, 1)).success).toBe(false); // turns 7 tomorrow
    expect(birthDateSchema.safeParse(yearsAgo(7)).success).toBe(true); // 7 today
    expect(birthDateSchema.safeParse(yearsAgo(30)).success).toBe(true);
  });
});
