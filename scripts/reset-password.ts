// Sets a new password for an account, for when it's forgotten and there's no
// security question to recover it. Run it yourself, in your own terminal:
//   npm run reset-password
// It asks for the username (or email) and the new password, which you type
// here and which is never shown or saved anywhere except as a hash.
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { hashSecret } from "../lib/password";
import { checkPasswordStrength } from "../lib/password-strength";

const tty = Boolean(process.stdin.isTTY);
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
const lines = rl[Symbol.asyncIterator]();
let hidden = false;
// While a password is being typed, don't echo the characters.
const out = rl as unknown as { _writeToOutput: (s: string) => void };
const write = out._writeToOutput.bind(rl);
out._writeToOutput = (s: string) => {
  if (!hidden || s.includes("\n") || s.includes("\r")) write(s);
};

/** Prints the question and reads one line (hidden for passwords). */
async function ask(question: string, secret = false): Promise<string> {
  process.stdout.write(question);
  hidden = secret && tty;
  const next = await lines.next();
  hidden = false;
  if (secret) process.stdout.write("\n");
  if (next.done) throw new Error("Stopped before finishing. Nothing changed.");
  return next.value;
}

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL isn't set. Run this from the project folder with: npm run reset-password");
  const database = new URL(url).pathname.slice(1) || "(default)";

  const identifier = (await ask("Username or email: ")).trim().toLowerCase().replace(/^@/, "");
  const user = await prisma.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
    select: { id: true, username: true, email: true },
  });
  if (!user) {
    console.log(`No account called "${identifier}" in the database "${database}".`);
    return;
  }

  for (;;) {
    const password = await ask("New password: ", true);
    const problems =
      password.length > 128 ? ["Passwords can be at most 128 characters."] : checkPasswordStrength(password, [user.username, user.email ?? ""]).problems;
    if (problems.length) {
      console.log(problems.map((p) => `  - ${p}`).join("\n"));
      continue;
    }
    if ((await ask("Type it again: ", true)) !== password) {
      console.log("  - They don’t match. Try again.");
      continue;
    }
    const sure = (await ask(`Set this as the new password for @${user.username} in the database "${database}"? (y/n) `)).trim().toLowerCase();
    if (sure !== "y" && sure !== "yes") {
      console.log("Nothing changed.");
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashSecret(password) } });
    // Clear failed-login lockouts so you can log in right away.
    await prisma.rateLimit.deleteMany({ where: { key: { in: [`login:${user.username}`, `login:${user.email ?? ""}`] } } });
    console.log(`Done. Log in as @${user.username} with your new password.`);
    return;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
