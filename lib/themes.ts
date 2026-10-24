// Homepage themes. Each theme's look lives in app/themes/<id>.css as a set of
// CSS variables scoped to [data-home-theme="<id>"]. To add a theme: add an
// entry here, add its CSS file, and import it in app/globals.css.

export type ThemeDef = {
  id: string;
  name: string;
  /** Price in coins; the admin can change it with /themeprice. */
  price: number;
  /** Youngest age that may preview, buy or use it (0 = everyone). */
  minAge: number;
  description: string;
};

export const THEMES: ThemeDef[] = [
  { id: "default", name: "Default", price: 0, minAge: 0, description: "Writt’s normal look." },
  { id: "pastel", name: "Pastel", price: 150, minAge: 0, description: "Soft pinks, lilacs and mint, rounded shapes and cute icons." },
  { id: "emo", name: "Emo", price: 200, minAge: 0, description: "Black with deep red and purple, sharp edges, scratchy grunge textures." },
  {
    id: "analog-horror",
    name: "Analog Horror",
    price: 300,
    minAge: 12,
    description: "An old VHS tape: scan lines, a little static, washed-out colors and timestamps. Eerie, never gory.",
  },
];

export const DEFAULT_THEME = "default";

export function findTheme(id: string): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id.toLowerCase());
}

/** True when someone of this age (null = unknown) may preview, buy or use the theme. */
export function oldEnoughForTheme(theme: ThemeDef, age: number | null): boolean {
  return theme.minAge === 0 || (age ?? 0) >= theme.minAge;
}

/** The theme to actually show: the chosen one if it exists and the user is old enough, else Default. */
export function themeToShow(chosen: string | null | undefined, age: number | null): string {
  const theme = chosen ? findTheme(chosen) : undefined;
  return theme && oldEnoughForTheme(theme, age) ? theme.id : DEFAULT_THEME;
}
