import type { Species } from './types';

/**
 * A short "good for" note built from the species' Uses data, used to prefill a catch's note.
 * Ability effects first (hidden ones say so, since a given catch may not have it), then the
 * handy moves it can learn. You can overwrite it on the Owned page.
 */
export function suggestedNote(sp: Species | undefined): string {
  if (!sp) return '';
  const groups = sp.uses.filter((u) => u.tag !== 'field');
  const abilities = groups.flatMap((g) => g.items.filter((i) => i.how.endsWith('ability')));
  const moves = groups.flatMap((g) => g.items.filter((i) => !i.how.endsWith('ability')).map((i) => i.name));
  const parts: string[] = [];
  for (const a of abilities.slice(0, 2)) {
    const effect = a.effect.charAt(0).toLowerCase() + a.effect.slice(1);
    parts.push(a.hidden ? `With ${a.name} (hidden ability): ${effect}.` : `${a.name}: ${effect}.`);
  }
  const uniqueMoves = [...new Set(moves)].slice(0, 4);
  if (uniqueMoves.length) parts.push(`Learns ${listOf(uniqueMoves)}.`);
  return parts.length ? parts.join(' ') : 'No field or catching uses. One to show off.';
}

const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
