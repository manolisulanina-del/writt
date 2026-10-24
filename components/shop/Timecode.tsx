"use client";

import { useEffect, useState } from "react";

const START = 3 * 3600 + 14 * 60; // 03:14:00, as if the tape started in the middle of the night
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A VHS tape counter that ticks once a second. Only the digits change: no
 * flashing. With "reduce motion" it stays still.
 */
export function Timecode() {
  const [seconds, setSeconds] = useState(START);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="tabular-nums">
      {pad(Math.floor(seconds / 3600))}:{pad(Math.floor(seconds / 60) % 60)}:{pad(seconds % 60)}
    </span>
  );
}
