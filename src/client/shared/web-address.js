// Mirrors challengeWebBase in lib/links.js: drop userinfo, query, hash and a trailing /api.
export function webRootOf(apiBase) {
  let root = String(apiBase || '');
  try {
    const parsed = new URL(root);
    parsed.username = ''; parsed.password = ''; parsed.search = ''; parsed.hash = '';
    root = parsed.href;
  } catch {
    root = root.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1');
  }
  return root.replace(/\/+$/, '').replace(/\/api$/i, '').replace(/\/+$/, '');
}
