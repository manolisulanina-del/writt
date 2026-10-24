"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runAdminCommandAction } from "@/actions/admin";
import { Button } from "@/components/ui/Button";
import { FormError, Textarea, inputClass } from "@/components/ui/Field";
import type { CommandResult } from "@/lib/admin/catalog";

/** Runs admin commands from a form and shows the outcome. */
function useCommand() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CommandResult | null>(null);
  const run = (command: string, onOk?: () => void) =>
    start(async () => {
      const r = await runAdminCommandAction(command);
      setResult(r);
      if (r.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

function Outcome({ result }: { result: CommandResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="text-sm font-semibold text-success">
      ✓ {result.message}
    </p>
  ) : (
    <FormError message={result.message} />
  );
}

/** Reply, approve or deny one open appeal. */
export function AppealAdminControls({ appealId }: { appealId: string }) {
  const { pending, result, run } = useCommand();
  const [text, setText] = useState("");
  const one = (s: string) => s.replace(/\s+/g, " ").trim();

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <label htmlFor="appeal-text" className="text-sm font-semibold">
        Message to the user
      </label>
      <Textarea
        id="appeal-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        placeholder="Required to reply; optional note when approving or denying."
      />
      <Outcome result={result} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending || !text.trim()} onClick={() => run(`/reply ${appealId} ${one(text)}`, () => setText(""))}>
          Send reply
        </Button>
        <Button size="sm" disabled={pending} onClick={() => run(`/approve ${appealId} ${one(text)}`.trim(), () => setText(""))}>
          Approve &amp; restore book
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run(`/deny ${appealId} ${one(text)}`.trim(), () => setText(""))}>
          Deny
        </Button>
      </div>
    </div>
  );
}

export function AnnouncementForm({ current }: { current: string | null }) {
  const { pending, result, run } = useCommand();
  const [text, setText] = useState(current ?? "");
  return (
    <div className="space-y-3">
      <label htmlFor="announcement" className="text-sm font-semibold">
        Banner text
      </label>
      <Textarea id="announcement" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Shown at the top of Writt for everyone" />
      <Outcome result={result} />
      <div className="flex gap-2">
        <Button disabled={pending || !text.trim()} onClick={() => run(`/announce ${text.replace(/\s+/g, " ").trim()}`)}>
          {current ? "Update banner" : "Publish banner"}
        </Button>
        {current && (
          <Button variant="secondary" disabled={pending} onClick={() => run("/unannounce", () => setText(""))}>
            Remove banner
          </Button>
        )}
      </div>
    </div>
  );
}

export function BanWordForm() {
  const { pending, result, run } = useCommand();
  const [word, setWord] = useState("");
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (word.trim()) run(`/bantag ${word.trim()}`, () => setWord(""));
      }}
    >
      <label className="sr-only" htmlFor="ban-word">
        Word to ban from tags
      </label>
      <input id="ban-word" value={word} onChange={(e) => setWord(e.target.value)} maxLength={40} placeholder="Word to ban" className={`${inputClass} h-10 max-w-xs py-0`} />
      <Button type="submit" variant="secondary" disabled={pending || !word.trim()}>
        Ban word
      </Button>
      <div className="w-full">
        <Outcome result={result} />
      </div>
    </form>
  );
}

export function SettingsForm({ threshold, maintenance }: { threshold: number; maintenance: boolean }) {
  const { pending, result, run } = useCommand();
  const [value, setValue] = useState(String(threshold));
  return (
    <div className="space-y-6">
      <Outcome result={result} />
      <div className="space-y-2">
        <label htmlFor="threshold" className="block text-sm font-semibold">
          Remove a book after this many reports
        </label>
        <div className="flex gap-2">
          <select id="threshold" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} w-28`}>
            {[20, 21, 22, 23, 24, 25].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <Button variant="secondary" disabled={pending || value === String(threshold)} onClick={() => run(`/threshold ${value}`)}>
            Save
          </Button>
        </div>
        <p className="text-xs text-ink-soft">Dismissed reports don’t count. Your own books are never removed by reports.</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Maintenance mode</p>
        <p className="text-sm text-ink-soft">
          {maintenance ? "On: everyone except you sees the maintenance page." : "Off: Writt is open to everyone."}
        </p>
        <Button variant={maintenance ? "primary" : "danger"} disabled={pending} onClick={() => run(`/maintenance ${maintenance ? "off" : "on"}`)}>
          {maintenance ? "Turn maintenance off" : "Turn maintenance on"}
        </Button>
      </div>
    </div>
  );
}
