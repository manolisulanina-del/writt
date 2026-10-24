"use client";

import { FANDOM_LIMIT, RATINGS, SUMMARY_MAX, TAG_LIMIT, WARNINGS } from "@/lib/content";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/Field";
import type { DraftStory } from "./model";
import { TagPicker } from "./TagPicker";

const RATING_HINT: Record<string, string> = {
  EVERYONE: "Fine for every reader, kids (7–12) included",
  TEEN: "Some mature themes. Hidden from readers under 13",
  MATURE: "Adults only. Hidden from readers under 18",
};

/** Summary, age range, status, warnings, fandoms and tags. An age range and a fandom are required to post. */
export function PublishingPanel({
  story,
  onChange,
  allowedRatings,
}: {
  story: DraftStory;
  onChange: (patch: Partial<DraftStory>) => void;
  /** Kids' accounts only see the age ranges they may use. */
  allowedRatings?: string[];
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="story-summary" className="flex items-center justify-between text-sm font-semibold">
          Summary
          <span className={cn("text-xs font-normal tabular-nums", story.summary.length > SUMMARY_MAX - 50 ? "text-danger" : "text-ink-soft")}>
            {story.summary.length}/{SUMMARY_MAX}
          </span>
        </label>
        <Textarea
          id="story-summary"
          value={story.summary}
          onChange={(e) => onChange({ summary: e.target.value.slice(0, SUMMARY_MAX) })}
          placeholder="A few sentences shown on the book card and at the top of the book."
          rows={4}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">
          Age range <span className="font-normal text-ink-soft">(required to post)</span>
        </legend>
        <p className="mb-2 text-xs text-ink-soft">Who is this book for? Readers can report books marked for the wrong ages.</p>
        <div className="grid gap-1.5">
          {RATINGS.filter((r) => !allowedRatings || allowedRatings.includes(r.value)).map((r) => (
            <label
              key={r.value}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                story.rating === r.value ? "border-accent bg-accent-soft" : "border-line hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="rating"
                checked={story.rating === r.value}
                onChange={() => onChange({ rating: r.value })}
                className="accent-[var(--accent)]"
              />
              <span>
                <span className="font-semibold">
                  {r.label} · {r.ages}
                </span>
                <span className="block text-xs text-ink-soft">{RATING_HINT[r.value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Status</legend>
        <div className="flex rounded-lg border border-line p-0.5">
          {(["ONGOING", "COMPLETED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ status: s })}
              aria-pressed={story.status === s}
              className={cn("flex-1 rounded-md py-1.5 text-sm font-semibold", story.status === s ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}
            >
              {s === "ONGOING" ? "Ongoing" : "Completed"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Warnings</legend>
        <div className="grid grid-cols-2 gap-1">
          {WARNINGS.map((w) => (
            <label key={w} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={story.warnings.includes(w)}
                onChange={(e) => onChange({ warnings: e.target.checked ? [...story.warnings, w] : story.warnings.filter((x) => x !== w) })}
                className="accent-[var(--accent)]"
              />
              {w}
            </label>
          ))}
        </div>
      </fieldset>

      <TagPicker
        kind="FANDOM"
        label="Fandoms (at least one to post)"
        value={story.fandoms}
        onChange={(fandoms) => onChange({ fandoms })}
        max={FANDOM_LIMIT}
        placeholder="Harry Potter, Marvel, Original…"
      />
      <TagPicker
        kind="TAG"
        label="Tags"
        value={story.tags}
        onChange={(tags) => onChange({ tags })}
        max={TAG_LIMIT}
        placeholder="Characters, ships, Fluff, Angst, AU…"
      />
    </div>
  );
}
