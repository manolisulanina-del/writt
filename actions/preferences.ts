"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { WARNINGS } from "@/lib/content";
import { parseReaderPrefs, type ReaderPrefs } from "@/lib/reader-prefs";
import { requireUser } from "@/lib/session";
import { fieldErrors } from "@/lib/validation";
import type { FormState } from "./auth";

/** Settings → Reading & content: hide Mature books, hide warnings. The date of birth is fixed once given. */
export async function updateContentPrefsAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      hideMature: z.boolean(),
      hiddenWarnings: z.array(z.enum(WARNINGS)),
    })
    .safeParse({
      hideMature: formData.get("hideMature") === "on",
      hiddenWarnings: formData.getAll("hiddenWarnings").map(String),
    });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      hideMature: parsed.data.hideMature,
      hiddenWarnings: parsed.data.hiddenWarnings,
    },
  });
  revalidatePath("/settings");
  return { values: { saved: "1" } };
}

/** Reader display settings, saved per user. */
export async function saveReaderPrefsAction(prefs: ReaderPrefs) {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { readerPrefs: parseReaderPrefs(prefs) } });
}
