import { useEffect, useState } from 'react';

/** A small preference kept in this browser only (e.g. Shiny vs Normal sprites). */
export function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const full = `shiny-hunting:pref:${key}`;
  const [value, setValue] = useState<T>(() => {
    try { return (window.localStorage.getItem(full) as T | null) ?? fallback; } catch { return fallback; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(full, value); } catch { /* ignore */ }
  }, [full, value]);
  return [value, setValue];
}
