"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notifyAdmin } from "@/lib/notifications";
import { rateLimit, retryMessage } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { fieldErrors } from "@/lib/validation";
import type { FormState } from "./auth";

// Appeals are in-site messages between one user and the admin. There is no
// recipient field: a user can only write into their own appeal, which only the
// admin can read, so messages can't reach anyone else.

const appealSchema = z.object({
  book: z.string().trim().min(1, "Paste the book’s link or type its title.").max(300),
  message: z
    .string()
    .trim()
    .min(1, "Tell the admin why you think this was unfair.")
    .max(1000, "Keep your message under 1,000 characters."),
});

/** Finds a removed book by link, id or exact title. */
async function findRemovedBook(input: string) {
  const id = input.match(/[a-f0-9]{24}/i)?.[0];
  if (id) {
    const book = await prisma.fanfic.findUnique({ where: { id }, select: { id: true, title: true, removed: true } });
    return book ? [book] : [];
  }
  return prisma.fanfic.findMany({
    where: { removed: true, title: { equals: input, mode: "insensitive" } },
    select: { id: true, title: true, removed: true },
    take: 5,
  });
}

export async function createAppealAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { book: String(formData.get("book") ?? ""), message: String(formData.get("message") ?? "") };
  if (isAdmin(user)) return { error: "You’re the admin, so there’s no one to appeal to.", values };

  const parsed = appealSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const limit = await rateLimit(`appeal:${user.id}`, 5, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds), values };

  const matches = await findRemovedBook(parsed.data.book);
  if (matches.length === 0) return { fieldErrors: { book: ["We couldn’t find a book with that link or title."] }, values };
  if (matches.length > 1) return { fieldErrors: { book: ["Several removed books have that title. Paste the book’s link instead."] }, values };
  const book = matches[0];
  if (!book.removed) return { fieldErrors: { book: ["That book hasn’t been removed, so there’s nothing to appeal."] }, values };

  const existing = await prisma.appeal.findFirst({
    where: { userId: user.id, fanficId: book.id, status: "OPEN" },
    select: { id: true },
  });
  if (existing) return { error: "You already have an open appeal for this book.", values };

  const appeal = await prisma.appeal.create({
    data: { userId: user.id, fanficId: book.id, bookTitle: book.title, message: parsed.data.message },
    select: { id: true },
  });
  await notifyAdmin({
    kind: "APPEAL_NEW",
    title: `New appeal from @${user.username}`,
    body: `About “${book.title}”: ${parsed.data.message.slice(0, 200)}`,
    link: `/admin?tab=appeals&id=${appeal.id}`,
  });
  redirect(`/appeals/${appeal.id}`);
}

/** The appeal's sender answers the admin. Only on their own open appeal. */
export async function replyToAppealAction(appealId: string, body: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { error: "Write a message first." };
  if (text.length > 1000) return { error: "Keep your message under 1,000 characters." };

  if (typeof appealId !== "string" || !/^[a-f0-9]{24}$/i.test(appealId)) return { error: "Appeal not found." };
  const appeal = await prisma.appeal.findFirst({
    where: { id: appealId, userId: user.id },
    select: { id: true, status: true, bookTitle: true },
  });
  if (!appeal) return { error: "Appeal not found." };
  if (appeal.status !== "OPEN") return { error: "This appeal is closed." };

  const limit = await rateLimit(`appeal-reply:${user.id}`, 10, 10 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds) };

  await prisma.$transaction([
    prisma.appealMessage.create({ data: { appealId: appeal.id, authorId: user.id, fromAdmin: false, body: text } }),
    prisma.appeal.update({ where: { id: appeal.id }, data: { awaitingAdmin: true } }),
  ]);
  await notifyAdmin({
    kind: "APPEAL_REPLY",
    title: `@${user.username} replied to their appeal`,
    body: `About “${appeal.bookTitle}”: ${text.slice(0, 200)}`,
    link: `/admin?tab=appeals&id=${appeal.id}`,
  });
  return { ok: true };
}
