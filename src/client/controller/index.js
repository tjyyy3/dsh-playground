import { msg, usePluginLanguage } from '../shared/language.js';
import * as React from 'react';
import { h } from '../shared/react.js';
import { workspaceOptions } from '../shared/workspaces.js';
import { css } from '../shared/styles.js';
import { AuthStatusPanel } from '../settings/auth.js';
import { LanguageMenu } from '../settings/language.js';
import { ReleaseStatusPanel, ReleaseIndicator } from '../settings/releases.js';
import { controllerMessage } from './messages.js';
import { codexCss, ExternalCodexChats } from './codex-chats.js';
import { ControllerHandoffDialog, noticeHandoffCopy } from './handoff.js';
import { CompetitionNotices, CompetitionNoticeSetting } from './competition-notices.js';
import { controllerPanelCss } from './styles.js';
import { taskEvidence } from './task-evidence.js';

function lineIcon(path, size = 16, viewBox = '0 0 16 16') {
  return h('svg', { width: size, height: size, viewBox, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: path }));
}

function controllerBrand() {
  return h('div', { className: 'pg-controller-brand' },
    h('svg', { width: 26, height: 26, viewBox: '0 0 26 26', fill: 'none', 'aria-hidden': true },
      h('rect', { x: 1, y: 1, width: 24, height: 24, rx: 6, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('path', { d: 'M5 13.5c2.1 0 2.1-6.5 4.2-6.5s2.1 12 4.3 12 2.1-8.5 4.2-8.5c1.3 0 1.9 3 3.3 3', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' })),
    h('h1', null, 'Playground'), h('small', null, 'DSH'));
}

function evidenceMark(evidence, label, description) {
  return h('span', { className: 'pg-controller-evidence', 'data-evidence': evidence, title: description }, label);
}

function groupHeading(title, count, subtitle) {
  return h('summary', { className: 'pg-controller-group' }, lineIcon('M3.5 2 6.5 5l-3 3', 10, '0 0 10 10'),
    h('span', { className: 'pg-controller-group-label' }, h('span', null, title), subtitle ? h('small', null, subtitle) : null),
    h('span', { className: 'pg-controller-task-count', 'aria-label': msg(`${count} 个任务`, `${count} tasks`) }, count));
}

function taskTime(value, language) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return h('time', { dateTime: date.toISOString(), title: date.toLocaleString(language) },
    date.toDateString() === new Date().toDateString()
      ? date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      : date.toLocaleDateString(language, { month: '2-digit', day: '2-digit' }));
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
  return { ended: msg('本次运行已结束', 'Run ended'), unknown: msg('状态未知', 'Status unknown') }[row.state];
}

function taskTone(row) {
  if (row.state === 'running') return 'running';
  const reason = row.liveEnd?.stopReason || (row.state === 'settled' ? row.noticeStopReason : undefined);
  if (stopReasonLabels()[reason]?.state) return 'error';
  if (row.terminalText || row.state === 'ended') return 'result';
  return 'unknown';
}

function controllerHeader(sessionId, viewSwitch) {
  return h('div', { className: 'pg-controller-chat-head' },
    h('h2', null, msg('工作区主控', 'Workspace controller')),
    sessionId ? h('span', { className: 'pg-badge', 'data-tone': 'open' }, msg('已初始化', 'Initialized')) : null,
    sessionId ? h('span', { className: 'pg-controller-session', title: sessionId },
      sessionId.length > 18 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId) : null,
    viewSwitch);
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
  if (!expectedId) return sessionId && onPromote ? h('button', { className: 'pg-button', disabled: busy, onClick: () => onPromote(sessionId) }, msg('把当前对话设为主控', 'Use this chat as the controller')) : null;
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
    controllerHeader(sessionId, showViewSwitch ? h('div', { className: 'pg-controller-view-switch', role: 'group', 'aria-label': msg('主控视图', 'Controller view') },
      controllerViews.map((item) => h('button', { key: item.id, className: 'pg-button', type: 'button', 'aria-pressed': view === item,
        onClick: () => setTraceSessionId(item === trajectoryView ? sessionId : null) }, item.label()))) : null),
    renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: view.slots }));
}

function ControllerPanel(props) {
  const language = usePluginLanguage();
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
  const [releaseVisit, setReleaseVisit] = React.useState(0);
  const error = controllerMessage(errorMessage);
  const [dispatchState, setDispatchState] = React.useState(null);
  const [catalogNotice, setCatalogNotice] = React.useState(null);
  const selectTab = (tab) => {
    if (tab === 'catalog' && view !== 'catalog') setCatalogNotice(null);
    setView(tab);
  };
  const [dispatchControls] = React.useState(() => ({ busy: false }));
  const [authStatus, setAuthStatus] = React.useState('checking');
  const [accountName, setAccountName] = React.useState('');
  const [updateAuthStatus] = React.useState(() => (status, user) => {
    setAuthStatus(status);
    setAccountName(status === 'authenticated' ? user?.name || user?.email || '' : '');
  });
  const [visited] = React.useState(() => new Set());
  if (view === 'catalog' || view === 'submissions' || view === 'settings') visited.add(view);
  const [preferences] = React.useState(() => {
    try { return JSON.parse(window.localStorage?.getItem('playground.controller.pane') || '{}'); } catch { return {}; }
  });
  const [showTasks, setShowTasks] = React.useState(() => props.controllerSelection.showTasks ?? preferences.open ?? !window.matchMedia?.('(max-width: 600px)').matches);
  const [taskWidth, setTaskWidth] = React.useState(() => Math.min(520, Math.max(300, Number(props.controllerSelection.taskWidth ?? preferences.width) || 380)));
  const [selectedTask, setSelectedTask] = React.useState('');
  const [groupOpen, setGroupOpen] = React.useState(() => new Map());
  const [taskActionStatus, setTaskActionStatus] = React.useState('');
  const [pane] = React.useState(() => ({ toggle: null, body: null, heading: null, back: null, rows: new Map(), focus: '', drag: null }));
  const savePane = (change) => { Object.assign(preferences, change); try { window.localStorage?.setItem('playground.controller.pane', JSON.stringify(preferences)); } catch {} };
  const resize = (width) => { const next = Math.min(520, Math.max(300, width)); props.controllerSelection.taskWidth = next; savePane({ width: next }); setTaskWidth(next); };
  const toggleTasks = () => { if (!showTasks && pane.body?.clientWidth <= 720) pane.focus = 'heading'; props.controllerSelection.showTasks = !showTasks; savePane({ open: !showTasks }); setShowTasks(!showTasks); };
  React.useEffect(() => { if (pane.focus === 'heading') pane.heading?.focus(); else if (pane.focus === 'back') pane.back?.focus(); else if (pane.focus) pane.rows.get(pane.focus)?.focus(); pane.focus = ''; }, [selectedTask, showTasks]);
  const [taskSnapshot, setTaskSnapshot] = React.useState(null);
  const [includeChallengeId, setIncludeChallengeId] = React.useState('');
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
    setIncludeChallengeId('');
    setGroupOpen(new Map());
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
      void controllerTasks({ workspaceId, sessionId: expectedId, ...(includeChallengeId && { includeChallengeId }) }, abort.signal)
        .then((value) => { if (!abort.signal.aborted) setTaskSnapshot({ workspaceId, sessionId: expectedId, value, updatedAt: Date.now() }); })
        .catch(() => { if (!abort.signal.aborted) setTaskSnapshot({ workspaceId, sessionId: expectedId, value: { kind: 'unavailable' } }); })
        .finally(() => { inFlight = false; });
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [workspaceId, expectedId, controllerTasks, taskRetry, includeChallengeId]);
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
  const handoffWorkspace = dispatchState?.coordination && dispatchState.workspaceId !== workspaceId ? undefined : selectedWorkspace;
  const selectedController = selectedWorkspace && inspection?.kind === 'existing' && !inspection.archived ? inspection.sessionId : '';
  const canInitialize = selectedWorkspace && (inspection?.kind === 'absent' || inspection?.kind === 'incomplete');
  const needsRecheck = dispatchState?.phase === 'error' && dispatchState.workspaceId === workspaceId &&
    (['controller_changed', 'controller_missing', 'controller_init_required', 'controller_archived', 'workspace_mismatch'].includes(dispatchState.code) ||
      dispatchState.coordination && ['controller_init_failed', 'controller_attach_failed', 'controller_open_failed'].includes(dispatchState.code) ||
      dispatchState.sessionId && inspection && dispatchState.sessionId !== selectedController);
  const recheckHandoff = () => {
    setDispatchState({ phase: 'guide', challenge: dispatchState.challenge,
      ...(dispatchState.coordination && { coordination: dispatchState.coordination, workspaceId, showDialog: true }) });
    setRetry(retry + 1);
  };
  const openAfterDispatch = async (state) => {
    try {
      await openControllerChat(state.sessionId);
      selectController(state.sessionId);
      if (state.linked) {
        const value = await controllerTasks?.({ workspaceId: state.workspaceId, sessionId: state.sessionId, includeChallengeId: state.challenge.id }).catch(() => undefined);
        if (value?.kind !== 'ready' || value.missingLinkedChildren || !value.linkedChildIds?.length || !state.childIds.every((id) => value.linkedChildIds.includes(id))) {
          setDispatchState({ ...state, phase: 'error', code: 'linked_task_unavailable' });
          return;
        }
        setIncludeChallengeId(state.challenge.id);
        setTaskSnapshot({ workspaceId: state.workspaceId, sessionId: state.sessionId, value });
        setShowTasks(true);
        setSelectedTask(state.childIds.length === 1 ? state.childIds[0] : '');
        setGroupOpen(new Map());
      }
      const notice = state.coordination?.notice;
      if (notice && state.noticeKey === notice.key) notice.acknowledge();
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
    let attempt = { ...state, ...target, requestId: state.requestId || crypto.randomUUID(), phase: initialize && state.coordination ? 'initializing' : 'sending' };
    setDispatchState(attempt);
    try {
      if (initialize) {
        const opened = await openController({ workspaceId: target.workspaceId, createIfMissing: true,
          ...(state.coordination && { expectedSessionId: target.sessionId || null }) });
        if (opened.kind !== 'opened') {
          setDispatchState({ ...attempt, phase: 'error', code: opened.code, message: opened.reason });
          return;
        }
        attempt = { ...attempt, sessionId: opened.sessionId };
        if (state.coordination) {
          try { await openControllerChat(opened.sessionId); }
          catch {
            setExpectedId(''); setInspection(null); setError('无法打开主控对话，请重试。');
            setDispatchState({ ...attempt, phase: 'error', code: 'controller_open_failed', message: '无法打开主控对话，请重试。' });
            return;
          }
          selectController(opened.sessionId);
          setDispatchState({ ...attempt, phase: 'guide' });
          return;
        }
        setInspection({ kind: 'existing', sessionId: opened.sessionId, archived: false });
      }
      const notice = state.coordination?.notice;
      const result = await dispatchChallenge({ workspaceId: attempt.workspaceId, sessionId: attempt.sessionId,
        challengeId: attempt.challenge.id, requestId: attempt.requestId,
        ...(notice && { notice: { scope: notice.scope, key: notice.key } }) });
      if ((result.kind === 'accepted' || result.kind === 'linked') && result.sessionId === attempt.sessionId) {
        await openAfterDispatch({ ...attempt, linked: result.kind === 'linked', childIds: result.childIds, noticeKey: result.noticeKey });
      } else {
        setDispatchState({ ...attempt, phase: 'error', code: result.code, message: result.reason || 'DSH 未确认接收请求，请重试。' });
      }
    } catch (failure) {
      setDispatchState({ ...attempt, phase: 'error', message: failure.message || '无法交给主控，请重试。' });
    } finally {
      dispatchControls.busy = false;
    }
  };
  const startHandoff = (challenge, coordination) => {
    if (busy || dispatchControls.busy) return;
    if (coordination) {
      setDispatchState({ phase: 'guide', challenge, coordination, workspaceId: '', showDialog: true });
      return;
    }
    if (dispatchState?.phase === 'accepted' && dispatchState.challenge.id === challenge.id && dispatchState.workspaceId === workspaceId) return retryOpenAfterDispatch(dispatchState);
    const retry = dispatchState?.phase === 'error' && dispatchState.challenge.id === challenge.id && dispatchState.workspaceId === workspaceId;
    const state = retry ? dispatchState : { challenge };
    if (retry && needsRecheck) return;
    if (selectedController) return sendChallenge(state, { workspaceId, sessionId: retry && state.sessionId || selectedController });
    setDispatchState({ ...state, phase: 'guide', showDialog: true });
  };
  const coordinate = (target, notice) => {
    if (target.kind === 'challenge') return startHandoff({ id: target.challengeId, title: target.title }, { notice });
    setCatalogNotice({ ...notice, target, visit: (catalogNotice?.visit ?? 0) + 1 });
    setView('catalog');
  };
  const handoff = { state: dispatchState, start: (challenge, notice) => startHandoff(challenge, catalogNotice ? { notice } : undefined), catalogNotice };
  const selectHandoffWorkspace = (id) => {
    if (dispatchState.coordination && dispatchState.workspaceId !== id) {
      setDispatchState({ phase: 'guide', challenge: dispatchState.challenge, coordination: dispatchState.coordination, workspaceId: id, showDialog: true });
    }
    selectWorkspace(id);
  };
  const handoffBusy = ['sending', 'initializing', 'opening'].includes(dispatchState?.phase);
  const showHandoffDialog = dispatchState && (dispatchState.phase !== 'sending' || dispatchState.showDialog);
  let handoffMessage;
  let handoffAction;
  if (showHandoffDialog) {
    if (handoffBusy) {
      handoffMessage = dispatchState.phase === 'initializing' ? msg('正在初始化主控对话…', 'Setting up controller chat…')
        : dispatchState.phase === 'sending' ? msg('正在交给主控…', 'Handing off to the controller…') : msg('正在打开主控对话…', 'Opening controller chat…');
    } else if (dispatchState.phase === 'accepted') {
      handoffMessage = dispatchState.linked ? msg('此题已有主控任务，暂时无法打开对话。', 'This challenge already has controller work. Its chat could not be opened.')
        : msg('主控已接收请求，无法打开对话。', 'The controller received the request, but its chat could not be opened.');
      if (dispatchState.workspaceId === workspaceId) handoffAction = { label: msg('打开主控对话', 'Open controller chat'), run: () => retryOpenAfterDispatch(dispatchState) };
    } else if (!handoffWorkspace) {
      handoffMessage = workspaces.state === 'error' ? msg('无法读取 DSH 工作区，请重启 DSH 后重试。', 'Could not load DSH workspaces. Restart DSH and try again.')
        : workspaces.phase !== 'ready' ? msg('正在读取 DSH 工作区…', 'Loading DSH workspaces…')
        : workspaces.items.length ? msg('请选择赛题工作所在的工作区。', 'Choose the workspace for this challenge.') : msg('还没有工作区。请选择一个目录添加为工作区。', 'No workspaces yet. Choose a folder to add one.');
    } else if (inspection?.kind === 'blocked' || inspection?.archived) {
      handoffMessage = controllerMessage(inspection.reason) || msg('主控对话已归档，请先取消归档。', 'The controller chat is archived. Unarchive it to continue.');
      handoffAction = { label: msg('重新核对', 'Check again'), run: () => setRetry(retry + 1) };
    } else if (dispatchState.code === 'platform_changed') {
      handoffMessage = controllerMessage(dispatchState.message);
    } else if (dispatchState.code === 'linked_task_unavailable') {
      handoffMessage = msg('无法打开已关联的子任务，请在主控对话中核对已有工作。', 'The linked child task could not be opened. Check the existing work in the controller chat.');
    } else if (dispatchState.code === 'controller_history_unavailable') {
      handoffMessage = msg('无法核对完整派工历史，请在主控对话中检查已有工作。', 'The full assignment history could not be verified. Check existing work in the controller chat.');
    } else if (needsRecheck) {
      handoffMessage = controllerMessage(dispatchState.message);
      handoffAction = { label: msg('重新核对', 'Check again'), run: recheckHandoff };
    } else if (selectedController || canInitialize) {
      const state = dispatchState.workspaceId && dispatchState.workspaceId !== workspaceId
        ? { challenge: dispatchState.challenge } : dispatchState;
      const sessionId = state.sessionId || selectedController || (state.coordination && inspection.sessionId);
      const copy = state.coordination ? noticeHandoffCopy(inspection, handoffWorkspace, state.coordination.notice) : {
        label: selectedController ? msg('交给主控', 'Hand off to controller') : inspection.kind === 'incomplete' ? msg('初始化并交接', 'Initialize and hand off') : msg('创建主控并交接', 'Create controller and hand off'),
        message: canInitialize ? msg('DSH 会发送一条初始化消息，再把赛题交给主控。', 'DSH will send a setup message before handing the challenge to the controller.') : undefined,
      };
      handoffMessage = dispatchState.phase === 'error' && state === dispatchState ? controllerMessage(dispatchState.message) : copy.message;
      handoffAction = { label: copy.label, run: () => sendChallenge({ ...state, showDialog: true }, { workspaceId, sessionId }, !selectedController) };
    } else {
      handoffMessage = error || msg('正在核对工作区的主控对话…', 'Checking the workspace controller chat…');
      if (error) handoffAction = { label: msg('重新核对', 'Check again'), run: () => setRetry(retry + 1) };
    }
  }
  const row = tasks?.rows?.find((item) => item.childId === selectedTask);
  const challengeGroups = new Map();
  const unassociated = [];
  const maintenance = [];
  for (const item of tasks?.rows || []) {
    if (item.category === 'maintenance') { maintenance.push(item); continue; }
    const challenge = item.challenge;
    if (!challenge) { unassociated.push(item); continue; }
    const groupKey = JSON.stringify([challenge.baseUrl, challenge.id]);
    if (!challengeGroups.has(groupKey)) challengeGroups.set(groupKey, { challenge, rows: [] });
    challengeGroups.get(groupKey).rows.push(item);
  }
  const taskCount = (tasks?.rows?.length ?? 0) - maintenance.length;
  const childAddress = expectedId && (row?.mode === 'continuable' || row?.mode === 'one-shot')
    ? { parentSessionId: expectedId, childSessionId: row.childId, mode: row.mode } : null;
  const evidenceLabels = {
    host: msg('宿主记录', 'Host record'),
    report: msg('Agent 报告', 'Agent report'),
    none: msg('无运行记录', 'No run record'),
  };
  const listRow = (item) => {
    const evidence = taskEvidence(item);
    const created = taskTime(item.createdAt, language);
    const label = taskState(item) || msg('状态未知', 'Status unknown');
    const tone = taskTone(item);
    const showResult = tone === 'result' && item.state === 'ended' && item.terminalText;
    return h('button', { type: 'button', key: item.childId, className: 'pg-controller-row',
      ref: (node) => { if (node) pane.rows.set(item.childId, node); else pane.rows.delete(item.childId); },
      onClick: () => { pane.focus = 'back'; setTaskActionStatus(''); setSelectedTask(item.childId); } },
      h('strong', null, item.label || msg('未命名任务', 'Untitled task')),
      h('span', { className: 'pg-controller-row-meta' },
        h('span', { className: 'pg-badge', 'data-tone': tone, title: showResult ? label : undefined },
          showResult ? msg('已收到结果', 'Result received') : label),
        evidenceMark(evidence, evidenceLabels[evidence]),
        item.provider || created ? h('span', { className: 'pg-controller-row-time' },
          item.provider, item.provider && created ? ' · ' : null, created) : null));
  };
  const taskGroup = (key, rows, title, subtitle, initiallyOpen = false, className = 'pg-controller-challenge') => {
    const open = groupOpen.get(key) ?? initiallyOpen;
    return h('details', { key, className, open,
      onToggle: (event) => {
        const expanded = event.currentTarget.open;
        if (expanded !== open) setGroupOpen((groups) => new Map(groups).set(key, expanded));
      } }, groupHeading(title, rows.length, subtitle),
      h('div', { className: 'pg-controller-group-rows' }, rows.map(listRow)));
  };
  return h('div', { className: 'pg-controller' }, h('style', null, css + controllerPanelCss + codexCss),
    view === 'controller' ? h(CompetitionNotices, { query: props.query, memory: props.noticeMemory, onCoordinate: coordinate }) : null,
    h('header', { className: 'pg-controller-bar' }, controllerBrand(),
      h('div', { className: 'pg-controller-workspace' },
        lineIcon('M1.75 4.25c0-.83.67-1.5 1.5-1.5h3l1.5 1.75h5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-9.5c-.83 0-1.5-.67-1.5-1.5v-7.75Z'),
        h('span', { className: 'pg-controller-workspace-text' },
          h('span', { 'aria-hidden': true }, selectedWorkspace ? selectedWorkspace.title || msg('未命名工作区', 'Untitled workspace') : msg('选择工作区', 'Select workspace')),
          selectedWorkspace?.path ? h('small', { id: 'pg-controller-workspace-path', title: selectedWorkspace.path }, selectedWorkspace.path) : null),
        lineIcon('M3 4.5 6 7.5l3-3', 12, '0 0 12 12'),
        h('select', { 'aria-label': msg('工作区', 'Workspace'), 'aria-describedby': selectedWorkspace?.path ? 'pg-controller-workspace-path' : undefined,
          value: workspaceId, disabled: busy || handoffBusy, onChange: async (event) => {
            if (dispatchControls.busy) return;
            if (event.target.value === '__add_workspace__') { setBusy(true); setError(''); try { await props.addTaskWorkspace(); } catch { setError('无法添加工作区，请重试。'); } finally { setBusy(false); } return; }
            selectWorkspace(event.target.value);
          } }, h('option', { value: '' }, msg('选择工作区', 'Select workspace')), workspaceOptions(workspaces.items),
          h('option', { value: '__add_workspace__', disabled: busy }, msg('添加工作区…', 'Add workspace…')))),
      h('nav', { className: 'pg-controller-tabs', role: 'tablist', 'aria-label': msg('Playground 导航', 'Playground navigation'), onKeyDown: (event) => { const ids = ['controller', 'catalog', 'submissions']; const index = Math.max(0, ids.indexOf(view)); if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; selectTab(ids[next]); event.currentTarget.querySelectorAll('[role=tab]')[next]?.focus(); } },
        [['controller', msg('主控', 'Controller')], ['catalog', msg('赛题', 'Challenges')], ['submissions', msg('提交', 'Submissions')]].map(([id, title]) => h('button', { key: id, className: 'pg-controller-tab', role: 'tab', tabIndex: view === id || (view === 'settings' && id === 'controller') ? 0 : -1, 'aria-selected': view === id, onClick: () => selectTab(id) }, title))),
      h('div', { className: 'pg-controller-account' },
        h(ReleaseIndicator, { checks: props.releaseChecks, active: view === 'controller', open: () => {
          setReleaseVisit(releaseVisit + 1); setView('settings');
        } }), h(LanguageMenu),
        h('button', { className: 'pg-controller-connection', title: msg('连接设置', 'Connection settings'), 'data-status': authStatus, onClick: () => setView('settings') },
          accountName ? h('span', { className: 'pg-controller-account-mark', title: accountName, 'aria-hidden': true }, Array.from(accountName).slice(0, 2).join('').toLocaleUpperCase()) : null,
          h('span', { className: 'pg-controller-connection-dot', 'aria-hidden': true }),
          { checking: msg('检查中…', 'Checking…'), authenticated: msg('已登录', 'Signed in'), unauthenticated: msg('未登录', 'Signed out'), unavailable: msg('检测失败', 'Check failed') }[authStatus]),
        view === 'controller' ? h('button', { className: 'pg-controller-icon', ref: (node) => { pane.toggle = node; }, title: showTasks ? msg('隐藏任务侧栏', 'Hide task sidebar') : msg('显示任务侧栏', 'Show task sidebar'), 'aria-label': showTasks ? msg('隐藏任务侧栏', 'Hide task sidebar') : msg('显示任务侧栏', 'Show task sidebar'), 'aria-expanded': showTasks, 'aria-controls': 'pg-controller-tasks', onClick: toggleTasks },
          h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: 'M15 4v16' }))) : null)),
    h('div', { className: 'pg-controller-body', ref: (node) => { pane.body = node; } },
      h('main', { className: 'pg-controller-chat', style: { display: view === 'controller' ? 'flex' : 'none' } },
        !expectedId ? controllerHeader() : null,
        !workspaceId ? h('div', { className: 'pg-controller-placeholder', role: workspaces.state === 'error' ? 'alert' : undefined }, workspaces.state === 'error' ? msg('无法读取工作区，请重启 DSH 后重试。', 'Could not load workspaces. Restart DSH and try again.') : workspaces.phase !== 'ready' ? msg('正在读取工作区…', 'Loading workspaces…') : msg('选择工作区以打开或创建主控对话。', 'Choose a workspace to open or create a controller chat.'), error ? h('p', { className: 'pg-controller-error', role: 'alert' }, error) : null)
          : !expectedId && workspaceId && error && !inspection ? h('div', { className: 'pg-controller-placeholder', role: 'alert' }, error, h('button', { className: 'pg-button', onClick: () => setRetry(retry + 1) }, msg('重试', 'Retry')))
          : !expectedId && workspaceId && !inspection ? h('div', { className: 'pg-controller-placeholder', role: 'status' }, msg('正在核对主控对话…', 'Checking controller chat…'))
          : !expectedId && workspaceId && inspection ? h('div', { className: 'pg-controller-placeholder' },
          h('p', null, inspection.kind === 'blocked' ? controllerMessage(inspection.reason) : inspection.archived ? msg('主控对话已归档，请先取消归档。', 'The controller chat is archived. Unarchive it to continue.') : msg('为此工作区打开或创建主控对话。', 'Open or create a controller chat for this workspace.')),
          inspection.kind !== 'blocked' && !inspection.archived ? h('button', { className: 'pg-button pg-primary', disabled: busy, onClick: open }, busy ? msg('正在打开…', 'Opening…') : inspection.kind === 'absent' ? msg('创建主控对话', 'Create controller chat') : msg('打开主控对话', 'Open controller chat')) : null,
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
        h('style', null, css), h('h1', null, msg('连接设置', 'Connection settings')), h(AuthStatusPanel, { ...props, onStatusChange: updateAuthStatus }),
        view === 'settings' ? h(CompetitionNoticeSetting, { memory: props.noticeMemory }) : null,
        visited.has('settings') ? h(ReleaseStatusPanel, { query: props.query, checks: props.releaseChecks,
          installRelease: props.installRelease, visit: releaseVisit }) : null),
      ['catalog', 'submissions'].map((section) => visited.has(section) ? h('div', { key: section, style: { display: view === section ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 } }, renderSlot('playground.library', { libraryOnly: true, section, active: view === section, ...(section === 'catalog' ? { handoff } : {}) })) : null),
      view === 'controller' && showTasks ? h(React.Fragment, null,
        h('div', { className: 'pg-controller-resize', role: 'separator', tabIndex: 0, 'aria-label': msg('调整任务侧栏宽度', 'Resize task sidebar'), 'aria-orientation': 'vertical', 'aria-valuemin': 300, 'aria-valuemax': 520, 'aria-valuenow': taskWidth,
          onKeyDown: (event) => { const next = { ArrowLeft: taskWidth + 10, ArrowRight: taskWidth - 10, Home: 300, End: 520 }[event.key]; if (next !== undefined) { event.preventDefault(); resize(next); } },
          onPointerDown: (event) => { pane.drag = { x: event.clientX, width: taskWidth }; event.currentTarget.setPointerCapture(event.pointerId); },
          onPointerMove: (event) => { if (pane.drag) resize(pane.drag.width + pane.drag.x - event.clientX); }, onPointerUp: () => { pane.drag = null; }, onPointerCancel: () => { pane.drag = null; } }),
        h('aside', { id: 'pg-controller-tasks', className: 'pg-controller-tasks', 'aria-label': msg('主控任务', 'Controller tasks'), style: { width: taskWidth }, onKeyDown: (event) => { if (event.key === 'Escape' && pane.body?.clientWidth <= 720) { toggleTasks(); pane.toggle?.focus(); } } },
          h('header', { className: 'pg-controller-task-head' },
            h('h2', { tabIndex: -1, ref: (node) => { pane.heading = node; } }, msg('主控任务', 'Controller tasks')),
            tasks?.kind === 'ready' ? h('span', { className: 'pg-controller-task-count' },
              msg(`${taskCount} 个 · ${challengeGroups.size} 道赛题`, `${taskCount} tasks · ${challengeGroups.size} challenges`)) : null,
            h('button', { type: 'button', className: 'pg-button pg-controller-refresh', disabled: !expectedId,
              'aria-label': msg('刷新任务', 'Refresh tasks'), onClick: () => setTaskRetry(taskRetry + 1) },
              lineIcon('M13 8a5 5 0 1 1-1.46-3.54M13 2.5v2.75h-2.75', 14))),
          h('div', { className: 'pg-controller-task-status' },
            tasks?.kind === 'ready' ? h('span', null, msg('状态更新于 ', 'Updated '), taskTime(taskSnapshot.updatedAt, language)) : null,
            h('span', { className: 'pg-controller-rule', 'aria-hidden': true }),
            evidenceMark('report', msg('报告', 'Report'), evidenceLabels.report),
            evidenceMark('host', msg('记录', 'Record'), evidenceLabels.host),
            evidenceMark('receipt', msg('回执', 'Receipt'), msg('平台回执', 'Platform receipt'))),
          h('div', { className: 'pg-controller-task-content' },
            !expectedId ? h('p', null, msg('打开主控后查看其派发的任务。', 'Open the controller to see the tasks it dispatched.')) : !tasks ? h('p', { role: 'status' }, msg('正在读取任务…', 'Loading tasks…'))
              : tasks.kind !== 'ready' ? h('p', { role: 'alert' }, msg('无法读取任务。', 'Could not load tasks.'), h('button', { className: 'pg-button', onClick: () => setTaskRetry(taskRetry + 1) }, msg('重试', 'Retry')))
              : row ? h('div', { className: 'pg-controller-detail' },
                h('button', { className: 'pg-button pg-controller-back', ref: (node) => { pane.back = node; }, onClick: () => { pane.focus = row.childId; setSelectedTask(''); } }, msg('返回任务', 'Back to tasks')),
                h('h3', null, row.label || msg('未命名任务', 'Untitled task')), h('p', null, [row.provider, taskState(row)].filter(Boolean).join(' · ')),
                h('p', null, row.challenge ? `${row.challenge.title || row.challenge.id} · ${row.challenge.id} · ${row.challenge.baseUrl}` : row.category === 'maintenance' ? msg('后台维护', 'Background maintenance') : msg('未关联赛题', 'No linked challenge')),
                childAddress ? h('button', { className: 'pg-button pg-controller-back', onClick: async () => {
                  setTaskActionStatus('');
                  try { await openTask(childAddress); }
                  catch { setTaskActionStatus('无法打开子智能体对话，请重试。'); }
                } }, msg('打开子智能体对话', 'Open subagent chat')) : null,
                row.state === 'unknown' ? h('p', null, msg('未收到结果通知，也未观察到本次运行记录。可能发生在重启后，这不表示任务失败。', 'No result notification or current run record is available. This can happen after a restart even if the task succeeded.')) : null,
                row.liveEnd ? h('p', null, msg(`${row.state === 'running' ? '上次' : '本次'}运行结束：${stopReasonLabels()[row.liveEnd.stopReason]?.detail || row.liveEnd.stopReason || '未知'}`, `${row.state === "running" ? "Previous" : "Current"} run ended: ${stopReasonLabels()[row.liveEnd.stopReason]?.detail || row.liveEnd.stopReason || "Unknown"}`)) : null,
                row.state === 'settled' && row.terminalText ? h('p', null, msg(`当前执行状态未知。已收到历史结果通知，不能作为本次运行已结束或比赛测评成功的依据。${typeof row.noticeStopReason === 'string' ? `历史通知的结束原因：${stopReasonLabels()[row.noticeStopReason]?.detail || row.noticeStopReason}` : ''}`, `Current run status is unknown. A previous result notification does not confirm that this run ended or that the challenge evaluation succeeded.${typeof row.noticeStopReason === 'string' ? ` Previous stop reason: ${stopReasonLabels()[row.noticeStopReason]?.detail || row.noticeStopReason}` : ''}`)) : null,
                row.state === 'running' && row.terminalText ? h('p', null, msg('正在运行。已收到的通知属于历史结果，不能作为本次运行已结束的依据。', 'Running. The available notification belongs to an earlier run.')) : null,
                taskOutput(row) ? h('div', { className: 'pg-controller-markdown' }, typeof renderFactorySlot === 'function' ? renderFactorySlot('conversation.chat.reasoning.content', { text: taskOutput(row), running: false }, { fallback: h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' } }, taskOutput(row)) }) : h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' } }, taskOutput(row))) : null,
                taskOutput(row) ? h('button', { className: 'pg-button pg-controller-back', onClick: async () => { try { await navigator.clipboard.writeText(taskOutput(row)); setTaskActionStatus('已复制结果'); } catch { setTaskActionStatus('无法复制，请选择文本后复制。'); } } }, msg('复制结果', 'Copy result')) : null,
                taskActionStatus ? h('p', { role: 'status' }, controllerMessage(taskActionStatus)) : null,
                row.terminalText ? h('details', { className: 'pg-controller-raw' }, h('summary', null, row.state !== 'ended' ? msg('历史原始通知', 'Original notification from an earlier run') : msg('原始通知', 'Original notification')), h('pre', null, row.terminalText)) : null)
              : !tasks.rows.length ? h('p', null, msg('还没有派发任务。', 'No tasks dispatched yet.')) : h(React.Fragment, null,
                [...challengeGroups].map(([key, group]) => taskGroup(key, group.rows,
                  msg(group.challenge.titleZh || group.challenge.title, group.challenge.title || group.challenge.titleZh) || group.challenge.id,
                  [group.challenge.id, group.challenge.baseUrl].filter(Boolean).join(' · '), true)),
                unassociated.length ? taskGroup('unassociated', unassociated, msg('未关联赛题', 'No linked challenge'),
                  msg('缺少明确的赛题关联', 'No confirmed challenge link')) : null,
                maintenance.length ? taskGroup('maintenance', maintenance, msg('后台维护', 'Background maintenance'), null, false, 'pg-controller-maintenance') : null),
            expectedId && props.codexChats ? h(ExternalCodexChats, { key: `${workspaceId}:${expectedId}`,
              workspaceId, sessionId: expectedId, query: props.codexChats, refresh: taskRetry }) : null))) : null),
    showHandoffDialog ? h(ControllerHandoffDialog, { state: dispatchState, workspaces, workspace: handoffWorkspace, busy: handoffBusy,
      selectWorkspace: selectHandoffWorkspace, addTaskWorkspace: props.addTaskWorkspace, message: handoffMessage, action: handoffAction,
      close: () => { if (!dispatchControls.busy) setDispatchState(null); } }) : null);

}

export { ControllerPanel, ControllerSession, ControllerSessionContent, TRAJECTORY_VIEW_ID };

