import "server-only";
import { localDriver } from "./local";
import { mongoDriver } from "./mongodb";
import { storageUrl, type StorageDriver } from "./types";

export { isStorageUrl } from "./types";

// To add a provider (S3, Cloudinary, UploadThing...), implement StorageDriver,
// register it here, and allow its id in STORAGE_URL in ./types.ts.
const drivers: Record<string, StorageDriver> = {
  [mongoDriver.id]: mongoDriver,
  [localDriver.id]: localDriver,
};

const PROVIDERS: Record<string, StorageDriver> = {
  mongodb: mongoDriver,
  local: localDriver,
};

function activeDriver(): StorageDriver {
  const name = process.env.STORAGE_PROVIDER ?? "mongodb";
  const driver = PROVIDERS[name];
  if (!driver) throw new Error(`Unknown STORAGE_PROVIDER "${name}". Use one of: ${Object.keys(PROVIDERS).join(", ")}`);
  return driver;
}

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** Detects the image type from its leading bytes; never trust the client-provided type. */
export function sniffImageType(data: Buffer): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  if (data.length < 12) return null;
  if (data[0] === 0x89 && data.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export async function saveImage(data: Buffer, ownerId: string): Promise<{ url: string }> {
  const contentType = sniffImageType(data);
  if (!contentType) throw new Error("Unsupported image type");
  const driver = activeDriver();
  const { key } = await driver.put({ data, contentType, ownerId });
  return { url: storageUrl(driver.id, key) };
}

/** Deletes stored files by their public URLs (any driver). Unknown URLs are ignored. */
export async function deleteStoredUrls(urls: string[]) {
  for (const url of urls) {
    const match = url.match(/^\/api\/files\/([a-z]+)\/([A-Za-z0-9._-]+)$/);
    if (match) await drivers[match[1]]?.delete(match[2]).catch(() => {});
  }
}

/** Reads an object through the driver that wrote it, whatever the current provider is. */
export function readObject(driverId: string, key: string) {
  return drivers[driverId]?.get(key) ?? Promise.resolve(null);
}
