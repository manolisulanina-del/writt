// Every admin command, its arguments and help text. Shared by the server
// (parsing, /help) and the command box (suggestions), so it must stay free of
// server-only imports.

export type ArgType = "book" | "user" | "appeal" | "comment" | "tag" | "days" | "daysOrForever" | "threshold" | "onoff" | "amount" | "theme";

export type CommandDef = {
  name: string;
  group: "Books" | "Reports" | "Appeals" | "Users" | "Families" | "Coins" | "Comments" | "Tags" | "Site";
  args: { name: string; type: ArgType; optional?: boolean }[];
  /** Free text after the arguments, e.g. a reason or a message. */
  rest?: { name: string; required: boolean; max: number };
  description: string;
  /** Deletes, bans or removes: the interface asks "Are you sure?" and the server requires confirmation. */
  destructive?: boolean;
};

const book = { name: "book", type: "book" } as const;
const user = { name: "@username", type: "user" } as const;
const appeal = { name: "appeal id", type: "appeal" } as const;
const reason = { name: "reason", required: false, max: 500 };
const message = { name: "message", required: true, max: 1000 };

export const COMMANDS: CommandDef[] = [
  { name: "remove", group: "Books", args: [book], rest: reason, description: "Removes a book from Writt immediately", destructive: true },
  { name: "restore", group: "Books", args: [book], description: "Brings back a removed book" },
  { name: "delete", group: "Books", args: [book], description: "Permanently deletes a book and its images", destructive: true },
  { name: "feature", group: "Books", args: [book], description: "Pins a book to the top of the homepage as Featured" },
  { name: "unfeature", group: "Books", args: [book], description: "Removes a book from Featured" },
  { name: "hot", group: "Books", args: [book], description: "Adds the Hot label by hand" },
  { name: "unhot", group: "Books", args: [book], description: "Removes the Hot label by hand" },
  { name: "hide", group: "Books", args: [book], description: "Makes a book private (only the author sees it)" },
  { name: "setrating", group: "Books", args: [book], rest: { name: "everyone|teen|mature", required: true, max: 10 }, description: "Changes a book’s age range (e.g. after “Wrong age range” reports)" },

  { name: "reports", group: "Reports", args: [{ ...book, optional: true }], description: "Most-reported books, or every report on one book" },
  { name: "clearreports", group: "Reports", args: [book], description: "Deletes all reports on a book", destructive: true },
  { name: "threshold", group: "Reports", args: [{ name: "20-25", type: "threshold" }], description: "Sets how many reports remove a book" },

  { name: "appeals", group: "Appeals", args: [], description: "Lists open appeals, oldest first" },
  { name: "appeal", group: "Appeals", args: [appeal], description: "Opens an appeal: message, book, reports and conversation" },
  { name: "reply", group: "Appeals", args: [appeal], rest: message, description: "Replies to the person who appealed" },
  { name: "approve", group: "Appeals", args: [appeal], rest: { ...message, required: false }, description: "Restores the book, clears its reports, lifts the 14-day block and closes the appeal" },
  { name: "deny", group: "Appeals", args: [appeal], rest: reason, description: "Keeps the book removed and closes the appeal" },

  { name: "lookup", group: "Users", args: [user], description: "Email, join date, books, reports, appeals and ban history" },
  { name: "ban", group: "Users", args: [user, { name: "days|forever", type: "daysOrForever" }], rest: reason, description: "Bans the user; they can’t log in until it ends", destructive: true },
  { name: "unban", group: "Users", args: [user], description: "Lifts a ban" },
  { name: "block", group: "Users", args: [user, { name: "days", type: "days" }], rest: reason, description: "Stops the user creating books for that many days" },
  { name: "unblock", group: "Users", args: [user], description: "Lifts a create-book block early, including the automatic one" },
  { name: "mute", group: "Users", args: [user, { name: "days", type: "days" }], rest: reason, description: "Stops the user from commenting" },
  { name: "unmute", group: "Users", args: [user], description: "Lets the user comment again" },
  { name: "warn", group: "Users", args: [user], rest: message, description: "Sends a warning they see the next time they open Writt" },
  { name: "resetpfp", group: "Users", args: [user], description: "Removes the user’s profile picture" },
  { name: "rename", group: "Users", args: [user], rest: { name: "new name", required: true, max: 20 }, description: "Changes an inappropriate username" },
  { name: "deleteuser", group: "Users", args: [user], description: "Permanently deletes the account and everything they posted", destructive: true },

  { name: "family", group: "Families", args: [user], description: "A child’s parent account, consent record, age group and restrictions (or a parent’s children)" },
  { name: "families", group: "Families", args: [], description: "Lists all family accounts and the kids’ accounts waiting for a parent" },
  { name: "setbirthdate", group: "Families", args: [user], rest: { name: "YYYY-MM-DD", required: true, max: 10 }, description: "Fixes a wrong date of birth (users can’t change it themselves)" },

  { name: "coins", group: "Coins", args: [user], description: "A user’s coin balance and history" },
  { name: "givecoins", group: "Coins", args: [user, { name: "amount", type: "amount" }], rest: reason, description: "Gives coins" },
  { name: "takecoins", group: "Coins", args: [user, { name: "amount", type: "amount" }], rest: reason, description: "Takes coins (never below 0)" },
  { name: "themeprice", group: "Coins", args: [{ name: "theme", type: "theme" }, { name: "price", type: "amount" }], description: "Changes a theme’s price" },
  { name: "givetheme", group: "Coins", args: [user, { name: "theme", type: "theme" }], description: "Gives a theme for free (still follows its age limit)" },

  { name: "deletecomment", group: "Comments", args: [{ name: "comment id", type: "comment" }], description: "Deletes any comment", destructive: true },
  { name: "clearcomments", group: "Comments", args: [book], description: "Deletes all comments on a book", destructive: true },
  { name: "lockcomments", group: "Comments", args: [book], description: "Turns comments on a book off" },
  { name: "unlockcomments", group: "Comments", args: [book], description: "Turns comments on a book back on" },

  { name: "tags", group: "Tags", args: [], description: "Lists all fandoms and tags, newest first, with creator and number of books" },
  { name: "renametag", group: "Tags", args: [{ name: "tag", type: "tag" }], rest: { name: "new name", required: true, max: 40 }, description: "Renames a tag everywhere it’s used (quote names with spaces)" },
  { name: "mergetag", group: "Tags", args: [{ name: "tag", type: "tag" }], rest: { name: "into tag", required: true, max: 60 }, description: "Moves every book from the first tag to the second, then deletes the first", destructive: true },
  { name: "deletetag", group: "Tags", args: [{ name: "tag", type: "tag" }], description: "Deletes a tag and removes it from every book", destructive: true },
  { name: "bantag", group: "Tags", args: [], rest: { name: "word", required: true, max: 40 }, description: "Adds a word to the banned list so no new tag can contain it" },

  { name: "announce", group: "Site", args: [], rest: { name: "message", required: true, max: 300 }, description: "Shows a banner at the top of Writt for everyone" },
  { name: "unannounce", group: "Site", args: [], description: "Removes the banner" },
  { name: "maintenance", group: "Site", args: [{ name: "on|off", type: "onoff" }], description: "Shows a maintenance page to everyone except you" },
  { name: "stats", group: "Site", args: [], description: "Users, books, views, reports, appeals and sign-ups" },
  { name: "help", group: "Site", args: [], description: "Lists every command" },
];

