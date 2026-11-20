import { normalizeAttempt, PlaygroundApiError } from '../api.js';
import { beijingDate, countSubmissions, parsePlatformTime } from './policy.js';

export const SUBMISSION_OVERVIEW_TTL_MS = 60_000;

export function createSubmissionOverview(client) {
  const cache = new Map();

  async function readOverview(challengeId, userId, options) {
    const rows = await client.getUserSubmissions(options);
    const byId = new Map();
    let partial = false;
    for (const row of rows) {
      if (row?.method === 'submitted' && row.attemptId == null && row.challengeId == null) continue;
      const author = row?.authorId;
      const challenge = row?.challengeId;
      const hasAuthor = typeof author === 'string' ? Boolean(author.trim()) : Number.isSafeInteger(author);
      const hasChallenge = typeof challenge === 'string' ? Boolean(challenge.trim()) : Number.isSafeInteger(challenge);
      if (challengeId != null && hasChallenge && String(challenge) !== String(challengeId)) continue;
      if (hasAuthor && String(author) !== String(userId)) continue;
      if (!hasAuthor || !hasChallenge || !Number.isSafeInteger(row?.attemptId) || row.attemptId <= 0) {
        partial = true;
        continue;
      }
      if (byId.has(row.attemptId)) continue;
      const item = normalizeAttempt({ id: row.attemptId, createdAt: row.time, status: row.status, method: row.method,
        scoringState: row.scoringState, execStatus: row.execStatus, updatedAt: row.updatedAt,
        challengeId: String(row.challengeId), authorId: String(row.authorId), challenge_title: row.paperZh || row.paper,
        score: row.scoringState?.scoreIsFinal === true ? row.scoringState.displayScore : undefined,
        countsTowardQuota: typeof row.countsTowardQuota === 'boolean' ? row.countsTowardQuota : undefined }, { detailed: false });
      byId.set(item.id, { ...item, identity: 'self' });
    }
    const items = [...byId.values()].sort((a, b) => (parsePlatformTime(b.createdAt) || 0) - (parsePlatformTime(a.createdAt) || 0) || b.id - a.id);
    const counts = countSubmissions(items, { partial: partial ? ['history_incomplete'] : [] });
    return { items, counts, partial };
  }

  async function submissionOverview(challengeId, exec, { token, user, limits = [], fresh = false } = {}) {
    const options = { signal: exec.signal, token: token ?? await client.currentToken?.() };
    if (!user) {
      const auth = await client.getCurrentUser(options);
      if (!auth?.authenticated) throw new PlaygroundApiError('登录后可查看提交历史。', { code: 'authentication_required' });
      user = auth.user;
    }
    if (!['string', 'number'].includes(typeof user?.id) || !String(user.id).trim()) {
      throw new PlaygroundApiError('无法确认当前账号，未读取提交历史。', { code: 'identity_unknown' });
    }
    const key = JSON.stringify([client.baseUrl, String(user.id), challengeId ?? null]);
    const cached = cache.get(key);
    let value;
    if (fresh && cached?.value && Date.now() - cached.at < SUBMISSION_OVERVIEW_TTL_MS && cached.value.counts.date === beijingDate(new Date())) {
      value = cached.value;
    } else {
      // A newer read or a tracked attempt supersedes this read while the platform request is pending.
      const pending = { challengeId };
      cache.set(key, pending);
      try {
        value = await readOverview(challengeId, user.id, options);
        if (cache.get(key) === pending) cache.set(key, { at: Date.now(), challengeId, value });
      } catch (error) {
        if (cache.get(key) === pending) cache.delete(key);
        throw error;
      }
    }
    return { ...value, counts: { ...value.counts, limits } };
  }

  async function history(args, exec) {
    const overview = await submissionOverview(args.challengeId, exec);
    const items = args.status ? overview.items.filter((item) => item.status === args.status) : overview.items;
    const limit = Math.min(100, Math.max(1, Math.trunc(args.limit) || 50));
    const cursor = args.cursor ? items.findIndex((item) => String(item.id) === args.cursor) : -1;
    if (args.cursor && cursor === -1) throw new PlaygroundApiError('提交历史已变化，请重新读取第一页。', { code: 'invalid_argument' });
    const page = items.slice(cursor + 1, cursor + 1 + limit);
    return { items: page, nextCursor: cursor + 1 + limit < items.length ? String(page.at(-1).id) : null, limit,
      submissionCounts: overview.counts, ...(overview.partial ? { partial: { reasons: ['history_incomplete'], note: '平台记录信息不完整，仅列出可核实的提交。' } } : {}) };
  }

  async function countsFor(challengeId, exec, options) {
    try { return (await submissionOverview(challengeId, exec, options)).counts; }
    catch (error) {
      if (exec.signal?.aborted || error?.code === 'cancelled') throw error;
      return undefined;
    }
  }

  function forgetOverview(challengeId) {
    for (const [key, entry] of cache) if (entry.challengeId == null || String(entry.challengeId) === String(challengeId)) cache.delete(key);
  }

  return { history, countsFor, forgetOverview };
}
