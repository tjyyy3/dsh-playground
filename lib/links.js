/** Public Playground web addresses derived from the configured API base. Pure; no network. */

/**
 * Web root of the Playground site for an API base: drops userinfo, query, hash and a trailing
 * `/api`, and never ends with a slash. A configured credential must never reach a shown or opened URL.
 */
export function challengeWebBase(apiBase) {
  let root = String(apiBase || '');
  try {
    const parsed = new URL(root);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    root = parsed.href;
  } catch {
    root = root.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1');
  }
  return root.replace(/\/+$/, '').replace(/\/api$/i, '').replace(/\/+$/, '');
}

/** `<web root>/challenge/<encoded id>`; the start prompt and the "在网页中打开" buttons share it. */
export function publicChallengeUrl(apiBase, challengeId) {
  return `${challengeWebBase(apiBase)}/challenge/${encodeURIComponent(challengeId)}`;
}
