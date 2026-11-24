import { msg, usePluginLanguage } from '../shared/language.js';
import { bundleSummaryLine } from '../tasks/attempts.js';
import { diagnosedMessage, safeMessage } from '../shared/errors.js';
import { h } from '../shared/react.js';
import { css } from '../shared/styles.js';

function commandFact(value) {
  return typeof value === 'string' ? value.slice(0, 300) : typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
}

function PlaygroundCommandCard({ node, sessionId, openTask, openWorkbench }) {
  usePluginLanguage();
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
  const label = node.name === 'playground-auth-login' ? msg('Playground 登录', 'Playground sign-in')
    : node.name === 'playground-confirm' ? msg('确认提交', 'Confirm submission') : action === 'results' ? msg('查询评测结果', 'Get evaluation results') : workflow?.kind === 'receipt' ? msg('提交回执', 'Submission receipt')
    : ({ auth: msg('登录状态检测', 'Check sign-in status'), catalog: msg('赛题目录查询', 'Browse challenges'), start: msg('创建任务对话', 'Create task chat'), task: msg('任务上下文', 'Task context'), context: msg('任务上下文', 'Task context'),
      mode: msg('切换工作模式', 'Switch work mode'), check: msg('检查提交材料', 'Check submission materials'), prepared: msg('检查提交材料', 'Check submission materials'), results: msg('查询评测结果', 'Get evaluation results'), cancel: msg('取消提交准备', 'Cancel submission preparation'), clear: msg('取消提交准备', 'Cancel submission preparation'),
      record_submission: msg('提交请求状态', 'Submission request status'), submission: msg('提交请求状态', 'Submission request status') })[action] || msg('Playground 命令', 'Playground command');
  const failed = node.outcome?.kind === 'error' || result.ok === false || Boolean(result.error);
  const available = Object.keys(result).length > 0;
  const status = !node.outcome ? msg('执行中 / 尚未完成', 'In progress') : failed ? msg('未完成', 'Incomplete') : !available ? msg('结果不可用', 'Result unavailable')
    : workflow?.kind === 'prepared' ? msg('历史检查记录，已退役', 'Historical check (retired)') : workflow?.kind === 'clear' ? msg('已取消或失效', 'Canceled or expired') : auth ? (auth.authenticated ? msg('已登录', 'Signed in') : msg('未登录', 'Signed out')) : msg('已完成', 'Completed');
  // Historical payloads can contain CLI output and credentials. Only project safe business facts.
  const competitionCount = commandFact(catalog?.competitions?.total) ?? catalog?.competitions?.items?.length ?? 0;
  const challengeCount = commandFact(catalog?.challenges?.total) ?? challenges.length;
  const attemptId = commandFact(workflow?.receipt?.attemptId ?? result.attemptId ?? result.id);
  const evaluationState = commandFact(workflow?.receipt?.scoringState?.state || result.scoringState?.state || result.status);
  const hasReceipt = workflow?.receipt || action === 'results';
  const details = {
    [msg('操作', 'Action')]: label, [msg('状态', 'Status')]: status,
    ...(catalog ? { [msg('比赛数量', 'Competitions')]: competitionCount,
      [msg('赛题数量', 'Challenges')]: challengeCount,
      [msg('当前页赛题', 'Challenges on this page')]: challenges.slice(0, 12).map((item) => commandFact(item.titleZh || item.title || item.id)).filter((title) => title !== undefined) } : {}),
    ...(workflow?.task ? { [msg('赛题', 'Challenge')]: commandFact(workflow.task.title) } : {}),
    ...(workflow?.mode ? { [msg('工作模式', 'Work mode')]: workflow.mode === 'author' ? msg('出题', 'Author') : msg('参赛', 'Participant') } : {}),
    ...(workflow?.submission ? { [msg('交接状态', 'Handoff status')]: commandFact(workflow.submission.status) } : {}),
    ...(workflow?.prepared ? { [msg('赛题', 'Challenge')]: commandFact(workflow.prepared.challenge?.title), [msg('材料数量', 'Materials')]: commandFact(workflow.prepared.files?.length), [msg('提交状态', 'Submission status')]: msg('历史记录，不参与当前提交', 'Historical record only') } : {}),
    ...(hasReceipt ? { [msg('提交编号', 'Submission ID')]: attemptId,
      [msg('评测状态', 'Evaluation status')]: evaluationState,
      [msg('平台返回分数', 'Platform score')]: commandFact(workflow?.receipt?.scoringState?.displayScore ?? result.scoringState?.displayScore ?? result.score) } : {}),
    ...(workflow?.prepared && bundleSummaryLine(workflow.prepared.bundleSummary) ? { [msg('评测包', 'Bundle')]: bundleSummaryLine(workflow.prepared.bundleSummary) } : {}),
    ...(result.diagnosis && typeof result.diagnosis === 'object' ? {
      [msg('失败环节', 'Failed step')]: ({ worker_upload: msg('评测 Worker 接收评测包', 'Evaluation worker receiving bundle'), attempt_create: msg('创建提交记录', 'Creating submission record'), local_check: msg('CLI 本地检查', 'Local CLI check') })[result.diagnosis.stage] || msg('未知', 'Unknown'),
      ...(commandFact(result.diagnosis.httpStatus) !== undefined ? { [msg('HTTP状态', 'HTTP status')]: commandFact(result.diagnosis.httpStatus) } : {}),
      ...(Array.isArray(result.diagnosis.details) ? { [msg('平台给出的原因', 'Platform reasons')]: result.diagnosis.details.slice(0, 6).map(commandFact).filter((item) => item !== undefined) } : {}),
      ...(bundleSummaryLine(result.diagnosis.bundle) ? { [msg('评测包', 'Bundle')]: bundleSummaryLine(result.diagnosis.bundle) } : {}),
    } : {}),
  };
  const summary = failed ? ({ authentication_required: msg('请先在工作台登录 Playground，再重试此操作。', 'Sign in to Playground in the workbench and try again.'),
    confirmation_required: msg('旧提交入口已退役，请在任务详情请求 Agent 提交。', 'Open the task details to ask the Agent to submit. The previous submission command has been retired.'),
    materials_changed: msg('材料已改变，请在工作台重新检查后再提交。', 'Materials have changed. Review them in the workbench before submitting.'),
    identity_changed: msg('登录身份已变化或无法核对，请在工作台确认登录身份。', 'Verify your account in the workbench. The signed-in account changed or could not be verified.') })[result.error?.code]
      || diagnosedMessage(result) || safeMessage(result.error?.message ?? plainText) || msg('操作未完成或已中断。请检查工作台中的状态后重试。', 'The operation did not finish. Check its status in the workbench before retrying.')
    : !node.outcome ? msg('此记录尚无完成结果；若任务已停止，请回到工作台核对状态。', 'No result has been recorded. If the task has stopped, check its status in the workbench.')
    : auth ? (auth.authenticated ? msg('Playground 身份已确认。', 'Playground account verified.') : msg('尚未登录；公开赛题仍可浏览。', 'Signed out. You can still browse public challenges.'))
    : catalog ? msg(`共 ${competitionCount} 个比赛、${challengeCount} 道赛题。`, `Competitions: ${competitionCount}. Challenges: ${challengeCount}.`)
    : workflow?.prepared ? msg('历史材料目录信息。旧检查卡已退役，不表示本次材料已检查或归档安全验证通过。', 'This historical material list comes from a retired check. It does not verify the current materials or archive safety.')
    : hasReceipt && attemptId !== undefined ? msg(`提交 #${attemptId} · ${evaluationState || '评测状态待查询'}`, `Submission #${attemptId} · ${evaluationState || 'Evaluation status pending'}`)
    : typeof result.sessionId === 'string' ? msg('已创建独立任务对话。', 'A separate task chat has been created.') : commandFact(workflow?.task?.title) || msg('可展开查看已保存的操作摘要；未提供的详情不可用。', 'Expand the details to view the saved command summary.');
  return h('section', { className: 'pg-card' }, h('style', null, css),
    h('div', { className: 'pg-head' }, h('strong', null, label), h('span', { className: 'pg-badge', 'data-tone': failed ? 'error' : !node.outcome || auth?.authenticated === false ? 'warning' : 'neutral' }, status)),
    h('p', { className: failed ? 'pg-error' : 'pg-note', role: failed ? 'alert' : 'status' }, summary),
    h('details', { className: 'pg-raw' }, h('summary', null, msg('查看操作详情', 'View command details')), h('pre', null, JSON.stringify(details, null, 2))),
    typeof result.sessionId === 'string' ? h('button', { className: 'pg-button', onClick: () => openTask(result.sessionId) }, msg('打开任务对话', 'Open task chat')) : null);
}

function ControllerWelcome({ node }) {
  usePluginLanguage();
  const ready = node.outcome?.kind === 'success';
  return h('section', { className: 'pg-card' }, h('style', null, css),
    h('h3', null, msg('Playground 工作区主控', 'Playground workspace controller')),
    h('p', { className: 'pg-note' }, ready
      ? msg('在下方输入你要协调的工作。试试「请让 Codex 只读检查这个工作区的 README，并告诉我怎么运行测试」。', 'Describe the work to coordinate below. Try “Ask Codex to read the workspace README and tell me how to run the tests.”')
      : msg('请从 Playground 工作台打开或创建工作区主控。', 'Open or create a workspace controller from the Playground workbench.')));
}

export { ControllerWelcome, PlaygroundCommandCard };

