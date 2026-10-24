"use client";

import { useId, useState } from "react";
import { cn, formatCount } from "@/lib/utils";

type Metric = { key: string; label: string };
type Row = { date: string } & Record<string, number | string>;

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= n) ?? pow * 10;
  return step * 4;
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** One metric at a time over 30 days: 2px line, 10% area wash, crosshair tooltip, and a table view. */
export function StatsChart({ metrics, days }: { metrics: readonly Metric[]; days: Row[] }) {
  const [metric, setMetric] = useState(metrics[0].key);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();

  const values = days.map((d) => Number(d[metric]) || 0);
  const max = niceMax(Math.max(...values));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (days.length - 1)) * iw;
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${PAD.top + ih} L${x(0).toFixed(1)},${PAD.top + ih} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const label = metrics.find((m) => m.key === metric)!.label;
  const total = values.reduce((a, b) => a + b, 0);
  const last = values.length - 1;

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Metric" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          {metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              aria-pressed={metric === m.key}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", metric === m.key ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setTable((t) => !t)} aria-pressed={table} className="ml-auto text-sm font-semibold text-ink-soft hover:text-ink">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      <h3 id={titleId} className="text-sm font-semibold text-ink">
        {label}, last 30 days <span className="font-normal text-ink-soft">· {formatCount(total)} total</span>
      </h3>

      {table ? (
        <div className="mt-3 max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-wide text-ink-soft uppercase">
                <th className="py-2 font-semibold">Day</th>
                {metrics.map((m) => (
                  <th key={m.key} className="py-2 text-right font-semibold">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...days].reverse().map((d) => (
                <tr key={d.date} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5">{fmtDay(d.date)}</td>
                  {metrics.map((m) => (
                    <td key={m.key} className="py-1.5 text-right">
                      {d[m.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label} per day for the last 30 days, ${total} in total`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-ink-soft text-[11px] tabular-nums">
                  {formatCount(t)}
                </text>
              </g>
            ))}
            {days.map((d, i) =>
              i % 7 === 0 || i === last ? (
                <text key={d.date} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-ink-soft text-[11px]">
                  {fmtDay(d.date)}
                </text>
              ) : null,
            )}
            <path d={area} fill="var(--chart)" opacity="0.1" />
            <path d={line} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--ink-soft)" strokeWidth="1" />}
            {(hover !== null ? [hover] : [last]).map((i) => (
              <circle key={i} cx={x(i)} cy={y(values[i])} r="4" fill="var(--chart)" stroke="var(--surface)" strokeWidth="2" />
            ))}
            {hover === null && (
              <text x={x(last) - 8} y={y(values[last]) - 10} textAnchor="end" className="fill-ink text-[12px] font-semibold tabular-nums">
                {values[last]}
              </text>
            )}
            {/* Hit areas wider than the marks: one invisible column per day. */}
            {days.map((d, i) => (
              <rect
                key={d.date}
                x={x(i) - iw / (days.length - 1) / 2}
                y={PAD.top}
                width={iw / (days.length - 1)}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>
          {hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lift"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > days.length / 2 ? "-105%" : "5%"})` }}
            >
              <p className="font-semibold text-ink">{fmtDay(days[hover].date)}</p>
              <p className="text-ink-soft tabular-nums">
                {label}: <span className="font-semibold text-ink">{values[hover]}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
