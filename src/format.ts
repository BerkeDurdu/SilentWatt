import type { CaseStatus } from '../shared/types';
import { getLang } from './i18n';

const locale = () => (getLang() === 'tr' ? 'tr-TR' : 'en-GB');
const cache = new Map<string, Intl.NumberFormat>();

export function num(n: number, digits = 0) {
  const key = `${locale()}:${digits}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(key, f);
  }
  return f.format(n);
}

/** Turkish writes the percent sign first (%14), English after (14%). */
export const pct = (n: number, digits = 0) => (getLang() === 'tr' ? `%${num(n, digits)}` : `${num(n, digits)}%`);
export const signedPct = (n: number) => `${n > 0 ? '+' : '−'}${pct(Math.abs(n))}`;
/** A share such as 0.31 as "+%31". Callers handle null themselves: not computed is never shown as 0. */
export const signedShare = (value: number) => signedPct(value * 100);
export const share = (value: number) => pct(value * 100);

/** A local date string (YYYY-MM-DD) as "7 Tem"; parsed and printed in UTC so it never shifts a day. */
export const shortDay = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const isOpenStatus = (s: CaseStatus) => s === 'new' || s === 'review' || s === 'assigned';
