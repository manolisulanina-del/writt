// Runtime settings read from environment variables, with safe defaults.

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const config = {
  /** A public story with at least this many views is labeled "Hot". */
  hotViewThreshold: int("HOT_VIEW_THRESHOLD", 100),
  /** The top N public stories by views are always labeled "Hot" (0 disables). */
  hotTopN: int("HOT_TOP_N", 3),
  /** A book with this many reports (not counting dismissed ones) is removed. Clamped to 20–25. */
  reportRemovalThreshold: Math.min(Math.max(int("REPORT_REMOVAL_THRESHOLD", 20), 20), 25),
  /** How long an author can't create books after one of theirs is removed for reports. */
  creationBlockDays: 14,
  /** Maximum upload size in megabytes. At most 4: hosts like Vercel refuse requests over 4.5 MB. */
  maxUploadMb: Math.min(int("MAX_UPLOAD_MB", 4), 4),
  /** The one admin account, identified by email (not username) so nobody can claim it by registering the name. */
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || null,
  /** Optional: pins admin to this exact account id as well as the email. */
  adminUserId: process.env.ADMIN_USER_ID?.trim() || null,
  /** The site's public address, for links in emails and texts. */
  appUrl: (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, ""),
};

/** OAuth providers are enabled when their keys are present. Instagram also needs an explicit flag. */
export const oauthProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  facebook: Boolean(process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET),
  apple: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET),
  instagram:
    process.env.FEATURE_INSTAGRAM_LOGIN === "true" &&
    Boolean(process.env.AUTH_INSTAGRAM_ID && process.env.AUTH_INSTAGRAM_SECRET),
};

export type OAuthProviderId = keyof typeof oauthProviders;
