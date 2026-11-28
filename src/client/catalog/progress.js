import { webRootOf } from '../shared/web-address.js';

const samePlatform = (base, other) => Boolean(base && other && webRootOf(base) === webRootOf(other));

function challengeProgress(challengeId, controllerRows = [], sessions = [], history, webBase) {
  const id = String(challengeId);
  const linked = controllerRows.filter((row) => String(row?.challenge?.id) === id && samePlatform(row.challenge.baseUrl, webBase));
  const running = linked.filter((row) => row.state === 'running').length;
  const unknown = linked.some((row) => row.state === 'unknown');
  const participating = sessions.filter((session) => {
    const task = session.projectionValues?.playgroundTask?.task;
    return task && String(task.challengeId) === id && (!task.mode || task.mode === 'participate')
      && samePlatform(task.baseUrl, webBase);
  });
  // The current-account history endpoint orders newest first. Its count includes rows outside this page.
  const items = Array.isArray(history?.items) ? history.items.filter((item) => String(item?.challengeId) === id) : [];
  const lifetime = history?.submissionCounts?.lifetime;
  const submissions = Number.isSafeInteger(lifetime) && lifetime >= items.length ? lifetime
    : Array.isArray(history?.items) && !history.nextCursor ? items.length : undefined;
  const scoring = items[0]?.scoringState;
  const score = scoring?.scoreIsFinal === true && Number.isFinite(scoring.displayScore) ? scoring.displayScore : undefined;
  const partial = Boolean(history?.partial || history?.submissionCounts?.partialReasons?.includes('history_incomplete'));
  return { controllers: linked.length, running, unknown, submissions, partial, score, participation: participating.length };
}

function progressSummary(progress, msg) {
  const { controllers, running, unknown, submissions, partial, score } = progress;
  if (controllers && (running || !(submissions > 0))) {
    const activity = running ? msg(` · ${running} 个运行中`, ` · ${running} running`) : unknown ? msg(' · 状态未知', ' · Status unknown') : '';
    return { text: msg(`主控任务 ${controllers} 个`, `${controllers} controller ${controllers === 1 ? 'task' : 'tasks'}`) + activity,
      tone: running ? 'running' : 'neutral' };
  }
  if (submissions > 0) {
    const count = partial ? msg(`至少已提交 ${submissions} 次`, `At least ${submissions} submissions`)
      : msg(`已提交 ${submissions} 次`, `${submissions} ${submissions === 1 ? 'submission' : 'submissions'}`);
    const latest = score === undefined ? '' : msg(` · 最近 ${score} 分（最终）`, ` · Latest score ${score} (final)`);
    return { text: count + latest, tone: 'result' };
  }
  return undefined;
}

export { challengeProgress, progressSummary, samePlatform };
