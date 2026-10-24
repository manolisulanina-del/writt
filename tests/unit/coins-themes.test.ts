import { describe, expect, it } from "vitest";
import { COINS, bookEarns, chapterEarns, shortfallMessage, writingFingerprint } from "@/lib/coin-rules";
import { findTheme, oldEnoughForTheme, themeToShow } from "@/lib/themes";

const words = (n: number, seed = "w") => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");
const check = (over: Partial<Parameters<typeof bookEarns>[0]> = {}) => ({ words: 300, earnedToday: 0, alreadyEarned: false, duplicateText: false, ...over });

describe("earning coins", () => {
  it("pays for books and chapters of 300 words or more, not shorter ones", () => {
    expect(bookEarns(check({ words: 300 }))).toBe(true);
    expect(bookEarns(check({ words: 299 }))).toBe(false);
    expect(chapterEarns(check({ words: 300 }))).toBe(true);
    expect(chapterEarns(check({ words: 120 }))).toBe(false);
  });

  it("stops at 3 books and 10 chapters a day", () => {
    expect(bookEarns(check({ earnedToday: COINS.booksPerDay - 1 }))).toBe(true);
    expect(bookEarns(check({ earnedToday: COINS.booksPerDay }))).toBe(false);
    expect(chapterEarns(check({ earnedToday: COINS.chaptersPerDay - 1 }))).toBe(true);
    expect(chapterEarns(check({ earnedToday: COINS.chaptersPerDay }))).toBe(false);
  });

  it("never pays twice for the same book or the same text", () => {
    expect(bookEarns(check({ alreadyEarned: true }))).toBe(false);
    expect(bookEarns(check({ duplicateText: true }))).toBe(false);
  });

  it("recognises the same writing posted again, whatever the spacing, case or punctuation", () => {
    const text = words(400);
    expect(writingFingerprint(text)).toBe(writingFingerprint(`  ${text.toUpperCase().replace(/ /g, ",  ")}!`));
    // Only the first 300 words count, so a changed ending is still the same writing.
    expect(writingFingerprint(`${words(300)} different ending`)).toBe(writingFingerprint(`${words(300)} another ending`));
    expect(writingFingerprint(words(400, "a"))).not.toBe(writingFingerprint(words(400, "b")));
  });

  it("explains how many coins are missing", () => {
    expect(shortfallMessage(150, 200)).toBe("You need 50 more coins.");
    expect(shortfallMessage(199, 200)).toBe("You need 1 more coin.");
    expect(shortfallMessage(200, 200)).toBeNull();
  });
});

describe("themes", () => {
  const analog = findTheme("Analog-Horror")!;

  it("keeps Analog Horror for ages 12 and over", () => {
    expect(oldEnoughForTheme(analog, 11)).toBe(false);
    expect(oldEnoughForTheme(analog, 12)).toBe(true);
    expect(oldEnoughForTheme(analog, null)).toBe(false);
    expect(oldEnoughForTheme(findTheme("pastel")!, 7)).toBe(true);
  });

  it("shows Default instead of a theme the user is too young for, or one that doesn't exist", () => {
    expect(themeToShow("analog-horror", 11)).toBe("default");
    expect(themeToShow("analog-horror", 12)).toBe("analog-horror");
    expect(themeToShow("no-such-theme", 30)).toBe("default");
    expect(themeToShow("emo", 9)).toBe("emo");
  });
});
