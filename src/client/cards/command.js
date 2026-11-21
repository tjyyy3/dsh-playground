import { bundleSummaryLine } from '../tasks/attempts.js';
import { diagnosedMessage, safeMessage } from '../shared/errors.js';
import { h } from '../shared/react.js';
import { css } from '../shared/styles.js';

function commandFact(value) {
  return typeof value === 'string' ? value.slice(0, 300) : typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
}

function PlaygroundCommandCard({ node, sessionId, openTask, openWorkbench }) {
  let result;
  let input;
  try { result = JSON.parse(node.outcome?.text || '{}'); } catch { result = undefined; }
  try { input = JSON.parse(node.args || '{}'); } catch { input = null; }
  // Handlers report some failures as plain text rather than a JSON result.
  const plainText = result === undefined ? node.outcome?.text : undefined;
  result = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const workflow = result.playgroundWorkflow;
  const auth = result.playgroundAuth;
  const catalog = result.playgroundCatalog;
  // Older plugin versions logged automatic auth/catalog queries from the `playground` command into
  // whichever conversation was open. Nothing writes them now, so hide them, including failed, interrupted
  // and unparseable leftovers (recognised by action when there is no payload); stored history is untouched.
  // `playground-auth-login` also carries `playgroundAuth` but is a real user login and stays visible.
  const legacyQuery = 'playgroundAuth' in result || 'playgroundCatalog' in result || input.action === 'auth' || input.action === 'catalog';
  if (node.name === 'playground' && !workflow && legacyQuery) return null;
  const challenges = Array.isArray(catalog?.challenges?.items) ? catalog.challenges.items.filter((item) => item && typeof item === 'object') : [];
  const action = auth ? 'auth' : catalog ? 'catalog' : input.action || workflow?.kind;
  const label = node.name === 'playground-auth-login' ? 'Playground 登录'
    : node.name === 'playground-confirm' ? '确认提交' : action === 'results' ? '查询评测结果' : workflow?.kind === 'receipt' ? '提交回执'
    : ({ auth: '登录状态检测', catalog: '赛题目录查询', start: '创建任务对话', task: '任务上下文', context: '任务上下文',
      mode: '切换工作模式', check: '检查提交材料', prepared: '检查提交材料', results: '查询评测结果', cancel: '取消提交准备', clear: '取消提交准备',
      record_submission: '提交请求状态', submission: '提交请求状态' })[action] || 'Playground 命令';
  const failed = node.outcome?.kind === 'error' || result.ok === false || Boolean(result.error);
  const available = Object.keys(result).length > 0;
  const status = !node.outcome ? '执行中 / 尚未完成' : failed ? '未完成' : !available ? '结果不可用'
    : workflow?.kind === 'prepared' ? '历史检查记录，已退役' : workflow?.kind === 'clear' ? '已取消或失效' : auth ? (auth.authenticated ? '已登录' : '未登录') : '已完成';
  // Historical payloads can contain CLI output and credentials. Only project safe business facts.
  const details = {
    操作: label, 状态: status,
    ...(catalog ? { 比赛数量: commandFact(catalog.competitions?.total) ?? catalog.competitions?.items?.length ?? 0,
      赛题数量: commandFact(catalog.challenges?.total) ?? challenges.length,
      当前页赛题: challenges.slice(0, 12).map((item) => commandFact(item.titleZh || item.title || item.id)).filter((title) => title !== undefined) } : {}),
    ...(workflow?.task ? { 赛题: commandFact(workflow.task.title) } : {}),
    ...(workflow?.mode ? { 工作模式: workflow.mode === 'author' ? '出题' : '参赛' } : {}),
    ...(workflow?.submission ? { 交接状态: commandFact(workflow.submission.status) } : {}),
    ...(workflow?.prepared ? { 赛题: commandFact(workflow.prepared.challenge?.title), 材料数量: commandFact(workflow.prepared.files?.length), 提交状态: '历史记录，不参与当前提交' } : {}),
    ...(workflow?.receipt || action === 'results' ? { 提交编号: commandFact(workflow?.receipt?.attemptId ?? result.attemptId ?? result.id),
      评测状态: commandFact(workflow?.receipt?.scoringState?.state || result.scoringState?.state || result.status),
      平台返回分数: commandFact(workflow?.receipt?.scoringState?.displayScore ?? result.scoringState?.displayScore ?? result.score) } : {}),
    ...(workflow?.prepared && bundleSummaryLine(workflow.prepared.bundleSummary) ? { 评测包: bundleSummaryLine(workflow.prepared.bundleSummary) } : {}),
    ...(result.diagnosis && typeof result.diagnosis === 'object' ? {
      失败环节: ({ worker_upload: '评测 Worker 接收评测包', attempt_create: '创建提交记录', local_check: 'CLI 本地检查' })[result.diagnosis.stage] || '未知',
      ...(commandFact(result.diagnosis.httpStatus) !== undefined ? { HTTP状态: commandFact(result.diagnosis.httpStatus) } : {}),
      ...(Array.isArray(result.diagnosis.details) ? { 平台给出的原因: result.diagnosis.details.slice(0, 6).map(commandFact).filter((item) => item !== undefined) } : {}),
      ...(bundleSummaryLine(result.diagnosis.bundle) ? { 评测包: bundleSummaryLine(result.diagnosis.bundle) } : {}),
    } : {}),
  };
  const summary = failed ? ({ authentication_required: '请先在工作台登录 Playground，再重试此操作。',
    confirmation_required: '旧提交入口已退役，请在任务详情请求 Agent 提交。',
    materials_changed: '材料已改变，请在工作台重新检查后再提交。',
    identity_changed: '登录身份已变化或无法核对，请在工作台确认登录身份。' })[result.error?.code]
      || diagnosedMessage(result) || safeMessage(result.error?.message ?? plainText) || '操作未完成或已中断。请检查工作台中的状态后重试。'
    : !node.outcome ? '此记录尚无完成结果；若任务已停止，请回到工作台核对状态。'
    : auth ? (auth.authenticated ? 'Playground 身份已确认。' : '尚未登录；公开赛题仍可浏览。')
    : catalog ? `共 ${details.比赛数量} 个比赛、${details.赛题数量} 道赛题。`
    : workflow?.prepared ? '历史材料目录信息。旧检查卡已退役，不表示本次材料已检查或归档安全验证通过。'
    : details.提交编号 !== undefined ? `提交 #${details.提交编号} · ${details.评测状态 || '评测状态待查询'}`
    : typeof result.sessionId === 'string' ? '已创建独立任务对话。' : commandFact(workflow?.task?.title) || '可展开查看已保存的操作摘要；未提供的详情不可用。';
  return h('section', { className: 'pg-card' }, h('style', null, css),
    h('div', { className: 'pg-head' }, h('strong', null, label), h('span', { className: 'pg-badge', 'data-tone': failed ? 'error' : !node.outcome || auth?.authenticated === false ? 'warning' : 'neutral' }, status)),
    h('p', { className: failed ? 'pg-error' : 'pg-note', role: failed ? 'alert' : 'status' }, summary),
    h('details', { className: 'pg-raw' }, h('summary', null, '查看操作详情'), h('pre', null, JSON.stringify(details, null, 2))),
    typeof result.sessionId === 'string' ? h('button', { className: 'pg-button', onClick: () => openTask(result.sessionId) }, '打开任务对话') : null);
}

function ControllerWelcome({ node }) {
  const ready = node.outcome?.kind === 'success';
  return h('section', { className: 'pg-card' }, h('style', null, css),
    h('h3', null, 'Playground 工作区主控'),
    h('p', { className: 'pg-note' }, ready
      ? '在下方输入你要协调的工作。试试「请让 Codex 只读检查这个工作区的 README，并告诉我怎么运行测试」。'
      : '请从 Playground 工作台打开或创建工作区主控。'));
}

export { ControllerWelcome, PlaygroundCommandCard };

