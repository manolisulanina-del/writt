import type { CSSProperties, ReactNode } from "react";

// Background ornaments for themed homepages. Purely decorative: hidden from
// screen readers, never clickable, and kept to the page edges so text stays
// readable. Gentle movement only, and none with "reduce motion" (see the theme CSS).

type Spot = { top: string; left?: string; right?: string; size: number; rotate?: number; delay?: number };

function Scatter({ spots, render }: { spots: Spot[]; render: (i: number) => ReactNode }) {
  return (
    <>
      {spots.map((s, i) => {
        const style: CSSProperties = {
          top: s.top,
          left: s.left,
          right: s.right,
          width: s.size,
          height: s.size,
          rotate: `${s.rotate ?? 0}deg`,
          animationDelay: `${s.delay ?? 0}s`,
        };
        return (
          // Only on wider screens: on phones they'd sit on top of the text.
          <span key={i} className="theme-ornament max-md:hidden" style={style}>
            {render(i)}
          </span>
        );
      })}
    </>
  );
}

// ---- Pastel: clouds, hearts, sparkles, flowers and a rainbow ----

const Cloud = () => (
  <svg viewBox="0 0 64 40" className="size-full">
    <path d="M14 34h38a10 10 0 0 0 0-20 14 14 0 0 0-26-4A11 11 0 0 0 14 34Z" fill="#fff" stroke="#c9b6f2" strokeWidth="2.5" />
    <circle cx="27" cy="25" r="1.6" fill="#7a5fb8" />
    <circle cx="39" cy="25" r="1.6" fill="#7a5fb8" />
    <path d="M30 29q3 2.5 6 0" stroke="#7a5fb8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <circle cx="23" cy="28" r="2.2" fill="#ffc2da" />
    <circle cx="43" cy="28" r="2.2" fill="#ffc2da" />
  </svg>
);
const Heart = ({ color }: { color: string }) => (
  <svg viewBox="0 0 32 32" className="size-full">
    <path d="M16 28S3 20 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 9-13 17-13 17Z" fill={color} stroke="#fff" strokeWidth="2" />
    <path d="M9 10.5a3 3 0 0 1 3-2.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8" />
  </svg>
);
const Sparkle = ({ color }: { color: string }) => (
  <svg viewBox="0 0 32 32" className="size-full">
    <path d="M16 2c1.5 8 6 12.5 14 14-8 1.5-12.5 6-14 14-1.5-8-6-12.5-14-14 8-1.5 12.5-6 14-14Z" fill={color} />
  </svg>
);
const Flower = () => (
  <svg viewBox="0 0 32 32" className="size-full">
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} cx="16" cy="9" rx="5" ry="7" fill="#b9ecd6" stroke="#fff" strokeWidth="1.5" transform={`rotate(${a} 16 16)`} />
    ))}
    <circle cx="16" cy="16" r="4.5" fill="#ffd36e" stroke="#fff" strokeWidth="1.5" />
  </svg>
);
const Rainbow = () => (
  <svg viewBox="0 0 120 64" className="size-full">
    {[
      ["#ffb3cf", 54],
      ["#ffe08a", 45],
      ["#b9ecd6", 36],
      ["#cdb8ff", 27],
    ].map(([c, r]) => (
      <path key={c} d={`M${60 - Number(r)} 62a${r} ${r} 0 0 1 ${Number(r) * 2} 0`} fill="none" stroke={String(c)} strokeWidth="8" strokeLinecap="round" />
    ))}
  </svg>
);

const PASTEL: { spot: Spot; art: () => ReactNode }[] = [
  { spot: { top: "3%", right: "6%", size: 120, delay: 0 }, art: () => <Rainbow /> },
  { spot: { top: "2%", left: "38%", size: 72, delay: 1.2 }, art: () => <Cloud /> },
  { spot: { top: "18%", right: "2%", size: 64, delay: 2.4 }, art: () => <Cloud /> },
  { spot: { top: "9%", left: "1.5%", size: 30, rotate: -12, delay: 0.6 }, art: () => <Heart color="#ff8fb8" /> },
  { spot: { top: "30%", left: "1%", size: 26, delay: 1.8 }, art: () => <Sparkle color="#ffd36e" /> },
  { spot: { top: "46%", right: "1.5%", size: 34, rotate: 14, delay: 0.9 }, art: () => <Heart color="#cdb8ff" /> },
  { spot: { top: "58%", left: "1.2%", size: 36, delay: 2.1 }, art: () => <Flower /> },
  { spot: { top: "70%", right: "2%", size: 28, delay: 1.4 }, art: () => <Sparkle color="#9fe3c5" /> },
  { spot: { top: "84%", left: "2%", size: 30, rotate: 10, delay: 0.3 }, art: () => <Heart color="#ffb3cf" /> },
  { spot: { top: "92%", right: "4%", size: 40, delay: 2.8 }, art: () => <Flower /> },
  { spot: { top: "22%", left: "47%", size: 18, delay: 1.1 }, art: () => <Sparkle color="#ff8fb8" /> },
];

// ---- Emo: paint drips, safety pins, broken hearts, scratched X marks ----

