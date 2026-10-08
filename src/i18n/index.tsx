import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Lang } from '@/lib/types';
import { STRINGS, type StringKey } from './strings';
import { usePersisted, useDbRevision } from '@/lib/hooks';
import { db } from '@/services/db';

export const LANGS: { code: Lang; label: string; name: string; locale: string }[] = [
  { code: 'ru', label: 'RU', name: 'Русский', locale: 'ru-RU' },
  { code: 'tk', label: 'TKM', name: 'Türkmençe', locale: 'tk-TM' },
  { code: 'en', label: 'ENG', name: 'English', locale: 'en-GB' },
];
const IDX: Record<Lang, number> = { en: 0, ru: 1, tk: 2 };

export type TParams = Record<string, string | number | undefined>;
export type TFn = (key: StringKey, params?: TParams) => string;

interface I18n { lang: Lang; setLang: (l: Lang) => void; t: TFn; tk: (key: string, params?: TParams) => string; locale: string; money: (amount: number, currency: 'TMT' | 'CNY' | 'USD', opts?: { decimals?: number }) => string; date: (iso: string, withTime?: boolean) => string; num: (n: number, d?: number) => string; rel: (iso: string) => string }
const Ctx = createContext<I18n | null>(null);

function detect(): Lang {
  const n = (navigator.language || 'ru').toLowerCase();
  return n.startsWith('tk') ? 'tk' : n.startsWith('en') ? 'en' : 'ru';
}

function interpolate(s: string, params?: TParams) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

// Current UI language for services (catalogue requests ask the server for localized text).
let activeLang: Lang = 'en';
export const getLang = () => activeLang;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = usePersisted<Lang>('lang', detect());
  activeLang = lang;
  useDbRevision(); // admin translation overrides update live
  const overrides = db().content.translationOverrides[lang] || {};
  const locale = LANGS.find((l) => l.code === lang)!.locale;

  useEffect(() => { document.documentElement.lang = lang === 'tk' ? 'tk' : lang; }, [lang]);

  const t = useCallback<TFn>((key, params) => {
    const o = overrides[key];
    const entry = STRINGS[key] as readonly [string, string, string] | undefined;
    const s = o ?? (entry ? entry[IDX[lang]] || entry[0] : key);
    return interpolate(s, params);
  }, [lang, overrides]);
  /** Dynamic keys (e.g. `status.${x}`) — falls back to the key's last segment if missing. */
  const tk = useCallback((key: string, params?: TParams) => (key in STRINGS || overrides[key] ? t(key as StringKey, params) : interpolate(key.split('.').pop()!.replace(/_/g, ' '), params)), [t, overrides]);

  const value = useMemo<I18n>(() => {
    const nf = (d: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
    return {
      lang, setLang, t, tk, locale,
      num: (n, d = 0) => nf(d).format(n),
      money: (amount, currency, opts = {}) => {
        const d = opts.decimals ?? (currency === 'TMT' ? 2 : Number.isInteger(amount) ? 0 : 2);
        const s = nf(d).format(amount);
        return currency === 'CNY' ? `¥${s}` : currency === 'USD' ? `$${s}` : `${s} TMT`;
      },
      date: (iso, withTime = false) => new Intl.DateTimeFormat(locale, withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)),
      rel: (iso) => {
        const diff = (new Date(iso).getTime() - Date.now()) / 1000;
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        const abs = Math.abs(diff);
        if (abs < 60) return rtf.format(Math.round(diff), 'second');
        if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
        return rtf.format(Math.round(diff / 86400), 'day');
      },
    };
  }, [lang, setLang, t, tk, locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider missing');
  return v;
}
export const useT = () => useI18n().t;

/** Pick the localized version of admin-entered content, falling back to English. */
export function localizedText<T extends object, K extends keyof T & string>(base: T, i18n: Partial<Record<Lang, Partial<Record<K, string>>>> | undefined, lang: Lang, field: K): string {
  const v = i18n?.[lang]?.[field];
  return String((typeof v === 'string' && v.trim() ? v : base[field]) ?? '');
}
export type { StringKey };
