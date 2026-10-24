// Seeds demo users and stories. Safe to re-run: it only replaces accounts
// on the @writt.dev demo domain and their content.
//   npm run db:seed
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { excerptOf, sanitizeDoc, type RichDoc } from "../lib/rich-text";

const prisma = new PrismaClient();
const PASSWORD = "Writt-demo-2026";
const DOMAIN = "@writt.dev";

function doc(...blocks: (string | { h: string } | { quote: string })[]): RichDoc {
  return sanitizeDoc({
    type: "doc",
    content: blocks.map((b) =>
      typeof b === "string"
        ? { type: "paragraph", content: [{ type: "text", text: b }] }
        : "h" in b
          ? { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: b.h }] }
          : { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: b.quote }] }] },
    ),
  });
}

const USERS = [
  { email: `editor${DOMAIN}`, username: "editor", role: "USER" as const, bio: "Keeper of the Writt shelves." },
  { email: `mira${DOMAIN}`, username: "mira.writes", role: "USER" as const, bio: "Found family, slow burn, and too many lighthouses." },
  { email: `kai${DOMAIN}`, username: "kai_inkwell", role: "USER" as const, bio: "Space operas and alternate endings." },
  { email: `june${DOMAIN}`, username: "junebug", role: "USER" as const, bio: "Coffee shop AUs. Always coffee shop AUs." },
];

type StorySeed = {
  author: string;
  title: string;
  views: number;
  visibility?: "PUBLIC" | "PRIVATE" | "DRAFT";
  musicUrl?: string;
  chapters: { title?: string; pages: RichDoc[] }[];
};

const STORIES: StorySeed[] = [
  {
    author: "mira.writes",
    title: "The Lighthouse Keeper’s Apprentice",
    views: 1840,
    musicUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    chapters: [
      {
        title: "Salt and Static",
        pages: [
          doc(
            "The lamp had not gone dark in forty years, which was precisely why Elin noticed the moment it flickered.",
            "She was halfway up the spiral stairs, a tin of oil in one hand and a letter she hadn’t opened in the other, when the beam stuttered across the water like a skipped heartbeat.",
            { quote: "Keep the light, and the light keeps you." },
            "Her grandmother used to say it every night. Elin had always assumed it was a metaphor.",
          ),
          doc(
            "The letter was addressed to someone who had been dead for a decade.",
            "Elin turned it over twice before breaking the seal. Inside: a single line of handwriting she recognised from the margins of every logbook in the tower.",
            "“If you are reading this, the light has chosen you. Do not let them take the lens.”",
          ),
        ],
      },
      {
        title: "Visitors",
        pages: [
          doc(
            "The boat arrived at dusk, which no sensible boat would do.",
            "Three figures climbed the rocks without a lantern between them, and the gulls, who were afraid of nothing, went silent.",
          ),
        ],
      },
    ],
  },
  {
    author: "kai_inkwell",
    title: "Orbit of Lesser Gods",
    views: 960,
    chapters: [
      {
        title: "Dock Seven",
        pages: [
          doc(
            { h: "Station Meridian, third shift" },
            "Captain Ro had a rule about cargo: never ask what’s in the crate, and never, ever let the crate ask about you.",
            "So when the crate in bay seven said her name, politely and with perfect diction, she did what any reasonable smuggler would do. She closed the bay doors and poured herself a drink.",
          ),
        ],
      },
    ],
  },
  {
    author: "junebug",
    title: "Extra Shot, No Foam",
    views: 412,
    chapters: [
      {
        pages: [
          doc(
            "The new barista spelled my name wrong on purpose. I know it was on purpose because my name is Sam, and the cup said “Samwise the Brave.”",
            "I came back the next day to complain. I came back the day after that to complain louder. By Friday I had a loyalty card with nine stamps and absolutely no dignity.",
          ),
          doc("“You know,” he said, sliding the cup across the counter, “most people just tip.”", "“Most people,” I said, “aren’t being bullied by their coffee.”"),
        ],
      },
    ],
  },
  {
    author: "mira.writes",
    title: "Notes from the Hollow Library",
    views: 230,
    chapters: [
      {
        title: "Overdue",
        pages: [
          doc(
            "The library fined you in memories, not money.",
            "Tobias owed it three summers and the smell of his mother’s kitchen, and he intended to pay none of it.",
          ),
        ],
      },
    ],
  },
  {
    author: "kai_inkwell",
    title: "Static Between Stars",
    views: 75,
    chapters: [{ pages: [doc("A short one about a radio operator who only ever hears one voice, and the night it says goodbye.")] }],
  },
  {
    author: "junebug",
    title: "Untitled heist thing (draft)",
    views: 0,
    visibility: "DRAFT",
    chapters: [{ pages: [doc("Okay so the crew is five people and one of them is a cat. Figure out the vault later.")] }],
  },
];

