import Link from "next/link";
import type { Cell, CommandResult } from "@/lib/admin/catalog";
import { cn } from "@/lib/utils";

function CellView({ cell }: { cell: Cell }) {
  if (typeof cell === "string") return <>{cell}</>;
  return (
    <Link href={cell.href} className="font-semibold text-accent hover:underline">
      {cell.text}
    </Link>
  );
}

/** Renders a command's message and any tables, fields or message threads it returned. */
export function CommandResultView({ result, command }: { result: CommandResult; command?: string }) {
  return (
    <div className={cn("rounded-xl border p-4", result.ok ? "border-line bg-surface" : "border-danger/30 bg-danger/5")}>
      {command && <p className="mb-1 font-mono text-xs text-ink-soft">{command}</p>}
      <p role="status" className={cn("font-semibold", result.ok ? "text-success" : "text-danger")}>
        {result.ok ? "✓ " : "✕ "}
        {result.message}
      </p>
      {result.blocks?.map((block, i) => {
        switch (block.kind) {
          case "text":
            return (
              <p key={i} className="mt-3 text-sm text-ink-soft">
                {block.text}
              </p>
            );
          case "fields":
            return (
              <dl key={i} className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
                {block.items.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="font-semibold text-ink-soft">{label}</dt>
                    <dd className="break-words">
                      <CellView cell={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            );
          case "table":
            return (
              <div key={i} className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
                      {block.columns.map((c) => (
                        <th key={c} className="py-2 pr-4 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-line/60 align-top last:border-0">
                        {row.map((cell, c) => (
                          <td key={c} className="py-2 pr-4 break-words">
                            <CellView cell={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "thread":
            return (
              <ol key={i} className="mt-3 space-y-2">
                {block.messages.map((m, j) => (
                  <li key={j} className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm", m.admin ? "ml-auto bg-ink text-paper" : "bg-muted")}>
                    <p className="text-xs font-semibold opacity-70">
                      {m.from} · {m.at}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}
