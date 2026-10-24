"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { applyTheme, buyTheme } from "@/lib/theme-shop";

/** Buys a theme. Price, balance, age limit and the parent's shop switch are all checked on the server. */
export async function buyThemeAction(themeId: string) {
  const user = await requireUser();
  const result = await buyTheme(user.id, String(themeId));
  if (result.ok) revalidatePath("/shop");
  return result;
}

/** Uses an owned theme on the homepage. */
export async function applyThemeAction(themeId: string) {
  const user = await requireUser();
  const result = await applyTheme(user.id, String(themeId));
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/settings");
  }
  return result;
}