const COMMENTS = [
  "I gasped out loud at the last line.",
  "Please tell me there’s another chapter coming soon!",
  "The atmosphere in this is unreal.",
  "Okay, I’m hooked. Following.",
];

async function main() {
  const oldUsers = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const oldIds = oldUsers.map((u) => u.id);
  if (oldIds.length) {
    const oldStories = await prisma.fanfic.findMany({ where: { authorId: { in: oldIds } }, select: { id: true } });
    const storyIds = oldStories.map((s) => s.id);
    const chapters = await prisma.chapter.findMany({ where: { fanficId: { in: storyIds } }, select: { id: true } });
    await prisma.page.deleteMany({ where: { chapterId: { in: chapters.map((c) => c.id) } } });
    await prisma.chapter.deleteMany({ where: { fanficId: { in: storyIds } } });
    const onStory = { fanficId: { in: storyIds } };
    await prisma.comment.deleteMany({ where: { OR: [onStory, { authorId: { in: oldIds } }] } });
    await prisma.reaction.deleteMany({ where: { OR: [onStory, { userId: { in: oldIds } }] } });
    await prisma.view.deleteMany({ where: { OR: [onStory, { userId: { in: oldIds } }] } });
    await prisma.report.deleteMany({ where: { OR: [onStory, { reporterId: { in: oldIds } }] } });
    await prisma.storedFile.deleteMany({ where: { ownerId: { in: oldIds } } });
    await prisma.fanfic.deleteMany({ where: { id: { in: storyIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.user.deleteMany({ where: { id: { in: oldIds } } });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const users = new Map<string, string>();
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: { ...u, name: u.username, passwordHash, needsSetup: false, hasSeenTutorial: u.username === "editor" },
    });
    users.set(u.username, created.id);
  }

  const readers = [...users.values()];
  for (const [i, s] of STORIES.entries()) {
    const visibility = s.visibility ?? "PUBLIC";
    const pages = s.chapters.flatMap((c) => c.pages);
    const story = await prisma.fanfic.create({
      data: {
        title: s.title,
        excerpt: excerptOf(pages[0]),
        authorId: users.get(s.author)!,
        visibility,
        views: s.views,
        musicUrl: s.musicUrl ?? null,
        musicVolume: 60,
        publishedAt: visibility === "PUBLIC" ? new Date(Date.now() - i * 36e5 * 7) : null,
        chapters: {
          create: s.chapters.map((c, order) => ({
            order,
            title: c.title ?? null,
            pages: { create: c.pages.map((content, p) => ({ order: p, content: content as unknown as Prisma.InputJsonValue })) },
          })),
        },
      },
    });
    if (visibility !== "PUBLIC") continue;

    // A few reactions and comments from the other demo users.
    const others = readers.filter((id) => id !== users.get(s.author));
    const likers = others.slice(0, 3 - (i % 3));
    for (const userId of likers) {
      await prisma.reaction.create({ data: { userId, fanficId: story.id, type: "LIKE" } });
    }
    const commenters = others.slice(0, 2);
    for (const [j, userId] of commenters.entries()) {
      await prisma.comment.create({ data: { authorId: userId, fanficId: story.id, body: COMMENTS[(i + j) % COMMENTS.length] } });
    }
    await prisma.fanfic.update({
      where: { id: story.id },
      data: { likeCount: likers.length, commentCount: commenters.length },
    });
  }

  console.log(`Seeded ${USERS.length} users and ${STORIES.length} stories.`);
  console.log(`Log in as any of: ${USERS.map((u) => u.username).join(", ")} with password "${PASSWORD}".`);
  console.log(`The admin is the account whose email matches ADMIN_EMAIL (@annamanoliadmin); the seed creates no admins.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
