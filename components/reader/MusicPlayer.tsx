"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseMusicUrl, type MusicSource } from "@/lib/music";
import { Spinner } from "@/components/ui/Spinner";
import { MusicIcon, PauseIcon, PlayIcon, VolumeIcon } from "@/components/ui/icons";

// Minimal typings for the two embed APIs we drive.
type YTPlayer = { playVideo(): void; pauseVideo(): void; setVolume(v: number): void; unMute(): void; destroy(): void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width: number;
      height: number;
      playerVars: Record<string, number>;
      events: { onReady: () => void; onStateChange: (e: { data: number }) => void };
    },
  ) => YTPlayer;
  PlayerState: { PLAYING: number };
};
type SCWidget = { play(): void; pause(): void; setVolume(v: number): void; bind(event: string, fn: () => void): void };
type SCNamespace = { Widget: ((el: HTMLIFrameElement) => SCWidget) & { Events: Record<"READY" | "PLAY" | "PAUSE" | "FINISH", string> } };

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    SC?: SCNamespace;
  }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error("Couldn’t load the player."));
        document.head.appendChild(el);
      }),
    );
  }
  return scripts.get(src)!;
}

function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    loadScript("https://www.youtube.com/iframe_api").catch(reject);
  });
}

type Controls = { play(): void; pause(): void; setVolume(v: number): void };

const LABEL: Record<MusicSource["kind"], string> = { youtube: "YouTube", soundcloud: "SoundCloud", audio: "Audio" };

export function MusicPlayer({ url, defaultVolume }: { url: string; defaultVolume: number }) {
  const parsed = useMemo(() => parseMusicUrl(url), [url]);
  if ("error" in parsed) return null;
  return <Player source={parsed} defaultVolume={defaultVolume} />;
}

function Player({ source, defaultVolume }: { source: MusicSource; defaultVolume: number }) {
  const [volume, setVolume] = useState(defaultVolume);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(source.kind === "audio");
  const [error, setError] = useState<string | null>(null);
  const controls = useRef<Controls | null>(null);
  const volumeRef = useRef(volume);
  const mountRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sliderId = useId();

  useEffect(() => {
    volumeRef.current = volume;
    controls.current?.setVolume(volume);
  }, [volume]);

  // Set up the player without playing; nothing starts until the reader presses play.
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;

    if (source.kind === "audio" && audioRef.current) {
      const audio = audioRef.current;
      controls.current = {
        play: () => void audio.play().catch(() => setError("This audio file couldn’t be played.")),
        pause: () => audio.pause(),
        setVolume: (v) => (audio.volume = v / 100),
      };
      audio.volume = volumeRef.current / 100;
    }

    if (source.kind === "youtube" && mountRef.current) {
      const host = document.createElement("div");
      mountRef.current.appendChild(host);
      loadYouTube()
        .then((YT) => {
          if (cancelled) return;
          const player = new YT.Player(host, {
            videoId: source.videoId,
            width: 160,
            height: 90,
            playerVars: { autoplay: 0, playsinline: 1, rel: 0, modestbranding: 1 },
            events: {
              onReady: () => {
                player.setVolume(volumeRef.current);
                controls.current = {
                  play: () => {
                    player.unMute();
                    player.playVideo();
                  },
                  pause: () => player.pauseVideo(),
                  setVolume: (v) => player.setVolume(v),
                };
                setReady(true);
              },
              onStateChange: (e) => setPlaying(e.data === YT.PlayerState.PLAYING),
            },
          });
          destroy = () => player.destroy();
        })
        .catch((e: Error) => setError(e.message));
    }

    if (source.kind === "soundcloud" && iframeRef.current) {
      const iframe = iframeRef.current;
      loadScript("https://w.soundcloud.com/player/api.js")
        .then(() => {
          if (cancelled || !window.SC) return;
          const widget = window.SC.Widget(iframe);
          const { READY, PLAY, PAUSE, FINISH } = window.SC.Widget.Events;
          widget.bind(READY, () => {
            widget.setVolume(volumeRef.current);
            controls.current = { play: () => widget.play(), pause: () => widget.pause(), setVolume: (v) => widget.setVolume(v) };
            setReady(true);
          });
          widget.bind(PLAY, () => setPlaying(true));
          widget.bind(PAUSE, () => setPlaying(false));
          widget.bind(FINISH, () => setPlaying(false));
        })
        .catch((e: Error) => setError(e.message));
    }

    return () => {
      cancelled = true;
      destroy?.();
      controls.current = null;
    };
  }, [source]);

  return (
    <section aria-label="Story music" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <button
        type="button"
        onClick={() => (playing ? controls.current?.pause() : controls.current?.play())}
        disabled={!ready}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition hover:bg-accent-strong disabled:opacity-50"
        aria-label={playing ? "Pause music" : "Play music"}
      >
        {!ready ? <Spinner className="size-4" /> : playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <MusicIcon className="size-4 text-accent" /> Soundtrack
        </p>
        <p className="text-xs text-ink-soft">{error ?? `${LABEL[source.kind]} · press play to listen`}</p>
      </div>
      <div className="flex w-40 items-center gap-2">
        <label htmlFor={sliderId} className="sr-only">
          Music volume
        </label>
        <VolumeIcon muted={volume === 0} className="size-4 shrink-0 text-ink-soft" />
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
          aria-valuetext={`${volume}%`}
        />
      </div>

      {source.kind === "youtube" && <div ref={mountRef} className="overflow-hidden rounded-lg [&_iframe]:block" />}
      {source.kind === "soundcloud" && (
        <iframe
          ref={iframeRef}
          title="SoundCloud player"
          className="h-5 w-full rounded"
          allow="autoplay"
          src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(source.url)}&auto_play=false&visual=false&show_comments=false&hide_related=true&show_teaser=false`}
        />
      )}
      {source.kind === "audio" && (
        <audio
          ref={audioRef}
          src={source.url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError("This audio file couldn’t be loaded.")}
        />
      )}
    </section>
  );
}
