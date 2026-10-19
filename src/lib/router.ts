import { useEffect, useState } from 'react';

export type Route =
  | { page: 'dex' }
  | { page: 'species'; id: number }
  | { page: 'caught' }
  | { page: 'goals' }
  | { page: 'stats' }
  | { page: 'catch-new'; species?: string }
  | { page: 'catch-edit'; id: string };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  switch (parts[0]) {
    case 'p': {
      const id = Number.parseInt(parts[1] ?? '', 10);
      return Number.isFinite(id) ? { page: 'species', id } : { page: 'dex' };
    }
    case 'caught': return { page: 'caught' };
    case 'goals': return { page: 'goals' };
    case 'stats': return { page: 'stats' };
    case 'catch':
      if (parts[1] === 'new') return { page: 'catch-new', species: params.get('species') ?? undefined };
      if (parts[1]) return { page: 'catch-edit', id: decodeURIComponent(parts[1]) };
      return { page: 'caught' };
    default: return { page: 'dex' };
  }
}

export const href = {
  dex: () => '#/',
  species: (id: number) => `#/p/${id}`,
  caught: () => '#/caught',
  goals: () => '#/goals',
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