const Drips = () => (
  <svg viewBox="0 0 1200 70" preserveAspectRatio="none" className="size-full">
    <path
      d="M0 0h1200v14c-20 0-22 30-34 30s-12-26-30-26-14 44-30 44-12-48-34-48-20 18-36 18-12-16-30-16-18 34-34 34-14-30-30-30-16 52-34 52-16-56-36-56-20 20-34 20-16-20-34-20-12 40-30 40-14-38-32-38-18 22-34 22-14-24-32-24-16 46-34 46-16-48-36-48-20 14-36 14-14-14-30-14-18 36-34 36-14-34-32-34-16 56-34 56-18-60-36-60-18 18-34 18-14-18-30-18-16 30-32 30-16-28-34-28-18 50-36 50-16-52-34-52-16 16-32 16-14-16-30-16-18 40-34 40-14-40-32-40-18 24-34 24-14-24-30-24-16 48-34 48-16-50-36-50-18 12-34 12-16-12-32-12-14 34-30 34-16-34-32-34-18 52-36 52-16-54-34-54-18 20-34 20S16 14 0 14Z"
      fill="#7a0d1d"
    />
  </svg>
);
const SafetyPin = () => (
  <svg viewBox="0 0 64 24" className="size-full">
    <path d="M8 12h44a6 6 0 1 1-6-6H14" fill="none" stroke="#b9aab7" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="8" cy="12" r="5" fill="none" stroke="#b9aab7" strokeWidth="2.5" />
    <path d="M14 6h4" stroke="#b9aab7" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
const BrokenHeart = () => (
  <svg viewBox="0 0 32 32" className="size-full">
    <path d="M16 28S3 20 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 9-13 17-13 17Z" fill="none" stroke="#c4183c" strokeWidth="2.2" />
    <path d="M16 10l-3 5 4 3-3 5 2 5" fill="none" stroke="#c4183c" strokeWidth="2.2" strokeLinejoin="round" />
  </svg>
);
const Scratch = () => (
  <svg viewBox="0 0 32 32" className="size-full">
    <path d="M5 6l22 21M6 8l20 19M27 5L6 27M25 6L5 25" stroke="#c4183c" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const Star = () => (
  <svg viewBox="0 0 32 32" className="size-full">
    <path d="M16 2l3.5 10H30l-8.5 6.5L25 29l-9-6.5L7 29l3.5-10.5L2 12h10.5Z" fill="none" stroke="#a57be0" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const EMO: { spot: Spot; art: () => ReactNode }[] = [
  { spot: { top: "10%", right: "4%", size: 70, rotate: -24 }, art: () => <SafetyPin /> },
  { spot: { top: "28%", left: "1.5%", size: 34, rotate: -8 }, art: () => <BrokenHeart /> },
  { spot: { top: "44%", right: "2%", size: 26 }, art: () => <Scratch /> },
  { spot: { top: "57%", left: "2%", size: 28, rotate: 12 }, art: () => <Star /> },
  { spot: { top: "68%", right: "2.5%", size: 34, rotate: 10 }, art: () => <BrokenHeart /> },
  { spot: { top: "80%", left: "1.5%", size: 64, rotate: 30 }, art: () => <SafetyPin /> },
  { spot: { top: "90%", right: "4%", size: 24 }, art: () => <Scratch /> },
  { spot: { top: "16%", left: "3%", size: 22 }, art: () => <Scratch /> },
];

// ---- Analog Horror: viewfinder corners and tape-margin notes ----

const NOTES = ["DO NOT REWIND", "TAPE 07 OF 09", "IF FOUND, PLEASE RETURN", "STAY TUNED", "PLAYBACK ONLY"];

function Viewfinder() {
  const corner = "absolute size-10 border-[#e6e2cf]/60";
  return (
    <div className="pointer-events-none absolute inset-3 z-0 sm:inset-6" aria-hidden>
      <span className={`${corner} top-0 left-0 border-t-2 border-l-2`} />
      <span className={`${corner} top-0 right-0 border-t-2 border-r-2`} />
      <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${corner} right-0 bottom-0 border-r-2 border-b-2`} />
      <span className="vhs-osd absolute bottom-3 left-14 flex items-center gap-2 text-sm opacity-70">
        <span className="inline-block h-3 w-6 border border-current p-px">
          <span className="block h-full w-2/3 bg-current" />
        </span>
        SP · CH 03
      </span>
    </div>
  );
}

export function ThemeDecor({ theme }: { theme: string }) {
  if (theme === "pastel") {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <Scatter spots={PASTEL.map((p) => p.spot)} render={(i) => PASTEL[i].art()} />
      </div>
    );
  }
  if (theme === "emo") {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-8 opacity-90 sm:h-16">
          <Drips />
        </div>
        <Scatter spots={EMO.map((p) => p.spot)} render={(i) => EMO[i].art()} />
      </div>
    );
  }
  if (theme === "analog-horror") {
    return (
      <>
        <Viewfinder />
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden max-lg:hidden" aria-hidden>
          {NOTES.map((n, i) => (
            <span
              key={n}
              className="vhs-osd absolute text-sm tracking-[0.3em] opacity-25"
              style={{ top: `${18 + i * 17}%`, [i % 2 ? "right" : "left"]: "1.2%", writingMode: "vertical-rl", rotate: i % 2 ? "0deg" : "180deg" }}
            >
              {n}
            </span>
          ))}
        </div>
      </>
    );
  }
  return null;
}
