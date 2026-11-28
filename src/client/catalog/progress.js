import { webRootOf } from '../shared/web-address.js';

const samePlatform = (base, other) => Boolean(base && other && webRootOf(base) === webRootOf(other));

function challengeProgress(challengeId, controllerRows = [], sessions = [], history, webBase, account) {
  const id = String(challengeId);
  const linked = controllerRows.filter((row) => String(row?.challenge?.id) === id && samePlatform(row.challenge.baseUrl, webBase));
  const running = linked.filter((row) => row.state === 'running').length;
  const unknown = linked.some((row) => row.state === 'unknown');
  const participating = sessions.filter((session) => {
    const task = session.projectionValues?.playgroundTask?.task;
    return task && String(task.challengeId) === id && (!task.mode || task.mode === 'participate')
      && samePlatform(task.baseUrl, webBase);
  });
  // DSH's controller rows and task projections identify workspace activity, without a Playground owner.
  const workspace = { controllers: linked.length, running, unknown, participation: participating.length };
  // Auth can change while the Host reads history. Require the returned author to match the
  // authenticated account before displaying its score or its total, which also includes unpaged rows.
  const accountId = typeof account === 'string' || Number.isSafeInteger(account) ? String(account).trim() : '';
  const items = history?.items;
  if (!accountId || !Array.isArray(items) || !items.length || items.some((item) =>
    String(item?.challengeId) !== id || String(item?.authorId ?? '') !== accountId)) return { workspace };
  // The current-account history endpoint orders newest first.
  const lifetime = history?.submissionCounts?.lifetime;
  const submissions = Number.isSafeInteger(lifetime) && lifetime >= items.length ? lifetime
    : !history.nextCursor ? items.length : undefined;
  const scoring = items[0]?.scoringState;
  const score = scoring?.scoreIsFinal === true && Number.isFinite(scoring.displayScore) ? scoring.displayScore : undefined;
  const partial = Boolean(history?.partial || history?.submissionCounts?.partialReasons?.includes('history_incomplete'));
  return { workspace, submissions, partial, score };
}

function progressSummary(progress, msg) {
  const { workspace, submissions, partial, score } = progress;
  const { controllers, running, unknown } = workspace;
  const lines = [];
  if (controllers) {
    const activity = running ? msg(` · ${running} 个运行中`, ` · ${running} running`) : unknown ? msg(' · 状态未知', ' · Status unknown') : '';
    lines.push({
      text: msg(`本地 · 主控任务 ${controllers} 个`, `Local · ${controllers} controller ${controllers === 1 ? 'task' : 'tasks'}`) + activity,
      tone: running ? 'running' : 'neutral',
    });
  }
  if (submissions > 0) {
    const count = partial ? msg(`至少已提交 ${submissions} 次`, `At least ${submissions} submissions`)
      : msg(`已提交 ${submissions} 次`, `${submissions} ${submissions === 1 ? 'submission' : 'submissions'}`);
    const latest = score === undefined ? '' : msg(` · 最近 ${score} 分（最终）`, ` · Latest score ${score} (final)`);
    lines.push({ text: msg('本账号 · ', 'Signed-in account · ') + count + latest, tone: 'result' });
  }
  return lines;
}

export { challengeProgress, progressSummary, samePlatform };
