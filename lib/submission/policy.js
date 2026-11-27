import { parsePlatformTime } from '../task/evidence.js';

export { parsePlatformTime };

// Submission counts (#62). The platform publishes no per-challenge limit; it answers HTTP 429 once one is
// reached, and a few statements state one. "Today" is the Beijing calendar day (UTC+8, no daylight saving).
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
/** The Beijing calendar date (YYYY-MM-DD) of a time, or undefined for an unreadable one. */
export function beijingDate(value) {
  const ms = parsePlatformTime(value);
  return Number.isFinite(ms) ? new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, 10) : undefined;
}

// Clear limit phrases only: a qualifier (最多 / 至多 / 限 / 不超过) and a count of 次 or "submissions".
// "up to N submissions" counts only with a period (per day, per participant, ...): alone it is often explanatory.
const CN_SCOPE = '(每人每天|每人每日|每个账号每天|每天|每日|每人|每个账号|每位参赛者|每支队伍)';
const dayOrTotal = (match) => (/[天日]/u.test(match[1]) ? 'day' : 'total');
const STATEMENT_LIMIT_PATTERNS = [
  // 每天最多可以提交 3 次 / 每人每天限 3 次 / 每天可提交 3 次 / 每人限 3 次
  [new RegExp(`${CN_SCOPE}\\s*(?:可以|可|只能|仅能)?\\s*(?:最多|至多|仅限|限|不超过|可以|可)\\s*(?:可以|可|只能)?\\s*(?:提交|评测)?\\s*(\\d{1,3})\\s*次`, 'u'), dayOrTotal, 2],
  // 每日提交上限为 5 次 / 每天提交次数上限 5 次
  [new RegExp(`${CN_SCOPE}\\s*(?:的)?\\s*(?:提交|评测)(?:次数)?\\s*(?:上限|最多)\\s*(?:为|是)?\\s*(\\d{1,3})\\s*次`, 'u'), dayOrTotal, 2],
  // at most 5 submissions per day / up to 5 submissions per participant / at most 5 submissions (no period)
  [/\b(?:at most|no more than|a maximum of|maximum of|up to|limited to)\s+(\d{1,3})\s+submissions?\b(?:\s+(?:per|each|a)\s+(day|24 hours|participant|user|account|team))?/i,
    (match) => (!match[2] ? 'unspecified' : /day|hours/i.test(match[2]) ? 'day' : 'total'), 1,
    (match) => Boolean(match[2]) || !/^up to/i.test(match[0])],
  // 5 submissions per day
  [/\b(\d{1,3})\s+submissions?\s+(?:per|each|a)\s+(day|24 hours|participant|user|account|team)\b/i,
    (match) => (/day|hours/i.test(match[2]) ? 'day' : 'total'), 1],
  // daily limit of 5 (submissions)
  [/\bdaily (?:submission )?limit (?:of|is)\s+(\d{1,3})\b/i, () => 'day', 1],
];
const excerptOf = (content, index, length) => {
  const start = Math.max(0, index - 20);
  const text = content.slice(start, index + length + 40).replace(/[`*_#>|[\]]/g, '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > 80 ? `${chars.slice(0, 79).join('')}…` : text;
};
/**
 * A submission limit the statement states in a clear phrase (每天最多 N 次, 每人限 N 次, at most N submissions
 * per day): `{ limit, period: 'day' | 'total' | 'unspecified', source: 'statement', excerpt }`, else undefined.
 * The excerpt is statement text (data), at most 80 characters.
 */
export function detectStatementLimit(content) {
  if (typeof content !== 'string' || !content) return undefined;
  for (const [pattern, periodOf, group, accept = () => true] of STATEMENT_LIMIT_PATTERNS) {
    const match = pattern.exec(content);
    const limit = Number(match?.[group]);
    if (match && accept(match) && Number.isSafeInteger(limit) && limit > 0) {
      return { limit, period: periodOf(match), source: 'statement', excerpt: excerptOf(content, match.index, match[0].length) };
    }
  }
  return undefined;
}

/**
 * Today's submissions (Beijing day) among `items`: `total`, and `counted`, those with countsTowardQuota true.
 * `partial` names the reasons the numbers may be low. No remaining count is derived from any limit.
 */
export function countSubmissions(items, { now = new Date(), partial = [], limits = [] } = {}) {
  const date = beijingDate(now);
  const all = Array.isArray(items) ? items : [];
  const today = all.filter((item) => beijingDate(item?.createdAt) === date);
  const reasons = [...partial];
  if (all.some((item) => !beijingDate(item.createdAt))) reasons.push('time_unknown');
  if (today.some((item) => typeof item.countsTowardQuota !== 'boolean')) reasons.push('quota_unknown');
  const knownCounted = today.filter((item) => item.countsTowardQuota === true).length;
  return { scope: 'current_account', date, timezone: 'Asia/Shanghai', total: today.length, lifetime: all.length,
    counted: reasons.length ? null : knownCounted, knownCounted,
    partial: reasons.length > 0, ...(reasons.length ? { partialReasons: [...new Set(reasons)] } : {}), limits,
    countedAt: (now instanceof Date ? now : new Date(now)).toISOString() };
}
const PERIOD_TEXT = { day: ['每天', 'per day'], total: ['每人', 'per participant'], unspecified: ['', ''] };
/** One plugin-written line for the counts and limit sources: `[zh, en]`. Statement text is not included. */
export function submissionCountsText(counts) {
  if (!counts || !Number.isInteger(counts.total)) return undefined;
  const limits = Array.isArray(counts.limits) ? counts.limits : [];
  const zhLimits = limits.map((item) => (item.source === 'statement'
    ? `题面写明${PERIOD_TEXT[item.period]?.[0] ?? ''}最多 ${item.limit} 次` : Number.isSafeInteger(item.limit) ? `平台曾返回上限 ${item.limit} 次` : '平台曾返回已达提交上限'));
  const enLimits = limits.map((item) => (item.source === 'statement'
    ? `statement: at most ${item.limit}${PERIOD_TEXT[item.period]?.[1] ? ` ${PERIOD_TEXT[item.period][1]}` : ''}` : Number.isSafeInteger(item.limit) ? `platform reply: limit ${item.limit}` : 'platform reply: limit reached'));
  if (counts.scope === 'current_account') {
    const partial = counts.partialReasons ?? [];
    const history = partial.includes('history_incomplete');
    const today = history || partial.includes('time_unknown');
    return [`当前账号累计${history ? '已核实 ' : ' '}${counts.lifetime} 次；今天（北京时间 ${counts.date}）${today ? '已核实' : '已提交'} ${counts.total} 次，${counts.counted == null ? '占名额次数未知' : `其中占名额 ${counts.counted} 次`}${today ? '（数据不完整）' : ''}。${zhLimits.length ? `次数上限：${zhLimits.join('；')}。` : '未查到次数上限。'}`,
      `Current account: ${counts.lifetime} submissions observed in total, ${counts.total} today (Beijing time, ${counts.date}); ${counts.counted == null ? 'quota usage unknown' : `${counts.counted} counted toward quota`}${today ? ' (incomplete history)' : ''}; ${enLimits.join('; ') || 'no known limit'}`];
  }
  // Archived counts predate the current-account scope and include Agent accounts.
  const hidden = Array.isArray(counts.partialReasons) && counts.partialReasons.includes('agent_private_hidden');
  return [`今天（北京时间 ${counts.date}）已提交 ${counts.total} 次，其中占名额 ${counts.counted} 次（本人与名下 Agent 账号合计${counts.partial ? '，可能不完整' : ''}${hidden ? '；Agent 账号未公开的提交看不到，没有计入' : ''}）；${zhLimits.length ? `次数上限：${zhLimits.join('；')}` : '未查到次数上限'}`,
    `Today (Beijing time, ${counts.date}): ${counts.total} submitted, ${counts.counted} counted toward the quota (your account and its Agent accounts${counts.partial ? ', may be incomplete' : ''}${hidden ? '; non-public Agent submissions are not visible and not counted' : ''}); ${enLimits.length ? `limits: ${enLimits.join('; ')}` : 'no known limit'}`];
}

// #63: when the agent must ask the user before a new submission, and the one line it says before submitting
// otherwise. The three ask-first reasons: the statement states a limit, today (Beijing day, current account) already has a submission counted toward the quota, or the platform answered 429.
export const ASK_FIRST_REASONS = {
  statement_limit: '题面写了提交次数限制',
  quota_used_today: '今天已有占名额的提交',
  platform_limit: '平台曾返回提交次数上限（HTTP 429）',
};
const policyLine = (value, max = 80) => {
  const chars = Array.from(String(value ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};
/**
 * Policy for a new submission. Counts include current limits; recorded limits are used when counts are unavailable.
 */
export function submitPolicy({ counts, limits, challenge, user } = {}) {
  const known = Array.isArray(counts?.limits) ? counts.limits : Array.isArray(limits) ? limits : [];
  const identity = typeof user?.userType === 'string' && user.userType.trim().toLowerCase() === 'agent' ? 'Agent 账号' : '本人账号';
  const target = `「${policyLine(challenge?.title || challenge?.id)}」（${policyLine(challenge?.id)}）`;
  const statement = known.some((item) => item?.source === 'statement');
  const ordinaryPartial = counts?.partialReasons?.some((reason) => reason === 'history_incomplete' || reason === 'time_unknown');
  const counted = Number.isInteger(counts?.total)
    ? `今天${ordinaryPartial ? '已核实' : '已提交'} ${counts.total} 次，${counts.counted == null ? '占名额次数未知' : `占名额 ${counts.counted} 次`}${counts.partial ? '（可能不完整）' : ''}` : '今天的提交次数未能读取';
  const reasons = [
    ...(statement ? ['statement_limit'] : []),
    ...((counts?.knownCounted ?? counts?.counted) > 0 ? ['quota_used_today'] : []),
    ...(known.some((item) => item?.source === 'platform') ? ['platform_limit'] : []),
  ];
  return { askFirst: reasons.length > 0, reasons,
    ...(reasons.length ? { reasonText: reasons.map((reason) => ASK_FIRST_REASONS[reason]).join('；') } : {}),
    announcement: `将以${identity}向${target}新建提交（${counted}；题面${statement ? '写了' : '没有写'}次数限制）` };
}

/** The limits recorded for one challenge, without the challenge id. */
export function submissionLimitsFor(state, challengeId) {
  if (challengeId === undefined || challengeId === null) return [];
  return (Array.isArray(state?.submissionLimits) ? state.submissionLimits : [])
    .filter((item) => item?.challengeId === String(challengeId))
    .map(({ challengeId: _, ...rest }) => rest);
}

export const SUBMIT_RULE = '仅在用户明确要求提交或点击任务的提交按钮后，按当前题面与官方要求选择 CLI、API 等方式执行。先读 playground_task status 的 submitPolicy，说明身份、目标和今天次数。askFirst 为真时等待用户额外答复；本次交接已有工作台确认且上下文未变时不重复询问。不能用模型声明或自动审批代替。取得任何真实编号后立即调用 playground_task track，即使后续上传失败也保留编号。超时或结果未知先查询既有编号或提交列表，不换路线盲目另建。材料读取授权不代表提交授权，不换题、不换账号、不扩大文件访问范围、不编造轨迹或结果。';
