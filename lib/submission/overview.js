import { normalizeAttempt, PlaygroundApiError } from '../api.js';
import { attemptScore } from '../task/evidence.js';
import { beijingDate, countSubmissions, parsePlatformTime } from './policy.js';

export const SUBMISSION_OVERVIEW_TTL_MS = 60_000;

const hasHistoryId = (value) => typeof value === 'string' ? Boolean(value.trim()) : Number.isSafeInteger(value);
const isAuthoredPaper = (row) => row?.method === 'submitted' && row.attemptId == null && row.challengeId == null;

export function createSubmissionOverview(client) {
  const cache = new Map();

  function summarizeRows(rows, challengeId, userId, historyIncomplete = false) {
    const byId = new Map();
    let partial = historyIncomplete;
    for (const row of rows) {
      if (isAuthoredPaper(row)) continue;
      const author = row?.authorId;
      const challenge = row?.challengeId;
      const hasAuthor = hasHistoryId(author);
      const hasChallenge = hasHistoryId(challenge);
      if (challengeId != null && hasChallenge && String(challenge) !== String(challengeId)) continue;
      if (hasAuthor && String(author) !== String(userId)) continue;
      if (!hasAuthor || !hasChallenge || !Number.isSafeInteger(row?.attemptId) || row.attemptId <= 0) {
        partial = true;
        continue;
      }
      if (byId.has(row.attemptId)) continue;
      const item = normalizeAttempt({ id: row.attemptId, createdAt: row.time, status: row.status, method: row.method,
        scoringState: row.scoringState, execStatus: row.execStatus, updatedAt: row.updatedAt,
        bundleStatus: row.bundleStatus, changelog: row.changelog, execLog: row.execLog, scoringQueue: row.scoringQueue,
        authorName: row.authorName, authorIsAgent: row.authorIsAgent,
        challengeId: String(row.challengeId), authorId: String(row.authorId), challenge_title: row.paperZh || row.paper,
        score: row.scoringState?.scoreIsFinal === true ? row.scoringState.displayScore : undefined,
        countsTowardQuota: typeof row.countsTowardQuota === 'boolean' ? row.countsTowardQuota : undefined }, { detailed: false });
      byId.set(item.id, { ...item, identity: item.authorIsAgent ? 'agent' : 'self' });
    }
    const items = [...byId.values()].sort((a, b) => (parsePlatformTime(b.createdAt) || 0) - (parsePlatformTime(a.createdAt) || 0) || b.id - a.id);
    const counts = countSubmissions(items, { partial: partial ? ['history_incomplete'] : [] });
    return { items, counts, partial };
  }

  async function historyAccount(exec, { token, user } = {}) {
    const options = { signal: exec.signal, token: token ?? await client.currentToken?.() };
    if (!user) {
      const auth = await client.getCurrentUser(options);
      if (!auth?.authenticated) throw new PlaygroundApiError('登录后可查看提交历史。', { code: 'authentication_required' });
      user = auth.user;
    }
    if (!['string', 'number'].includes(typeof user?.id) || !String(user.id).trim()) {
      throw new PlaygroundApiError('无法确认当前账号，未读取提交历史。', { code: 'identity_unknown' });
    }
    return { user, options };
  }

  async function submissionOverview(challengeId, exec, { token, user: knownUser, limits = [], fresh = false } = {}) {
    const { user, options } = await historyAccount(exec, { token, user: knownUser });
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
        value = summarizeRows(await client.getUserSubmissions(options), challengeId, user.id);
        if (cache.get(key) === pending) cache.set(key, { at: Date.now(), challengeId, value });
      } catch (error) {
        if (cache.get(key) === pending) cache.delete(key);
        throw error;
      }
    }
    return { ...value, counts: { ...value.counts, limits } };
  }

  function historyPage(overview, args) {
    const items = args.status ? overview.items.filter((item) => item.status === args.status) : overview.items;
    const limit = Math.min(100, Math.max(1, Math.trunc(args.limit) || 50));
    const cursor = args.cursor ? items.findIndex((item) => String(item.id) === args.cursor) : -1;
    if (args.cursor && cursor === -1) throw new PlaygroundApiError('提交历史已变化，请重新读取第一页。', { code: 'invalid_argument' });
    const page = items.slice(cursor + 1, cursor + 1 + limit);
    return { items: page, ...(args.allChallenges ? { baseUrl: client.baseUrl, challenges: [...new Map(overview.items.map((item) => [item.challengeId, item.challengeTitle])).entries()],
      scoringTotals: { final: overview.items.filter((item) => attemptScore(item).scoreIsFinal).length,
        attention: overview.items.filter((item) => item.bundleNotReceived === true || item.status === 'draft' || item.scoringState?.actionNeeded === true).length } } : {}), nextCursor: cursor + 1 + limit < items.length ? String(page.at(-1).id) : null, limit,
      submissionCounts: overview.counts, ...(overview.partial ? { partial: { reasons: ['history_incomplete'], note: '平台记录信息不完整，仅列出可核实的提交。' } } : {}) };
  }

  async function history(args, exec) {
    return historyPage(await submissionOverview(args.challengeId, exec), args);
  }

  async function historySummary(exec) {
    const { user, options } = await historyAccount(exec);
    const rows = await client.getUserSubmissions(options);
    const rowsById = new Map();
    let unknownChallenge = false;
    for (const row of rows) {
      if (isAuthoredPaper(row) || (hasHistoryId(row?.authorId) && String(row.authorId) !== String(user.id))) continue;
      if (!hasHistoryId(row?.challengeId)) {
        unknownChallenge = true;
        continue;
      }
      const id = String(row.challengeId);
      if (!rowsById.has(id)) rowsById.set(id, []);
      rowsById.get(id).push(row);
    }
    const histories = [];
    for (const [id, entries] of rowsById) {
      const overview = summarizeRows(entries, id, user.id, unknownChallenge);
      if (overview.items.length) histories.push([id, historyPage(overview, { limit: 1, challengeId: id })]);
    }
    return { byId: Object.fromEntries(histories) };
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

  return { history, historySummary, countsFor, forgetOverview };
}
