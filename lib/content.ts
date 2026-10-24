// Age ranges (stored as `rating`), warnings, lengths and sorts. Shared by forms (client) and queries (server).

export const RATINGS = [
  { value: "EVERYONE", label: "Everyone", short: "E", ages: "7+" },
  { value: "TEEN", label: "Teen", short: "T", ages: "13+" },
  { value: "MATURE", label: "Mature", short: "M", ages: "18+" },
] as const;
export type RatingValue = (typeof RATINGS)[number]["value"];
export const RATING_LABEL: Record<string, string> = Object.fromEntries(RATINGS.map((r) => [r.value, r.label]));
export const RATING_AGES: Record<string, string> = Object.fromEntries(RATINGS.map((r) => [r.value, r.ages]));
/** Youngest reader each age range is shown to. */
export const RATING_MIN_AGE: Record<string, number> = { EVERYONE: 0, TEEN: 13, MATURE: 18 };

/** True when a reader of this age (null = unknown) is too young for the book's age range. */
export function tooYoungFor(rating: string | null, age: number | null): boolean {
  return Boolean(rating && (age ?? 0) < (RATING_MIN_AGE[rating] ?? 0));
}

export const WARNINGS = [
  "Violence",
  "Character death",
  "Strong language",
  "Sexual content",
  "Self-harm",
  "Abuse",
  "Substance use",
  "Major spoilers",
] as const;
export type WarningValue = (typeof WARNINGS)[number];

export const STATUS_LABEL: Record<string, string> = { ONGOING: "Ongoing", COMPLETED: "Completed" };

export const LENGTHS = [
  { value: "short", label: "Under 5k words", min: 0, max: 5_000 },
  { value: "medium", label: "5k–20k words", min: 5_000, max: 20_000 },
  { value: "long", label: "20k–50k words", min: 20_000, max: 50_000 },
  { value: "epic", label: "Over 50k words", min: 50_000, max: Number.MAX_SAFE_INTEGER },
] as const;

export const SORTS = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "Newest" },
  { value: "liked", label: "Most liked" },
  { value: "updated", label: "Recently updated" },
] as const;
export type SortValue = (typeof SORTS)[number]["value"];

export const TAG_LIMIT = 25;
export const FANDOM_LIMIT = 10;
export const SUMMARY_MAX = 500;
export const NOTE_MAX = 2000;

const WORDS_PER_MINUTE = 230;

export function readingTime(words: number): string {
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

/** Youngest age that can join Writt. */
export const MIN_SIGNUP_AGE = 7;

/** Reader age groups, and which book age ranges each can see. */
export const AGE_GROUPS = [
  { label: "Kids", range: "7–12", min: 0, sees: "Everyone books" },
  { label: "Teens", range: "13–17", min: 13, sees: "Everyone and Teen books" },
  { label: "Adults", range: "18+", min: 18, sees: "every book, Mature included" },
] as const;

export function ageGroup(age: number | null) {
  return [...AGE_GROUPS].reverse().find((g) => (age ?? 0) >= g.min)!;
}

export function ageFrom(birthDate: Date | null | undefined, now = new Date()): number | null {
  if (!birthDate) return null;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}
