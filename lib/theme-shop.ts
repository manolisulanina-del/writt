import "server-only";
import { prisma, isUniqueViolation } from "@/lib/db";
import { shortfallMessage } from "@/lib/coin-rules";
import { NotEnoughCoins, changeCoins, coinTransaction } from "@/lib/coins";
import { isAdmin } from "@/lib/auth/admin-identity";
import { ageFrom } from "@/lib/content";
import { getKidState } from "@/lib/family";
import { getSiteSettings } from "@/lib/settings";
import { DEFAULT_THEME, THEMES, findTheme, oldEnoughForTheme, type ThemeDef } from "@/lib/themes";

export type ShopTheme = ThemeDef & { price: number; owned: boolean; applied: boolean; locked: boolean };

/** Current prices: lib/themes.ts, overridden by the admin's /themeprice. */
export async function themePrices(): Promise<Record<string, number>> {
  const { themePrices: overrides } = await getSiteSettings();
  return Object.fromEntries(THEMES.map((t) => [t.id, t.id === DEFAULT_THEME ? 0 : (overrides[t.id] ?? t.price)]));
}

/**
 * Who's shopping: age, balance, owned themes, and whether a parent turned the
 * shop off. The admin (Writt's creator) has unlimited coins: shown as ∞, and
 * themes cost them nothing.
 */
export async function shopState(userId: string) {
  const [user, owned, prices, kid] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, homeTheme: true, birthDate: true, role: true, email: true } }),
    prisma.themeOwnership.findMany({ where: { userId }, select: { theme: true } }),
    themePrices(),
    getKidState(userId),
  ]);
  const age = ageFrom(user.birthDate);
  const ownedIds = new Set([DEFAULT_THEME, ...owned.map((o) => o.theme)]);
  const themes: ShopTheme[] = THEMES.map((t) => ({
    ...t,
    price: prices[t.id],
    owned: ownedIds.has(t.id),
    applied: user.homeTheme === t.id,
    locked: !oldEnoughForTheme(t, age),
  }));
  const unlimited = isAdmin({ id: userId, role: user.role, email: user.email });
  return { coins: user.coins, unlimited, age, themes, shopOff: Boolean(kid && !kid.controls.shop) };
}

type Result = { ok: true; message: string } | { ok: false; error: string };

const lockedMessage = (t: ThemeDef) => `${t.name} is available when you turn ${t.minAge}.`;

/** Buys a theme with coins. Checks the age limit, the parent's shop switch and the balance on the server. */
export async function buyTheme(userId: string, themeId: string): Promise<Result> {
  const theme = findTheme(themeId);
  if (!theme || theme.id === DEFAULT_THEME) return { ok: false, error: "That theme doesn’t exist." };
  const state = await shopState(userId);
  if (state.shopOff) return { ok: false, error: "The shop is turned off on your account." };
  if (!oldEnoughForTheme(theme, state.age)) return { ok: false, error: lockedMessage(theme) };
  const entry = state.themes.find((t) => t.id === theme.id)!;
  if (entry.owned) return { ok: false, error: `You already own ${theme.name}.` };
  // Unlimited coins: the theme is simply added, and nothing goes into the coin history.
  if (state.unlimited) {
    try {
      await prisma.themeOwnership.create({ data: { userId, theme: theme.id, source: "ADMIN" } });
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, error: `You already own ${theme.name}.` };
      throw error;
    }
    return { ok: true, message: `${theme.name} is yours! Apply it from My themes.` };
  }
  const short = shortfallMessage(state.coins, entry.price);
  if (short) return { ok: false, error: short };

  try {
    await coinTransaction(async (tx) => {
      await tx.themeOwnership.create({ data: { userId, theme: theme.id, source: "PURCHASE" } });
      await changeCoins(tx, userId, -entry.price, "THEME_PURCHASE", { theme: theme.id, note: theme.name });
    });
  } catch (error) {
    if (error instanceof NotEnoughCoins) return { ok: false, error: shortfallMessage(0, error.missing)! };
    if (isUniqueViolation(error)) return { ok: false, error: `You already own ${theme.name}.` };
    if ((error as { code?: string })?.code === "P2034") return { ok: false, error: "Your coins were busy with something else. Try again." };
    throw error;
  }
  return { ok: true, message: `${theme.name} is yours! Apply it from My themes.` };
}

/** Uses an owned theme (or Default) on the user's homepage. */
export async function applyTheme(userId: string, themeId: string): Promise<Result> {
  const theme = findTheme(themeId);
  if (!theme) return { ok: false, error: "That theme doesn’t exist." };
  const state = await shopState(userId);
  if (!oldEnoughForTheme(theme, state.age)) return { ok: false, error: lockedMessage(theme) };
  if (!state.themes.find((t) => t.id === theme.id)?.owned) return { ok: false, error: `Buy ${theme.name} first.` };
  await prisma.user.update({ where: { id: userId }, data: { homeTheme: theme.id } });
  return { ok: true, message: `Your homepage now uses ${theme.name}.` };
}

/** Whether the user may preview a theme on their homepage before buying. */
export async function canPreviewTheme(userId: string, themeId: string): Promise<{ ok: true; theme: ThemeDef } | { ok: false; error: string }> {
  const theme = findTheme(themeId);
  if (!theme) return { ok: false, error: "That theme doesn’t exist." };
  const state = await shopState(userId);
  if (state.shopOff) return { ok: false, error: "The shop is turned off on your account." };
  if (!oldEnoughForTheme(theme, state.age)) return { ok: false, error: lockedMessage(theme) };
  return { ok: true, theme };
}
