export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatCount(n: number): string {
  return n < 1000 ? String(n) : compact.format(n);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** True while a timed sanction (ban, mute, block) is still in effect. */
export function isActiveUntil(until: Date | null | undefined): boolean {
  return Boolean(until && until.getTime() > Date.now());
}

/** Today's date as YYYY-MM-DD, for the max of date inputs. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
