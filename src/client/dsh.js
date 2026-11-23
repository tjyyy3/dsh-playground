import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { h } from './shared/react.js';
import { queryFailure, safeMessage } from './shared/errors.js';
import { locales } from './shared/locale.js';
import { ControllerPanel, ControllerSession, ControllerSessionContent, TRAJECTORY_VIEW_ID } from './controller/index.js';
import { PlaygroundWorkbench } from './workbench.js';
import { TaskStartOverlay } from './tasks/start.js';
import { PlaygroundToolCard } from './cards/tool.js';
import { ControllerWelcome, PlaygroundCommandCard } from './cards/command.js';

function PlaygroundPanelIcon({ size = 20 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
    h('path', { d: 'M8 3h8M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M7 15h10' }));
}

// uiWorkspace.archiveSession throws WorkspaceArchiveError carrying the host rpcError (read from the error, not
// its class: bundles do not share classes). `workspace/session-active` covers any running work in the
// conversation (turns, subagents, background jobs, schedules), not only a visible running turn. Errors without
// an rpcError, such as unarchiveSession's "workspace session unarchive failed: <code>: <message>", get only
// the generic message.
async function changeArchive(uiWorkspace, method, sessionId) {
  const verb = method === 'archiveSession' ? '归档' : '取消归档';
  if (typeof uiWorkspace?.[method] !== 'function') return { ok: false, message: `当前 DSH 版本不支持${verb}对话。` };
  try {
    await uiWorkspace[method](sessionId);
    return { ok: true };
  } catch (failure) {
    const rpcError = failure?.rpcError;
    if (rpcError?.code === 'workspace/session-active') return { ok: false, message: '对话还有运行中的工作（回复、子代理、后台作业或定时任务），停止后再归档。' };
    const detail = typeof rpcError?.message === 'string' ? safeMessage(rpcError.message) : undefined;
    return { ok: false, message: detail ? `${verb}未完成：${detail}。请重试。` : `${verb}未完成，请重试。` };
  }
}

