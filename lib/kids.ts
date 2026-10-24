// Kids' accounts (ages 7 to 15): age groups, restrictions and their defaults.
// Pure and shared by server and client, so it can be unit-tested directly.

import { ageFrom } from "@/lib/content";

/** Under this age a parent's permission is needed, and restrictions apply. */
export const CONSENT_AGE = 16;
/** From this age a child moves from the Younger to the Older group. */
export const OLDER_GROUP_AGE = 13;
/** How long a locked account waits for a parent before it's deleted. */
export const CONSENT_DAYS = 7;

export type KidGroup = "YOUNGER" | "OLDER";

export const GROUP_INFO: Record<KidGroup, { label: string; ages: string }> = {
  YOUNGER: { label: "Younger", ages: "7 to 12" },
  OLDER: { label: "Older", ages: "13 to 15" },
};

/** The child's group, or null from 16 (no restrictions) or without a date of birth. */
export function kidGroupForAge(age: number | null): KidGroup | null {
  if (age === null || age >= CONSENT_AGE) return null;
  return age < OLDER_GROUP_AGE ? "YOUNGER" : "OLDER";
}

export function kidGroupFor(birthDate: Date | null | undefined, now = new Date()): KidGroup | null {
  return kidGroupForAge(ageFrom(birthDate, now));
}

/** True for anyone under 16 (who needs a parent's permission). */
export function needsConsent(birthDate: Date | null | undefined, now = new Date()): boolean {
  return kidGroupFor(birthDate, now) !== null;
}

/** The restrictions from the age-groups spec. On for Younger, off for Older, by default. */
export const RESTRICTIONS = [
  { key: "everyoneOnly", label: "Only books rated Everyone", detail: "They only see books rated Everyone, and their own books must be rated Everyone." },
  { key: "commentsOff", label: "Comments off", detail: "They can’t post or read comments, and nobody can comment on their books." },
  { key: "approveBooks", label: "Approve every book", detail: "Each book they publish waits for your approval here first. Drafts and private books don’t." },
  { key: "limitedProfile", label: "Simple profile", detail: "Their profile only shows their username, picture and books: no bio, nickname or follower lists." },
  { key: "noFollow", label: "No following", detail: "They can’t follow other users, and nobody can follow them." },
] as const;

/** Extra switches on every child's account, on by default whatever the group. */
export const ACCOUNT_SWITCHES = [
  { key: "publishing", label: "Publishing", detail: "When off, they can only save drafts." },
  { key: "shop", label: "Theme shop", detail: "When off, they can’t buy themes." },
] as const;

export type RestrictionKey = (typeof RESTRICTIONS)[number]["key"];
export type SwitchKey = (typeof ACCOUNT_SWITCHES)[number]["key"];
export type ControlKey = RestrictionKey | SwitchKey;
export type KidControls = Record<ControlKey, boolean>;

export const CONTROL_KEYS: ControlKey[] = [...RESTRICTIONS.map((r) => r.key), ...ACCOUNT_SWITCHES.map((s) => s.key)];

export function isControlKey(key: string): key is ControlKey {
  return (CONTROL_KEYS as string[]).includes(key);
}

/** Defaults for a group: every restriction on for Younger, off for Older; switches on. */
export function defaultControls(group: KidGroup): KidControls {
  const restrictionsOn = group === "YOUNGER";
  const out = {} as KidControls;
  for (const r of RESTRICTIONS) out[r.key] = restrictionsOn;
  for (const s of ACCOUNT_SWITCHES) out[s.key] = true;
  return out;
}

/** The parent's own choices, read safely from the stored JSON. Unknown keys are dropped. */
export function parseOverrides(value: unknown): Partial<KidControls> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Partial<KidControls> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isControlKey(key) && typeof v === "boolean") out[key] = v;
  }
  return out;
}

/**
 * What applies right now: the parent's choices where they made one, otherwise
 * the group's default. So when a child turns 13, settings the parent changed
 * stay, and the rest switch to the Older defaults on their own.
 */
export function effectiveControls(group: KidGroup, overrides: Partial<KidControls>): KidControls {
  return { ...defaultControls(group), ...overrides };
}

/** Overrides after "Use younger restrictions": every restriction on, switches untouched. */
export function withYoungerRestrictions(overrides: Partial<KidControls>): Partial<KidControls> {
  const next = { ...overrides };
  for (const r of RESTRICTIONS) next[r.key] = true;
  return next;
}

/**
 * Book age ranges a child may never see. Mature is always blocked under 16,
 * whatever the parent sets; Teen is blocked while "Only books rated Everyone" is on.
 */
export function hiddenRatingsForKid(controls: KidControls): ("TEEN" | "MATURE")[] {
  return controls.everyoneOnly ? ["TEEN", "MATURE"] : ["MATURE"];
}

/** Age ranges a child may give their own books. */
export function allowedOwnRatings(controls: KidControls): ("EVERYONE" | "TEEN")[] {
  return controls.everyoneOnly ? ["EVERYONE"] : ["EVERYONE", "TEEN"];
}

/** Family fields for an account given this date of birth: locked until a parent approves if under 16. */
export function consentFieldsFor(birthDate: Date, now = new Date()) {
  const group = kidGroupFor(birthDate, now);
  return group
    ? { consent: "PENDING" as const, consentDeadline: new Date(now.getTime() + CONSENT_DAYS * 24 * 60 * 60_000), kidGroup: group }
    : { consent: "NOT_REQUIRED" as const, consentDeadline: null, kidGroup: null };
}

/** What the story editor offers a child: allowed age ranges, whether they can post, and whether posts wait for a parent. */
export type PostingRules = { allowedRatings: string[]; canPublish: boolean; needsApproval: boolean };

export function postingRules(controls: KidControls | null): PostingRules | undefined {
  if (!controls) return undefined;
  return { allowedRatings: allowedOwnRatings(controls), canPublish: controls.publishing, needsApproval: controls.approveBooks };
}
