// One-off data fixes after schema changes. Safe to re-run.
//   npm run db:migrate-data
// MongoDB doesn't backfill @default values onto existing documents, and Prisma
// filters like `removed: false` or `parentId: null` don't match documents
// missing the field, so set every new field explicitly. Also syncs roles: only
// ADMIN_EMAIL is admin.
import { PrismaClient } from "@prisma/client";
import { countWords } from "../lib/content";
import { docText, type RichDoc } from "../lib/rich-text";

const prisma = new PrismaClient();

type Value = string | number | boolean | null | string[] | { $date: string };

const DEFAULTS: Record<string, Record<string, Value>> = {
  Fanfic: {
    removed: false,
    featured: false,
    hotMode: "AUTO",
    commentsLocked: false,
    summary: "",
    rating: null,
    warnings: [],
    status: "ONGOING",
    wordCount: 0,
    chapterCount: 0,
    saveCount: 0,
    awaitingApproval: false,
  },
  Chapter: { noteStart: null, noteEnd: null, publishAt: null, wordCount: 0, coinsChecked: false },
  Comment: { parentId: null, authorHeart: false },
  User: {
    hideMature: false,
    hiddenWarnings: [],
    birthDate: null,
    kind: "WRITER",
    consent: "NOT_REQUIRED",
    consentDeadline: null,
    paused: false,
    kidControls: null,
    kidGroup: null,
    coins: 0,
    homeTheme: "default",
    sessionVersion: 0,
  },
};

async function main() {
  // Before the defaults below, while "no coinsCheckedAt field" still means "from before coins".
  await settleCoinsForOldBooks();
  for (const [collection, fields] of Object.entries(DEFAULTS)) {
    for (const [field, value] of Object.entries(fields)) {
      const result = (await prisma.$runCommandRaw({
        update: collection,
        updates: [{ q: { [field]: { $exists: false } }, u: { $set: { [field]: value } }, multi: true }],
      })) as { nModified?: number };
      if (result.nModified) console.log(`${collection}.${field}: set on ${result.nModified} documents`);
    }
  }
  // Books that existed before contentUpdatedAt use their last update time.
  await prisma.$runCommandRaw({
    update: "Fanfic",
    updates: [{ q: { contentUpdatedAt: { $exists: false } }, u: [{ $set: { contentUpdatedAt: "$updatedAt" } }], multi: true }],
  });
  // Books already posted, and existing chapters, count as announced, so followers
  // never get "new book" or "new chapter" notifications for old work. Drafts stay unannounced.
  await prisma.$runCommandRaw({
    update: "Fanfic",
    updates: [{ q: { announcedAt: { $exists: false } }, u: [{ $set: { announcedAt: { $ifNull: ["$publishedAt", null] } } }], multi: true }],
  });
  await prisma.$runCommandRaw({
    update: "Chapter",
    updates: [{ q: { announcedAt: { $exists: false } }, u: [{ $set: { announcedAt: "$$NOW" } }], multi: true }],
  });

  await recountWords();

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    console.warn("ADMIN_EMAIL is not set: skipping role sync.");
    return;
  }
  // The admin is ADMIN_EMAIL and, when set, ADMIN_USER_ID (see lib/auth/admin-identity.ts).
  const adminId = process.env.ADMIN_USER_ID?.trim();
  const isTheAdmin = adminId ? { email: adminEmail, id: adminId } : { email: adminEmail };
  const demoted = await prisma.user.updateMany({ where: { role: "ADMIN", NOT: isTheAdmin }, data: { role: "USER" } });
  const promoted = await prisma.user.updateMany({ where: { ...isTheAdmin, role: "USER" }, data: { role: "ADMIN" } });
  console.log(`Roles: ${promoted.count} promoted, ${demoted.count} demoted.`);
}

/** Word and chapter counts come from the pages, so books written before they existed get real numbers. */
async function recountWords() {
  const now = Date.now();
  const books = await prisma.fanfic.findMany({
    select: {
      id: true,
      wordCount: true,
      chapterCount: true,
      chapters: { select: { id: true, wordCount: true, publishAt: true, pages: { select: { content: true } } } },
    },
  });
  let fixed = 0;
  for (const book of books) {
    let words = 0;
    let chapters = 0;
    for (const ch of book.chapters) {
      const count = ch.pages.reduce((n, p) => n + countWords(docText(p.content as unknown as RichDoc)), 0);
      if (count !== ch.wordCount) await prisma.chapter.update({ where: { id: ch.id }, data: { wordCount: count } });
      if (!ch.publishAt || ch.publishAt.getTime() <= now) {
        words += count;
        chapters++;
      }
    }
    if (words !== book.wordCount || chapters !== book.chapterCount) {
      await prisma.fanfic.update({ where: { id: book.id }, data: { wordCount: words, chapterCount: chapters } });
      fixed++;
    }
  }
  console.log(`Word counts: checked ${books.length} books, fixed ${fixed}.`);
}

/**
 * Books written before coins existed don't earn them later: their chapters are
 * marked as counted, and each gets a placeholder earning record.
 */
async function settleCoinsForOldBooks() {
  // New books always store coinsCheckedAt (null until checked), so a missing field means an old book.
  const found = (await prisma.$runCommandRaw({
    find: "Fanfic",
    filter: { coinsCheckedAt: { $exists: false } },
    projection: { _id: 1, authorId: 1 },
    batchSize: 100000,
  })) as { cursor: { firstBatch: { _id: { $oid: string }; authorId: { $oid: string } }[] } };
  const books = found.cursor.firstBatch.map((b) => ({ id: b._id.$oid, authorId: b.authorId.$oid }));
  if (books.length === 0) return;
  const now = new Date();
  for (const book of books) {
    await prisma.chapter.updateMany({ where: { fanficId: book.id }, data: { coinsChecked: true } });
    await prisma.fanfic.update({ where: { id: book.id }, data: { coinsCheckedAt: now } });
    const key = `BOOK:${book.id}`;
    if (!(await prisma.coinEarning.findUnique({ where: { objectKey: key }, select: { id: true } }))) {
      await prisma.coinEarning.create({ data: { userId: book.authorId, kind: "BOOK", objectKey: key, fingerprint: `before-coins:${book.id}` } });
    }
  }
  console.log(`Coins: ${books.length} existing books marked as already counted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