const plugin = {
  inject: ['slots', 'locale', 'remote', 'remote.commands', 'remote.credentials', 'connection', 'uiWorkspace', 'workspaces', 'layout', 'sessions', 'configForms'],
  apply(ctx) {
    const taskRequest = createSnapshotStore(null);
    const controllerTarget = createSnapshotStore(null);
    const controllerSelection = { workspaceId: '', sessionId: '' };
    const developerTools = ctx.configForms?.developerTools?.enabled;
    const controllerTrajectory = {
      getSnapshot: () => developerTools?.getSnapshot() === true
        && ctx.slots.entries('conversation.view').some(({ options }) => options.id === TRAJECTORY_VIEW_ID),
      subscribe(listener) {
        const disposeDeveloperTools = developerTools?.subscribe(listener);
        const disposeView = ctx.slots.subscribe('conversation.view', listener);
        return () => { disposeDeveloperTools?.(); disposeView(); };
      },
    };
    const requestHost = async (method, input, signal) => {
      const result = await ctx.connection.rpc.call('/api', `playgroundQueries/${method}`, { args: { input } }, signal)
        .catch(() => ({ ok: false, error: { code: 'transport' } }));
      if (result.ok) return result.value;
      throw new Error(queryFailure(result.error));
    };
    const actions = {
      controllerSelection,
      clearControllerTarget: (target) => { if (controllerTarget.getSnapshot() === target) controllerTarget.set(null); },
      requestTask: (request) => taskRequest.set(request),
      closeTaskStart: () => taskRequest.set(null),
      addTaskWorkspace: async () => {
        const path = await ctx.uiWorkspace.pickDirectory();
        return path ? ctx.workspaces.create({ path }) : null;
      },
      openTask: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
      openControllerChat: (sessionId, workspaceId) => {
        if (workspaceId) controllerSelection.workspaceId = workspaceId;
        if (workspaceId !== undefined) controllerTarget.set({ workspaceId, sessionId });
        const opened = ctx.uiWorkspace.openSession(sessionId);
        ctx.layout.selectPanel('playground');
        return opened;
      },
      promoteController: (input) => requestHost('promoteController', input),
      controllerTasks: (input, signal) => requestHost('controllerTasks', input, signal),
      dispatchChallenge: (input, signal) => requestHost('dispatchChallenge', input, signal),
      inspectController: (input, signal) => requestHost('inspectController', input, signal),
      openController: (input) => requestHost('openController', input),
      // DSH's own archive, the one its sidebar uses. Running work is refused by the host, never stopped
      // from here. Both resolve to { ok } and report failures as a short message instead of throwing.
      archiveTask: (sessionId) => changeArchive(ctx.uiWorkspace, 'archiveSession', sessionId),
      unarchiveTask: (sessionId) => changeArchive(ctx.uiWorkspace, 'unarchiveSession', sessionId),
      openChat: () => ctx.layout.selectPanel(null),
      openWorkbench: async (sessionId) => {
        await ctx.uiWorkspace.openSession(sessionId);
        ctx.layout.selectPanel('playground');
      },
      refreshProjections: (sessionId) => ctx.sessions.refreshProjections(sessionId),
      query: (input, signal) => requestHost('query', input, signal),
      materials: (input) => requestHost('materials', input),
      submission: (input) => requestHost('submission', input),
      run: async (sessionId, input) => {
        const result = await ctx.remote.commands.execute(sessionId, `/playground ${JSON.stringify(input)}`, []);
        if (!result.ok) throw new Error(result.error.message);
        if (!result.value) throw new Error('Playground 命令未注册，请重启 DSH 加载插件。');
        const text = result.value.result.text;
        if (!text?.startsWith('{')) throw new Error(text || 'Playground 未返回操作结果。');
        return JSON.parse(text);
      },
      // Session-free: the password goes to the DSH credential store, never into the call or a conversation.
      // It is only needed for this one CLI login, so it is removed from the store afterwards, whatever the outcome.
      login: async (email, password) => {
        try {
          await ctx.remote.credentials.set('PLAYGROUND_PASSWORD', password);
          const result = await ctx.connection.rpc.call('/api', 'playgroundQueries/login', { args: { input: { email } } })
            .catch(() => ({ ok: false, error: { code: 'transport' } }));
          if (!result.ok) throw new Error(queryFailure(result.error));
          if (result.value?.ok === false) throw new Error(safeMessage(result.value.error?.message) || 'Playground 登录失败，请重试。');
          return result.value;
        } finally {
          await Promise.resolve().then(() => ctx.remote.credentials.unset?.('PLAYGROUND_PASSWORD')).catch(() => {});
        }
      },
      // The API token goes only to the DSH credential store, never into an RPC, a command or a conversation.
      // The Host reads it from there per operation, for its own requests and for the CLI it starts.
      saveToken: async (value) => {
        const token = typeof value === 'string' ? value.trim() : '';
        if (!token) throw new Error('请先粘贴 API 令牌。');
        if (/\s/.test(token)) throw new Error('令牌中不能有空格或换行，请从网站重新复制。');
        try { await ctx.remote.credentials.set('PLAYGROUND_TOKEN', token); }
        catch { throw new Error('无法把令牌保存到 DSH 凭据存储，请重试。'); }
      },
      // Clears only the DSH copy; the CLI credentials file is never modified.
      clearToken: async () => {
        try { await ctx.remote.credentials.unset('PLAYGROUND_TOKEN'); }
        catch { throw new Error('无法清除 DSH 凭据存储中的令牌，请重试。'); }
      },
    };
    ctx.effect(() => ctx.locale.register('playground', Object.fromEntries(
      Object.entries(locales).map(([language, messages]) => [language, Object.fromEntries(
        Object.entries(messages).flatMap(([key, value]) => typeof value === 'string'
          ? [[key, value]]
          : Object.entries(value).map(([childKey, text]) => [`${key}.${childKey}`, text])),
      )]),
    )));
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: 'playground', locale: 'playground', inject: () => ({ ...actions, hooks: { controllerTarget } }),
      children: { 'playground.controller.session': { kind: 'single', scope: 'session-maybe' }, 'playground.library': { kind: 'single', scope: 'root' } },
    }, ControllerPanel));
    ctx.slots.inject('playground.library', () => ctx.slots.register({ name: 'playground.library', locale: 'playground', inject: () => actions }, PlaygroundWorkbench));
    ctx.slots.inject('playground.controller.session', () => ctx.slots.register({
      name: 'playground.controller.session', children: { 'playground.controller.content': { kind: 'single', scope: 'session' } },
    }, ControllerSession));
    ctx.slots.inject('conversation.view', () => ctx.slots.inject('playground.controller.content', () => {
      // Its owner has registered the shared Session store by the time it declares conversation.view.
      const store = ctx.slots.entries('conversation.session').find((entry) => entry.children?.['conversation.view'])?.store;
      return ctx.slots.register({ name: 'playground.controller.content', store: typeof store === 'object' ? store : undefined,
        inject: () => ({ hooks: { controllerTrajectory } }) }, ControllerSessionContent);
    }));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: 'playground', order: 20, label: () => 'Playground', locale: 'playground',
    }, PlaygroundPanelIcon));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay', id: 'playground.task-start', inject: () => ({ ...actions, hooks: { taskRequest } }),
    }, TaskStartOverlay));
    ctx.slots.inject('tool.call.toolview', function* () {
      for (const toolName of Object.keys(locales.en.tools)) {
        yield ctx.slots.register({ name: 'tool.call.toolview', key: toolName, locale: 'playground', inject: () => actions }, PlaygroundToolCard);
      }
    });
    ctx.slots.inject('conversation.chat.commandview', function* () {
      for (const key of ['playground', 'playground-confirm', 'playground-auth-login']) {
        yield ctx.slots.register({ name: 'conversation.chat.commandview', key, inject: () => actions }, PlaygroundCommandCard);
      }
      yield ctx.slots.register({ name: 'conversation.chat.commandview', key: 'playground-controller' }, ControllerWelcome);
    });
  },
};

export { plugin };

