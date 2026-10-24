export type StoredObject = { data: Uint8Array; contentType: string };

export interface StorageDriver {
  /** Short id used in public URLs: /api/files/<id>/<key>. */
  readonly id: string;
  put(input: { data: Buffer; contentType: string; ownerId: string }): Promise<{ key: string }>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** Public URL for a stored object. Same shape for every driver. */
export function storageUrl(driverId: string, key: string): string {
  return `/api/files/${driverId}/${key}`;
}

const STORAGE_URL = /^\/api\/files\/(db|disk)\/[A-Za-z0-9._-]{1,100}$/;

/** True for URLs produced by any Writt storage driver. User content may only reference these. */
export function isStorageUrl(url: string): boolean {
  return STORAGE_URL.test(url);
}
