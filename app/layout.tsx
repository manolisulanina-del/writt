import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans, Lexend, Literata, Nunito, Rubik_Dirt, VT323 } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

const ui = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

const read = Literata({
  variable: "--font-read",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Dyslexia-friendly reading font, only downloaded when a reader picks it.
const dyslexic = Lexend({
  variable: "--font-dyslexic",
  subsets: ["latin"],
  preload: false,
});

// Homepage theme fonts (app/themes/*.css), only downloaded when a theme uses them.
const pastel = Nunito({ variable: "--font-pastel", subsets: ["latin"], preload: false });
const emo = Rubik_Dirt({ variable: "--font-emo", subsets: ["latin"], weight: "400", preload: false });
const vhs = VT323({ variable: "--font-vhs", subsets: ["latin"], weight: "400", preload: false });

export const metadata: Metadata = {
  title: { default: "Writt", template: "%s · Writt" },
  description: "Write fanfiction, publish it, and read what everyone else is dreaming up.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
};

// Runs before first paint: stored choice wins, otherwise follow the OS.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("writt-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${display.variable} ${ui.variable} ${read.variable} ${dyslexic.variable} ${pastel.variable} ${emo.variable} ${vhs.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
