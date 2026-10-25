// Runs once when the server starts. In production, Writt refuses to start with
// settings that would leave the admin account or the database unsafe, rather
// than running half-configured. (Local development and `next build` skip this.)

export function register() {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;

  const problems: string[] = [];
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (secret.length < 32) problems.push("AUTH_SECRET is missing or too short (use `npx auth secret`).");
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is missing.");
  if (/_dev\b/.test(new URL(process.env.DATABASE_URL || "mongodb://x/x").pathname)) {
    problems.push("DATABASE_URL points at a test database (name ends in _dev).");
  }
  if (!process.env.ADMIN_EMAIL) problems.push("ADMIN_EMAIL is missing, so nobody could be admin.");
  if (!process.env.ADMIN_USER_ID) problems.push("ADMIN_USER_ID is missing: it pins the admin to your exact account, so nobody can become admin by registering your email.");
  if (!process.env.CRON_SECRET) problems.push("CRON_SECRET is missing: scheduled jobs (deleting unapproved kids' accounts) won't be allowed to run.");
  if (!process.env.AUTH_URL && !process.env.APP_URL) problems.push("AUTH_URL (or APP_URL) is missing: links in emails would be wrong.");

  if (problems.length) {
    throw new Error(`Writt can't start in production:\n - ${problems.join("\n - ")}`);
  }
}
