import { useEffect, useId, useRef, useState } from 'react';
import { currentHostLanguage, languagePreference, msg, setLanguage, usePluginLanguage } from '../shared/language.js';
import { h } from '../shared/react.js';

export function LanguageMenu() {
  usePluginLanguage();
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  const preference = languagePreference();
  const label = msg('界面语言', 'Interface language');
  const follow = msg('跟随 DSH', 'Follow DSH') + ' · ' + (currentHostLanguage() === 'en' ? 'English' : '中文');
  const options = [[null, follow], ['zh', '中文'], ['en', 'English']];
  const selected = options.findIndex(([value]) => value === preference);

  useEffect(() => {
    if (!open) return;
    const node = root.current;
    menu.current?.querySelector('[aria-checked=true]')?.focus();
    const dismissOutside = (event) => { if (!node.contains(event.target)) setOpen(false); };
    node.ownerDocument.addEventListener('pointerdown', dismissOutside, true);
    return () => node.ownerDocument.removeEventListener('pointerdown', dismissOutside, true);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return h('div', { className: 'pg-language', ref: root,
    onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); },
    onKeyDown: (event) => {
      if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    },
  },
  h('button', { type: 'button', className: 'pg-controller-icon', ref: trigger,
    'aria-label': label, 'aria-describedby': open ? undefined : id + '-tip', 'aria-haspopup': 'menu',
    'aria-expanded': open, 'aria-controls': open ? id : undefined,
    onClick: () => setOpen(!open), onKeyDown: (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
    },
  }, h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
  h('path', { d: 'M3 5h12M9 2v3m3 0c-.7 5.4-4.3 9.2-9 12m2-9c1.3 3.2 3.5 5.6 6.5 7.4M13 21l4.5-11L22 21m-7.4-3.5h5.8' }))),
  open ? h('div', { id, role: 'menu', 'aria-label': label, className: 'pg-language-menu', ref: menu,
    onKeyDown: (event) => {
      const rows = Array.from(event.currentTarget.children);
      const index = rows.indexOf(event.target);
      const target = { ArrowDown: (index + 1) % rows.length, ArrowUp: (index + rows.length - 1) % rows.length, Home: 0, End: rows.length - 1 }[event.key];
      if (target !== undefined) { event.preventDefault(); rows[target].focus(); }
    },
  }, options.map(([value, text]) => h('button', { key: value ?? 'follow', type: 'button', role: 'menuitemradio',
    'aria-checked': preference === value, tabIndex: -1, onClick: () => { setLanguage(value); close(); },
  }, h('span', { lang: value ?? undefined }, text), h('span', { 'aria-hidden': true }, preference === value ? '✓' : ''))))
    : h('span', { className: 'pg-language-tip', role: 'tooltip', id: id + '-tip' }, label + ' · ' + options[selected][1]));
}
