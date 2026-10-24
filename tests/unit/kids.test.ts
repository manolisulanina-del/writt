import { describe, expect, it } from "vitest";
import {
  RESTRICTIONS,
  allowedOwnRatings,
  consentFieldsFor,
  defaultControls,
  effectiveControls,
  hiddenRatingsForKid,
  kidGroupFor,
  kidGroupForAge,
  parseOverrides,
  withYoungerRestrictions,
} from "@/lib/kids";

const restrictionKeys = RESTRICTIONS.map((r) => r.key);
const yearsAgo = (years: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate() - 2));
};

describe("age groups", () => {
  it.each([
    [7, "YOUNGER"],
    [12, "YOUNGER"],
    [13, "OLDER"],
    [15, "OLDER"],
    [16, null],
    [40, null],
  ] as const)("age %i → %s", (age, group) => {
    expect(kidGroupForAge(age)).toBe(group);
  });

  it("locks under-16 accounts until a parent approves, for 7 days", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const kid = consentFieldsFor(new Date("2016-01-01T00:00:00Z"), now);
    expect(kid.consent).toBe("PENDING");
    expect(kid.kidGroup).toBe("YOUNGER");
    expect(kid.consentDeadline!.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60_000);
    expect(consentFieldsFor(new Date("2010-01-01T00:00:00Z"), now)).toEqual({ consent: "NOT_REQUIRED", consentDeadline: null, kidGroup: null });
  });
});

describe("restriction defaults", () => {
  it("turns every restriction on for ages 7 to 12, and off for 13 to 15", () => {
    const younger = defaultControls("YOUNGER");
    const older = defaultControls("OLDER");
    for (const key of restrictionKeys) {
      expect(younger[key]).toBe(true);
      expect(older[key]).toBe(false);
    }
    // Publishing and the shop start on for everyone.
    expect(younger.publishing && younger.shop && older.publishing && older.shop).toBe(true);
  });

  it("lets a parent turn off a restriction for a younger child", () => {
    const c = effectiveControls("YOUNGER", { commentsOff: false });
    expect(c.commentsOff).toBe(false);
    expect(c.everyoneOnly).toBe(true);
  });

  it("lets a parent turn on any restriction for an older child", () => {
    for (const key of restrictionKeys) expect(effectiveControls("OLDER", { [key]: true })[key]).toBe(true);
  });

  it("'Use younger restrictions' turns every restriction on and leaves the switches alone", () => {
    const overrides = withYoungerRestrictions({ shop: false, commentsOff: false });
    const c = effectiveControls("OLDER", overrides);
    for (const key of restrictionKeys) expect(c[key]).toBe(true);
    expect(c.shop).toBe(false);
    expect(c.publishing).toBe(true);
  });

  it("at 13 keeps what the parent changed and moves the rest to the older defaults", () => {
    const overrides = { commentsOff: false, approveBooks: true }; // set while the child was 12
    const at12 = effectiveControls("YOUNGER", overrides);
    const at13 = effectiveControls("OLDER", overrides);
    expect(at12.commentsOff).toBe(false);
    expect(at13.commentsOff).toBe(false); // the parent's choice stays
    expect(at13.approveBooks).toBe(true); // the parent's choice stays
    expect(at12.everyoneOnly).toBe(true);
    expect(at13.everyoneOnly).toBe(false); // untouched: now the older default
    expect(at13.noFollow).toBe(false);
  });

  it("drops unknown or non-boolean values from stored settings", () => {
    expect(parseOverrides({ commentsOff: false, hacked: true, noFollow: "yes" })).toEqual({ commentsOff: false });
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides(["x"])).toEqual({});
  });
});

describe("book age ranges for kids", () => {
  it("never shows Mature books under 16, even with every restriction off", () => {
    const allOff = effectiveControls("YOUNGER", Object.fromEntries(restrictionKeys.map((k) => [k, false])));
    expect(hiddenRatingsForKid(allOff)).toEqual(["MATURE"]);
    expect(hiddenRatingsForKid(defaultControls("OLDER"))).toContain("MATURE");
  });

  it("hides Teen books while 'Only books rated Everyone' is on", () => {
    expect(hiddenRatingsForKid(defaultControls("YOUNGER"))).toEqual(["TEEN", "MATURE"]);
    expect(hiddenRatingsForKid(defaultControls("OLDER"))).toEqual(["MATURE"]);
  });

  it("limits the age ranges kids can give their own books", () => {
    expect(allowedOwnRatings(defaultControls("YOUNGER"))).toEqual(["EVERYONE"]);
    expect(allowedOwnRatings(defaultControls("OLDER"))).toEqual(["EVERYONE", "TEEN"]);
  });

  it("works out a group from a date of birth", () => {
    expect(kidGroupFor(yearsAgo(10))).toBe("YOUNGER");
    expect(kidGroupFor(yearsAgo(14))).toBe("OLDER");
    expect(kidGroupFor(yearsAgo(16))).toBeNull();
  });
});
