import { msg, usePluginLanguage } from '../shared/language.js';
import * as React from 'react';
import { h } from '../shared/react.js';
import { workspaceOptions } from '../shared/workspaces.js';
import { css } from '../shared/styles.js';
import { AuthStatusPanel } from '../settings/auth.js';
import { LanguageMenu } from '../settings/language.js';
import { ReleaseStatusPanel } from '../settings/releases.js';
import { CodexChats } from './codex-chats.js';
import { ControllerHandoffDialog } from './handoff.js';

const controllerPanelCss = `
  .pg-controller { height:100%; min-height:0; display:flex; flex-direction:column; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); }
  .pg-controller-bar { display:flex; align-items:center; gap:10px; min-height:48px; padding:0 14px; border-bottom:1px solid var(--dsw-alias-border-l3); flex-wrap:wrap; }
  .pg-controller-bar h1 { font-size:15px; line-height:24px; margin:0; font-weight:600; }
  .pg-controller-bar :is(select,button), .pg-controller-action, .pg-controller-row, .pg-controller-back { font:inherit; color:inherit; }
  .pg-controller-bar select, .pg-controller-action { border:1px solid var(--dsw-alias-border-l3); border-radius:6px; background:transparent; padding:5px 8px; }
  .pg-controller-bar button, .pg-controller-action, .pg-controller-row, .pg-controller-back { cursor:pointer; }
  .pg-controller-bar button:hover, .pg-controller-action:hover:not(:disabled), .pg-controller-row:hover, .pg-controller-back:hover { background:var(--dsw-alias-interactive-bg-hover); }
  .pg-controller-bar :is(button,select):focus-visible, .pg-controller-action:focus-visible, .pg-controller-row:focus-visible, .pg-controller-back:focus-visible, .pg-controller-resize:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px; }
  .pg-controller-tabs { display:flex; align-self:stretch; gap:4px; }
  .pg-controller-challenge { border-bottom:1px solid var(--dsw-alias-border-l3); padding:8px 0; }
  .pg-controller-challenge > summary { cursor:pointer; overflow-wrap:anywhere; }
  .pg-controller-challenge > summary small { display:block; padding-left:16px; color:var(--dsw-alias-label-secondary); font-size:11px; }
  .pg-controller-tab { border:0; border-bottom:2px solid transparent; padding:0 10px; background:transparent; }
  .pg-controller-tab[aria-selected=true] { border-bottom-color:var(--pg-accent, #087f78); font-weight:600; }
  .pg-controller-account { display:flex; align-items:center; position:relative; gap:4px; margin-left:auto; }
  .pg-language { position:relative; flex:none; }
  .pg-language-menu, .pg-language-tip { position:absolute; z-index:20; top:calc(100% + 4px); right:0; width:max-content; max-width:calc(100vw - 16px); box-sizing:border-box; background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l3); border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,.12); }
  .pg-language-menu { padding:4px; }
  .pg-language-menu button { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:32px; padding:4px 8px; text-align:start; border:0; border-radius:4px; background:transparent; }
  .pg-language-tip { visibility:hidden; padding:5px 8px; font-size:12px; pointer-events:none; }
  .pg-language:hover .pg-language-tip, .pg-language button:focus-visible + .pg-language-tip { visibility:visible; }
  .pg-controller-icon { display:grid; place-items:center; width:32px; height:32px; padding:6px; border:0; border-radius:5px; background:transparent; }
  .pg-controller-connection { display:flex; align-items:center; gap:6px; min-height:32px; padding:5px 8px; border:1px solid var(--dsw-alias-border-l3); border-radius:6px; background:transparent; white-space:nowrap; font-size:12px!important; }
  .pg-controller-connection-dot { width:7px; height:7px; flex:none; border-radius:50%; background:var(--dsw-alias-label-secondary); }
  .pg-controller-connection[data-status=authenticated] .pg-controller-connection-dot { background:#16a34a; }
  .pg-controller-connection[data-status=unauthenticated] .pg-controller-connection-dot { background:#dc2626; }
  .pg-controller-body { flex:1; min-height:0; display:flex; position:relative; container-type:inline-size; }
  .pg-controller-chat { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; }
  .pg-controller-view-switch { display:flex; flex:none; gap:4px; padding:4px 12px; border-bottom:1px solid var(--dsw-alias-border-l3); }
  .pg-controller-view-switch [aria-pressed=true] { border-color:var(--pg-accent, #087f78); font-weight:600; }
  .pg-controller-placeholder { margin:auto; max-width:440px; padding:24px; line-height:1.6; }
  .pg-controller-resize { flex:none; width:5px; cursor:col-resize; border-left:1px solid var(--dsw-alias-border-l3); touch-action:none; }
  .pg-controller-resize:hover { background:var(--dsw-alias-interactive-bg-hover); }
  .pg-controller-tasks { box-sizing:border-box; flex:none; min-width:0; display:flex; flex-direction:column; background:var(--dsw-alias-bg-base); }
  .pg-controller-tasks header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px 16px 10px; border-bottom:1px solid var(--dsw-alias-border-l3); }
  .pg-controller-tasks h2 { font-size:14px; margin:0; }
  .pg-controller-task-content { overflow:auto; min-height:0; padding:8px 12px 20px; }
  .pg-controller-tasks p { color:var(--dsw-alias-label-secondary); font-size:13px; line-height:1.5; }
  .pg-controller-row { display:block; width:100%; border:0; border-bottom:1px solid var(--dsw-alias-border-l3); padding:10px 4px; background:transparent; text-align:left; }
  .pg-controller-row strong, .pg-controller-row span { display:block; overflow-wrap:anywhere; }
  .pg-controller-row span { margin-top:4px; color:var(--dsw-alias-label-secondary); font-size:12px; }
  .pg-controller-back { border:0; background:transparent; padding:4px 0 10px; color:var(--dsw-alias-label-secondary); }
  .pg-codex-chats { padding-bottom:12px; border-bottom:1px solid var(--dsw-alias-border-l3); overflow-wrap:anywhere; }
  .pg-codex-chats label { display:block; margin:6px 0; }
  .pg-codex-chats input, .pg-codex-chats textarea { box-sizing:border-box; width:100%; font:inherit; color:inherit; background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l3); border-radius:4px; padding:6px; }
  .pg-controller-detail h3 { margin:4px 0; font-size:15px; overflow-wrap:anywhere; }
  .pg-controller-markdown { min-width:0; overflow-wrap:anywhere; line-height:1.55; }
  .pg-controller-markdown pre, .pg-controller-markdown table, .pg-controller-raw pre { max-width:100%; overflow:auto; }
  .pg-controller-raw pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; font-size:12px; }
  .pg-controller-raw, .pg-controller-maintenance { margin-top:16px; font-size:12px; }
  .pg-controller-error { color:var(--dsw-alias-state-error-primary); }
  @media (max-width:600px) { .pg-controller-bar { gap:4px; padding:4px 8px; } }
  @container (max-width:720px) { .pg-controller-resize { display:none; } .pg-controller-tasks { position:absolute; right:0; top:0; bottom:0; width:min(380px,90%)!important; z-index:10; border-left:1px solid var(--dsw-alias-border-l3); box-shadow:-8px 0 24px rgba(0,0,0,.12); } }
`;

