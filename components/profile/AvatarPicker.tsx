"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ACCEPTED_IMAGES, uploadImage } from "@/lib/upload-client";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

async function cropToBlob(src: string, area: Area, size = 512): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t process that image."))), "image/jpeg", 0.9),
  );
}

/** Profile picture with a square crop + preview step before upload. Writes the URL into a hidden "image" field. */
export function AvatarPicker({ defaultImage, username }: { defaultImage: string | null; username: string }) {
  const [image, setImage] = useState(defaultImage ?? "");
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_IMAGES.split(",").includes(file.type)) {
      setError("Use a PNG, JPEG, GIF or WebP image.");
      return;
    }
    setError(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setSource(URL.createObjectURL(file));
  }

  function close() {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
  }

  async function save() {
    if (!source || !area) return;
    setBusy(true);
    try {
      setImage(await uploadImage(await cropToBlob(source, area)));
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-5">
      <input type="hidden" name="image" value={image} />
      <Avatar src={image || null} name={username || "?"} size={88} />
      <div className="space-y-2">
        <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:bg-muted focus-within:ring-2 focus-within:ring-accent">
          Change picture
          <input
            type="file"
            accept={ACCEPTED_IMAGES}
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {image && (
          <button type="button" onClick={() => setImage("")} className="block text-xs font-semibold text-ink-soft hover:text-danger">
            Remove picture
          </button>
        )}
        {error && !source && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>

      <Modal open={source !== null} onClose={close} title="Crop your picture" description="Drag to reposition, use the slider to zoom.">
        <div className="space-y-4 p-5">
          <div className="relative h-72 overflow-hidden rounded-xl bg-ink">
            {source && (
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} loading={busy}>
              Use picture
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
