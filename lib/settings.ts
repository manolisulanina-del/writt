import "server-only";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

export const SETTINGS_TAG = "site-settings";

export type SiteSettings = {
  announcement: string | null;
  maintenance: boolean;
  reportThreshold: number;
  /** Extra banned tag words added with /bantag (config/banned-tag-words.json holds the rest). */
  bannedTagWords: string[];
  /** Theme prices changed with /themeprice; themes not listed keep their price from lib/themes.ts. */
  themePrices: Record<string, number>;
};

/** Site-wide switches. Cached and invalidated by setSetting(), so every page can read them cheaply. */
export async function getSiteSettings(): Promise<SiteSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);
  const rows = await prisma.siteSetting.findMany();
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const threshold = Number(get("reportThreshold"));
  return {
    announcement: typeof get("announcement") === "string" && get("announcement") ? String(get("announcement")) : null,
    maintenance: get("maintenance") === true,
    reportThreshold: Number.isInteger(threshold) && threshold >= 20 && threshold <= 25 ? threshold : config.reportRemovalThreshold,
    bannedTagWords: Array.isArray(get("bannedTagWords")) ? (get("bannedTagWords") as unknown[]).map(String) : [],
    themePrices: pricesFrom(get("themePrices")),
  };
}

function pricesFrom(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 0),
  );
}

/** Writes one setting and refreshes the cached copy. Only call from server actions. */
export async function setSetting(key: "announcement" | "maintenance" | "reportThreshold" | "bannedTagWords" | "themePrices", value: Prisma.InputJsonValue | null) {
  if (value === null) {
    await prisma.siteSetting.deleteMany({ where: { key } });
  } else {
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  updateTag(SETTINGS_TAG);
}
