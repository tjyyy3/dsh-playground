import { useSyncExternalStore } from 'react';

const storageKey = 'dsh-playground.ui-language';
const listeners = new Set();

function readPreference() {
  try {
    const value = globalThis.window?.localStorage?.getItem(storageKey);
    return value === 'en' || value === 'zh' ? value : null;
  } catch { return null; }
}

let preference = readPreference();
let hostLanguage;

export const languagePreference = () => preference;
export const currentHostLanguage = () => (/^en(?:-|$)/i.test(hostLanguage ?? globalThis.document?.documentElement?.lang ?? '') ? 'en' : 'zh');
export const currentLanguage = () => preference ?? currentHostLanguage();
export const msg = (chinese, english) => currentLanguage() === 'en' ? english : chinese;

export function followHostLocale(locale) {
  if (!locale?.getSnapshot || !locale.subscribe) return;
  const update = () => {
    const previous = currentHostLanguage();
    hostLanguage = locale.getSnapshot().active;
    if (currentHostLanguage() !== previous) for (const notify of listeners) notify();
  };
  update();
  const unsubscribe = locale.subscribe(update);
  return () => { unsubscribe(); hostLanguage = undefined; };
}

export function setLanguage(value) {
  if ((value !== null && value !== 'zh' && value !== 'en') || value === preference) return;
  preference = value;
  try {
    const storage = globalThis.window?.localStorage;
    if (value === null) storage?.removeItem(storageKey);
    else storage?.setItem(storageKey, value);
  } catch { /* The selection still applies to this window. */ }
  for (const notify of listeners) notify();
}

function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const snapshot = () => `${preference ?? 'follow'}-${currentHostLanguage()}`;

export function usePluginLanguage() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return currentLanguage();
}
