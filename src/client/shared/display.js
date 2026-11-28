import { msg } from './language.js';
import { h } from './react.js';
import { webRootOf } from './web-address.js';

function statusTone(state) {
  if (['failed', 'incomplete', 'rejected'].includes(state)) return 'error';
  if (['queued', 'evaluating', 'scoring', 'provisional'].includes(state)) return 'evaluating';
  if (['pending_review', 'awaiting_bundle', 'awaiting_review', 'awaiting_confirmation'].includes(state)) return 'warning';
  if (['scored', 'late_scored', 'final'].includes(state)) return 'scored';
  if (state === 'open') return 'open';
  if (['active', 'running'].includes(state)) return 'running';
  if (['ready', 'submitted'].includes(state)) return 'result';
  return state === 'unknown' ? 'unknown' : 'neutral';
}

// The Host builds challenge web addresses; check them again before opening. Only https, plus http
// for a local mock platform, and never an address that carries account details.
function openableWebUrl(value) {
  if (typeof value !== 'string' || !value) return undefined;
  let url;
  try { url = new URL(value); } catch { return undefined; }
  if (url.username || url.password) return undefined;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url.href : undefined;
}

// Tasks recorded before webUrl existed rebuild it like the Host projection view does: from the API base
// the task was created against, and from the catalog's web root only when the task recorded no base.
// The session list may carry the persisted state rather than the Host view, so this repeats it here.
function taskWebUrl(task, webBase) {
  if (typeof task?.webUrl === 'string' && task.webUrl) return task.webUrl;
  const id = task?.challengeId;
  if (!((typeof id === 'string' && id) || Number.isFinite(id))) return undefined;
  const root = typeof task.baseUrl === 'string' && task.baseUrl ? webRootOf(task.baseUrl) : typeof webBase === 'string' ? webBase : '';
  return root ? `${root}/challenge/${encodeURIComponent(id)}` : undefined;
}

// DSH desktop hands https windows to the system browser.
function openWebButton(value, title) {
  const url = openableWebUrl(value);
  if (!url) return null;
  const label = msg('在网页中打开', 'Open in browser');
  return h('button', { type: 'button', className: 'pg-button', 'aria-label': title ? msg(`在网页中打开：${title}`, `Open in browser: ${title}`) : label,
    onClick: () => { window.open(url, '_blank', 'noopener,noreferrer'); } }, label);
}

export { openWebButton, openableWebUrl, statusTone, taskWebUrl, webRootOf };

