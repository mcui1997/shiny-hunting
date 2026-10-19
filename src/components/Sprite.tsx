import { useState } from 'react';

const RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const CDN = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon';

/** Gen 5 animated sprite, then the static Gen 5 sprite, then the default sprite; CDN mirror last. */
export function spriteUrls(id: number, shiny: boolean): string[] {
  const s = shiny ? 'shiny/' : '';
  return [
    `${RAW}/versions/generation-v/black-white/animated/${s}${id}.gif`,
    `${RAW}/versions/generation-v/black-white/${s}${id}.png`,
    `${RAW}/${s}${id}.png`,
    `${CDN}/versions/generation-v/black-white/animated/${s}${id}.gif`,
  ];
}

export function Sprite({ id, name, shiny, size = 96, eager = false }: {
  id: number; name: string; shiny: boolean; size?: number; eager?: boolean;
}) {
  const urls = spriteUrls(id, shiny);
  const [i, setI] = useState(0);
  const key = `${id}-${shiny}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) { setLastKey(key); setI(0); }
  if (i >= urls.length) {
    return <span className="sprite sprite--missing" style={{ width: size, height: size }} role="img" aria-label={`${name} sprite unavailable`}>?</span>;
  }
  return (
    <img
      className="sprite"
      src={urls[i]}
      alt={`${shiny ? 'Shiny ' : ''}${name}`}
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setI((n) => n + 1)}
    />
  );
}
