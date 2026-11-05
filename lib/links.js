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

/**
 * `<web root>/<page path>` for a site page such as `competition/bohr-product`; each segment is encoded, so a
 * `?` in the path stays part of the path. `query` (an object of string values) becomes the query string,
 * for example `{ period: '2' }` gives `competition/bohr-product?period=2`; undefined values are left out.
 */
export function publicPageUrl(apiBase, pagePath, query) {
  const segments = String(pagePath || '').split('/').filter(Boolean).map((segment) => encodeURIComponent(segment));
  const search = new URLSearchParams(Object.entries(query && typeof query === 'object' ? query : {})
    .filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();
  return `${challengeWebBase(apiBase)}/${segments.join('/')}${search ? `?${search}` : ''}`;
}

/** `<web root>/challenge/<encoded id>`; the start prompt and the "在网页中打开" buttons share it. */
export function publicChallengeUrl(apiBase, challengeId) {
  return `${challengeWebBase(apiBase)}/challenge/${encodeURIComponent(challengeId)}`;
}
