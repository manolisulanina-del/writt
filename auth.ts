import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";
import Instagram from "next-auth/providers/instagram";
import { randomBytes } from "node:crypto";
import { isObjectId, prisma } from "@/lib/db";
import { oauthProviders } from "@/lib/config";
import { roleForAccount, roleForNewAccount } from "@/lib/auth/admin-identity";
import { consumeLoginToken } from "@/lib/login-tokens";
import { verifySecret } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

type Role = "USER" | "ADMIN";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      needsSetup: boolean;
      needsBirthDate: boolean;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    username?: string;
    needsSetup?: boolean;
    needsBirthDate?: boolean;
    role?: Role;
  }
}

export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export class BannedSignin extends CredentialsSignin {
  code = "banned";
}

/** True while a ban is in effect. */
export function isBanned(user: { bannedUntil: Date | null }): boolean {
  return Boolean(user.bannedUntil && user.bannedUntil.getTime() > Date.now());
}

/** Placeholder until onboarding. The `writer_` prefix is reserved, so it can't clash with chosen names. */
export function placeholderUsername(): string {
  return `writer_${randomBytes(5).toString("hex")}`;
}

// Bcrypt hash of a random string, compared against when no user matches so
// response time doesn't reveal whether an account exists.
const DUMMY_HASH = "$2b$12$.uF6wDwyP/AhAVnjiVCd8.QsCprPq.iPIS0hVr2Xp83pWYuycrzVu";

function adapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createUser: (user: AdapterUser) => {
      const email = user.email?.toLowerCase();
      return base.createUser!({
        ...user,
        email,
        username: placeholderUsername(),
        role: roleForNewAccount(email),
      } as AdapterUser);
    },
  };
}

const providers: Provider[] = [
  Credentials({
    id: "credentials",
    name: "Email",
    credentials: { identifier: {}, password: {} },
    async authorize(raw) {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { identifier, password } = parsed.data;

      const limit = await rateLimit(`login:${identifier}`, 10, 15 * 60_000);
      if (!limit.ok) throw new RateLimitedSignin();

      const user = await prisma.user.findFirst({
        where: identifier.includes("@") ? { email: identifier } : { username: identifier },
        select: { id: true, email: true, name: true, image: true, passwordHash: true, bannedUntil: true },
      });
      const valid = await verifySecret(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user?.passwordHash || !valid) return null;
      if (isBanned(user)) throw new BannedSignin();
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];
// One-time links emailed to family accounts (they have no password). See lib/login-tokens.ts.
providers.push(
  Credentials({
    id: "family-link",
    name: "Family sign-in link",
    credentials: { token: {} },
    async authorize(raw) {
      const userId = typeof raw?.token === "string" ? await consumeLoginToken(raw.token) : null;
      if (!userId) return null;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, image: true, bannedUntil: true } });
      if (!user || isBanned(user)) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
);
if (oauthProviders.google) providers.push(Google);
if (oauthProviders.facebook) providers.push(Facebook);
if (oauthProviders.apple) providers.push(Apple);
// Behind FEATURE_INSTAGRAM_LOGIN: Meta retired the consumer Instagram login API. See README.
if (oauthProviders.instagram) providers.push(Instagram);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  adapter: adapter(),
  // The Credentials provider only works with JWT sessions. 400 days is the
  // longest cookie lifetime browsers allow; it renews on each visit, so users
  // stay signed in unless they're away that long or sign out.
  session: { strategy: "jwt", maxAge: 400 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    // OAuth sign-ins for banned accounts are refused too.
    async signIn({ user }) {
      if (!user?.id || !isObjectId(user.id)) return true; // brand-new OAuth account
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { bannedUntil: true } });
      return dbUser && isBanned(dbUser) ? "/login?error=Banned" : true;
    },
    async jwt({ token, user, trigger }) {
      if (user?.id) token.uid = user.id;
      if (!token.uid) return null;

      // Refresh profile fields on sign-in, after unstable_update(), and once for
      // sessions issued before the birth-date check existed.
      if (user || trigger === "update" || token.needsBirthDate === undefined) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.uid },
          select: { username: true, needsSetup: true, birthDate: true, kind: true, role: true, image: true, name: true, email: true },
        });
        if (!dbUser) return null;

        // Keep the role in sync on every sign-in: promote the admin (ADMIN_EMAIL,
        // and ADMIN_USER_ID when set), and demote anyone else holding the role.
        const role = roleForAccount(token.uid, dbUser.email);
        if (role !== dbUser.role) {
          await prisma.user.update({ where: { id: token.uid }, data: { role } });
        }
        token.username = dbUser.username;
        token.needsSetup = dbUser.needsSetup;
        // Family accounts (parents only) don't give a date of birth.
        token.needsBirthDate = !dbUser.birthDate && dbUser.kind !== "FAMILY";
        token.role = role;
        token.picture = dbUser.image;
        token.name = dbUser.name ?? dbUser.username;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid!;
      session.user.username = token.username ?? "";
      session.user.needsSetup = token.needsSetup ?? true;
      session.user.needsBirthDate = token.needsBirthDate ?? false;
      session.user.role = token.role ?? "USER";
      session.user.image = token.picture ?? null;
      return session;
    },
  },
});
