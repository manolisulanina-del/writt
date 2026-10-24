"use client";

import type { TagKind } from "@prisma/client";
import { useEffect, useId, useRef, useState } from "react";
import { createTagAction, searchTagsAction } from "@/actions/tags";
import { cn } from "@/lib/utils";
import type { TagRef } from "./model";

type Option = { id: string; name: string; uses: number } | { create: string };

/**
 * Pick existing fandoms or tags with suggestions as you type, or create a new
 * one ("Create tag: …"). The server checks every rule again on create and save.
 */
export function TagPicker({
  kind,
  label,
  value,
  onChange,
  max,
  placeholder,
}: {
  kind: TagKind;
  label: string;
  value: TagRef[];
  onChange: (next: TagRef[]) => void;
  max: number;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  // Suggestions are fetched after a short pause; `exactFor` is the query that matched an existing name exactly.
  const [found, setFound] = useState<{ id: string; name: string; uses: number }[]>([]);
  const [exactFor, setExactFor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const noun = kind === "FANDOM" ? "fandom" : "tag";
  const full = value.length >= max;
  // "Create …" always uses what is typed right now, never an older query that is still on screen.
  const typed = query.replace(/\s+/g, " ").trim();
  const chosen = new Set(value.map((v) => v.id));
  const options: Option[] = found.filter((o) => !chosen.has(o.id));
  if (typed && exactFor !== query) options.push({ create: typed });

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(async () => {
      const result = await searchTagsAction(kind, query);
      if (!active) return;
      setFound(result.options);
      setExactFor(result.exact ? query : null);
      setHighlight(0);
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, open, kind]);

  async function choose(option: Option) {
    setError(null);
    if ("create" in option) {
      setBusy(true);
      const result = await createTagAction(kind, option.create);
      setBusy(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (!value.some((v) => v.id === result.tag.id)) onChange([...value, { id: result.tag.id, name: result.tag.name }]);
    } else if (!value.some((v) => v.id === option.id)) {
      onChange([...value, { id: option.id, name: option.name }]);
    }
    setQuery("");
    input.current?.focus();
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="flex items-center justify-between text-sm font-semibold">
        {label}
        <span className="text-xs font-normal text-ink-soft tabular-nums">
          {value.length}/{max}
        </span>
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Chosen ${noun}s`}>
          {value.map((t) => (
            <li key={t.id} className="inline-flex items-center gap-1 rounded-full bg-plum-soft py-0.5 pr-1 pl-2.5 text-xs font-semibold text-plum">
              {t.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== t.id))}
                className="rounded-full px-1 hover:bg-plum/15"
                aria-label={`Remove ${t.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          id={inputId}
          ref={input}
          value={query}
          disabled={full || busy}
          onChange={(e) => {
            setQuery(e.target.value.slice(0, 40));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (options[highlight]) void choose(options[highlight]);
            } else if (e.key === "Backspace" && !query && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={full ? `Up to ${max} ${noun}s` : placeholder}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
        />
        {open && options.length > 0 && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lift">
            {options.map((o, i) => (
              <li
                key={"create" in o ? "create" : o.id}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn("flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-sm", i === highlight && "bg-muted")}
              >
                {"create" in o ? (
                  <span>
                    <span className="text-ink-soft">Create {noun}:</span> <strong>{o.create}</strong>
                  </span>
                ) : (
                  <>
                    <span>{o.name}</span>
                    <span className="text-xs text-ink-soft">{o.uses} book{o.uses === 1 ? "" : "s"}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