const controllerMessages = new Map([
  ['该子任务关联的平台与当前平台不一致，未更改已有归属。', 'The child task belongs to another platform. Its association was preserved.'],
  ['该子任务已关联另一道赛题，未更改已有归属。', 'The child task already belongs to another challenge. Its association was preserved.'],
  ['该编号不属于当前主控可见的直接子任务。', 'This ID is not a direct child task visible to this controller.'],
  ['主控对话已归档，请先取消归档。', 'The controller chat is archived. Unarchive it to continue.'],
  ['主控对话已归档。请先在 DSH 中取消归档。', 'Unarchive the controller chat in DSH first.'],
  ['已创建对话，但未能关联到工作区。请在 DSH 中按对话编号找回；不会重复创建。', 'The chat was created but could not be attached to the workspace. Find it by its ID in DSH.'],
  ['所选主控已变更，请重新核对工作区。', 'The selected controller changed. Check the workspace again.'],
  ['该对话的主控记录与工作区或赛题任务冲突，无法打开主控。', 'The controller record conflicts with the workspace or challenge task. The controller cannot open.'],
  ['该对话已有赛题记录，不能设为主控。', 'This chat already has challenge records and cannot become the controller.'],
  ['该工作区有多个主控记录，请先在 DSH 中核对这些对话。', 'This workspace has multiple controller records. Check these chats in DSH.'],
  ['无法确认唯一的主控对话，请检查工作区。', 'Could not identify a unique controller chat. Check the workspace.'],
  ['无法创建主控对话，请检查 DSH 工作区后重试。', 'Could not create the controller chat. Check the DSH workspace and retry.'],
  ['无法确认保存主控记录，请重试。', 'Could not confirm that the controller record was saved. Try again.'],
  ['主控对话已创建，但未完成初始化。请重试。', 'The controller chat was created but initialization is incomplete. Try again.'],
  ['主控对话已创建，但无法保存初始化记录。请重试。', 'The controller chat was created but its initialization record could not be saved. Try again.'],
  ['主控对话已创建，但无法加载。请在 DSH 中打开该对话后重试。', 'The controller chat was created but could not be loaded. Open it in DSH and retry.'],
  ['主控记录已保存，但未能初始化空对话。', 'The controller record was saved but the empty chat could not be initialized.'],
  ['DSH 未确认保存主控记录。请重试。', 'DSH did not confirm saving the controller record. Try again.'],
  ['DSH 未确认接收主控的首条消息。请重试。', 'DSH did not acknowledge the first controller message. Try again.'],
  ['DSH 未确认启动并保存主控对话。请重试。', 'DSH did not confirm starting and saving the controller chat. Try again.'],
  ['请先完成主控初始化。', 'Complete controller initialization first.'],
  ['请在原对话中重试设为主控。', 'Retry making the original chat the controller from that chat.'],
  ['现有主控尚未初始化，请先完成初始化。', 'Initialize the existing controller first.'],
  ['主控对话尚未初始化。请在 Playground 工作台确认初始化。', 'Confirm controller initialization in the Playground workbench.'],
  ['该工作区没有主控对话。', 'This workspace has no controller chat.'],
  ['未找到主控对话，请重新选择工作区并确认创建。', 'Controller chat not found. Select the workspace again and confirm creation.'],
  ['当前 DSH 版本无法初始化主控对话，请更新 DSH 后重试。', 'Update DSH to a version that can initialize controller chats and retry.'],
  ['当前 DSH 无法保存主控记录。', 'This DSH instance cannot save controller records.'],
  ['无法核对当前工作区的主控任务，未关联任务。', 'Could not verify the workspace controller tasks. No task was linked.'],
  ['所选工作区目录不存在或不可访问，请重新选择。', 'The selected workspace folder is missing or inaccessible. Choose another.'],
  ['DSH 未确认接收请求，请重试。', 'DSH did not acknowledge the request. Try again.'],
  ['请提供明确的赛题编号和已有子任务编号。', 'Provide a challenge ID and an existing child task ID.'],
  ['请先在 DSH 中打开该对话，完成会话迁移后再试。', 'Open this chat in DSH to migrate it, then try again.'],
  ['当前对话不是工作区主控。', 'This chat is not the workspace controller.'],
  ['找不到赛题，未关联任务。请确认 challenge_id。', 'Challenge not found. Check challenge_id. No task was linked.'],
  ['无法核对该工作区的对话记录，请重启 DSH 后重试。', 'Could not verify the workspace chat history. Restart DSH and retry.'],
  ['无法核对该工作区的对话记录，请重试。', 'Could not verify the workspace chat history. Try again.'],
  ['当前对话已归档，请先取消归档。', 'Unarchive this chat first.'],
  ['当前对话不可用，请先打开该对话。', 'This chat is unavailable. Open it first.'],
  ['无法加载主控对话，请先在 DSH 中打开该对话。', 'Could not load the controller chat. Open it in DSH first.'],
  ['主控对话的目录不属于所选工作区。', 'The controller chat folder is outside the selected workspace.'],
  ['当前对话不属于所选的已注册工作区。', 'This chat does not belong to the selected registered workspace.'],
  ['当前对话已离开所选工作区。', 'This chat has left the selected workspace.'],
  ['所选工作区已移除，请重新选择。', 'The selected workspace was removed. Choose another.'],
  ['无法打开主控对话，请重试。', 'Could not open the controller chat. Try again.'],
  ['无法交给主控，请重试。', 'Could not hand off to the controller. Try again.'],
  ['无法添加工作区，请重试。', 'Could not add the workspace. Try again.'],
  ['无法打开子智能体对话，请重试。', 'Could not open the subagent chat. Try again.'],
  ['已复制结果', 'Result copied'],
  ['无法复制，请选择文本后复制。', 'Could not copy. Select the text and copy it manually.'],
]);