export function usage(def: CommandDef): string {
  const parts = [`/${def.name}`];
  for (const a of def.args) parts.push(a.optional ? `[${a.name}]` : a.type === "user" ? a.name : `<${a.name}>`);
  if (def.rest) parts.push(def.rest.required ? `<${def.rest.name}>` : `[${def.rest.name}]`);
  return parts.join(" ");
}

export function findCommand(name: string): CommandDef | undefined {
  return COMMANDS.find((c) => c.name === name.toLowerCase());
}

export function isDestructiveCommand(input: string): boolean {
  const name = input.trim().match(/^\/(\S+)/)?.[1];
  return Boolean(name && findCommand(name)?.destructive);
}

// ---- Results, rendered by components/admin/CommandResult.tsx ----

export type Cell = string | { text: string; href: string };

export type ResultBlock =
  | { kind: "text"; text: string }
  | { kind: "fields"; items: [string, Cell][] }
  | { kind: "table"; columns: string[]; rows: Cell[][] }
  | { kind: "thread"; messages: { from: string; admin: boolean; at: string; body: string }[] };

export type CommandResult = {
  ok: boolean;
  message: string;
  blocks?: ResultBlock[];
  /** Set when a destructive command was sent without confirmation. */
  needsConfirm?: boolean;
};
