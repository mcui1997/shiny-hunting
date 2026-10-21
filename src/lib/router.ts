import { useEffect, useState } from 'react';

export type Route =
  | { page: 'home' }
  | { page: 'dex' }
  | { page: 'species'; id: number }
  | { page: 'caught' }
  | { page: 'stats' }
  | { page: 'catch-new'; species?: string }
  | { page: 'catch-edit'; id: string };

const safeDecode = (s: string) => {
  try { return decodeURIComponent(s); } catch { return ''; }
};

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.slice(0, 200).replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  switch (parts[0]) {
    case 'p': {
      const id = /^\d{1,4}$/.test(parts[1] ?? '') ? Number.parseInt(parts[1], 10) : NaN;
      return Number.isFinite(id) ? { page: 'species', id } : { page: 'home' };
    }
    case 'caught': return { page: 'caught' };
    case 'dex': return { page: 'dex' };
    case 'goals': return { page: 'home' }; // the old Goals page is part of Home now
    case 'stats': return { page: 'stats' };
    case 'catch':
      if (parts[1] === 'new') return { page: 'catch-new', species: params.get('species')?.slice(0, 40) ?? undefined };
      if (parts[1]) return { page: 'catch-edit', id: safeDecode(parts[1]).slice(0, 20) };
      return { page: 'caught' };
    default: return { page: 'home' };
  }
}

export const href = {
  home: () => '#/',
  dex: () => '#/dex',
  species: (id: number) => `#/p/${id}`,
  caught: () => '#/caught',
  stats: () => '#/stats',
  newCatch: (species?: string) => `#/catch/new${species ? `?species=${encodeURIComponent(species)}` : ''}`,
  editCatch: (id: string) => `#/catch/${encodeURIComponent(id)}`,
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (to: string) => { window.location.hash = to; };
