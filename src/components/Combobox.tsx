import { useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9♀♂]/g, '');

/**
 * Text input with a suggestion list drawn by the page (not the browser's <datalist>, whose popup
 * can't be styled and in some browsers turns the text white after you pick an entry).
 * Arrow keys move, Enter picks, Escape closes. Typing anything is still allowed.
 */
export function Combobox({ value, onValue, options, max = 8, className = 'input', wrapClassName, ...rest }: {
  value: string;
  onValue: (v: string) => void;
  options: readonly string[];
  max?: number;
  wrapClassName?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = norm(value);
    if (!q) return options.slice(0, max);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const o of options) {
      const k = norm(o);
      if (k === q) continue; // already typed exactly
      if (k.startsWith(q)) starts.push(o);
      else if (k.includes(q)) contains.push(o);
      if (starts.length >= max) break;
    }
    return [...starts, ...contains].slice(0, max);
  }, [value, options, max]);

  const show = open && matches.length > 0;
  const pick = (v: string) => {
    onValue(v);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className={`combo${wrapClassName ? ` ${wrapClassName}` : ''}`}>
      <input
        {...rest}
        ref={inputRef}
        className={className}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => { onValue(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={(e) => { setOpen(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setOpen(false); setActive(-1); rest.onBlur?.(e); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
          else if (e.key === 'Enter' && show && active >= 0) { e.preventDefault(); pick(matches[active]); }
          else if (e.key === 'Escape' && show) { e.preventDefault(); setOpen(false); }
          rest.onKeyDown?.(e);
        }}
      />
      {show && (
        <ul id={listId} role="listbox" className="combo-list">
          {matches.map((m, i) => (
            <li key={m} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="combo-option"
              // mousedown, not click: keeps focus in the input so blur doesn't close the list first
              onMouseDown={(e) => { e.preventDefault(); pick(m); inputRef.current?.focus(); }}
              onMouseEnter={() => setActive(i)}>
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
