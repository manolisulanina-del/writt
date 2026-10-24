// What a parent reads and agrees to when approving a child's account. The
// exact text is saved with each consent record.

import type { KidGroup } from "@/lib/kids";

export const DATA_WE_COLLECT = [
  "Their date of birth, to choose the right protections and to end them when they turn 16.",
  "Their email address and password (stored scrambled), so they can log in.",
  "Their username and, if they add one, a profile picture.",
  "The books, chapters and comments they write, and the books they read, like or save.",
  "Coins they earn and themes they buy (coins can’t be bought with money).",
  "Reports about their books and any warnings from the admin.",
];

export const WHY_WE_COLLECT =
  "We use this only to run Writt for your child: to show their writing, keep them to books suitable for their age, and let you see and manage their account. We never sell it, never show ads, and never show your email or phone number to anyone.";

export const AGREEMENT = "I am this child’s parent or guardian and I give permission.";

export const PROTECTIONS: Record<KidGroup, string[]> = {
  YOUNGER: [
    "They will only see books rated for everyone.",
    "Comments are turned off.",
    "You approve every book before it’s posted.",
    "Their profile only shows their username, picture and books.",
    "They can’t follow or be followed by other users.",
    "Nobody can message them. They can only message the creator of Writt.",
  ],
  OLDER: [
    "They will see books rated for everyone and for teens. Mature books are always blocked.",
    "Nobody can message them. They can only message the creator of Writt.",
    "They can comment, post their own books and follow other writers. You can turn on stricter settings at any time.",
  ],
};

/** The full text a parent agreed to, as saved in the consent record. */
export function consentRecordText(group: KidGroup, username: string): string {
  return [
    `Child: @${username} (${group === "YOUNGER" ? "ages 7 to 12" : "ages 13 to 15"})`,
    "Protections:",
    ...PROTECTIONS[group].map((p) => `- ${p}`),
    "Data Writt collects:",
    ...DATA_WE_COLLECT.map((d) => `- ${d}`),
    WHY_WE_COLLECT,
    AGREEMENT,
  ].join("\n");
}