function controllerMessage(value) {
  return msg(value, controllerMessages.get(value) ?? value);
}

const stopReasonLabels = () => ({
  completed: { detail: msg('完成', 'Completed') }, aborted: { detail: msg('已中止', 'Aborted'), state: msg('已中止', 'Aborted') },
  'max-tokens': { detail: msg('达到输出上限', 'Output limit reached'), state: msg('达到输出上限', 'Output limit reached') },
  refusal: { detail: msg('拒绝', 'Refused'), state: msg('拒绝执行', 'Task refused') }, error: { detail: msg('出错', 'Error'), state: msg('运行出错', 'Run failed') },
});

function taskState(row) {
  if (row.state === 'running') return msg('运行中', 'Running');
  const reason = stopReasonLabels()[row.liveEnd?.stopReason || (row.state === 'settled' ? row.noticeStopReason : undefined)];
  if (reason?.state) return `${row.state === 'settled' ? msg('上次', 'Previous run: ') : ''}${reason.state}`;
  if (row.state === 'settled') return msg('已收到历史结果', 'Received a previous result');
  if (row.state === 'ended' && row.terminalText) return msg('本次运行已结束 · 已收到结果', 'Run ended · Result received');
  return { ended: msg('本次运行已结束', 'Run ended'), unknown: msg('暂无执行回执', 'No execution receipt yet') }[row.state];
}

function taskOutput(row) {
  if (row.state === 'running') return '';
  const live = row.liveEnd?.lastAssistantMessage?.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  if (live) return live;
  const text = row.terminalText || '';
  const [summary, marker, ...rest] = text.split('\n');
  const prefix = `Background subagent ${row.childId} `;
  const endings = ['finished and will do no further work unless you send it more.', 'finished. It cannot receive follow-up messages.', 'was stopped before it finished.', 'ran out of room before it finished.', 'declined the task.', 'failed before it finished.'];
  return marker === 'Its closing message:' && endings.some((ending) => summary === prefix + ending) ? rest.join('\n') : text;
}

const TRAJECTORY_VIEW_ID = 'trajectory';
const controllerViews = [['chat', () => msg('对话', 'Chat')], [TRAJECTORY_VIEW_ID, () => msg('轨迹', 'Trajectory')]].map(([id, label]) => ({
  id, label, slots: { views: ({ renderSlot }) => renderSlot('conversation.session', { view: id }) },
}));
const [chatView, trajectoryView] = controllerViews;

function ControllerSession({ sessionId, useSession, useConversation, useSessions, renderSlot, expectedId, onPromote, busy }) {
  usePluginLanguage();
  const session = useSession((value) => value);
  const conversation = useConversation((value) => value);
  const blank = useSessions((value) => sessionId === undefined ? undefined : value.byId[sessionId]?.blank);
  if (!expectedId) return sessionId && onPromote ? h('button', { className: 'pg-controller-action', disabled: busy, onClick: () => onPromote(sessionId) }, msg('把当前对话设为主控', 'Use this chat as the controller')) : null;
  if (sessionId !== expectedId) return h('div', { className: 'pg-controller-placeholder', role: 'status' }, msg('正在打开所选主控对话…', 'Opening the selected controller chat…'));
  if (session?.openState === 'error') return h('div', { className: 'pg-controller-placeholder pg-controller-error', role: 'alert' }, msg('无法加载主控对话，请重新打开。', 'Could not load the controller chat. Reopen it to try again.'));
  if (!session || !conversation) return h('div', { className: 'pg-controller-placeholder', role: 'status' }, msg('正在加载主控对话…', 'Loading controller chat…'));
  const shellPhase = conversation.activeTargets.size > 0 || !session.blank && !session.awaitingFirstTurn || session.running
    ? 'active' : session.promptAttempted ? 'engaging' : 'blank';
  const settling = shellPhase === 'blank' && session.openState === 'loading' && blank !== true
    || session.subagent?.address.mode === 'continuable' && session.subagent.parentAvailable === undefined;
  const hero = shellPhase === 'blank' && (session.openState === 'open' || blank === true);
  return renderSlot('playground.controller.content', { phase: settling ? 'settling' : hero ? 'hero' : 'active', hero,
    canSwitchView: shellPhase === 'active' && !settling });
}

function ControllerSessionContent({ sessionId, phase, hero, canSwitchView, useControllerTrajectory, useStore, renderFactorySlot }) {
  usePluginLanguage();
  const trajectoryAvailable = useControllerTrajectory((value) => value);
  const viewRequest = useStore?.((value) => value.viewRequest);
  const [traceSessionId, setTraceSessionId] = React.useState(null);
  const showViewSwitch = trajectoryAvailable && canSwitchView;
  React.useEffect(() => {
    if (showViewSwitch && viewRequest?.view === TRAJECTORY_VIEW_ID) setTraceSessionId(sessionId);
  }, [sessionId, showViewSwitch, viewRequest]);
  const view = showViewSwitch && traceSessionId === sessionId ? trajectoryView : chatView;
  return h(React.Fragment, null,
    showViewSwitch ? h('div', { className: 'pg-controller-view-switch', role: 'group', 'aria-label': msg('主控视图', 'Controller view') },
      controllerViews.map((item) => h('button', { key: item.id, className: 'pg-controller-action', type: 'button', 'aria-pressed': view === item,
        onClick: () => setTraceSessionId(item === trajectoryView ? sessionId : null) }, item.label()))) : null,
    renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: view.slots }));
}

