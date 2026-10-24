"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { runAdminCommandAction } from "@/actions/admin";
import { COMMANDS, isDestructiveCommand, usage, type CommandResult } from "@/lib/admin/catalog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { CommandResultView } from "./CommandResultView";

type Entry = { id: number; command: string; result: CommandResult };

/** The admin's command line: suggestions as you type, confirmation for destructive commands, results below. */
export function CommandBox({ initialCommand }: { initialCommand?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const ranInitial = useRef(false);

  // Suggest while the command name is still being typed.
  const typedName = value.startsWith("/") && !value.includes(" ") ? value.slice(1).toLowerCase() : null;
  const suggestions = typedName === null ? [] : COMMANDS.filter((c) => c.name.startsWith(typedName)).slice(0, 8);
  const exact = typedName !== null && suggestions.length === 1 && suggestions[0].name === typedName;
  const showSuggestions = suggestions.length > 0 && !exact;
  // Once the name is complete, show its usage as a hint.
  const current = COMMANDS.find((c) => value.startsWith(`/${c.name} `) || value === `/${c.name}`);

  function execute(command: string, confirmed: boolean) {
    start(async () => {
      const result = await runAdminCommandAction(command, confirmed);
      counter.current += 1;
      setEntries((e) => [{ id: counter.current, command, result }, ...e].slice(0, 30));
      setConfirming(null);
      if (result.ok) {
        setValue("");
        router.refresh();
      }
    });
  }

  function submit(command = value.trim()) {
    if (!command) return;
    if (isDestructiveCommand(command)) setConfirming(command);
    else execute(command, false);
  }

  // Menus link here with ?cmd= for read-only commands like /lookup; run them once.
  useEffect(() => {
    if (!initialCommand || ranInitial.current) return;
    ranInitial.current = true;
    if (!isDestructiveCommand(initialCommand)) execute(initialCommand, false);
    else setValue(initialCommand); // eslint-disable-line react-hooks/set-state-in-effect -- prefill only, never auto-run destructive commands
    // execute is stable enough for a one-shot effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCommand]);

  return (
    <section aria-label="Admin command box" className="rounded-2xl border border-ink/80 bg-ink p-4 text-paper shadow-lift">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (showSuggestions) {
            setValue(`/${suggestions[highlight].name} `);
            return;
          }
          submit();
        }}
        className="relative"
      >
        <label htmlFor="admin-command" className="mb-2 block text-xs font-bold tracking-widest uppercase opacity-70">
          Command
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg text-accent" aria-hidden>
            ›
          </span>
          <input
            id="admin-command"
            ref={input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (!showSuggestions) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => (h + 1) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Tab") {
                e.preventDefault();
                setValue(`/${suggestions[highlight].name} `);
              }
            }}
            placeholder="/help, /ban @username 7, /remove <book link> spam…"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls={listId}
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent font-mono text-base outline-none placeholder:text-paper/40"
          />
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-40"
          >
            {pending && <Spinner className="size-4" />}
            Run
          </button>
        </div>
        {current && !showSuggestions && (
          <p className="mt-2 font-mono text-xs opacity-70">
            {usage(current)} — {current.description}
          </p>
        )}
        {showSuggestions && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-lift">
            {suggestions.map((c, i) => (
              <li
                key={c.name}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setValue(`/${c.name} `);
                  input.current?.focus();
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn("cursor-pointer px-4 py-2", i === highlight && "bg-muted")}
              >
                <span className="font-mono text-sm font-semibold">{usage(c)}</span>
                <span className={cn("block text-xs", c.destructive ? "text-danger" : "text-ink-soft")}>{c.description}</span>
              </li>
            ))}
          </ul>
        )}
      </form>

      {entries.length > 0 && (
        <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto text-ink" aria-live="polite">
          {entries.map((e) => (
            <CommandResultView key={e.id} result={e.result} command={e.command} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && execute(confirming, true)}
        pending={pending}
        confirmLabel="Yes, run it"
      >
        <p className="text-sm text-ink-soft">This can’t easily be undone:</p>
        <p className="rounded-lg bg-muted px-3 py-2 font-mono text-sm break-words">{confirming}</p>
      </ConfirmDialog>
    </section>
  );
}
