"use client";

import { useState } from "react";
import { parseMusicUrl } from "@/lib/music";
import { ACCEPTED_IMAGES, uploadImage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { Cover } from "@/components/fanfic/Cover";
import { ImageIcon, VolumeIcon } from "@/components/ui/icons";
import type { DraftStory } from "./model";

type Props = {
  story: DraftStory;
  onChange: (patch: Partial<DraftStory>) => void;
};

/** Cover image and music settings. */
export function DetailsPanel({ story, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const music = story.musicUrl.trim() ? parseMusicUrl(story.musicUrl) : null;

  async function setCover(file: File | undefined) {
    if (!file) return;
    setCoverError(null);
    setUploading(true);
    try {
      onChange({ coverUrl: await uploadImage(file) });
    } catch (e) {
      setCoverError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-sm font-semibold">Cover image</p>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void setCover(e.dataTransfer.files[0]);
          }}
          className={cn(
            "relative block w-32 cursor-pointer rounded-xl ring-offset-2 ring-offset-paper transition focus-within:ring-2 focus-within:ring-accent",
            dragging && "ring-2 ring-accent",
          )}
        >
          <Cover src={story.coverUrl} title={story.title || "Your story"} sizes="8rem" className="shadow-card" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-black/45 text-xs font-semibold text-white opacity-0 transition hover:opacity-100">
            {uploading ? <Spinner /> : <ImageIcon />}
            {uploading ? "Uploading…" : story.coverUrl ? "Replace" : "Upload or drop"}
          </span>
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 text-white">
              <Spinner label="Uploading cover" />
            </span>
          )}
          <input
            type="file"
            accept={ACCEPTED_IMAGES}
            className="sr-only"
            aria-label="Upload cover image"
            onChange={(e) => {
              void setCover(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {story.coverUrl && (
          <button type="button" onClick={() => onChange({ coverUrl: null })} className="mt-2 text-xs font-semibold text-ink-soft hover:text-danger">
            Remove cover
          </button>
        )}
        {coverError && (
          <p role="alert" className="mt-2 text-xs font-medium text-danger">
            {coverError}
          </p>
        )}
      </div>

      <Field
        label="Music"
        hint="YouTube, SoundCloud or a direct audio file link. Readers press play to start it."
        errors={music && "error" in music ? [music.error] : undefined}
      >
        {(p) => (
          <Input
            {...p}
            type="url"
            inputMode="url"
            placeholder="https://youtu.be/…"
            value={story.musicUrl}
            onChange={(e) => onChange({ musicUrl: e.target.value })}
          />
        )}
      </Field>

      {music && !("error" in music) && (
        <div>
          <label htmlFor="music-volume" className="mb-1.5 flex items-center justify-between text-sm font-semibold">
            Default volume <span className="tabular-nums text-ink-soft">{story.musicVolume}%</span>
          </label>
          <div className="flex items-center gap-2">
            <VolumeIcon muted={story.musicVolume === 0} className="size-4 text-ink-soft" />
            <input
              id="music-volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={story.musicVolume}
              onChange={(e) => onChange({ musicVolume: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
