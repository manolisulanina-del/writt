import "server-only";
import { prisma, isObjectId } from "@/lib/db";
import type { StorageDriver } from "./types";

/** Stores image bytes in the StoredFile collection. */
export const mongoDriver: StorageDriver = {
  id: "db",

  async put({ data, contentType, ownerId }) {
    const file = await prisma.storedFile.create({
      data: { data: new Uint8Array(data), contentType, size: data.length, ownerId },
      select: { id: true },
    });
    return { key: file.id };
  },

  async get(key) {
    if (!isObjectId(key)) return null;
    const file = await prisma.storedFile.findUnique({
      where: { id: key },
      select: { data: true, contentType: true },
    });
    return file ? { data: file.data, contentType: file.contentType } : null;
  },

  async delete(key) {
    if (!isObjectId(key)) return;
    await prisma.storedFile.deleteMany({ where: { id: key } });
  },
};
