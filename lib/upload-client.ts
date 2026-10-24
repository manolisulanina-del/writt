// Browser-side helper for /api/upload.

export const ACCEPTED_IMAGES = "image/png,image/jpeg,image/gif,image/webp";
// Hosts like Vercel refuse requests over 4.5 MB, so uploads stay at 4 MB or less.
const MAX_MB = 4;
// Photos bigger than this (in pixels or bytes) are shrunk before uploading.
const MAX_SIDE = 2400;
const SHRINK_OVER_BYTES = 1.5 * 1024 * 1024;

/**
 * Makes big photos smaller (at most 2400px on the long side, as WebP) so they
 * upload fast and fit the size limit. GIFs are left alone to keep animations,
 * and the original is kept if shrinking wouldn't help.
 */
async function shrink(file: Blob): Promise<Blob> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // the server checks the bytes anyway
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SHRINK_OVER_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const smaller = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  return smaller && smaller.size < file.size ? smaller : file;
}

export async function uploadImage(file: Blob): Promise<string> {
  if (!ACCEPTED_IMAGES.split(",").includes(file.type)) {
    throw new Error("Use a PNG, JPEG, GIF or WebP image.");
  }
  const upload = await shrink(file);
  if (upload.size > MAX_MB * 1024 * 1024) {
    throw new Error(file.type === "image/gif" ? `GIFs must be under ${MAX_MB} MB.` : `Images must be under ${MAX_MB} MB.`);
  }
  const body = new FormData();
  body.append("file", upload);
  let res: Response;
  try {
    res = await fetch("/api/upload", { method: "POST", body });
  } catch {
    throw new Error("Upload failed. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? (res.status === 413 ? `Images must be under ${MAX_MB} MB.` : "Upload failed. Try again."));
  return json.url;
}
