// Music links attached to a story. Only sources whose players expose a volume
// API are accepted, so the reader's volume slider always works.

export type MusicSource =
  | { kind: "youtube"; videoId: string; url: string }
  | { kind: "soundcloud"; url: string }
  | { kind: "audio"; url: string };

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;

export function parseMusicUrl(input: string): MusicSource | { error: string } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { error: "That doesn’t look like a link." };
  }
  if (url.protocol !== "https:") {
    return { error: "Music links must start with https://" };
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = match?.[1] ?? null;
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
      return { error: "Couldn’t find the video in that YouTube link." };
    }
    return { kind: "youtube", videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }

  if (host === "soundcloud.com" || host === "on.soundcloud.com") {
    if (url.pathname.split("/").filter(Boolean).length < 1) {
      return { error: "Link to a specific SoundCloud track or playlist." };
    }
    return { kind: "soundcloud", url: `https://${url.hostname}${url.pathname}` };
  }

  if (host.endsWith("spotify.com")) {
    return {
      error:
        "Spotify links aren’t supported because their player can’t be volume-controlled. Try YouTube, SoundCloud or a direct audio file.",
    };
  }

  if (AUDIO_EXT.test(url.pathname)) {
    return { kind: "audio", url: url.toString() };
  }

  return {
    error: "Use a YouTube or SoundCloud link, or a direct audio file (.mp3, .m4a, .ogg, .wav).",
  };
}
