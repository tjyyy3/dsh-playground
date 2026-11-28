import { msg, usePluginLanguage } from '../shared/language.js';
import * as React from 'react';
import { h } from '../shared/react.js';
import { workspaceOptions } from '../shared/workspaces.js';
import { webRootOf } from '../shared/web-address.js';
import { css } from '../shared/styles.js';
import { AuthStatusPanel } from '../settings/auth.js';
import { LanguageMenu } from '../settings/language.js';
import { SettingsPage } from '../settings/page.js';
import { ReleaseStatusPanel, ReleaseIndicator } from '../settings/releases.js';
import { controllerMessage } from './messages.js';
import { codexCss, ExternalCodexChats } from './codex-chats.js';
import { ControllerHandoffDialog, noticeHandoffCopy } from './handoff.js';
import { CompetitionNotices, CompetitionNoticeSetting } from './competition-notices.js';
import { controllerPanelCss } from './styles.js';
import { HomePanel } from '../home/index.js';
import { taskEvidence } from './task-evidence.js';
import { calendarTime, challengeSubtitle, taskProvider, taskRowTime } from './task-presentation.js';

function lineIcon(path, size = 16, viewBox = '0 0 16 16') {
  return h('svg', { width: size, height: size, viewBox, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: path }));
}

function controllerBrand(onClick) {
  return h('button', { type: 'button', className: 'pg-controller-brand', onClick,
    'aria-label': msg('Playground 首页', 'Playground home') },
    h('svg', { width: 26, height: 26, viewBox: '0 0 26 26', fill: 'none', 'aria-hidden': true },
      h('rect', { x: 1, y: 1, width: 24, height: 24, rx: 6, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('path', { d: 'M5 13.5c2.1 0 2.1-6.5 4.2-6.5s2.1 12 4.3 12 2.1-8.5 4.2-8.5c1.3 0 1.9 3 3.3 3', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' })),
    h('strong', null, 'Playground'), h('small', null, 'DSH'));
}

function evidenceMark(evidence, label, description) {
  return h('span', { className: 'pg-controller-evidence', 'data-evidence': evidence, title: description }, label);
}

function groupHeading(title, rows, subtitle, summarize) {
  const running = rows.filter((row) => row.state === 'running').length;
  const received = rows.filter((row) => row.state !== 'running' && (row.terminalText ||
    row.liveEnd?.lastAssistantMessage?.some((part) => part.type === 'text' && part.text))).length;
  const summary = summarize ? msg(
    rows.length + ' 个任务 · ' + running + ' 运行中 · ' + received + ' 已回结果',
    rows.length + ' tasks · ' + running + ' running · ' + received + ' with results') : null;
  return h('summary', { className: 'pg-controller-group' }, lineIcon('M3.5 2 6.5 5l-3 3', 10, '0 0 10 10'),
    h('span', { className: 'pg-controller-group-label' }, h('span', null, title), subtitle ? h('small', null, subtitle) : null,
      summary ? h('small', { className: 'pg-controller-group-overview' }, summary) : null),
    summarize ? null : h('span', { className: 'pg-controller-task-count' }, rows.length));
}

function taskTime(stamp) {
  return stamp ? h('time', { dateTime: stamp.dateTime, title: stamp.title }, stamp.label) : null;
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

const PRIMARY_TABS = ['home', 'controller', 'catalog', 'submissions'];

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
  const [view, updateView] = React.useState(() => props.controllerSelection.view || 'home');
  const setView = (next) => {
    props.controllerSelection.view = next;
    updateView(next);
  };
  const [releaseVisit, setReleaseVisit] = React.useState(0);
  const [releaseAvailable, setReleaseAvailable] = React.useState(false);
  const settingsReturn = React.useRef('home');
  const settingsOpener = React.useRef(null);
  const restoreSettingsFocus = React.useRef(false);
  const openSettings = (event) => {
    if (view !== 'settings') {
      settingsReturn.current = view;
      settingsOpener.current = event?.currentTarget;
    }
    setView('settings');
  };
  const closeSettings = () => {
    restoreSettingsFocus.current = true;
    setReleaseVisit(0);
    setReleaseAvailable(false);
    setView(settingsReturn.current);
  };
  React.useLayoutEffect(() => {
    if (view === 'settings' || !restoreSettingsFocus.current) return;
    restoreSettingsFocus.current = false;
    settingsOpener.current?.focus();
    settingsOpener.current = null;
  }, [view]);
  const error = controllerMessage(errorMessage);
  const [dispatchState, setDispatchState] = React.useState(null);
  const [catalogNotice, setCatalogNotice] = React.useState(null);
  const [catalogDestination, setCatalogDestination] = React.useState(null);
  const workspacePicker = React.useRef(null);
  const selectTab = (tab) => {
    if (tab === 'catalog' && view !== 'catalog') setCatalogNotice(null);
    setView(tab);
  };
  const browse = (destination) => {
    setCatalogNotice(null);
    setCatalogDestination((previous) => ({ ...destination, visit: (previous?.visit ?? 0) + 1 }));
    setView('catalog');
  };
  const [dispatchControls] = React.useState(() => ({ busy: false }));
  const [authStatus, setAuthStatus] = React.useState('checking');
  const [accountName, setAccountName] = React.useState('');
  const [accountId, setAccountId] = React.useState(undefined);
  const [configuredBase, setConfiguredBase] = React.useState('');
  const [cliUpdate, setCliUpdate] = React.useState(null);
  const [updateAuthStatus] = React.useState(() => (status, user, baseUrl, update) => {
    setAuthStatus(status);
    if (status === 'checking') return;
    setAccountName(status === 'authenticated' ? user?.name || user?.email || '' : '');
    setAccountId(status === 'authenticated' ? user?.id : undefined);
    setConfiguredBase(baseUrl || '');
    setCliUpdate(update);
  });
  const [visited] = React.useState(() => new Set());
  if (view === 'catalog' || view === 'submissions') visited.add(view);
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
  const homeController = selectedWorkspace && inspection?.kind === 'existing' && !inspection.archived ? inspection.sessionId : '';
  const showController = () => {
    selectTab('controller');
    if (!homeController && !workspaceId) workspacePicker.current?.focus();
  };
  const showVersion = (event) => {
    setReleaseVisit((visit) => visit + 1);
    openSettings(event);
  };
  const handoffWorkspace = dispatchState?.coordination && dispatchState.workspaceId !== workspaceId ? undefined : selectedWorkspace;
  const selectedController = selectedWorkspace && inspection?.kind === 'existing' && !inspection.archived ? inspection.sessionId : '';
  const canInitialize = selectedWorkspace && (inspection?.kind === 'absent' || inspection?.kind === 'incomplete');
  const needsRecheck = dispatchState?.phase === 'error' && dispatchState.workspaceId === workspaceId &&
    (['controller_changed', 'controller_missing', 'controller_init_required', 'controller_archived', 'workspace_mismatch'].includes(dispatchState.code) ||
      dispatchState.coordination && ['controller_init_failed', 'controller_attach_failed', 'controller_open_failed'].includes(dispatchState.code) ||
      dispatchState.sessionId && inspection && dispatchState.sessionId !== selectedController);
  const recheckHandoff = () => {
    setDispatchState({ phase: 'guide', challenge: dispatchState.challenge, context: dispatchState.context, showDialog: true,
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
        setTaskSnapshot({ workspaceId: state.workspaceId, sessionId: state.sessionId, value, updatedAt: Date.now() });
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
  const startHandoff = (challenge, coordination, context) => {
    if (busy || dispatchControls.busy) return;
    if (coordination) {
      setDispatchState({ phase: 'guide', challenge, context, coordination, workspaceId: '', showDialog: true });
      return;
    }
    if (dispatchState?.phase === 'accepted' && dispatchState.challenge.id === challenge.id && dispatchState.workspaceId === workspaceId) return retryOpenAfterDispatch(dispatchState);
    const retry = dispatchState?.phase === 'error' && dispatchState.challenge.id === challenge.id && dispatchState.workspaceId === workspaceId;
    if (!retry) setDispatchState({ phase: 'guide', challenge, context, showDialog: true });
  };
  const coordinate = (target, notice) => {
    if (target.kind === 'challenge') return startHandoff({ id: target.challengeId, title: target.title }, { notice },
      { competition: msg(notice.titleZh || notice.title, notice.title || notice.titleZh), webBase: notice.scope });
    setCatalogNotice({ ...notice, target, visit: (catalogNotice?.visit ?? 0) + 1 });
    setView('catalog');
  };
  const handoff = { state: dispatchState, start: (challenge, notice, context) => startHandoff(challenge, catalogNotice ? { notice } : undefined, context), catalogNotice };
  const selectHandoffWorkspace = (id) => {
    if (workspaceId !== id || dispatchState.coordination && dispatchState.workspaceId !== id) {
      setDispatchState({ phase: 'guide', challenge: dispatchState.challenge, context: dispatchState.context,
        coordination: dispatchState.coordination, workspaceId: id, showDialog: true });
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
        ? { challenge: dispatchState.challenge, context: dispatchState.context } : dispatchState;
      const sessionId = state.sessionId || selectedController || (state.coordination && inspection.sessionId);
      const copy = state.coordination ? noticeHandoffCopy(inspection, handoffWorkspace, state.coordination.notice) : {
        label: selectedController ? msg('确认交给主控', 'Confirm handoff') : inspection.kind === 'incomplete' ? msg('初始化并交接', 'Initialize and hand off') : msg('创建主控并交接', 'Create controller and hand off'),
        message: canInitialize ? msg('DSH 会发送一条初始化消息，再把赛题交给主控。', 'DSH will send a setup message before handing the challenge to the controller.')
          : msg(`工作区「${handoffWorkspace.title || workspaceId}」的主控 ${selectedController} 将协调此题。交接后可在主控对话中查看派发进度。`,
            `Controller ${selectedController} in workspace “${handoffWorkspace.title || workspaceId}” will coordinate this challenge. Follow its progress in the controller chat.`),
      };
      handoffMessage = dispatchState.phase === 'error' && state === dispatchState ? controllerMessage(dispatchState.message) : copy.message;
      handoffAction = { label: copy.label, run: () => sendChallenge({ ...state, showDialog: true }, { workspaceId, sessionId }, !selectedController) };
    } else {
      handoffMessage = error || msg('正在核对工作区的主控对话…', 'Checking the workspace controller chat…');
      if (error) handoffAction = { label: msg('重新核对', 'Check again'), run: () => setRetry(retry + 1) };
    }
  }
  const handoffBase = showHandoffDialog && webRootOf(dispatchState.context?.webBase || configuredBase);
  const handoffChallengeId = showHandoffDialog && handoffWorkspace ? dispatchState.challenge.id : '';
  const [handoffTasks, setHandoffTasks] = React.useState(null);
  React.useEffect(() => {
    setHandoffTasks(null);
    if (!handoffChallengeId || !handoffBase || !selectedController || !controllerTasks) return;
    const abort = new AbortController();
    void controllerTasks({ workspaceId, sessionId: selectedController, includeChallengeId: handoffChallengeId }, abort.signal)
      .then((snapshot) => {
        if (abort.signal.aborted || snapshot?.kind !== 'ready') return;
        const count = snapshot.rows?.filter(({ challenge }) =>
          challenge?.id === handoffChallengeId && webRootOf(challenge.baseUrl) === handoffBase).length;
        setHandoffTasks({ workspaceId, sessionId: selectedController, challengeId: handoffChallengeId, base: handoffBase, retry, count });
      }).catch(() => {});
    return () => abort.abort();
  }, [workspaceId, selectedController, handoffChallengeId, handoffBase, retry, controllerTasks]);
  const handoffTaskCount = handoffTasks?.workspaceId === workspaceId && handoffTasks.sessionId === selectedController &&
    handoffTasks.challengeId === handoffChallengeId && handoffTasks.base === handoffBase && handoffTasks.retry === retry
    ? handoffTasks.count : undefined;
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
  const taskRows = tasks?.kind === 'ready' ? tasks.rows.filter(({ category }) => category !== 'maintenance') : undefined;
  const childAddress = expectedId && (row?.mode === 'continuable' || row?.mode === 'one-shot')
    ? { parentSessionId: expectedId, childSessionId: row.childId, mode: row.mode } : null;
  const evidenceLabels = {
    host: msg('宿主记录', 'Host record'),
    report: msg('Agent 报告', 'Agent report'),
    none: msg('无运行记录', 'No run record'),
  };
  const evidenceDescriptions = {
    host: msg('DSH 亲眼看到的运行（最可信）', 'Run observed by DSH (highest confidence)'),
    report: msg('子智能体自己说的结果，还没人核对', 'Result reported by the subagent and awaiting verification'),
    none: msg('既没看到运行也没收到结果', 'No run observed and no result received'),
  };
  const stateBadge = (item, compact = false) => {
    const label = taskState(item) || msg('状态未知', 'Status unknown');
    const tone = taskTone(item);
    const showResult = compact && tone === 'result' && item.state === 'ended' && item.terminalText;
    return h('span', { className: 'pg-badge', 'data-tone': tone, title: showResult ? label : undefined },
      showResult ? msg('已收到结果', 'Result received') : label);
  };
  const listRow = (item) => {
    const evidence = taskEvidence(item);
    const time = taskTime(taskRowTime(item, language));
    const provider = taskProvider(item.provider, language);
    return h('button', { type: 'button', key: item.childId, className: 'pg-controller-row',
      ref: (node) => { if (node) pane.rows.set(item.childId, node); else pane.rows.delete(item.childId); },
      onClick: () => { pane.focus = 'back'; setTaskActionStatus(''); setSelectedTask(item.childId); } },
      h('strong', null, item.label || msg('未命名任务', 'Untitled task')),
      h('span', { className: 'pg-controller-row-arrow', 'aria-hidden': true }, '›'),
      h('span', { className: 'pg-controller-row-meta' },
        stateBadge(item, true),
        evidenceMark(evidence, evidenceLabels[evidence], evidenceDescriptions[evidence]),
        provider || time ? h('span', { className: 'pg-controller-row-time' },
          provider, provider && time ? ' · ' : null, time) : null));
  };
  const detailEvidence = row && taskEvidence(row);
  const detailProvider = row && taskProvider(row.provider, language);
  const detailTime = row && taskTime(taskRowTime(row, language));
  const output = row && taskOutput(row);
  const taskGroup = (key, rows, title, subtitle, initiallyOpen = false, className = 'pg-controller-challenge') => {
    const open = groupOpen.get(key) ?? initiallyOpen;
    return h('details', { key, className, open,
      onToggle: (event) => {
        const expanded = event.currentTarget.open;
        if (expanded !== open) setGroupOpen((groups) => new Map(groups).set(key, expanded));
      } }, groupHeading(title, rows, subtitle, initiallyOpen),
      h('div', { className: 'pg-controller-group-rows' }, rows.map(listRow)));
  };
  const workspaceLoadError = msg('无法读取工作区，请重启 DSH 后重试。', 'Could not load workspaces. Restart DSH and try again.');
  const workspaceLoading = msg('正在读取工作区…', 'Loading workspaces…');
  const controllerChecking = msg('正在核对主控对话…', 'Checking controller chat…');
  const archivedController = msg('主控对话已归档，请先取消归档。', 'The controller chat is archived. Unarchive it to continue.');
  const emptyTaskRail = tasks?.kind === 'ready' && !tasks.rows.length || !expectedId && (
    workspaceId ? inspection?.kind === 'absent' : workspaces.phase === 'ready' && workspaces.state !== 'error'
  );
  let taskRailStatus;
  if (!expectedId && !emptyTaskRail) {
    if (!workspaceId) {
      taskRailStatus = workspaces.state === 'error' ? h('p', { role: 'alert' }, workspaceLoadError) : h('p', { role: 'status' }, workspaceLoading);
    } else if (inspection?.kind === 'blocked') {
      taskRailStatus = h('p', { role: 'alert' }, controllerMessage(inspection.reason));
    } else if (inspection?.archived) {
      taskRailStatus = h('p', { role: 'status' }, archivedController);
    } else if (error) {
      taskRailStatus = h('p', { role: 'alert' }, error, h('button', { className: 'pg-button', onClick: () => setRetry(retry + 1) }, msg('重试', 'Retry')));
    } else if (inspection?.kind === 'incomplete') {
      taskRailStatus = h('p', { role: 'status' }, msg('请先初始化此工作区的主控对话。', 'Set up the controller chat for this workspace first.'));
    } else {
      taskRailStatus = h('p', { role: 'status' }, controllerChecking);
    }
  }
  return h('div', { className: 'pg-controller' }, h('style', null, css + controllerPanelCss + codexCss),
    view === 'controller' ? h(CompetitionNotices, { query: props.query, memory: props.noticeMemory, onCoordinate: coordinate }) : null,
    h('header', { className: 'pg-controller-bar', style: view === 'settings' ? { display: 'none' } : undefined }, controllerBrand(() => selectTab('home')),
      h('div', { className: 'pg-controller-workspace' },
        lineIcon('M1.75 4.25c0-.83.67-1.5 1.5-1.5h3l1.5 1.75h5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-9.5c-.83 0-1.5-.67-1.5-1.5v-7.75Z'),
        h('span', { className: 'pg-controller-workspace-text' },
          h('span', { 'aria-hidden': true }, selectedWorkspace ? selectedWorkspace.title || msg('未命名工作区', 'Untitled workspace') : msg('选择工作区', 'Select workspace')),
          selectedWorkspace?.path ? h('small', { id: 'pg-controller-workspace-path', title: selectedWorkspace.path }, selectedWorkspace.path) : null),
        lineIcon('M3 4.5 6 7.5l3-3', 12, '0 0 12 12'),
        h('select', { 'aria-label': msg('工作区', 'Workspace'), 'aria-describedby': selectedWorkspace?.path ? 'pg-controller-workspace-path' : undefined,
          ref: workspacePicker, value: workspaceId, disabled: busy || handoffBusy, onChange: async (event) => {
            if (dispatchControls.busy) return;
            if (event.target.value === '__add_workspace__') { setBusy(true); setError(''); try { await props.addTaskWorkspace(); } catch { setError('无法添加工作区，请重试。'); } finally { setBusy(false); } return; }
            selectWorkspace(event.target.value);
          } }, h('option', { value: '' }, msg('选择工作区', 'Select workspace')), workspaceOptions(workspaces.items),
          h('option', { value: '__add_workspace__', disabled: busy }, msg('添加工作区…', 'Add workspace…')))),
      h('nav', { className: 'pg-controller-tabs', role: 'tablist', 'aria-label': msg('Playground 导航', 'Playground navigation'), onKeyDown: (event) => { const ids = PRIMARY_TABS; const index = Math.max(0, ids.indexOf(view)); if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length; selectTab(ids[next]); event.currentTarget.querySelectorAll('[role=tab]')[next]?.focus(); } },
        [['home', msg('首页', 'Home')], ['controller', msg('主控', 'Controller')], ['catalog', msg('赛题', 'Challenges')], ['submissions', msg('提交', 'Submissions')]].map(([id, title]) => h('button', { key: id, className: 'pg-controller-tab', role: 'tab', tabIndex: view === id ? 0 : -1, 'aria-selected': view === id, onClick: () => selectTab(id) }, title))),
      h('div', { className: 'pg-controller-account' },
        h(ReleaseIndicator, { checks: props.releaseChecks, active: view === 'controller', open: showVersion }), h(LanguageMenu),
        h('button', { className: 'pg-controller-connection', title: msg('连接设置', 'Connection settings'), 'data-status': authStatus, onClick: openSettings },
          accountName ? h('span', { className: 'pg-controller-account-mark', title: accountName, 'aria-hidden': true }, Array.from(accountName).slice(0, 2).join('').toLocaleUpperCase()) : null,
          h('span', { className: 'pg-controller-connection-dot', 'aria-hidden': true }),
          { checking: msg('检查中…', 'Checking…'), authenticated: msg('已登录', 'Signed in'), unauthenticated: msg('未登录', 'Signed out'), unavailable: msg('检测失败', 'Check failed') }[authStatus]),
        view === 'controller' ? h('button', { className: 'pg-controller-icon', ref: (node) => { pane.toggle = node; }, title: showTasks ? msg('隐藏任务侧栏', 'Hide task sidebar') : msg('显示任务侧栏', 'Show task sidebar'), 'aria-label': showTasks ? msg('隐藏任务侧栏', 'Hide task sidebar') : msg('显示任务侧栏', 'Show task sidebar'), 'aria-expanded': showTasks, 'aria-controls': 'pg-controller-tasks', onClick: toggleTasks },
          h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }), h('path', { d: 'M15 4v16' }))) : null)),
    h('div', { className: 'pg-controller-body', ref: (node) => { pane.body = node; } },
      view === 'home' ? h(HomePanel, { query: props.query, authStatus, account: accountId, workspace: selectedWorkspace,
        inspection, controllerId: homeController, taskRows, requestTask: props.requestTask,
        handoff: { state: dispatchState, start: (challenge) => startHandoff(challenge, undefined, { webBase: configuredBase }) },
        actions: { browse, controller: showController, submissions: () => selectTab('submissions'),
          settings: openSettings, versions: showVersion, recheck: () => setRetry(retry + 1),
          focusWorkspace: () => workspacePicker.current?.focus() } }) : null,
      h('main', { className: 'pg-controller-chat', style: { display: view === 'controller' ? 'flex' : 'none' } },
        !expectedId ? controllerHeader() : null,
        !workspaceId ? h('div', { className: 'pg-controller-placeholder', role: workspaces.state === 'error' ? 'alert' : undefined }, workspaces.state === 'error' ? workspaceLoadError : workspaces.phase !== 'ready' ? workspaceLoading : msg('选择工作区以打开或创建主控对话。', 'Choose a workspace to open or create a controller chat.'), error ? h('p', { className: 'pg-controller-error', role: 'alert' }, error) : null)
          : !expectedId && workspaceId && error && !inspection ? h('div', { className: 'pg-controller-placeholder', role: 'alert' }, error, h('button', { className: 'pg-button', onClick: () => setRetry(retry + 1) }, msg('重试', 'Retry')))
          : !expectedId && workspaceId && !inspection ? h('div', { className: 'pg-controller-placeholder', role: 'status' }, controllerChecking)
          : !expectedId && workspaceId && inspection ? h('div', { className: 'pg-controller-placeholder' },
          h('p', null, inspection.kind === 'blocked' ? controllerMessage(inspection.reason) : inspection.archived ? archivedController : msg('为此工作区打开或创建主控对话。', 'Open or create a controller chat for this workspace.')),
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
      h(SettingsPage, { active: view === 'settings', brand: controllerBrand(closeSettings), onBack: closeSettings,
        checks: props.releaseChecks, configuredBase, authStatus, cliUpdate, releaseAvailable, releaseVisit },
        h(AuthStatusPanel, { ...props, settings: true, active: view === 'settings', onStatusChange: updateAuthStatus }),
        view === 'settings' ? h(CompetitionNoticeSetting, { memory: props.noticeMemory }) : null,
        view === 'settings' ? h(ReleaseStatusPanel, { query: props.query, checks: props.releaseChecks,
          installRelease: props.installRelease, visit: releaseVisit, onAvailable: setReleaseAvailable }) : null),
      ['catalog', 'submissions'].map((section) => visited.has(section) ? h('div', { key: section, style: { display: view === section ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 } }, renderSlot('playground.library', { libraryOnly: true, section, active: view === section, ...(section === 'submissions' ? { account: authStatus === 'authenticated' ? accountId : undefined, accountName } : {}), ...(section === 'catalog' ? { handoff, catalogDestination, controllerRows: tasks?.kind === 'ready' ? tasks.rows : undefined, account: authStatus === 'authenticated' ? accountId : undefined } : {}) })) : null),
      view === 'controller' && showTasks ? h(React.Fragment, null,
        h('div', { className: 'pg-controller-resize', role: 'separator', tabIndex: 0, 'aria-label': msg('调整任务侧栏宽度', 'Resize task sidebar'), 'aria-orientation': 'vertical', 'aria-valuemin': 300, 'aria-valuemax': 520, 'aria-valuenow': taskWidth,
          onKeyDown: (event) => { const next = { ArrowLeft: taskWidth + 10, ArrowRight: taskWidth - 10, Home: 300, End: 520 }[event.key]; if (next !== undefined) { event.preventDefault(); resize(next); } },
          onPointerDown: (event) => { pane.drag = { x: event.clientX, width: taskWidth }; event.currentTarget.setPointerCapture(event.pointerId); },
          onPointerMove: (event) => { if (pane.drag) resize(pane.drag.width + pane.drag.x - event.clientX); }, onPointerUp: () => { pane.drag = null; }, onPointerCancel: () => { pane.drag = null; } }),
        h('aside', { id: 'pg-controller-tasks', className: 'pg-controller-tasks', 'aria-label': msg('派出的任务', 'Dispatched tasks'), style: { width: taskWidth }, onKeyDown: (event) => { if (event.key === 'Escape' && pane.body?.clientWidth <= 720) { toggleTasks(); pane.toggle?.focus(); } } },
          h('header', { className: 'pg-controller-task-head' },
            h('h2', { tabIndex: -1, ref: (node) => { pane.heading = node; } }, msg('派出的任务', 'Dispatched tasks')),
            tasks?.kind === 'ready' && taskCount > 0 ? h('span', { className: 'pg-controller-task-count' },
              msg(`${taskCount} 个 · ${challengeGroups.size} 道赛题`, `${taskCount} tasks · ${challengeGroups.size} challenges`)) : null,
            h('button', { type: 'button', className: 'pg-button pg-controller-refresh', disabled: !expectedId,
              'aria-label': msg('刷新任务', 'Refresh tasks'), onClick: () => setTaskRetry(taskRetry + 1) },
              lineIcon('M13 8a5 5 0 1 1-1.46-3.54M13 2.5v2.75h-2.75', 14)),
            h('details', { className: 'pg-controller-evidence-info' },
              h('summary', null, h('span', { 'aria-hidden': true }, 'ⓘ'), msg('状态从哪来', 'Status sources')),
              h('ul', null, Object.entries(evidenceLabels).map(([kind, label]) => h('li', { key: kind },
                evidenceMark(kind, label), h('span', null, evidenceDescriptions[kind])))))),
          h('p', { className: 'pg-controller-task-intro' }, msg(
            '主控把题拆成子任务，交给 Codex 或 DSH 子智能体去做；这里看每个子任务做到哪、结果回来没有。提交评测不在这里。',
            'The controller assigns subtasks to Codex or DSH subagents. Follow their progress and results here. Evaluation is under Submissions.')),
          tasks?.kind === 'ready' ? h('div', { className: 'pg-controller-task-status' },
            h('span', null, msg('状态更新于 ', 'Updated '), taskTime(calendarTime(taskSnapshot.updatedAt, language))),
            h('span', { className: 'pg-controller-rule', 'aria-hidden': true })) : null,
          h('div', { className: 'pg-controller-task-content' },
            taskRailStatus ?? (emptyTaskRail ? h('div', { className: 'pg-controller-task-empty' },
              h('h3', null, msg('还没有派出的任务', 'No dispatched tasks yet')),
              h('ol', null,
                h('li', null, msg('在「赛题」选一道题，点「交给主控」', 'Choose a challenge and select “Hand off to controller.”')),
                h('li', null, msg('在对话里说：「把这道题交给 Codex，先读题列验证计划」', 'In the chat, say “Give this challenge to Codex. Read it and draft a validation plan first.”')),
                h('li', null, msg('主控派出的子任务会按赛题出现在这里', 'The assigned subtasks appear here by challenge.'))),
              h('button', { type: 'button', className: 'pg-button pg-primary', onClick: () => browse() }, msg('去选题', 'Choose a challenge')))
              : !tasks ? h('p', { role: 'status' }, msg('正在读取任务…', 'Loading tasks…'))
              : tasks.kind !== 'ready' ? h('p', { role: 'alert' }, msg('无法读取任务。', 'Could not load tasks.'), h('button', { className: 'pg-button', onClick: () => setTaskRetry(taskRetry + 1) }, msg('重试', 'Retry')))
              : row ? h('div', { className: 'pg-controller-detail' },
                h('button', { className: 'pg-button pg-controller-back', ref: (node) => { pane.back = node; }, onClick: () => { pane.focus = row.childId; setSelectedTask(''); } }, msg('返回任务', 'Back to tasks')),
                h('div', { className: 'pg-controller-detail-title' },
                  h('p', { className: 'pg-controller-detail-context' }, row.challenge
                    ? [msg(row.challenge.titleZh || row.challenge.title, row.challenge.title || row.challenge.titleZh),
                      challengeSubtitle(row.challenge, configuredBase)].filter(Boolean).join(' · ')
                    : row.category === 'maintenance' ? msg('后台维护', 'Background maintenance') : msg('没有对上赛题的任务', 'Tasks without a challenge link')),
                  h('h3', null, row.label || msg('未命名任务', 'Untitled task')),
                  h('div', { className: 'pg-controller-detail-meta' }, stateBadge(row),
                    evidenceMark(detailEvidence, evidenceLabels[detailEvidence], evidenceDescriptions[detailEvidence]),
                    detailProvider ? h('span', { className: 'pg-controller-detail-provider' }, detailProvider) : null,
                    detailTime)),
                childAddress ? h('button', { className: 'pg-button pg-controller-back', onClick: async () => {
                  setTaskActionStatus('');
                  try { await openTask(childAddress); }
                  catch { setTaskActionStatus('无法打开子智能体对话，请重试。'); }
                } }, msg('打开子智能体对话', 'Open subagent chat')) : null,
                row.state === 'unknown' ? h('p', null, msg('未收到结果通知，也未观察到本次运行记录。可能发生在重启后，这不表示任务失败。', 'No result notification or current run record is available. This can happen after a restart even if the task succeeded.')) : null,
                row.liveEnd ? h('p', null, msg(`${row.state === 'running' ? '上次' : '本次'}运行结束：${stopReasonLabels()[row.liveEnd.stopReason]?.detail || row.liveEnd.stopReason || '未知'}`, `${row.state === "running" ? "Previous" : "Current"} run ended: ${stopReasonLabels()[row.liveEnd.stopReason]?.detail || row.liveEnd.stopReason || "Unknown"}`)) : null,
                row.state === 'settled' && row.terminalText ? h('p', null, msg(`当前执行状态未知。已收到历史结果通知，不能作为本次运行已结束或比赛测评成功的依据。${typeof row.noticeStopReason === 'string' ? `历史通知的结束原因：${stopReasonLabels()[row.noticeStopReason]?.detail || row.noticeStopReason}` : ''}`, `Current run status is unknown. A previous result notification does not confirm that this run ended or that the challenge evaluation succeeded.${typeof row.noticeStopReason === 'string' ? ` Previous stop reason: ${stopReasonLabels()[row.noticeStopReason]?.detail || row.noticeStopReason}` : ''}`)) : null,
                row.state === 'running' && row.terminalText ? h('p', null, msg('正在运行。已收到的通知属于历史结果，不能作为本次运行已结束的依据。', 'Running. The available notification belongs to an earlier run.')) : null,
                output ? h('section', { className: 'pg-controller-result' },
                  h('h4', null, msg('返回结果', 'Result')),
                  h('div', { className: 'pg-controller-markdown' }, typeof renderFactorySlot === 'function'
                    ? renderFactorySlot('conversation.chat.reasoning.content', { text: output, running: false }, { fallback: h('pre', null, output) })
                    : h('pre', null, output)),
                  h('button', { className: 'pg-button pg-controller-back', onClick: async () => {
                    try { await navigator.clipboard.writeText(output); setTaskActionStatus('已复制结果'); }
                    catch { setTaskActionStatus('无法复制，请选择文本后复制。'); }
                  } }, msg('复制结果', 'Copy result'))) : null,
                taskActionStatus ? h('p', { role: 'status' }, controllerMessage(taskActionStatus)) : null,
                row.terminalText ? h('details', { className: 'pg-controller-raw' }, h('summary', null, row.state !== 'ended' ? msg('历史原始通知', 'Original notification from an earlier run') : msg('原始通知', 'Original notification')), h('pre', null, row.terminalText)) : null)
              : h(React.Fragment, null,
                [...challengeGroups].map(([key, group]) => taskGroup(key, group.rows,
                  msg(group.challenge.titleZh || group.challenge.title, group.challenge.title || group.challenge.titleZh) || group.challenge.id,
                  challengeSubtitle(group.challenge, configuredBase), true)),
                unassociated.length ? taskGroup('unassociated', unassociated, msg('没有对上赛题的任务', 'Tasks without a challenge link'),
                  msg('主控派活时没登记是哪道题', 'The controller did not record a challenge for these tasks')) : null,
                maintenance.length ? taskGroup('maintenance', maintenance, msg('后台维护', 'Background maintenance'), null, false, 'pg-controller-maintenance') : null)),
            expectedId && props.codexChats ? h(ExternalCodexChats, { key: `${workspaceId}:${expectedId}`,
              workspaceId, sessionId: expectedId, query: props.codexChats, refresh: taskRetry }) : null))) : null),
    showHandoffDialog ? h(ControllerHandoffDialog, { state: dispatchState, workspaces, workspace: handoffWorkspace, busy: handoffBusy,
      inspection: handoffWorkspace ? inspection : null, inspectionFailed: Boolean(error), inspectController, query: props.query, checkAttempt: retry, taskCount: handoffTaskCount,
      selectWorkspace: selectHandoffWorkspace, addTaskWorkspace: props.addTaskWorkspace, message: handoffMessage, action: handoffAction,
      close: () => { if (!dispatchControls.busy) setDispatchState(null); } }) : null);

}

export { ControllerPanel, ControllerSession, ControllerSessionContent, TRAJECTORY_VIEW_ID };