function ControllerPanel(props) {
  usePluginLanguage();
  const { useWorkspaces, useSessions, useControllerTarget, renderSlot, renderFactorySlot, inspectController, openController, openControllerChat, openTask, promoteController, controllerTasks, dispatchChallenge } = props;
  const workspaces = useWorkspaces((value) => value);
  const sessions = useSessions((value) => value);
  const controllerTarget = useControllerTarget((value) => value);
  const selectedSession = sessions.ids.map((id) => sessions.byId[id]).find((item) => (item?.retainedBy?.mainView ?? 0) > 0);
  const selectedMarker = selectedSession?.projectionValues?.playgroundController;
  const [workspaceId, setWorkspaceId] = React.useState(() => props.controllerSelection.workspaceId || (selectedMarker?.sessionId === selectedSession?.id ? selectedMarker?.workspaceId : '') || '');
  const [inspection, setInspection] = React.useState(null);
  const [expectedId, setExpectedId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [errorMessage, setError] = React.useState('');
  const [view, setView] = React.useState('controller');
  const error = controllerMessage(errorMessage);
  const [dispatchState, setDispatchState] = React.useState(null);
  const [dispatchControls] = React.useState(() => ({ busy: false }));
  const [authStatus, setAuthStatus] = React.useState('checking');
  const [visited] = React.useState(() => new Set());
  if (view === 'catalog' || view === 'submissions' || view === 'settings') visited.add(view);
  const [preferences] = React.useState(() => {
    try { return JSON.parse(window.localStorage?.getItem('playground.controller.pane') || '{}'); } catch { return {}; }
  });
  const [showTasks, setShowTasks] = React.useState(() => props.controllerSelection.showTasks ?? preferences.open ?? !window.matchMedia?.('(max-width: 600px)').matches);
  const [taskWidth, setTaskWidth] = React.useState(() => Math.min(520, Math.max(300, Number(props.controllerSelection.taskWidth ?? preferences.width) || 380)));
  const [selectedTask, setSelectedTask] = React.useState('');
  const [showMaintenance, setShowMaintenance] = React.useState(false);
  const [closedChallenges, setClosedChallenges] = React.useState(() => new Set());
  const [taskActionStatus, setTaskActionStatus] = React.useState('');
  const [pane] = React.useState(() => ({ toggle: null, body: null, heading: null, back: null, rows: new Map(), focus: '', drag: null }));
  const savePane = (change) => { Object.assign(preferences, change); try { window.localStorage?.setItem('playground.controller.pane', JSON.stringify(preferences)); } catch {} };
  const resize = (width) => { const next = Math.min(520, Math.max(300, width)); props.controllerSelection.taskWidth = next; savePane({ width: next }); setTaskWidth(next); };
  const toggleTasks = () => { if (!showTasks && pane.body?.clientWidth <= 720) pane.focus = 'heading'; props.controllerSelection.showTasks = !showTasks; savePane({ open: !showTasks }); setShowTasks(!showTasks); };
  React.useEffect(() => { if (pane.focus === 'heading') pane.heading?.focus(); else if (pane.focus === 'back') pane.back?.focus(); else if (pane.focus) pane.rows.get(pane.focus)?.focus(); pane.focus = ''; }, [selectedTask, showTasks]);
  const [taskSnapshot, setTaskSnapshot] = React.useState(null);
  const tasks = taskSnapshot?.workspaceId === workspaceId && taskSnapshot.sessionId === expectedId ? taskSnapshot.value : null;
  const [retry, setRetry] = React.useState(0);
  const [taskRetry, setTaskRetry] = React.useState(0);
  const selectWorkspace = (id) => {
    if (id === workspaceId) return;
    props.controllerSelection.workspaceId = id;
    props.controllerSelection.sessionId = '';
    setExpectedId('');
    setInspection(null);
    setError('');
    setSelectedTask('');
    setTaskSnapshot(null);
    setClosedChallenges(new Set());
    setWorkspaceId(id);
  };
  const targetWorkspaceId = controllerTarget && (controllerTarget.workspaceId ||
    workspaces.items.find((item) => item.sessionIds?.includes(controllerTarget.sessionId))?.workspaceId);
  React.useEffect(() => {
    if (!targetWorkspaceId) return;
    setView('controller');
    if (targetWorkspaceId !== workspaceId) selectWorkspace(targetWorkspaceId);
    else if (controllerTarget.sessionId !== expectedId) setRetry(retry + 1);
    props.clearControllerTarget(controllerTarget);
  }, [controllerTarget, targetWorkspaceId]);
  React.useEffect(() => {
    const media = window.matchMedia?.('(max-width: 600px)');
    if (!media) return;
    const changed = (event) => { if (event.matches) setShowTasks(false); else setShowTasks(props.controllerSelection.showTasks ?? true); };
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  React.useEffect(() => {
    if (!workspaceId && selectedMarker?.sessionId === selectedSession?.id && selectedMarker?.workspaceId) {
      props.controllerSelection.workspaceId = selectedMarker.workspaceId;
      setWorkspaceId(selectedMarker.workspaceId);
    }
  }, [workspaceId, selectedSession?.id, selectedMarker?.workspaceId]);
  React.useEffect(() => {
    setExpectedId(''); setInspection(null); setError('');
    if (!workspaceId) return;
    const abort = new AbortController();
    inspectController({ workspaceId }, abort.signal).then((value) => {
      if (abort.signal.aborted) return;
      setInspection(value);
      if (value.kind === 'existing' && !value.archived) { props.controllerSelection.sessionId = value.sessionId; setExpectedId(value.sessionId); Promise.resolve(openControllerChat(value.sessionId)).catch(() => { if (!abort.signal.aborted) { setExpectedId(''); setError('无法打开主控对话，请重试。'); } }); }
    }).catch((failure) => { if (!abort.signal.aborted) setError(failure.message); });
    return () => abort.abort();
  }, [workspaceId, retry]);
  React.useEffect(() => { setTaskSnapshot(null); }, [workspaceId, expectedId]);
  React.useEffect(() => {
    if (!workspaceId || !expectedId || !controllerTasks) return;
    const abort = new AbortController();
    let inFlight = false;
    const refresh = () => {
      if (inFlight) return;
      inFlight = true;
      void controllerTasks({ workspaceId, sessionId: expectedId }, abort.signal)
        .then((value) => { if (!abort.signal.aborted) setTaskSnapshot({ workspaceId, sessionId: expectedId, value }); })
        .catch(() => { if (!abort.signal.aborted) setTaskSnapshot({ workspaceId, sessionId: expectedId, value: { kind: 'unavailable' } }); })
        .finally(() => { inFlight = false; });
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [workspaceId, expectedId, controllerTasks, taskRetry]);
  const selectController = (sessionId) => {
    setInspection({ kind: 'existing', sessionId, archived: false });
    props.controllerSelection.sessionId = sessionId;
    setExpectedId(sessionId);
  };
  const open = async () => {
    setBusy(true); setError('');
    try {
      const result = await openController({ workspaceId, createIfMissing: true });
      if (result.kind !== 'opened') setError(result.reason);
      else { selectController(result.sessionId); await openControllerChat(result.sessionId); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const selectedWorkspace = workspaces.phase === 'ready' && workspaces.items.find((item) => item.workspaceId === workspaceId);
  const selectedController = selectedWorkspace && inspection?.kind === 'existing' && !inspection.archived ? inspection.sessionId : '';
  const canInitialize = selectedWorkspace && (inspection?.kind === 'absent' || inspection?.kind === 'incomplete');
  const needsRecheck = dispatchState?.phase === 'error' && dispatchState.workspaceId === workspaceId &&
    (['controller_changed', 'controller_missing', 'controller_init_required', 'controller_archived', 'workspace_mismatch'].includes(dispatchState.code) ||
      dispatchState.sessionId && inspection && dispatchState.sessionId !== selectedController);
  const recheckHandoff = () => {
    setDispatchState({ phase: 'guide', challenge: dispatchState.challenge });
    setRetry(retry + 1);
  };
  const openAfterDispatch = async (state) => {
    try {
      await openControllerChat(state.sessionId);
      selectController(state.sessionId);
      setDispatchState(null);
      setView('controller');
    } catch {
      setDispatchState({ ...state, phase: 'accepted' });
    }
  };
  const retryOpenAfterDispatch = async (state) => {
    if (dispatchControls.busy) return;
    dispatchControls.busy = true;
    setDispatchState({ ...state, phase: 'opening' });
    try { await openAfterDispatch(state); }
    finally { dispatchControls.busy = false; }
  };
  const sendChallenge = async (state, target, initialize = false) => {
    if (busy || dispatchControls.busy || !selectedWorkspace || target.workspaceId !== workspaceId) return;
    dispatchControls.busy = true;
    let attempt = { ...state, ...target, requestId: state.requestId || crypto.randomUUID(), phase: 'sending' };
    setDispatchState(attempt);
    try {
      if (initialize) {
        const opened = await openController({ workspaceId: target.workspaceId, createIfMissing: true });
        if (opened.kind !== 'opened') {
          setDispatchState({ ...attempt, phase: 'error', message: opened.reason });
          return;
        }
        attempt = { ...attempt, sessionId: opened.sessionId };
        setInspection({ kind: 'existing', sessionId: opened.sessionId, archived: false });
      }
      const result = await dispatchChallenge({ workspaceId: attempt.workspaceId, sessionId: attempt.sessionId,
        challengeId: attempt.challenge.id, requestId: attempt.requestId });
      if (result.kind === 'accepted' && result.sessionId === attempt.sessionId) {
        await openAfterDispatch(attempt);
      } else {
        setDispatchState({ ...attempt, phase: 'error', code: result.code, message: result.reason || 'DSH 未确认接收请求，请重试。' });
      }
    } catch (failure) {
      setDispatchState({ ...attempt, phase: 'error', message: failure.message || '无法交给主控，请重试。' });
    } finally {
      dispatchControls.busy = false;
    }
  };
  const startHandoff = (challenge) => {
    if (busy || dispatchControls.busy) return;
    if (dispatchState?.phase === 'accepted' && dispatchState.challenge.id === challenge.id && dispatchState.workspaceId === workspaceId) return retryOpenAfterDispatch(dispatchState);
    const retry = dispatchState?.phase === 'error' && dispatchState.challenge.id === challenge.id && dispatchState.workspaceId === workspaceId;
    const state = retry ? dispatchState : { challenge };
    if (retry && needsRecheck) return;
    if (selectedController) return sendChallenge(state, { workspaceId, sessionId: retry && state.sessionId || selectedController });
    setDispatchState({ ...state, phase: 'guide', showDialog: true });
  };
  const handoff = { state: dispatchState, start: startHandoff };
  const handoffBusy = dispatchState?.phase === 'sending' || dispatchState?.phase === 'opening';
  const showHandoffDialog = dispatchState && (dispatchState.phase !== 'sending' || dispatchState.showDialog);
  let handoffMessage;
  let handoffAction;
  if (showHandoffDialog) {
    if (handoffBusy) {
      handoffMessage = dispatchState.phase === 'sending' ? msg('正在交给主控…', 'Handing off to the controller…') : msg('正在打开主控对话…', 'Opening controller chat…');
    } else if (dispatchState.phase === 'accepted') {
      handoffMessage = msg('主控已接收请求，无法打开对话。', 'The controller received the request, but its chat could not be opened.');
      if (dispatchState.workspaceId === workspaceId) handoffAction = { label: msg('打开主控对话', 'Open controller chat'), run: () => retryOpenAfterDispatch(dispatchState) };
    } else if (!selectedWorkspace) {
      handoffMessage = workspaces.state === 'error' ? msg('无法读取 DSH 工作区，请重启 DSH 后重试。', 'Could not load DSH workspaces. Restart DSH and try again.')
        : workspaces.phase !== 'ready' ? msg('正在读取 DSH 工作区…', 'Loading DSH workspaces…')
        : workspaces.items.length ? msg('请选择赛题工作所在的工作区。', 'Choose the workspace for this challenge.') : msg('还没有工作区。请选择一个目录添加为工作区。', 'No workspaces yet. Choose a folder to add one.');
    } else if (inspection?.kind === 'blocked' || inspection?.archived) {
      handoffMessage = controllerMessage(inspection.reason) || msg('主控对话已归档，请先取消归档。', 'The controller chat is archived. Unarchive it to continue.');
      handoffAction = { label: msg('重新核对', 'Check again'), run: () => setRetry(retry + 1) };
    } else if (needsRecheck) {
      handoffMessage = controllerMessage(dispatchState.message);
      handoffAction = { label: msg('重新核对', 'Check again'), run: recheckHandoff };
    } else if (selectedController || canInitialize) {
      const state = dispatchState.workspaceId && dispatchState.workspaceId !== workspaceId
        ? { challenge: dispatchState.challenge } : dispatchState;
      const sessionId = state.sessionId || selectedController;
      handoffMessage = dispatchState.phase === 'error' && state === dispatchState ? controllerMessage(dispatchState.message)
        : canInitialize ? msg('DSH 会发送一条初始化消息，再把赛题交给主控。', 'DSH will send a setup message before handing the challenge to the controller.') : undefined;
      handoffAction = { label: selectedController ? msg('交给主控', 'Hand off to controller') : inspection.kind === 'incomplete' ? msg('初始化并交接', 'Initialize and hand off') : msg('创建主控并交接', 'Create controller and hand off'),
        run: () => sendChallenge({ ...state, showDialog: true }, { workspaceId, sessionId }, !selectedController) };
    } else {
      handoffMessage = error || msg('正在核对工作区的主控对话…', 'Checking the workspace controller chat…');
      if (error) handoffAction = { label: msg('重新核对', 'Check again'), run: () => setRetry(retry + 1) };
    }
  }
  const row = tasks?.rows?.find((item) => item.childId === selectedTask);
  const challengeGroups = new Map();
  for (const item of tasks?.rows || []) {
    if (item.category === 'maintenance') continue;
    const challenge = item.challenge;
    const groupKey = challenge ? JSON.stringify([challenge.baseUrl, challenge.id]) : 'unassociated';
    if (!challengeGroups.has(groupKey)) challengeGroups.set(groupKey, { challenge, rows: [] });
    challengeGroups.get(groupKey).rows.push(item);
  }
  const childAddress = expectedId && (row?.mode === 'continuable' || row?.mode === 'one-shot')
    ? { parentSessionId: expectedId, childSessionId: row.childId, mode: row.mode } : null;
  const listRow = (item) => h('button', { key: item.childId, className: 'pg-controller-row', ref: (node) => { if (node) pane.rows.set(item.childId, node); else pane.rows.delete(item.childId); }, onClick: () => { pane.focus = 'back'; setTaskActionStatus(''); setSelectedTask(item.childId); } },
    h('strong', null, item.label || msg('未命名任务', 'Untitled task')), h('span', null, [item.provider, taskState(item)].filter(Boolean).join(' · ')));
  return h('div', { className: 'pg-controller' }, h('style', null, controllerPanelCss),
    h('header', { className: 'pg-controller-bar' }, h('h1', null, 'Playground'),
      h('select', { 'aria-label': msg('工作区', 'Workspace'), value: workspaceId, disabled: busy || handoffBusy, onChange: async (event) => {
        if (dispatchControls.busy) return;
        if (event.target.value === '__add_workspace__') { setBusy(true); setError(''); try { await props.addTaskWorkspace(); } catch { setError('无法添加工作区，请重试。'); } finally { setBusy(false); } return; }
        selectWorkspace(event.target.value);
      } }, h('option', { value: '' }, msg('选择工作区', 'Select workspace')), workspaceOptions(workspaces.items), h('option', { value: '__add_workspace__', disabled: busy }, msg('添加工作区…', 'Add workspace…'))),
      h('nav', { className: 'pg-controller-tabs', role: 'tablist', 'aria-label': msg('Playground 导航', 'Playground navigation'), onKeyDown: (event) => { const ids = ['controller', 'catalog', 'submissions']; const index = Math.max(0, ids.indexOf(view)); if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; setView(ids[next]); event.currentTarget.querySelectorAll('[role=tab]')[next]?.focus(); } },
        [['controller', msg('对话', 'Chat')], ['catalog', msg('赛题', 'Challenges')], ['submissions', msg('提交', 'Submissions')]].map(([id, title]) => h('button', { key: id, className: 'pg-controller-tab', role: 'tab', tabIndex: view === id || (view === 'settings' && id === 'controller') ? 0 : -1, 'aria-selected': view === id, onClick: () => setView(id) }, title))),
      h('div', { className: 'pg-controller-account' }, h(LanguageMenu),
      h('button', { className: 'pg-controller-connection', title: msg('连接设置', 'Connection settings'), 'data-status': authStatus, onClick: () => setView('settings') },
        h('span', { className: 'pg-controller-connection-dot', 'aria-hidden': true }),
        { checking: msg('检查中…', 'Checking…'), authenticated: msg('已登录', 'Signed in'), unauthenticated: msg('未登录', 'Signed out'), unavailable: msg('检测失败', 'Check failed') }[authStatus])),
      view === 'controller' ? h('button', { className: 'pg-controller-icon', ref: (node) => { pane.toggle = node; }, title: showTasks ? msg('隐藏任务侧栏', 'Hide task sidebar') : msg('显示任务侧栏', 'Show task sidebar'), 'aria-label': showTasks ? msg('隐藏任务侧栏', 'Hide task sidebar') : msg('显示任务侧栏', 'Show task sidebar'), 'aria-expanded': showTasks, 'aria-controls': 'pg-controller-tasks', onClick: toggleTasks },
        h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: 'M15 4v16' }))) : null),
    h('div', { className: 'pg-controller-body', ref: (node) => { pane.body = node; } },
      h('main', { className: 'pg-controller-chat', style: { display: view === 'controller' ? 'flex' : 'none' } },
        !workspaceId ? h('div', { className: 'pg-controller-placeholder', role: workspaces.state === 'error' ? 'alert' : undefined }, workspaces.state === 'error' ? msg('无法读取工作区，请重启 DSH 后重试。', 'Could not load workspaces. Restart DSH and try again.') : workspaces.phase !== 'ready' ? msg('正在读取工作区…', 'Loading workspaces…') : msg('选择工作区以打开或创建主控对话。', 'Choose a workspace to open or create a controller chat.'), error ? h('p', { className: 'pg-controller-error', role: 'alert' }, error) : null)
          : !expectedId && workspaceId && error && !inspection ? h('div', { className: 'pg-controller-placeholder', role: 'alert' }, error, h('button', { onClick: () => setRetry(retry + 1) }, msg('重试', 'Retry')))
          : !expectedId && workspaceId && !inspection ? h('div', { className: 'pg-controller-placeholder', role: 'status' }, msg('正在核对主控对话…', 'Checking controller chat…'))
          : !expectedId && workspaceId && inspection ? h('div', { className: 'pg-controller-placeholder' },
          h('p', null, inspection.kind === 'blocked' ? controllerMessage(inspection.reason) : inspection.archived ? msg('主控对话已归档，请先取消归档。', 'The controller chat is archived. Unarchive it to continue.') : msg('为此工作区打开或创建主控对话。', 'Open or create a controller chat for this workspace.')),
          inspection.kind !== 'blocked' && !inspection.archived ? h('button', { className: 'pg-controller-action', disabled: busy, onClick: open }, busy ? msg('正在打开…', 'Opening…') : inspection.kind === 'absent' ? msg('创建主控对话', 'Create controller chat') : msg('打开主控对话', 'Open controller chat')) : null,
          h('p', null, msg('空对话会收到一条初始化消息。', 'An empty chat will receive a setup message.')),
          renderSlot('playground.controller.session', { expectedId: '', busy, onPromote: async (sessionId) => {
            setBusy(true); setError('');
            try {
              const result = await promoteController({ workspaceId, sessionId });
              if (result.kind === 'opened') { selectController(result.sessionId); await openControllerChat(result.sessionId); }
              else setError(result.reason);
            } catch (failure) { setError(failure.message); } finally { setBusy(false); }
          } }),
          error ? h('p', { className: 'pg-controller-error', role: 'alert' }, error) : null)
          : renderSlot('playground.controller.session', { expectedId })),
      h('main', { className: 'pg-workbench', style: { display: view === 'settings' ? 'block' : 'none', padding: 24, overflow: 'auto' } },
        h('style', null, css), h('h1', null, msg('连接设置', 'Connection settings')), h(AuthStatusPanel, { ...props, onStatusChange: setAuthStatus }),
        visited.has('settings') ? h(ReleaseStatusPanel, { query: props.query }) : null),
      ['catalog', 'submissions'].map((section) => visited.has(section) ? h('div', { key: section, style: { display: view === section ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 } }, renderSlot('playground.library', { libraryOnly: true, section, active: view === section, ...(section === 'catalog' ? { handoff } : {}) })) : null),
      view === 'controller' && showTasks ? h(React.Fragment, null,
        h('div', { className: 'pg-controller-resize', role: 'separator', tabIndex: 0, 'aria-label': msg('调整任务侧栏宽度', 'Resize task sidebar'), 'aria-orientation': 'vertical', 'aria-valuemin': 300, 'aria-valuemax': 520, 'aria-valuenow': taskWidth,
          onKeyDown: (event) => { const next = { ArrowLeft: taskWidth + 10, ArrowRight: taskWidth - 10, Home: 300, End: 520 }[event.key]; if (next !== undefined) { event.preventDefault(); resize(next); } },
          onPointerDown: (event) => { pane.drag = { x: event.clientX, width: taskWidth }; event.currentTarget.setPointerCapture(event.pointerId); },
          onPointerMove: (event) => { if (pane.drag) resize(pane.drag.width + pane.drag.x - event.clientX); }, onPointerUp: () => { pane.drag = null; }, onPointerCancel: () => { pane.drag = null; } }),
        h('aside', { id: 'pg-controller-tasks', className: 'pg-controller-tasks', 'aria-label': msg('主控任务', 'Controller tasks'), style: { width: taskWidth }, onKeyDown: (event) => { if (event.key === 'Escape' && pane.body?.clientWidth <= 720) { toggleTasks(); pane.toggle?.focus(); } } },
          h('header', null, h('h2', { tabIndex: -1, ref: (node) => { pane.heading = node; } }, msg('任务', 'Tasks')),
            h('button', { className: 'pg-controller-back', disabled: !expectedId, onClick: () => setTaskRetry(taskRetry + 1) }, msg('刷新任务', 'Refresh tasks'))),
          h('div', { className: 'pg-controller-task-content' },
            expectedId && props.codexChats ? h(CodexChats, { key: `${workspaceId}:${expectedId}`, workspaceId, sessionId: expectedId, query: props.codexChats, refresh: taskRetry }) : null,
            !expectedId ? h('p', null, msg('打开主控后查看其派发的任务。', 'Open the controller to see the tasks it dispatched.')) : !tasks ? h('p', { role: 'status' }, msg('正在读取任务…', 'Loading tasks…'))
              : tasks.kind !== 'ready' ? h('p', { role: 'alert' }, msg('无法读取任务。', 'Could not load tasks.'), h('button', { onClick: () => setTaskRetry(taskRetry + 1) }, msg('重试', 'Retry')))
              : row ? h('div', { className: 'pg-controller-detail' },
                h('button', { className: 'pg-controller-back', ref: (node) => { pane.back = node; }, onClick: () => { pane.focus = row.childId; setSelectedTask(''); } }, msg('返回任务', 'Back to tasks')),
                h('h3', null, row.label || msg('未命名任务', 'Untitled task')), h('p', null, [row.provider, taskState(row)].filter(Boolean).join(' · ')),
                h('p', null, row.challenge ? `${row.challenge.title || row.challenge.id} · ${row.challenge.id} · ${row.challenge.baseUrl}` : row.category === 'maintenance' ? msg('后台维护', 'Background maintenance') : msg('未关联赛题', 'No linked challenge')),
                childAddress ? h('button', { className: 'pg-controller-back', onClick: async () => {
                  setTaskActionStatus('');
                  try { await openTask(childAddress); }
                  catch { setTaskActionStatus('无法打开子智能体对话，请重试。'); }
                } }, msg('打开子智能体对话', 'Open subagent chat')) : null,
                row.state === 'unknown' ? h('p', null, msg('未收到结果通知，也未观察到本次运行记录。可能发生在重启后，这不表示任务失败。', 'No result notification or current run record is available. This can happen after a restart even if the task succeeded.')) : null,
                row.liveEnd ? h('p', null, msg(`${row.state === 'running' ? '上次' : '本次'}运行结束：${stopReasonLabels()[row.liveEnd.stopReason]?.detail || row.liveEnd.stopReason || '未知'}`, `${row.state === "running" ? "Previous" : "Current"} run ended: ${stopReasonLabels()[row.liveEnd.stopReason]?.detail || row.liveEnd.stopReason || "Unknown"}`)) : null,
                row.state === 'settled' && row.terminalText ? h('p', null, msg(`当前执行状态未知。已收到历史结果通知，不能作为本次运行已结束或比赛测评成功的依据。${typeof row.noticeStopReason === 'string' ? `历史通知的结束原因：${stopReasonLabels()[row.noticeStopReason]?.detail || row.noticeStopReason}` : ''}`, `Current run status is unknown. A previous result notification does not confirm that this run ended or that the challenge evaluation succeeded.${typeof row.noticeStopReason === 'string' ? ` Previous stop reason: ${stopReasonLabels()[row.noticeStopReason]?.detail || row.noticeStopReason}` : ''}`)) : null,
                row.state === 'running' && row.terminalText ? h('p', null, msg('正在运行。已收到的通知属于历史结果，不能作为本次运行已结束的依据。', 'Running. The available notification belongs to an earlier run.')) : null,
                taskOutput(row) ? h('div', { className: 'pg-controller-markdown' }, typeof renderFactorySlot === 'function' ? renderFactorySlot('conversation.chat.reasoning.content', { text: taskOutput(row), running: false }, { fallback: h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' } }, taskOutput(row)) }) : h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' } }, taskOutput(row))) : null,
                taskOutput(row) ? h('button', { className: 'pg-controller-back', onClick: async () => { try { await navigator.clipboard.writeText(taskOutput(row)); setTaskActionStatus('已复制结果'); } catch { setTaskActionStatus('无法复制，请选择文本后复制。'); } } }, msg('复制结果', 'Copy result')) : null,
                taskActionStatus ? h('p', { role: 'status' }, controllerMessage(taskActionStatus)) : null,
                row.terminalText ? h('details', { className: 'pg-controller-raw' }, h('summary', null, row.state !== 'ended' ? msg('历史原始通知', 'Original notification from an earlier run') : msg('原始通知', 'Original notification')), h('pre', null, row.terminalText)) : null)
              : !tasks.rows.length ? h('p', null, msg('还没有派发任务。', 'No tasks dispatched yet.')) : h(React.Fragment, null,
                [...challengeGroups].map(([groupKey, group]) => h('details', { key: groupKey, className: 'pg-controller-challenge', open: !closedChallenges.has(groupKey),
                  onToggle: (event) => { const closed = !event.currentTarget.open; if (closed === closedChallenges.has(groupKey)) return; const next = new Set(closedChallenges); if (closed) next.add(groupKey); else next.delete(groupKey); setClosedChallenges(next); } },
                h('summary', null, msg(`${group.challenge?.title || group.challenge?.id || '未关联赛题'}（${group.rows.length}）`, `${group.challenge?.title || group.challenge?.id || 'No linked challenge'} (${group.rows.length})`),
                  group.challenge ? h('small', null, `${group.challenge.id} · ${group.challenge.baseUrl}`) : h('small', null, msg('缺少明确的赛题关联，保留原任务和结果。', 'The original task and result are available without a confirmed challenge link.'))),
                group.rows.map(listRow))),
                tasks.rows.some((item) => item.category === 'maintenance') ? h('details', { className: 'pg-controller-maintenance', open: showMaintenance, onToggle: (event) => setShowMaintenance(event.currentTarget.open) }, h('summary', null, msg(`后台维护（${tasks.rows.filter((item) => item.category === 'maintenance').length}）`, `Background maintenance (${tasks.rows.filter((item) => item.category === 'maintenance').length})`)), tasks.rows.filter((item) => item.category === 'maintenance').map(listRow)) : null)))) : null),
    showHandoffDialog ? h(ControllerHandoffDialog, { state: dispatchState, workspaces, workspace: selectedWorkspace, busy: handoffBusy,
      selectWorkspace, addTaskWorkspace: props.addTaskWorkspace, message: handoffMessage, action: handoffAction,
      close: () => { if (!dispatchControls.busy) setDispatchState(null); } }) : null);

}

export { ControllerPanel, ControllerSession, ControllerSessionContent, TRAJECTORY_VIEW_ID };

