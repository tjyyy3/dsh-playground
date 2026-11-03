import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaygroundClient } from '../lib/api.js';
import { registerWorkbenchQueries } from '../lib/queries.js';
import { createWorkflow, workflowProjection } from '../lib/workflow.js';

let fixtureId = 0;
const settle = () => new Promise((resolve) => setImmediate(resolve));
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node?.props?.children || []).flat(Infinity).map(text).join(' ');
}
function findAll(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const child of (node.props?.children || []).flat(Infinity)) findAll(child, predicate, found);
  return found;
}

async function clientFixture(t, services = {}) {
  let plugin;
  const states = new Map();
  const effects = [];
  let hooks;
  let cursor;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (initial) => {
      const values = hooks;
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (value) => { values[index] = value; }];
    },
    // Effects are collected, not run; a test runs them to simulate mounting.
    useEffect: (effect, deps) => { effects.push(Object.assign(() => effect(), { deps })); }, Fragment: Symbol('fragment'),
  };
  t.after(() => { delete globalThis.window; });
  globalThis.window = { __ModuleLoader__: { load: (module) => { plugin = module.factory((name) => {
    if (name === 'react') return React;
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: 'native-modal' };
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: (initial) => {
      let value = initial;
      return { getSnapshot: () => value, set: (next) => { value = next; } };
    } };
    throw Error(name);
  }); } } };
  await import(`../client.js?fixture=${fixtureId++}`);
  const registrations = new Map();
  plugin.apply({ effect: () => {}, ...services, slots: {
    inject: (_name, fn) => { const result = fn(); if (result?.next) [...result]; },
    register: (definition, Component) => { registrations.set(definition.name === 'main' ? 'main' : definition.id || definition.key || definition.name, { definition, Component }); },
  } });
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of (node.props?.children || []).flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  }
  function render(Component, props) {
    if (!states.has(Component)) states.set(Component, []);
    hooks = states.get(Component);
    cursor = 0;
    return Component(props);
  }
  const unmount = (Component) => states.delete(Component);
  // Render the workbench for one source session and return its panels.
  function workbench(sessionId, access = true) {
    const main = registrations.get('main');
    const tree = render(main.Component, { ...main.definition.inject(),
      useSessions: (select) => select({ ids: sessionId ? [sessionId] : [], byId: sessionId ? { [sessionId]: { id: sessionId } } : {}, projectionsBySession: {} }),
      useSessionAccess: () => access, refreshProjections: async () => {} });
    return { auth: find(tree, (node) => node.type?.name === 'AuthStatusPanel'), catalog: find(tree, (node) => node.type?.name === 'CatalogPanel') };
  }
  // Fresh mount of a panel: discard its state, render, then run its mount effects.
  async function mount(element) {
    unmount(element.type);
    effects.length = 0;
    render(element.type, element.props);
    effects.splice(0).forEach((effect) => effect());
    await settle();
    return render(element.type, element.props);
  }
  return { registrations, find, render, unmount, effects, workbench, mount };
}

test('F-01: opening a task drawer preserves confirmation actions and closes correctly', async (t) => {
  const { registrations, find, render } = await clientFixture(t);
  const Main = registrations.get('main').Component;
  const calls = [];
  const session = { id: 's', displayTitle: 'Playground · Fixture', retainedBy: { mainView: 1 } };
  const state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'participate' }, prepared: {
    checkId: 'checked', challenge: { id: 'fixture', title: 'Fixture' }, args: {}, files: [],
  }, receipt: null };
  const props = { useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask: state } } } }),
    useSessionAccess: () => true, refreshProjections: async () => {}, run: async (...args) => { calls.push(args); return { ok: true }; }, openTask: () => {}, openChat: () => {}, login: async () => {}, t: (s) => s };
  const tree = render(Main, props);
  assert.equal(find(tree, (n) => n.type?.name === 'TaskDetailDrawer'), undefined);
  const row = find(tree, (n) => n.type?.name === 'TaskSummaryRow');
  render(row.type, row.props).props.onClick();
  const drawer = find(render(Main, props), (n) => n.type?.name === 'TaskDetailDrawer');
  const drawerTree = render(drawer.type, drawer.props);
  const selected = find(drawerTree, (n) => n.type?.name === 'SelectedTask');
  const task = render(selected.type, selected.props);
  const taskTree = render(task.type, task.props);
  const button = find(taskTree, (n) => n.type === 'button' && n.props.children.includes('确认目标并提交'));
  await button.props.onClick();
  assert.deepEqual(calls, [['s', 'checked', true]]);
  find(drawerTree, (n) => n.type === 'button' && n.props['aria-label'] === '关闭任务详情').props.onClick();
  assert.equal(find(render(Main, props), (n) => n.type?.name === 'TaskDetailDrawer'), undefined);
});

// Open the task drawer for one session in the given workflow state and render its TaskWorkflow.
function taskDrawer(f, getState, run, { access = true, running = false } = {}) {
  const Main = f.registrations.get('main').Component;
  const session = { id: 's', displayTitle: 'Playground · Fixture', retainedBy: { mainView: 1 }, running };
  const props = { useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask: getState() } } } }),
    useSessionAccess: () => access, refreshProjections: async () => {}, run, openTask: () => {}, openChat: () => {}, login: async () => {}, t: (s) => s };
  const row = f.find(f.render(Main, props), (n) => n.type?.name === 'TaskSummaryRow');
  f.render(row.type, row.props).props.onClick();
  return () => {
    const drawer = f.find(f.render(Main, props), (n) => n.type?.name === 'TaskDetailDrawer');
    const selected = f.find(f.render(drawer.type, drawer.props), (n) => n.type?.name === 'SelectedTask');
    const task = f.render(selected.type, selected.props);
    return f.render(task.type, task.props);
  };
}
const buttonLabeled = (f, tree, label) => f.find(tree, (n) => n.type === 'button' && text(n).includes(label));

test('task details offer no working-mode selector for a participation task', async (t) => {
  const f = await clientFixture(t);
  const state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'participate' }, prepared: null, receipt: null };
  const tree = taskDrawer(f, () => state, async () => ({ ok: true }))();
  assert.equal(f.find(tree, (n) => n.type === 'select'), undefined);
  assert.doesNotMatch(text(tree), /工作模式|切回参赛/);
  assert.ok(buttonLabeled(f, tree, '准备提交 / 检查材料'));
});

test('an author-mode task shows its note and switches back to participation through the mode action', async (t) => {
  const f = await clientFixture(t);
  const calls = [];
  let state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'author' }, prepared: null, receipt: null };
  const run = async (...args) => { calls.push(args); state = { ...state, task: { ...state.task, mode: args[1].mode } }; return { ok: true }; };
  const workflow = taskDrawer(f, () => state, run);
  let tree = workflow();
  assert.equal(f.find(tree, (n) => n.type === 'select'), undefined);
  assert.match(text(tree), /尚未接入平台出题修改与发布/);
  assert.equal(buttonLabeled(f, tree, '准备提交 / 检查材料'), undefined);
  await buttonLabeled(f, tree, '切回参赛').props.onClick();
  assert.deepEqual(calls, [['s', { action: 'mode', mode: 'participate' }, false]]);
  tree = workflow();
  assert.equal(buttonLabeled(f, tree, '切回参赛'), undefined);
  assert.ok(buttonLabeled(f, tree, '准备提交 / 检查材料'));
});

test('切回参赛 is disabled without session access or while the agent is running', async (t) => {
  const f = await clientFixture(t);
  const state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'author' }, prepared: null, receipt: null };
  const run = async () => assert.fail('a disabled switch-back ran a session command');
  const enabled = buttonLabeled(f, taskDrawer(f, () => state, run)(), '切回参赛');
  assert.equal(enabled.props.disabled, false);
  for (const [label, options, note] of [
    ['no access', { access: false }, /没有此会话的操作权限/],
    ['running', { running: true }, /此会话正在执行任务/],
  ]) {
    const tree = taskDrawer(f, () => state, run, options)();
    assert.equal(buttonLabeled(f, tree, '切回参赛').props.disabled, true, label);
    assert.match(text(tree), note, label);
  }
});

test('the workbench usage help names only the participation start', async (t) => {
  const f = await clientFixture(t);
  const main = f.registrations.get('main');
  const tree = f.render(main.Component, { ...main.definition.inject(),
    useSessions: (select) => select({ ids: [], byId: {}, projectionsBySession: {} }), useSessionAccess: () => true, refreshProjections: async () => {} });
  const help = f.find(tree, (n) => n.type === 'details' && n.props.className === 'pg-help');
  assert.match(text(help), /开始参赛任务/);
  assert.doesNotMatch(text(help), /开始出题任务/);
});

test('the confirmation card lists declared outcome, detail and author only for a new submission', async (t) => {
  const { registrations, find, render, unmount } = await clientFixture(t);
  const Main = registrations.get('main').Component;
  const session = { id: 's', displayTitle: 'Playground · Fixture', retainedBy: { mainView: 1 } };
  const card = (args) => {
    const state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'participate' }, prepared: {
      checkId: 'checked', challenge: { id: 'fixture', title: 'Fixture' }, args, files: [],
    }, receipt: null };
    const props = { useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask: state } } } }),
      useSessionAccess: () => true, refreshProjections: async () => {}, run: async () => ({ ok: true }), openTask: () => {}, openChat: () => {}, login: async () => {}, t: (s) => s };
    unmount(Main);
    const row = find(render(Main, props), (n) => n.type?.name === 'TaskSummaryRow');
    render(row.type, row.props).props.onClick();
    const drawer = find(render(Main, props), (n) => n.type?.name === 'TaskDetailDrawer');
    const selected = find(render(drawer.type, drawer.props), (n) => n.type?.name === 'SelectedTask');
    const task = render(selected.type, selected.props);
    unmount(task.type);
    return find(render(task.type, task.props), (n) => n.props?.['aria-label'] === 'Playground 提交确认');
  };
  const declared = { outcome: 'success', detail: ' Run notes ', author_name: 'Agent A' };
  assert.ok(text(card(declared)).includes('声明结果：success · 说明：Run notes · 署名：Agent A'));
  assert.ok(text(card({ detail: '--- notes' })).includes('说明：--- notes'));
  assert.doesNotMatch(text(card({ detail: '--- notes' })), /声明结果|署名/);
  assert.doesNotMatch(text(card({ ...declared, attempt_id: 7 })), /声明结果|说明：|署名/);
  assert.doesNotMatch(text(card({ detail: '  ' })), /声明结果|说明：|署名/);
  // A newline in an agent-supplied value must not render as a separate, fake card line.
  const line = find(card({ detail: 'x\n工作区：D:\\other' }), (n) => n.type === 'p' && n.props.children.some((child) => typeof child === 'string' && child.startsWith('说明：')));
  assert.deepEqual(line.props.children, ['说明：x 工作区：D:\\other']);
  assert.doesNotMatch(text(line), /[\r\n]/);
});

test('adding a task workspace uses the native picker and workspace registry; picker cancellation registers nothing', async (t) => {
  const calls = [];
  let path = null;
  const { registrations } = await clientFixture(t, {
    uiWorkspace: { pickDirectory: async () => { calls.push(['pick']); return path; } },
    workspaces: { create: async (input) => { calls.push(['register', input]); return { workspaceId: 'b', ...input }; } },
  });
  const actions = registrations.get('playground.task-start').definition.inject();
  assert.equal(await actions.addTaskWorkspace(), null);
  assert.deepEqual(calls, [['pick']]);
  path = '/workspace-b';
  assert.deepEqual(await actions.addTaskWorkspace(), { workspaceId: 'b', path });
  assert.deepEqual(calls, [['pick'], ['pick'], ['register', { path }]]);
});

test('task starts from catalog and chat cards request a workspace without creating a session', async (t) => {
  const { registrations, find, render } = await clientFixture(t);
  const requests = [];
  const run = async () => { throw Error('must not run before confirmation'); };
  const props = { sessionId: 'source', allowed: true, run, requestTask: (value) => requests.push(value), openChat: () => {} };
  const main = render(registrations.get('main').Component, {
    useSessions: (select) => select({ ids: ['source'], byId: { source: { id: 'source' } }, projectionsBySession: {} }),
    useSessionAccess: () => true, refreshProjections: async () => {}, ...props,
  });
  const catalog = find(main, (node) => node.type?.name === 'CatalogPanel');
  assert.equal(catalog.props.requestTask, props.requestTask);
  const card = render(registrations.get('playground_get_challenge').Component, {
    ...props, phase: 'result', toolName: 'playground_get_challenge',
    block: { meta: { playground: { ok: true, id: 'challenge', title: 'Challenge' } } }, t: (key) => key,
  });
  const start = find(card, (node) => node.type?.name === 'StartTaskButton');
  assert.ok(start);
  render(start.type, start.props).props.onClick();
  assert.deepEqual(requests, [{ id: 'challenge', title: 'Challenge', mode: 'participate', sessionId: 'source' }]);
});

test('workspace confirmation is required each time; cancellation and failed starts create no navigation', async (t) => {
  const { registrations, find, render, unmount } = await clientFixture(t);
  const overlay = registrations.get('playground.task-start');
  const actions = overlay.definition.inject();
  let items = [{ workspaceId: 'b', title: 'Workspace B', path: '/workspace-b' }];
  const calls = [];
  let failure = false;
  const props = { ...actions, useTaskRequest: (select) => select(actions.hooks.taskRequest.getSnapshot()),
    useWorkspaces: (select) => select({ phase: 'ready', items }),
    run: async (...args) => { calls.push(args); return failure ? { ok: false, error: { message: 'directory unavailable' } } : { ok: true, sessionId: 'new-task' }; },
    openTask: (id) => calls.push(['open', id]),
  };
  const request = { id: 'challenge', title: 'Challenge', mode: 'participate', sessionId: 'source' };
  actions.requestTask(request);
  const dialog = render(overlay.Component, props);
  let tree = render(dialog.type, dialog.props);
  const confirm = () => find(tree, (node) => node.type === 'button' && node.props.children.includes('创建参赛任务'));
  assert.equal(confirm().props.disabled, true);
  await confirm().props.onClick();
  assert.deepEqual(calls, []);
  find(tree, (node) => node.type === 'select').props.onChange({ target: { value: 'b' } });
  tree = render(dialog.type, dialog.props);
  assert.equal(confirm().props.disabled, false);
  find(tree, (node) => node.type === 'button' && node.props.children.includes('取消')).props.onClick();
  assert.equal(render(overlay.Component, props), null);
  assert.deepEqual(calls, []);
  unmount(dialog.type);

  actions.requestTask(request);
  tree = render(dialog.type, dialog.props);
  assert.equal(confirm().props.disabled, true);
  find(tree, (node) => node.type === 'select').props.onChange({ target: { value: 'b' } });
  tree = render(dialog.type, dialog.props);
  assert.equal(confirm().props.disabled, false);
  items = [];
  tree = render(dialog.type, dialog.props);
  assert.equal(confirm().props.disabled, true);
  await confirm().props.onClick();
  assert.deepEqual(calls, []);
  items = [{ workspaceId: 'b', title: 'Workspace B', path: '/workspace-b' }];
  tree = render(dialog.type, dialog.props);
  failure = true;
  await confirm().props.onClick();
  tree = render(dialog.type, dialog.props);
  assert.equal(find(tree, (node) => node.props?.role === 'alert').props.children[0], 'directory unavailable');
  assert.equal(calls.length, 1);
  failure = false;
  await confirm().props.onClick();
  assert.deepEqual(calls[1], ['source', { action: 'start', challenge_id: 'challenge', mode: 'participate', workspace_id: 'b' }]);
  assert.deepEqual(calls[2], ['open', 'new-task']);
  assert.equal(render(overlay.Component, props), null);
});

test('a failed workspace list is reported instead of loading forever', async (t) => {
  const { registrations, find, render } = await clientFixture(t);
  const overlay = registrations.get('playground.task-start');
  const actions = overlay.definition.inject();
  actions.requestTask({ id: 'challenge', title: 'Challenge', mode: 'participate', sessionId: 'source' });
  const dialog = render(overlay.Component, { ...actions, useTaskRequest: (select) => select(actions.hooks.taskRequest.getSnapshot()),
    useWorkspaces: (select) => select({ phase: 'pending', state: 'error', error: { message: 'stream closed' }, items: [] }),
    run: async () => { throw Error('must not run'); }, openTask: () => {} });
  const tree = render(dialog.type, dialog.props);
  const alert = find(tree, (node) => node.props?.role === 'alert');
  assert.match(alert.props.children[0], /无法读取 DSH 工作区列表：stream closed/);
  assert.equal(find(tree, (node) => node.props?.role === 'status'), undefined);
  assert.equal(find(tree, (node) => node.type === 'select').props.disabled, true);
});

test('a created task closes the dialog even when opening the new conversation fails', async (t) => {
  const { registrations, find, render } = await clientFixture(t);
  const overlay = registrations.get('playground.task-start');
  const actions = overlay.definition.inject();
  const warn = t.mock.method(console, 'warn', () => {});
  actions.requestTask({ id: 'challenge', title: 'Challenge', mode: 'participate', sessionId: 'source' });
  const props = { ...actions, useTaskRequest: (select) => select(actions.hooks.taskRequest.getSnapshot()),
    useWorkspaces: (select) => select({ phase: 'ready', items: [{ workspaceId: 'b', title: 'Workspace B', path: '/workspace-b' }] }),
    run: async () => ({ ok: true, sessionId: 'new-task' }), openTask: async () => { throw Error('navigation failed'); } };
  const dialog = render(overlay.Component, props);
  let tree = render(dialog.type, dialog.props);
  find(tree, (node) => node.type === 'select').props.onChange({ target: { value: 'b' } });
  tree = render(dialog.type, dialog.props);
  await find(tree, (node) => node.type === 'button' && node.props.children.includes('创建参赛任务')).props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(render(overlay.Component, props), null);
  assert.equal(warn.mock.callCount(), 1);
});

test('workbench reads, re-entry, search, filters and source-session changes never execute a command', async (t) => {
  const calls = [];
  const f = await clientFixture(t, {
    connection: { rpc: { call: async (...args) => { calls.push(args); return { ok: true, value: { authenticated: false, challenges: { items: [] } } }; } } },
    remote: { commands: { execute: () => assert.fail('workbench read reached command history') } },
  });
  // Either source session, and no open session at all, use the same session-free reads.
  for (const sessionId of ['A', 'B', undefined]) {
    const { auth, catalog } = f.workbench(sessionId);
    await f.mount(auth);
    let panel = await f.mount(catalog);
    await f.find(panel, (node) => node.type === 'button' && text(node) === '刷新目录').props.onClick();
    f.find(panel, (node) => node.type === 'input').props.onChange({ target: { value: 'synthetic' } });
    panel = f.render(catalog.type, catalog.props);
    f.find(panel, (node) => node.type === 'input').props.onKeyDown({ key: 'Enter' });
    f.find(panel, (node) => node.type === 'select').props.onChange({ target: { value: 'spring' } });
    await settle();
  }
  assert.equal(calls.length, 15);
  assert.ok(calls.every(([route, endpoint, payload]) => route === '/api' && endpoint === 'playgroundQueries/query'
    && Object.keys(payload).join() === 'args' && Object.keys(payload.args).join() === 'input'));
  assert.ok(calls.every(([, , payload]) => Object.values(payload.args.input).every((value) => value !== undefined)));
  assert.ok(calls.some(([, , payload]) => payload.args.input.season === 'spring'));
  assert.ok(calls.some(([, , payload]) => payload.args.input.search === 'synthetic'));
});

test('catalog browsing needs no conversation, but task starts need one with command access', async (t) => {
  const f = await clientFixture(t, { connection: { rpc: { call: async () => ({ ok: true,
    value: { competitions: { items: [] }, challenges: { items: [{ id: 'c1', title: 'Challenge' }] } } }) } } });
  for (const [sessionId, access, hint] of [[undefined, true, /打开一个 DSH 对话/], ['A', false, /没有在此对话中创建任务的权限/], ['A', true, undefined]]) {
    const panel = await f.mount(f.workbench(sessionId, access).catalog);
    const starts = findAll(panel, (node) => node.type?.name === 'StartTaskButton');
    // Author mode is not open yet: each challenge card offers only a participation start.
    assert.equal(starts.length, 1);
    assert.equal(starts[0].props.mode, 'participate');
    assert.doesNotMatch(text(panel), /开始出题任务/);
    assert.ok(starts.every((start) => start.props.disabled === Boolean(hint)));
    if (hint) assert.match(text(panel), hint);
    else assert.doesNotMatch(text(panel), /才能从目录创建任务|没有在此对话中创建任务/);
  }
});

test('only the newest catalog request updates the panel; superseded requests are cancelled', async (t) => {
  const pending = [];
  const f = await clientFixture(t, { connection: { rpc: { call: (_route, _endpoint, payload, signal) => new Promise((resolve) => pending.push({ payload, signal, resolve })) } } });
  const { catalog } = f.workbench('A');
  let panel = f.render(catalog.type, catalog.props);
  f.find(panel, (node) => node.type === 'input').props.onChange({ target: { value: 'old' } });
  panel = f.render(catalog.type, catalog.props);
  f.find(panel, (node) => node.type === 'input').props.onKeyDown({ key: 'Enter' });
  f.find(panel, (node) => node.type === 'select').props.onChange({ target: { value: 'spring' } });
  assert.equal(pending.length, 2);
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending[1].signal.aborted, false);
  const page = (title) => ({ ok: true, value: { competitions: { items: [] }, challenges: { items: [{ id: title, title }] } } });
  pending[1].resolve(page('newest'));
  await settle();
  pending[0].resolve(page('stale'));
  await settle();
  panel = f.render(catalog.type, catalog.props);
  assert.match(text(panel), /newest/);
  assert.doesNotMatch(text(panel), /stale/);
});

test('query failures name the cause without exposing raw transport errors', async (t) => {
  let reply;
  const f = await clientFixture(t, { connection: { rpc: { call: async () => reply() } } });
  const { query } = f.registrations.get('main').definition.inject();
  for (const [next, expected] of [
    [() => ({ ok: false, error: { code: 'remote-access/denied', message: 'Bearer secret-token' } }), /没有读取 Playground 数据的权限/],
    [() => ({ ok: false, error: { code: 'gateway/invocation-unavailable', message: 'secret-token' } }), /查询服务未加载/],
    [() => ({ ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } }), /平台请求失败：upstream returned 503/],
    [() => ({ ok: false, error: { code: 'gateway/internal', message: 'Bearer secret-token' } }), /平台请求失败。/],
    [() => ({ ok: false, error: { code: 'gateway/arguments-invalid', message: 'secret-token' } }), /gateway\/arguments-invalid/],
    [() => { throw new Error('Bearer secret-token'); }, /无法连接 DSH 服务/],
  ]) {
    reply = next;
    await assert.rejects(query({ action: 'auth' }), (error) => expected.test(error.message) && !error.message.includes('secret-token'));
  }
  reply = () => ({ ok: false, error: { code: 'gateway/internal', message: 'Bearer secret-token' } });
  const content = text(await f.mount(f.workbench(undefined).auth));
  assert.match(content, /检测失败/);
  assert.doesNotMatch(content, /secret-token/);
});

const legacyAuth = { playgroundAuth: { authenticated: false, user: { email: 'private@example.test' }, cli: { token: 'private-token' } } };
const legacyCatalog = { playgroundCatalog: { competitions: { total: 2 }, challenges: { total: 1, items: [{ title: 'Synthetic challenge' }] } }, authorization: 'private-token' };

test('legacy auth/catalog records from the playground command render nothing', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  for (const value of [legacyAuth, legacyCatalog]) {
    const node = { name: 'playground', outcome: { kind: 'success', text: JSON.stringify(value) } };
    // Payload present, with and without args.
    assert.equal(f.render(Card, { node }), null);
    assert.equal(f.render(Card, { node: { ...node, args: '{"action":"auth"}' } }), null);
  }
  // A null payload still counts as a legacy record.
  for (const key of ['playgroundAuth', 'playgroundCatalog']) {
    assert.equal(f.render(Card, { node: { name: 'playground', outcome: { kind: 'success', text: JSON.stringify({ [key]: null }) } } }), null);
  }
});

test('failed, interrupted and unparseable legacy auth/catalog leftovers render nothing', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  for (const action of ['auth', 'catalog']) {
    const args = JSON.stringify({ action });
    const render = (outcome) => f.render(Card, { node: { name: 'playground', args, outcome } });
    assert.equal(render({ kind: 'error', text: 'Bearer private-token' }), null);
    assert.equal(render({ kind: 'error', text: JSON.stringify({ ok: false, error: { code: 'authentication_required', message: 'x' } }) }), null);
    assert.equal(render(null), null);
    assert.equal(render(undefined), null);
    assert.equal(render({ kind: 'success', text: '{bad-json' }), null);
    assert.equal(render({ kind: 'success', text: '' }), null);
  }
});

test('historical playground-auth-login cards still show summaries and inert safe details', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  assert.equal(f.registrations.get('playground-auth-login').Component, Card);
  for (const [value, expected] of [
    [legacyAuth, '未登录'],
    [{ playgroundAuth: { authenticated: true } }, 'Playground 身份已确认'],
    [legacyCatalog, '共 2 个比赛、1 道赛题'],
  ]) {
    const tree = f.render(Card, { node: { name: 'playground-auth-login', outcome: { kind: 'success', text: JSON.stringify(value) } } });
    assert.match(text(tree), /Playground 登录/);
    assert.match(text(tree), new RegExp(expected));
    assert.ok(f.find(tree, (node) => node.type === 'details'));
    assert.equal(f.find(tree, (node) => node.props?.onClick || node.props?.onToggle), undefined);
    assert.doesNotMatch(text(tree), /private-token|private@example/);
  }
});

test('workflow, login and confirmation records are never hidden as legacy queries', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  const workflow = f.render(Card, { node: { name: 'playground', args: '{"action":"start"}',
    outcome: { kind: 'success', text: JSON.stringify({ sessionId: 'S', playgroundWorkflow: { kind: 'start', task: { title: 'Synthetic' } } }) } } });
  assert.match(text(workflow), /创建任务对话/);
  // Workflow wins even if a legacy auth/catalog field is also present.
  // The assertions target the workflow fact (task title) rather than the label, which a payload key can override.
  const mixed = f.render(Card, { node: { name: 'playground', outcome: { kind: 'success',
    text: JSON.stringify({ ...legacyAuth, playgroundWorkflow: { kind: 'start', task: { title: 'Synthetic' } } }) } } });
  assert.notEqual(mixed, null);
  assert.match(text(mixed), /Synthetic/);
  // Even a legacy action in args does not hide a record that carries a workflow result.
  const mixedAction = f.render(Card, { node: { name: 'playground', args: '{"action":"auth"}', outcome: { kind: 'success',
    text: JSON.stringify({ playgroundWorkflow: { kind: 'start', task: { title: 'Synthetic' } } }) } } });
  assert.notEqual(mixedAction, null);
  assert.match(text(mixedAction), /Synthetic/);
  // The explicit login action keeps its card for both outcomes.
  const login = f.render(Card, { node: { name: 'playground-auth-login', args: '{"action":"auth"}', outcome: { kind: 'success', text: JSON.stringify(legacyAuth) } } });
  assert.match(text(login), /Playground 登录/);
  const loginError = f.render(Card, { node: { name: 'playground-auth-login', args: '{"action":"auth"}', outcome: { kind: 'error', text: '未找到 Playground CLI。请先安装 CLI。' } } });
  assert.match(text(loginError), /Playground 登录.*未完成/);
  const confirm = f.render(Card, { node: { name: 'playground-confirm', outcome: { kind: 'success', text: JSON.stringify(legacyAuth) } } });
  assert.match(text(confirm), /确认提交/);
});

test('playground records with non-legacy actions render when pending, failed or unparseable', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  for (const [action, label] of [['check', /检查提交材料/], ['results', /查询评测结果/], ['start', /创建任务对话/],
    ['mode', /切换工作模式/], ['cancel', /取消提交准备/], ['context', /任务上下文/]]) {
    const args = JSON.stringify({ action });
    const render = (outcome) => f.render(Card, { node: { name: 'playground', args, outcome } });
    const pending = render(null);
    assert.match(text(pending), label);
    assert.match(text(pending), /尚未完成/);
    const failed = render({ kind: 'error', text: 'Bearer private-token' });
    assert.match(text(failed), label);
    assert.match(text(failed), /未完成/);
    assert.doesNotMatch(text(failed), /private-token/);
    assert.match(text(render({ kind: 'success', text: '{bad-json' })), label);
  }
  // Unknown or missing action also stays visible.
  assert.notEqual(f.render(Card, { node: { name: 'playground', args: '{"action":"mystery"}', outcome: null } }), null);
  assert.notEqual(f.render(Card, { node: { name: 'playground', outcome: null } }), null);
});

test('command cards show plugin failure reasons but hide credentials and local paths', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  const render = (node) => text(f.render(Card, { node }));
  const structured = render({ args: '{"action":"start"}', outcome: { kind: 'error',
    text: JSON.stringify({ ok: false, error: { code: 'invalid_argument', message: '目标目录不存在，请确认路径或重新选择工作区。' } }) } });
  assert.match(structured, /创建任务对话.*未完成/);
  assert.match(structured, /目标目录不存在/);
  assert.match(render({ name: 'playground-auth-login', args: null, outcome: { kind: 'error', text: '未找到 Playground CLI。请先安装 CLI。' } }), /Playground 登录.*未找到 Playground CLI/);
  assert.match(render({ outcome: { kind: 'error', text: JSON.stringify({ ok: false, error: { code: 'authentication_required', message: 'x' } }) } }), /请先在工作台登录/);
  for (const secret of ['Bearer private-token', 'open C:\\Users\\private\\bundle.zip failed', 'token=private-token']) {
    const content = render({ args: '{"action":"catalog"}', outcome: { kind: 'error', text: secret } });
    assert.match(content, /赛题目录查询.*未完成/);
    assert.match(content, /操作未完成或已中断/);
    assert.doesNotMatch(content, /private/);
  }
});

test('interrupted records, missing details and confirmation actions remain understandable', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  const pending = f.render(Card, { node: { args: '{"action":"auth"}', outcome: null } });
  assert.match(text(pending), /登录状态检测.*尚未完成/);
  for (const value of ['null', '[]', '42', '{bad-json', '{}']) {
    assert.match(text(f.render(Card, { node: { outcome: { kind: 'success', text: value } } })), /详情不可用/);
  }
  const malformed = f.render(Card, { node: { outcome: { kind: 'success', text: '{"playgroundCatalog":{"challenges":{"items":{}}}}' } } });
  assert.match(text(malformed), /赛题目录查询/);
  let opened;
  const prepared = f.render(Card, { sessionId: 'A', openWorkbench: (id) => { opened = id; }, node: {
    outcome: { kind: 'success', text: JSON.stringify({ playgroundWorkflow: { kind: 'prepared', prepared: { challenge: { title: 'Synthetic' }, files: [{ path: 'private-path' }] } } }) },
  } });
  const button = f.find(prepared, (node) => node.type === 'button');
  assert.equal(text(button), '前往工作台确认提交');
  button.props.onClick();
  assert.equal(opened, 'A');
  assert.doesNotMatch(text(prepared), /private-path/);
});

test('workbench login needs no conversation and keeps the password out of the call', async (t) => {
  const calls = [];
  let reply = { ok: true, value: { ok: true, authenticated: true } };
  const f = await clientFixture(t, {
    remote: {
      commands: { execute: () => assert.fail('login reached command history') },
      credentials: { set: async (name, value) => { calls.push(['credential', name, value]); } },
    },
    connection: { rpc: { call: async (...args) => { calls.push(['rpc', ...args]); return reply; } } },
  });
  const { login } = f.registrations.get('main').definition.inject();
  assert.deepEqual(await login('a@example.test', 'synthetic-password'), { ok: true, authenticated: true });
  assert.deepEqual(calls[0], ['credential', 'PLAYGROUND_PASSWORD', 'synthetic-password']);
  assert.deepEqual(calls[1].slice(0, 4), ['rpc', '/api', 'playgroundQueries/login', { args: { input: { email: 'a@example.test' } } }]);
  assert.doesNotMatch(JSON.stringify(calls[1]), /synthetic-password/);
  for (const [next, expected] of [
    [{ ok: true, value: { ok: false, error: { code: 'login_failed', message: '未找到 Playground CLI。' } } }, /未找到 Playground CLI/],
    [{ ok: true, value: { ok: false, error: { code: 'login_failed', message: 'token=private' } } }, /^Playground 登录失败，请重试。$/],
    [{ ok: false, error: { code: 'gateway/invocation-unavailable' } }, /查询服务未加载/],
  ]) {
    reply = next;
    await assert.rejects(login('a@example.test', 'synthetic-password'), (error) => expected.test(error.message));
  }
  // The login panel is rendered and usable with no source conversation at all.
  const { auth } = f.workbench(undefined);
  assert.equal('sessionId' in auth.props, false);
});

// Runs the plugin's locale registration so tests can use the same zh/en messages as DSH.
async function localizedFixture(t, services = {}) {
  const messages = {};
  const f = await clientFixture(t, { effect: (fn) => fn(), locale: { register: (_name, value) => Object.assign(messages, value) }, ...services });
  const translator = (language) => (key) => messages[language][key] ?? key;
  return { ...f, zh: translator('zh'), en: translator('en') };
}

// Renders the workbench with one task session and returns the summary row, the drawer receipt
// summary and the score line of the drawer's attempt card.
function taskViews(f, playgroundTask, t, { running = false } = {}) {
  const session = { id: 's', displayTitle: 'Playground · Fixture', running, projectionValues: { playgroundTask } };
  const Main = f.registrations.get('main').Component;
  const props = { useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask } } } }),
    useSessionAccess: () => true, refreshProjections: async () => {}, run: async () => ({ ok: true }), openTask: () => {}, openChat: () => {}, login: async () => {}, t };
  const rowElement = f.find(f.render(Main, props), (node) => node.type?.name === 'TaskSummaryRow');
  const row = f.render(rowElement.type, rowElement.props);
  const part = (className) => f.find(row, (node) => node.props?.className === className);
  row.props.onClick();
  const drawer = f.find(f.render(Main, props), (node) => node.type?.name === 'TaskDetailDrawer');
  const selected = f.find(f.render(drawer.type, drawer.props), (node) => node.type?.name === 'SelectedTask');
  const workflow = f.render(selected.type, selected.props);
  const result = f.find(f.render(workflow.type, workflow.props), (node) => node.type === 'details' && node.props.className === 'pg-raw');
  const summary = result && f.find(result, (node) => node.type === 'summary');
  const card = result && f.find(result, (node) => node.type?.name === 'PlaygroundToolCard');
  const scoreLine = card && f.find(f.render(card.type, card.props), (node) => node.props?.className === 'pg-score');
  return {
    stage: text(part('pg-task-row-meta')).split('·').at(-1).trim(),
    badge: text(part('pg-badge')), tone: part('pg-badge').props['data-tone'],
    score: text(part('pg-task-row-score')), summary: summary && text(summary), card: scoreLine && text(scoreLine),
  };
}

// Routes the Client's session-free query through the real query contract and workflow onto a fake Playground client.
function historyRpc(client, calls) {
  const services = new Map();
  let contribution;
  registerWorkbenchQueries({ provide: (key, value) => services.set(key, value), typert: { register: (value) => { contribution = value; } } },
    createWorkflow({ ctx: {}, client }));
  const schema = contribution.invocations.find((item) => item.method === 'query').parameters[0].codec.create();
  return async (route, endpoint, payload, signal) => {
    calls.push([route, endpoint, payload]);
    try { return { ok: true, value: await services.get('playgroundQueries').query(schema.parse(payload.args.input), signal) }; }
    catch (error) { return { ok: false, error: { code: 'gateway/internal', message: error.message } }; }
  };
}


// Expected row, drawer and attempt-card display for one receipt. `card` is the score line of the
// drawer's attempt card; undefined means the card shows no score line.
const view = (stage, badge, tone, score, card) => ({ stage, badge, tone, score, card });
const awaiting = '等待评分，暂无最终分数';
const finalLine = (score) => `最终分数: ${score}`;
const referenceLine = (score) => `参考分（未确认最终）: ${score}`;

test('task rows derive stage, badge and score from the platform state, consistently with the drawer', async (t) => {
  const task = { challengeId: 'fixture', title: 'Fixture', mode: 'participate' };
  const cases = [
    ['final score', { attemptId: 1, ok: true, status: 'scored', score: 87.5, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 87.5 } },
      view('已出最终分', '评分完成', 'success', '87.5 分', finalLine(87.5))],
    ['final after deadline', { attemptId: 2, ok: true, status: 'late_scored', score: 64, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 64 } },
      view('已出最终分（赛后）', '评分完成', 'success', '64 分', finalLine(64))],
    ['late_scored scoring state with another status', { attemptId: 23, ok: true, status: 'scored', score: 64, scoringState: { state: 'late_scored', scoreIsFinal: true, displayScore: 64 } },
      view('已出最终分（赛后）', '赛后已评分', 'success', '64 分', finalLine(64))],
    ['a final score of zero is still final', { attemptId: 3, ok: true, status: 'scored', score: 0, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 0 } },
      view('已出最终分', '评分完成', 'success', '0 分', finalLine(0))],
    ['scoring failed', { attemptId: 4, ok: true, status: 'pending_review', score: 0, scoringState: { state: 'failed', scoreIsFinal: false } },
      view('评测未通过', '失败', 'error', '—', undefined)],
    ['rejected', { attemptId: 5, ok: true, status: 'scored', score: 0, scoringState: { state: 'rejected', scoreIsFinal: false } },
      view('评测未通过', '未通过', 'error', '—', undefined)],
    ['bundle rejected', { attemptId: 6, ok: false, status: 'submitted', bundleStatus: 'failed' },
      view('评测未通过', '失败', 'error', '—', undefined)],
    ['queued with score 0', { attemptId: 7, ok: true, status: 'queued', score: 0, scoringState: { state: 'queued', scoreIsFinal: false, provisionalScore: 0 } },
      view('评测中', '排队中', 'warning', '—', awaiting)],
    ['evaluating with a provisional score', { attemptId: 8, ok: true, status: 'scoring', score: 0, scoringState: { state: 'evaluating', scoreIsFinal: false, provisionalScore: 41 } },
      view('评测中', '评测中', 'warning', '参考 41', referenceLine(41))],
    ['pending review without a scoring state', { attemptId: 9, ok: true, status: 'pending_review' },
      view('评测中', '等待审核', 'warning', '—', awaiting)],
    // Failed and rejected attempts are terminal: a computed or provisional score is not shown as a reference.
    ['rejected with a non-zero score', { attemptId: 10, ok: true, status: 'scored', score: 72, scoringState: { state: 'rejected', scoreIsFinal: false, displayScore: 72 } },
      view('评测未通过', '未通过', 'error', '—', undefined)],
    ['failed with a provisional score', { attemptId: 11, ok: true, status: 'pending_review', score: 0, scoringState: { state: 'failed', scoreIsFinal: false, provisionalScore: 30 } },
      view('评测未通过', '失败', 'error', '—', undefined)],
    ['a final flag never overrides a rejection', { attemptId: 12, ok: true, status: 'scored', score: 72, scoringState: { state: 'rejected', scoreIsFinal: true, displayScore: 72 } },
      view('评测未通过', '未通过', 'error', '—', undefined)],
    ['unknown scoring state with pending review', { attemptId: 13, ok: true, status: 'pending_review', score: 0, scoringState: { state: 'unknown', scoreIsFinal: false } },
      view('评测中', '等待审核', 'warning', '—', awaiting)],
    // Status-only receipts never claim a final score, and the badge tone follows the stage.
    ['status-only scored', { attemptId: 14, ok: true, status: 'scored', score: 80 },
      view('已提交，等待结果', '已评分', 'neutral', '参考 80', referenceLine(80))],
    ['status-only late_scored', { attemptId: 15, ok: true, status: 'late_scored' },
      view('已提交，等待结果', '赛后已评分', 'neutral', '—', awaiting)],
    // CLI receipts may carry the scoring state as a bare string; it never implies a final score.
    ['CLI string final scoring state', { attemptId: 16, ok: true, status: 'scored', score: 87, scoringState: 'final' },
      view('已提交，等待结果', '评分完成', 'neutral', '参考 87', referenceLine(87))],
    ['CLI string rejected scoring state', { attemptId: 17, ok: true, status: 'scored', score: 55, scoringState: 'rejected' },
      view('评测未通过', '未通过', 'error', '—', undefined)],
    // Submissions the platform did not fully receive. Without a platform state the badge says "未提交".
    ['upload failed before the platform received the bundle', { attemptId: 18, ok: false, stage: 'upload', error: { message: 'network down' } },
      view('提交未完成', '未提交', 'error', '—', undefined)],
    // "查询结果" merges the platform attempt over a failed-upload receipt and keeps its stale `ok: false`;
    // the platform state wins. The attempt card still hides its score line for an `ok: false` result.
    ['stale ok: false after the platform reported the attempt', { attemptId: 19, ok: false, stage: 'upload', error: { message: 'network down' }, status: 'submitted' },
      view('已提交，等待结果', '已提交', 'neutral', '—', undefined)],
    // A draft has nothing to score, so the drawer card shows no score line.
    ['draft', { attemptId: 20, ok: true, status: 'draft', score: 0, scoringState: { state: 'draft', scoreIsFinal: false } },
      view('提交未完成', '草稿', 'error', '—', undefined)],
    // The platform accepted an incomplete bundle: the submission exists and no retry is offered.
    ['bundle accepted as incomplete', { attemptId: 21, ok: true, status: 'submitted', bundleStatus: 'incomplete' },
      view('已提交，等待结果', '材料不完整', 'warning', '—', awaiting)],
  ];
  for (const [name, receipt, expected] of cases) {
    const f = await localizedFixture(t);
    const views = taskViews(f, { task, prepared: null, receipt }, f.zh);
    assert.deepEqual({ stage: views.stage, badge: views.badge, tone: views.tone, score: views.score, card: views.card }, expected, name);
    assert.equal(views.summary, `提交 #${receipt.attemptId} · ${expected.badge} · ${expected.stage} · ${expected.score}`, name);
  }
  const f = await localizedFixture(t);
  const created = taskViews(f, { task, prepared: null, receipt: null }, f.zh);
  assert.deepEqual({ stage: created.stage, badge: created.badge, tone: created.tone, score: created.score, summary: created.summary },
    { stage: '任务已创建', badge: '未提交', tone: 'neutral', score: '—', summary: undefined });
  const english = await localizedFixture(t);
  const en = taskViews(english, { task, prepared: null, receipt: cases[1][1] }, english.en);
  assert.equal(en.summary, 'Submission #2 · Final · Final score available (after deadline) · 64 pts');
  assert.equal(en.card, 'Final score: 64');
});

test('a running task shows the agent stage with the receipt badge and score, in the row and the drawer', async (t) => {
  const task = { challengeId: 'fixture', title: 'Fixture', mode: 'participate' };
  for (const [receipt, expected] of [
    [{ attemptId: 1, ok: true, status: 'queued', score: 0, scoringState: { state: 'queued', scoreIsFinal: false } }, view('Agent 执行中', '排队中', 'warning', '—', awaiting)],
    [{ attemptId: 2, ok: true, status: 'scored', score: 90, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 90 } }, view('Agent 执行中', '评分完成', 'success', '90 分', finalLine(90))],
  ]) {
    const f = await localizedFixture(t);
    const views = taskViews(f, { task, prepared: null, receipt }, f.zh, { running: true });
    assert.deepEqual({ stage: views.stage, badge: views.badge, tone: views.tone, score: views.score, card: views.card }, expected);
    assert.equal(views.summary, `提交 #${receipt.attemptId} · ${expected.badge} · ${expected.stage} · ${expected.score}`);
  }
  const f = await localizedFixture(t);
  const idle = taskViews(f, { task, prepared: null, receipt: null }, f.zh, { running: true });
  assert.deepEqual({ stage: idle.stage, badge: idle.badge, tone: idle.tone }, { stage: 'Agent 执行中', badge: '未提交', tone: 'warning' });
});

test('platform states rejected, late_scored, pending_review and scoring have zh and en names', async (t) => {
  const f = await localizedFixture(t);
  const Card = f.registrations.get('playground_list_my_attempts').Component;
  const items = [{ id: 1, scoringState: { state: 'rejected' } }, { id: 2, status: 'late_scored' }, { id: 3, status: 'pending_review' }, { id: 4, scoringState: { state: 'scoring' } }];
  for (const [translate, names] of [[f.zh, ['未通过', '赛后已评分', '等待审核', '评测中']], [f.en, ['Rejected', 'Scored after deadline', 'Pending review', 'Scoring']]]) {
    const card = f.render(Card, { phase: 'result', toolName: 'playground_list_my_attempts', t: translate, block: { meta: { playground: { ok: true, items } } } });
    const badges = findAll(f.find(card, (node) => node.props?.className === 'pg-list'), (node) => node.props?.className === 'pg-badge').map(text);
    assert.deepEqual(badges, names);
  }
  for (const [receipt, badge, stage] of [[{ status: 'scored', scoringState: { state: 'rejected' } }, '未通过', '评测未通过'],
    [{ status: 'late_scored' }, '赛后已评分', '已提交，等待结果'],
    [{ status: 'pending_review' }, '等待审核', '评测中'], [{ status: 'scoring', scoringState: { state: 'scoring' } }, '评测中', '评测中']]) {
    const fresh = await localizedFixture(t);
    const views = taskViews(fresh, { task: { challengeId: 'fixture', title: 'Fixture' }, prepared: null, receipt }, fresh.zh);
    assert.deepEqual({ badge: views.badge, stage: views.stage }, { badge, stage });
  }
});

test('attempt lists apply the same score rules as the task row', async (t) => {
  const f = await localizedFixture(t);
  const Card = f.registrations.get('playground_list_my_attempts').Component;
  const items = [
    { id: 1, status: 'scored', score: 80, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 80 } },
    { id: 2, status: 'queued', score: 0, scoringState: { state: 'queued', scoreIsFinal: false, provisionalScore: 0 } },
    { id: 3, status: 'scored', score: 72, scoringState: { state: 'rejected', scoreIsFinal: true, displayScore: 72 } },
    { id: 4, status: 'pending_review', score: 30, scoringState: { state: 'evaluating', scoreIsFinal: false } },
  ];
  const card = f.render(Card, { phase: 'result', toolName: 'playground_list_my_attempts', t: f.zh, block: { meta: { playground: { ok: true, items } } } });
  const rows = findAll(f.find(card, (node) => node.props?.className === 'pg-list'), (node) => node.props?.className === 'pg-row-sub').map(text);
  assert.match(rows[0], /最终分数: 80/);
  assert.match(rows[1], /等待评分，暂无最终分数/);
  assert.doesNotMatch(rows[2], /72|分数|参考|等待/);
  assert.match(rows[3], /参考分（未确认最终）: 30/);
});

// Workbench refresh of unscored submissions. Time is a mock clock that starts at 09:05 local time;
// `tick` advances both the two-minute interval and `Date`.
const twoMinutes = 120000;
const queuedAttempt = { status: 'queued', score: 0, scoringState: { state: 'queued', scoreIsFinal: false, provisionalScore: 0 } };
const evaluatingAttempt = { status: 'scoring', score: 0, scoringState: { state: 'evaluating', scoreIsFinal: false, provisionalScore: 41 } };
const finalAttempt = (score) => ({ status: 'scored', score, scoringState: { state: 'final', scoreIsFinal: true, displayScore: score } });

function fakeDocument(t) {
  const listeners = new Set();
  const doc = { visibilityState: 'visible', listeners,
    addEventListener: (type, listener) => { if (type === 'visibilitychange') listeners.add(listener); },
    removeEventListener: (type, listener) => { if (type === 'visibilitychange') listeners.delete(listener); },
    setVisibility(state) { doc.visibilityState = state; [...listeners].forEach((listener) => listener()); } };
  globalThis.document = doc;
  t.after(() => { delete globalThis.document; });
  return doc;
}

// Mounts the workbench over tasks whose latest receipts are `receipts` ([sessionId, receipt] pairs). `platform`
// maps a submission id to its reply: an attempt object, or an Error for a transport failure.
async function refreshHarness(t, receipts, platform, { visibility = 'visible' } = {}) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: new Date(2026, 10, 2, 9, 5).getTime() });
  const document = fakeDocument(t);
  document.visibilityState = visibility;
  const calls = [];
  const held = [];
  const control = { hold: false };
  const respond = (entry) => {
    const reply = platform.get(entry.id);
    if (reply instanceof Error) entry.reject(reply); else entry.resolve({ ok: true, value: reply });
  };
  const f = await localizedFixture(t, {
    connection: { rpc: { call: (route, endpoint, payload, signal) => new Promise((resolve, reject) => {
      const entry = { route, endpoint, payload, signal, id: payload.args.input.attemptId, resolve, reject };
      calls.push(entry);
      if (control.hold) held.push(entry); else respond(entry);
    }) } },
    remote: { commands: { execute: () => assert.fail('the refresh reached command history') } },
  });
  const Main = f.registrations.get('main').Component;
  const task = (title) => ({ challengeId: 'fixture', title, mode: 'participate' });
  const sessions = receipts.map(([id, receipt]) => ({ id, displayTitle: `Playground · ${id}`,
    projectionValues: { playgroundTask: { task: task(id), prepared: null, receipt } } }));
  const actions = f.registrations.get('main').definition.inject();
  const props = () => ({ ...actions, useSessions: (select) => select({ ids: sessions.map((item) => item.id), byId: Object.fromEntries(sessions.map((item) => [item.id, item])),
    projectionsBySession: Object.fromEntries(sessions.map((item) => [item.id, { state: 'ready', values: item.projectionValues }])) }),
  useSessionAccess: () => true, refreshProjections: async () => {}, run: async () => assert.fail('the refresh ran a session command'),
  openTask: () => {}, openChat: () => {}, login: async () => {}, t: f.zh });
  // Renders like React: after each render, effects whose dependencies changed clean up and run again.
  const slots = [];
  const view = { tree: undefined };
  const renderOnce = () => {
    f.effects.length = 0;
    view.tree = f.render(Main, props());
    f.effects.splice(0).forEach((run, index) => {
      const slot = slots[index];
      if (slot && run.deps && slot.deps?.length === run.deps.length && run.deps.every((dep, i) => Object.is(dep, slot.deps[i]))) return;
      slot?.cleanup?.();
      slots[index] = { deps: run.deps, cleanup: run() };
    });
    return view.tree;
  };
  // The second render shows what the effects of the first one changed, as React would after a state update.
  const flush = () => { renderOnce(); return renderOnce(); };
  const unmount = () => { slots.forEach((slot) => slot?.cleanup?.()); slots.length = 0; f.unmount(Main); };
  // StrictMode-like double mount: every effect cleans up and runs again, and component state survives.
  const remount = () => { slots.forEach((slot) => slot?.cleanup?.()); slots.length = 0; return flush(); };
  const rows = () => findAll(view.tree, (node) => node.type?.name === 'TaskSummaryRow').map((element) => {
    const row = f.render(element.type, element.props);
    const part = (className) => text(f.find(row, (node) => node.props?.className === className));
    return { id: element.props.session.id, badge: part('pg-badge'), score: part('pg-task-row-score') };
  });
  const button = () => f.find(view.tree, (node) => node.type === 'button' && node.props.className === 'pg-button pg-refresh');
  const status = () => { const node = f.find(view.tree, (node) => String(node.props?.className).includes('pg-refresh-status')); return node && text(node); };
  const release = () => held.splice(0).forEach(respond);
  const settled = async () => { await settle(); await settle(); return flush(); };
  return { f, document, calls, control, release, sessions, flush, settled, unmount, remount, rows, button, status, view, tick: (ms) => t.mock.timers.tick(ms) };
}

const receiptOf = (attemptId, attempt = queuedAttempt) => ({ attemptId, ok: true, ...attempt });

test('the workbench refreshes unscored submissions now and every two minutes, and stops once all have a result', async (t) => {
  const platform = new Map([[61, queuedAttempt], [63, evaluatingAttempt]]);
  const h = await refreshHarness(t, [
    ['a', receiptOf(61)], ['b', receiptOf(62, finalAttempt(80))], ['c', receiptOf(61)], ['d', receiptOf(63, evaluatingAttempt)],
    ['e', receiptOf(64, { status: 'failed', scoringState: { state: 'failed', scoreIsFinal: false } })],
    ['f', { attemptId: 65, ok: false, stage: 'upload' }], ['g', { ok: true, status: 'queued' }],
  ], platform);
  h.flush();
  // The first round runs when the workbench opens; each submission is requested once, and only unscored ones.
  assert.deepEqual(h.calls.map((call) => call.id), [61, 63]);
  assert.ok(h.calls.every((call) => call.route === '/api' && call.endpoint === 'playgroundQueries/query'
    && JSON.stringify(call.payload) === JSON.stringify({ args: { input: { action: 'attempt', attemptId: call.id } } })));
  await h.settled();
  assert.equal(h.status(), '状态更新于 09:05');
  h.tick(twoMinutes);
  assert.deepEqual(h.calls.map((call) => call.id), [61, 63, 61, 63]);
  await h.settled();
  assert.equal(h.status(), '状态更新于 09:07');
  platform.set(61, finalAttempt(80)); platform.set(63, finalAttempt(55));
  h.tick(twoMinutes);
  assert.equal(h.calls.length, 6);
  await h.settled();
  assert.equal(h.status(), '状态更新于 09:09');
  assert.deepEqual(h.rows().filter((row) => ['a', 'c', 'd'].includes(row.id)).map((row) => [row.badge, row.score]),
    [['评分完成', '80 分'], ['评分完成', '80 分'], ['评分完成', '55 分']]);
  // Nothing is left to wait for: the interval and the visibility listener are gone.
  assert.equal(h.document.listeners.size, 0);
  h.tick(twoMinutes * 5);
  assert.equal(h.calls.length, 6);
});

test('polling pauses while the page is hidden and resumes when it is visible again', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, queuedAttempt]]), { visibility: 'hidden' });
  h.flush();
  h.tick(twoMinutes * 2);
  assert.equal(h.calls.length, 0);
  h.document.setVisibility('visible');
  assert.equal(h.calls.length, 1);
  await h.settled();
  h.document.setVisibility('hidden');
  h.tick(twoMinutes);
  assert.equal(h.calls.length, 1);
});

test('becoming visible starts a round only when the previous one began more than 30 seconds ago, and the interval is separate', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, queuedAttempt]]));
  h.flush();
  await h.settled();
  assert.equal(h.calls.length, 1);
  // 10 seconds after the opening round: switching tabs back and forth requests nothing.
  h.tick(10000);
  h.document.setVisibility('hidden');
  h.document.setVisibility('visible');
  assert.equal(h.calls.length, 1);
  // 35 seconds in, the event alone starts a round; the interval is still 85 seconds away.
  h.tick(25000);
  h.document.setVisibility('hidden');
  assert.equal(h.calls.length, 1);
  h.document.setVisibility('visible');
  assert.equal(h.calls.length, 2);
  await h.settled();
  // The interval keeps its own schedule: it fires 120 seconds after the opening, not after the event.
  h.tick(84000);
  assert.equal(h.calls.length, 2);
  h.tick(1000);
  assert.equal(h.calls.length, 3);
});

test('closing the workbench stops polling and cancels the request in flight', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, finalAttempt(80)]]));
  h.control.hold = true;
  h.flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].signal.aborted, false);
  h.unmount();
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.document.listeners.size, 0);
  h.tick(twoMinutes * 3);
  assert.equal(h.calls.length, 1);
  h.release();
  await settle();
  assert.equal(h.calls.length, 1);
});

test('a refresh never overlaps another, and the button is disabled while one is running', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, queuedAttempt]]));
  h.control.hold = true;
  h.flush();
  assert.equal(h.calls.length, 1);
  assert.deepEqual([h.button().props.disabled, text(h.button())], [true, '正在刷新…']);
  h.tick(twoMinutes);
  h.button().props.onClick();
  assert.equal(h.calls.length, 1);
  h.release();
  await h.settled();
  assert.deepEqual([h.button().props.disabled, text(h.button())], [false, '刷新']);
  h.tick(twoMinutes);
  assert.equal(h.calls.length, 2);
});

test('the refresh button requests the latest submission of every task at once and never lowers a final result', async (t) => {
  const platform = new Map([[61, queuedAttempt], [62, queuedAttempt]]);
  const h = await refreshHarness(t, [['a', receiptOf(61)], ['b', receiptOf(62, finalAttempt(80))]], platform);
  h.flush();
  await h.settled();
  assert.deepEqual(h.calls.map((call) => call.id), [61]);
  h.button().props.onClick();
  assert.deepEqual(h.calls.map((call) => call.id), [61, 61, 62]);
  await h.settled();
  assert.deepEqual(h.rows().map((row) => [row.id, row.badge, row.score]), [['a', '排队中', '—'], ['b', '评分完成', '80 分']]);
});

test('a failed refresh keeps the last results, reports the last good time without raw errors, and retries on the next interval', async (t) => {
  const platform = new Map([[61, evaluatingAttempt]]);
  const h = await refreshHarness(t, [['a', receiptOf(61)]], platform);
  h.flush();
  await h.settled();
  assert.equal(h.status(), '状态更新于 09:05');
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['评测中', '参考 41']]);
  platform.set(61, new Error('Bearer secret-token at C:\\Users\\someone\\.config'));
  h.tick(twoMinutes);
  await h.settled();
  assert.equal(h.status(), '刷新失败，显示的是 09:05 的状态');
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['评测中', '参考 41']]);
  assert.doesNotMatch(text(h.view.tree), /secret-token|Users|Bearer/);
  platform.set(61, finalAttempt(80));
  h.tick(twoMinutes);
  assert.equal(h.calls.length, 3);
  await h.settled();
  assert.equal(h.status(), '状态更新于 09:09');
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['评分完成', '80 分']]);
});

test('a refresh that fails before any success says the task records are shown', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, new Error('Bearer secret-token')]]));
  h.flush();
  await h.settled();
  assert.equal(h.status(), '刷新失败，显示的是任务记录中的状态');
  assert.doesNotMatch(text(h.view.tree), /secret-token/);
});

test('a refreshed final score reaches the task row and the drawer summary without touching any session', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, finalAttempt(80)]]));
  const before = JSON.stringify(h.sessions);
  h.flush();
  await h.settled();
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['评分完成', '80 分']]);
  const element = findAll(h.view.tree, (node) => node.type?.name === 'TaskSummaryRow')[0];
  h.f.render(element.type, element.props).props.onClick();
  h.flush();
  const drawer = h.f.find(h.view.tree, (node) => node.type?.name === 'TaskDetailDrawer');
  const selected = h.f.find(h.f.render(drawer.type, drawer.props), (node) => node.type?.name === 'SelectedTask');
  const workflow = h.f.render(selected.type, selected.props);
  const summary = h.f.find(h.f.render(workflow.type, workflow.props), (node) => node.type === 'summary');
  assert.equal(text(summary), '提交 #61 · 评分完成 · 已出最终分 · 80 分');
  assert.equal(JSON.stringify(h.sessions), before);
});

test('a task finishing neither requests again nor resets the interval for the tasks still pending', async (t) => {
  const platform = new Map([[61, queuedAttempt], [63, queuedAttempt]]);
  const h = await refreshHarness(t, [['a', receiptOf(61)], ['b', receiptOf(63)]], platform);
  h.control.hold = true;
  h.flush();
  assert.deepEqual(h.calls.map((call) => call.id), [61, 63]);
  // The round takes 90 seconds; 61 comes back final and 63 does not.
  h.tick(90000);
  platform.set(61, finalAttempt(80));
  h.control.hold = false;
  h.release();
  await h.settled();
  assert.deepEqual(h.rows().map((row) => [row.id, row.badge]), [['a', '评分完成'], ['b', '排队中']]);
  assert.deepEqual(h.calls.map((call) => call.id), [61, 63]);
  // The next round is still due 120 seconds after the first one began, and asks for 63 only.
  h.tick(29000);
  assert.equal(h.calls.length, 2);
  h.tick(1000);
  assert.deepEqual(h.calls.map((call) => call.id), [61, 63, 63]);
});

test('failed and rejected receipts stay failed or rejected against a lookup that is not final', async (t) => {
  const platform = new Map([[61, queuedAttempt], [62, evaluatingAttempt]]);
  const h = await refreshHarness(t, [
    ['a', receiptOf(61, { status: 'failed', scoringState: { state: 'failed', scoreIsFinal: false } })],
    ['b', receiptOf(62, { status: 'rejected', scoringState: { state: 'rejected', scoreIsFinal: false } })],
  ], platform);
  h.flush();
  assert.equal(h.calls.length, 0);
  h.button().props.onClick();
  assert.deepEqual(h.calls.map((call) => call.id), [61, 62]);
  await h.settled();
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['失败', '—'], ['未通过', '—']]);
});

test('a stored result is ignored once its receipt has changed, even when the result is not final', async (t) => {
  const platform = new Map([[61, { status: 'failed', scoringState: { state: 'failed', scoreIsFinal: false } }]]);
  const h = await refreshHarness(t, [['a', receiptOf(61)]], platform);
  h.flush();
  await h.settled();
  assert.deepEqual(h.rows().map((row) => row.badge), ['失败']);
  // The same submission id is uploaded again: the receipt is submitted, and the old failure no longer applies.
  h.sessions[0].projectionValues.playgroundTask.receipt = { attemptId: 61, ok: true, status: 'submitted' };
  h.flush();
  assert.deepEqual(h.rows().map((row) => row.badge), ['已提交']);
  // It is unscored again, so it is read again on the next round.
  platform.set(61, finalAttempt(80));
  h.tick(twoMinutes);
  assert.equal(h.calls.length, 2);
  await h.settled();
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['评分完成', '80 分']]);
});

test('a newer receipt saved by a result query is not overwritten by an older stored lookup', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, queuedAttempt]]));
  h.flush();
  await h.settled();
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['排队中', '—']]);
  h.sessions[0].projectionValues.playgroundTask.receipt = receiptOf(61, evaluatingAttempt);
  h.flush();
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['评测中', '参考 41']]);
});

test('an attempt that omits fields keeps the values of the receipt', async (t) => {
  const receipt = { attemptId: 61, ok: true, status: 'queued', bundleStatus: 'ready', scoringState: { state: 'evaluating', scoreIsFinal: false, provisionalScore: 41 } };
  const h = await refreshHarness(t, [['a', receipt]], new Map([[61, { status: 'scoring' }]]));
  h.flush();
  await h.settled();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.rows().map((row) => [row.badge, row.score]), [['评测中', '参考 41']]);
});

test('awaiting_review is polled like pending_review, and an incomplete bundle is not', async (t) => {
  const h = await refreshHarness(t, [
    ['a', { attemptId: 61, ok: true, status: 'awaiting_review' }],
    ['b', { attemptId: 62, ok: true, status: 'submitted', scoringState: { state: 'awaiting_review' } }],
    ['c', { attemptId: 63, ok: true, status: 'pending_review' }],
    ['d', { attemptId: 64, ok: true, status: 'awaiting_review', bundleStatus: 'incomplete' }],
  ], new Map([[61, finalAttempt(70)], [62, finalAttempt(71)], [63, finalAttempt(72)]]));
  h.flush();
  assert.deepEqual(h.calls.map((call) => call.id), [61, 62, 63]);
  await h.settled();
  assert.deepEqual(h.rows().map((row) => [row.id, row.score]), [['a', '70 分'], ['b', '71 分'], ['c', '72 分'], ['d', '—']]);
});

test('pending submissions that appear after the workbench opened are read once, without a second opening round', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61, finalAttempt(80))]], new Map([[61, queuedAttempt]]));
  h.flush();
  assert.equal(h.calls.length, 0);
  h.sessions[0].projectionValues.playgroundTask.receipt = receiptOf(61);
  h.flush();
  assert.equal(h.calls.length, 1);
  await h.settled();
  h.sessions[0].projectionValues.playgroundTask.receipt = receiptOf(62);
  h.flush();
  assert.equal(h.calls.length, 1);
});

test('a refresh keeps at most four requests in flight', async (t) => {
  const ids = [61, 62, 63, 64, 65, 66];
  const h = await refreshHarness(t, ids.map((id) => [`s${id}`, receiptOf(id)]), new Map(ids.map((id) => [id, queuedAttempt])));
  h.control.hold = true;
  h.flush();
  assert.deepEqual(h.calls.map((call) => call.id), [61, 62, 63, 64]);
  h.release();
  await settle();
  assert.deepEqual(h.calls.map((call) => call.id), ids);
  h.control.hold = false;
  h.release();
  await h.settled();
  assert.equal(h.status(), '状态更新于 09:05');
  assert.equal(h.rows().length, 6);
  assert.ok(h.rows().every((row) => row.badge === '排队中'));
});

test('a partial failure does not claim every row is from the last full refresh', async (t) => {
  const platform = new Map([[61, queuedAttempt], [63, new Error('Bearer secret-token')]]);
  const h = await refreshHarness(t, [['a', receiptOf(61, { status: 'submitted' })], ['b', receiptOf(63, { status: 'submitted' })]], platform);
  h.flush();
  await h.settled();
  assert.equal(h.status(), '刷新失败，部分任务显示的不是最新状态');
  assert.deepEqual(h.rows().map((row) => row.badge), ['排队中', '已提交']);
  assert.doesNotMatch(text(h.view.tree), /secret-token|\d\d:\d\d/);
});

test('mounting, cleaning up and mounting again starts a fresh round and drops the first one', async (t) => {
  const h = await refreshHarness(t, [['a', receiptOf(61)]], new Map([[61, queuedAttempt]]));
  h.control.hold = true;
  h.flush();
  assert.equal(h.calls.length, 1);
  h.remount();
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].signal.aborted, false);
  assert.equal(h.document.listeners.size, 1);
  h.control.hold = false;
  h.release();
  await h.settled();
  assert.equal(h.calls.length, 2);
  assert.equal(h.status(), '状态更新于 09:05');
  assert.deepEqual(h.rows().map((row) => row.badge), ['排队中']);
});

// A real Playground client over a fake fetch, so rows go through the real /me/attempts normalizer.
// `respond(url, init)` returns a raw snake_case platform body, a failure from platformFailure(), or a promise of either.
// The fake response only resolves microtasks, so one settle() is enough for a read to land.
const fakeResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const platformFailure = (message, status = 503) => ({ failure: fakeResponse({ error: message }, status) });
const attemptsPage = (items, nextCursor = null) => ({ items, next_cursor: nextCursor, limit: 50 });
function attemptsClient(respond, requests, { token = 'test-token' } = {}) {
  return createPlaygroundClient({ baseUrl: 'https://example.test', token, fetchImpl: async (url, init) => {
    requests.push({ url, init });
    const body = await respond(url, init);
    return body?.failure ?? fakeResponse(body);
  } });
}

const isHistory = (node) => node.type?.name === 'AttemptHistory';
// Row text with runs of whitespace collapsed, since text() joins every child with a space.
const historyRows = (panel) => findAll(panel, (node) => node.type === 'li').map((li) => text(li).replace(/\s+/g, ' '));
const findButton = (panel, label) => findAll(panel, (node) => node.type === 'button' && text(node) === label)[0];
const liveStatus = (panel) => text(findAll(panel, (node) => node.props?.className === 'pg-sr-only')[0]);
const alerts = (panel) => findAll(panel, (node) => node.props?.role === 'alert').map(text);

async function historyFixture(t, respond, state, options) {
  const calls = [];
  const requests = [];
  const f = await localizedFixture(t, {
    connection: { rpc: { call: historyRpc(attemptsClient(respond, requests, options), calls) } },
    remote: { commands: { execute: () => assert.fail('submission history reached command history') } },
  });
  const main = f.registrations.get('main');
  const session = { id: 's', displayTitle: 'Playground · Fixture', retainedBy: { mainView: 1 }, projectionValues: { playgroundTask: state } };
  // The host's real zh translator, so rows render the same `progress.*` text as the task row and drawer.
  const props = { ...main.definition.inject(), t: f.zh, useSessionAccess: () => true, refreshProjections: async () => {},
    useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask: state } } } }) };
  const row = f.find(f.render(main.Component, props), (node) => node.type?.name === 'TaskSummaryRow');
  f.render(row.type, row.props).props.onClick();
  const drawer = f.find(f.render(main.Component, props), (node) => node.type?.name === 'TaskDetailDrawer');
  const history = f.find(f.render(drawer.type, drawer.props), isHistory);
  assert.ok(history, 'the task drawer renders a submission history section');
  const panel = await f.mount(history);
  // mount() leaves the effects of its last render collected; they are the deps a later re-render compares with.
  return { ...f, calls, requests, drawer, history, panel, historyEffects: f.effects.splice(0) };
}

// Re-render a mounted history and run only the effects whose deps changed since `previous`, as React does.
function rerender(f, element, previous) {
  f.effects.length = 0;
  const tree = f.render(element.type, element.props);
  const effects = f.effects.splice(0);
  let ran = 0;
  effects.forEach((run, index) => {
    const old = previous[index];
    if (old && run.deps && old.deps?.length === run.deps.length && run.deps.every((dep, i) => Object.is(dep, old.deps[i]))) return;
    ran++;
    run();
  });
  return { tree, effects, ran };
}

const historyTask = (extra = {}) => ({ task: { challengeId: 'fixture', title: 'Fixture', mode: 'participate' }, prepared: null, receipt: null, ...extra });
// A receipt shaped like confirm()'s CLI-path output, with the confirmedAt stamp receiptOf writes
// (test/workflow.test.mjs checks that confirm writes it). withReceipt replays it as the
// /playground-confirm command/done text, the way the projection receives a confirmed receipt.
const confirmedReceipt = (attemptId, confirmedAt, extra = {}) => ({ ok: true, baseUrl: 'http://127.0.0.1:15000/api', attemptId,
  status: 'submitted', bundleStatus: 'ready', traceCount: 1, challengeTitle: 'Fixture',
  args: { challenge_id: 'fixture', bundle_path: 'bundle.zip', trace_path: 'trace.json', attempt_id: attemptId }, confirmedAt, ...extra });
const withReceipt = (state, receipt) => workflowProjection.apply(state,
  { type: 'command/done', data: { text: JSON.stringify({ playgroundWorkflow: { kind: 'receipt', receipt }, ...receipt }) } });

test('the task drawer lists every account submission for the challenge and marks only this conversation\'s', async (t) => {
  const f = await historyFixture(t, () => attemptsPage([
    { id: 101, challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: null, created_at: '2026-10-01T08:00:00Z' },
    { id: 102, challenge_id: 'fixture', status: 'submitted', scoring_state: 'final', score: 80, created_at: '2026-10-02T08:00:00Z' },
    { id: 103, challenge_id: 'fixture', status: 'failed', score: null, created_at: '2026-10-03T08:00:00Z' },
  ]), historyTask({ receipt: { ok: true, attemptId: 102 }, attemptIds: [102] }));
  assert.deepEqual(f.calls.map(([route, endpoint, payload]) => [route, endpoint, payload.args.input]),
    [['/api', 'playgroundQueries/query', { action: 'my_attempts', challengeId: 'fixture', limit: 50 }]]);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url.pathname, '/api/me/attempts');
  assert.deepEqual(Object.fromEntries(url.searchParams), { limit: '50', challenge_id: 'fixture' });
  assert.equal(init.headers.authorization, 'Bearer test-token');
  assert.ok(init.signal instanceof AbortSignal);
  const rows = historyRows(f.panel);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /提交 #103 .* · 评测未通过 · — 失败/);
  assert.match(rows[1], /提交 #102 .* · 已出最终分 · 80 分 评分完成/);
  assert.match(rows[2], /提交 #101 .* · 评测中 · — 排队中/);
  assert.doesNotMatch(rows[2], /分 /);
  const tones = findAll(f.panel, (node) => node.type === 'li').map((li) => f.find(li, (node) => node.props?.className === 'pg-badge').props['data-tone']);
  assert.deepEqual(tones, ['error', 'success', 'warning']);
  assert.deepEqual(rows.filter((row) => row.includes('本对话')).map((row) => row.match(/#(\d+)/)[1]), ['102']);
  assert.equal(rows.filter((row) => row.includes('未关联到对话')).length, 2);
  assert.equal(findButton(f.panel, '加载更多'), undefined);
  assert.equal(liveStatus(f.panel), '已加载 3 条提交');
});

// #21: a snake_case row is final only for scoring_state final or late_scored, so a queued 0 is not a score.
test('history rows show a queued 0 as pending and a late_scored row as a final score after the deadline', async (t) => {
  const f = await historyFixture(t, () => attemptsPage([
    { id: 201, challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: 0, created_at: '2026-10-01T08:00:00Z' },
    { id: 202, challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: 7, created_at: '2026-10-02T08:00:00Z' },
    { id: 203, challenge_id: 'fixture', status: 'scored', scoring_state: 'late_scored', score: 64, created_at: '2026-10-03T08:00:00Z' },
  ]), historyTask());
  const items = findAll(f.panel, (node) => node.type === 'li');
  const rows = historyRows(f.panel);
  const tone = (li) => f.find(li, (node) => node.props?.className === 'pg-badge').props['data-tone'];
  assert.match(rows[0], /提交 #203 .* · 已出最终分（赛后） · 64 分 赛后已评分/);
  assert.equal(tone(items[0]), 'success');
  assert.match(rows[1], /提交 #202 .* · 评测中 · 参考 7 排队中/);
  assert.equal(tone(items[1]), 'warning');
  assert.match(rows[2], /提交 #201 .* · 评测中 · — 排队中/);
  assert.doesNotMatch(rows[2], /0 分/);
  assert.equal(tone(items[2]), 'warning');
});

test('history rows take a settled result from the workbench refresh, but never a less settled one', async (t) => {
  const queued = { challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: 0, updated_at: '2026-10-05T08:00:00Z' };
  const f = await historyFixture(t, () => attemptsPage([
    { ...queued, id: 301, created_at: '2026-10-01T08:00:00Z' },
    { id: 302, challenge_id: 'fixture', status: 'scored', scoring_state: 'final', score: 50, created_at: '2026-10-02T08:00:00Z' },
    { ...queued, id: 303, created_at: '2026-10-03T08:00:00Z' },
    { ...queued, id: 304, created_at: '2026-10-04T08:00:00Z' },
    // Re-uploaded under the same id after the stored result was fetched.
    { ...queued, id: 305, created_at: '2026-10-04T09:00:00Z', updated_at: '2026-10-06T08:00:00Z' },
    // No updated_at: the guard cannot compare dates, so it fails open and applies the dated entry.
    { id: 306, challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: 0, created_at: '2026-10-04T10:00:00Z' },
  ]), historyTask());
  assert.equal(f.requests.length, 1);
  const failed = { status: 'failed', score: null, scoringState: { state: 'failed', scoreIsFinal: false }, updatedAt: '2026-10-05T09:00:00Z' };
  const attempts = {
    301: { attempt: { status: 'scored', score: 90, scoringState: { state: 'final', scoreIsFinal: true, displayScore: 90 } } },
    302: { attempt: { status: 'queued', score: 0, scoringState: { state: 'queued', scoreIsFinal: false } } },
    303: { attempt: { status: 'submitted', score: 0, scoringState: { state: 'evaluating', scoreIsFinal: false } } },
    304: { attempt: failed },
    305: { attempt: failed },
    306: { attempt: failed },
  };
  const { tree, ran } = rerender(f, { type: f.history.type, props: { ...f.history.props, attempts } }, f.historyEffects);
  const rows = historyRows(tree);
  const tones = findAll(tree, (node) => node.type === 'li').map((li) => f.find(li, (node) => node.props?.className === 'pg-badge').props['data-tone']);
  assert.equal(rows.length, 6);
  assert.match(rows[0], /提交 #306 .* · 评测未通过 · — 失败/);
  assert.equal(tones[0], 'error');
  assert.match(rows[1], /提交 #305 .* · 评测中 · — 排队中/);
  assert.equal(tones[1], 'warning');
  assert.match(rows[2], /提交 #304 .* · 评测未通过 · — 失败/);
  assert.equal(tones[2], 'error');
  assert.match(rows[3], /提交 #303 .* · 评测中 · — 排队中/);
  assert.equal(tones[3], 'warning');
  assert.match(rows[4], /提交 #302 .* · 已出最终分 · 50 分/);
  assert.match(rows[5], /提交 #301 .* · 已出最终分 · 90 分/);
  // Reading the store is not another poll: the re-render's read effect kept its deps and did not run.
  assert.equal(ran, 0);
  await settle();
  assert.equal(f.requests.length, 1);
});

test('submission history derives attribution from an old receipt and loads further pages on request', async (t) => {
  const pages = {
    '': attemptsPage([{ id: 7, challenge_id: 'fixture', scoring_state: 'final', score: 80, created_at: '2026-10-02T08:00:00Z' }], 'page-2'),
    'page-2': attemptsPage([{ id: 5, challenge_id: 'fixture', score: null, created_at: '2026-10-01T08:00:00Z' }]),
  };
  // A projection persisted before attemptIds existed only has the latest receipt.
  const f = await historyFixture(t, (url) => pages[url.searchParams.get('cursor') || ''], historyTask({ receipt: { ok: true, attemptId: 7 } }));
  assert.equal(liveStatus(f.panel), '已加载 1 条提交');
  let focused = 0;
  f.find(f.panel, (node) => node.type === 'ul').props.ref({ focus: () => { focused++; } });
  await findButton(f.panel, '加载更多').props.onClick();
  const panel = f.render(f.history.type, f.history.props);
  assert.deepEqual(f.requests.map(({ url }) => url.searchParams.get('cursor')), [null, 'page-2']);
  const rows = historyRows(panel);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /提交 #7.*本对话/);
  assert.match(rows[1], /提交 #5.*未关联到对话/);
  assert.equal(findButton(panel, '加载更多'), undefined);
  assert.equal(focused, 1, 'focus moves to the list when the last page removes "加载更多"');
  assert.equal(f.find(panel, (node) => node.type === 'ul').props.tabIndex, -1);
  assert.equal(liveStatus(panel), '已加载 2 条提交');
});

test('submission history shows each attempt once and skips rows without an id', async (t) => {
  const row = (id, day) => ({ ...(id ? { id } : {}), challenge_id: 'fixture', score: null, created_at: `2026-10-0${day}T08:00:00Z` });
  const pages = {
    '': attemptsPage([row(3, 3), row(3, 3), row(undefined, 4)], 'page-2'),
    'page-2': attemptsPage([row(3, 3), row(2, 2)]),
  };
  const f = await historyFixture(t, (url) => pages[url.searchParams.get('cursor') || ''], historyTask());
  assert.deepEqual(historyRows(f.panel).map((item) => item.match(/提交 #(\S+)/)[1]), ['3']);
  await findButton(f.panel, '加载更多').props.onClick();
  const panel = f.render(f.history.type, f.history.props);
  assert.deepEqual(historyRows(panel).map((item) => item.match(/提交 #(\S+)/)[1]), ['3', '2']);
  assert.equal(liveStatus(panel), '已加载 2 条提交');
});

test('submission history explains signed-out, failed and empty reads', async (t) => {
  const signedOut = /登录后可查看提交历史。关闭任务详情后，在“Playground 连接状态”中登录。/;
  for (const [respond, options, expected, alert] of [
    [() => assert.fail('a signed-out read must not reach the platform'), { token: '' }, signedOut, false],
    [() => platformFailure('token expired', 401), undefined, signedOut, false],
    [() => platformFailure('upstream returned 503'), undefined, /Playground 平台请求失败：upstream returned 503/, true],
    [() => attemptsPage([]), undefined, /这道题还没有提交记录/, false],
  ]) {
    const f = await historyFixture(t, respond, historyTask(), options);
    const content = text(f.panel);
    assert.match(content, expected);
    assert.equal(findAll(f.panel, (node) => node.type === 'li').length, 0);
    assert.equal(alerts(f.panel).length > 0, alert);
    assert.equal(Boolean(findButton(f.panel, '重试')), alert, 'only a failed read offers 重试');
    if (!expected.test('这道题还没有提交记录')) assert.doesNotMatch(content, /这道题还没有提交记录/);
  }
});

test('a failed first read offers 重试, which reads the first page again', async (t) => {
  let failing = true;
  const f = await historyFixture(t, () => (failing ? platformFailure('upstream returned 503')
    : attemptsPage([{ id: 9, challenge_id: 'fixture', scoring_state: 'final', score: 80, created_at: '2026-10-02T08:00:00Z' }])), historyTask());
  assert.equal(alerts(f.panel).length, 1);
  const retry = findButton(f.panel, '重试');
  assert.ok(retry, 'a failed first read renders 重试');
  failing = false;
  await retry.props.onClick();
  const panel = f.render(f.history.type, f.history.props);
  assert.deepEqual(f.requests.map(({ url }) => url.searchParams.get('cursor')), [null, null]);
  assert.deepEqual(historyRows(panel).map((item) => item.match(/提交 #(\d+)/)[1]), ['9']);
  assert.deepEqual(alerts(panel), []);
  assert.equal(findButton(panel, '重试'), undefined);
  assert.equal(liveStatus(panel), '已加载 1 条提交');
});

// A fake DOM node for a callback ref; counts focus() calls.
const focusTarget = () => ({ focused: 0, focus() { this.focused++; } });
const heading = (f, panel) => f.find(panel, (node) => node.type === 'h3');

test('a successful 重试 moves focus to the list once it attaches, not to the heading', async (t) => {
  let failing = true;
  const f = await historyFixture(t, () => (failing ? platformFailure('upstream returned 503')
    : attemptsPage([{ id: 9, challenge_id: 'fixture', scoring_state: 'final', score: 80, created_at: '2026-10-02T08:00:00Z' }])), historyTask());
  const title = focusTarget();
  heading(f, f.panel).props.ref(title);
  failing = false;
  await findButton(f.panel, '重试').props.onClick();
  const panel = f.render(f.history.type, f.history.props);
  const list = focusTarget();
  const ul = f.find(panel, (node) => node.type === 'ul');
  ul.props.ref(null);
  ul.props.ref(list);
  assert.equal(list.focused, 1, 'the list takes focus when it attaches after 重试');
  assert.equal(title.focused, 0);
  // The flag is cleared, so later commits (the inline ref runs again) do not steal focus.
  ul.props.ref(list);
  assert.equal(list.focused, 1);
});

test('a 重试 that ends empty or signed out focuses the section heading', async (t) => {
  for (const [second, expected] of [
    [() => attemptsPage([]), '这道题还没有提交记录。'],
    [() => platformFailure('token expired', 401), '登录后可查看提交历史。'],
  ]) {
    let respond = () => platformFailure('upstream returned 503');
    const f = await historyFixture(t, () => respond(), historyTask());
    const title = focusTarget();
    assert.equal(heading(f, f.panel).props.tabIndex, -1);
    heading(f, f.panel).props.ref(title);
    respond = second;
    await findButton(f.panel, '重试').props.onClick();
    const panel = f.render(f.history.type, f.history.props);
    assert.equal(f.find(panel, (node) => node.type === 'ul'), undefined);
    assert.equal(findButton(panel, '重试'), undefined);
    assert.equal(title.focused, 1, `focus moves to the heading when the result is: ${expected}`);
    assert.equal(liveStatus(panel), expected);
  }
});

test('a failed read, including a repeated 重试 failure, announces 提交历史读取失败。', async (t) => {
  const f = await historyFixture(t, () => platformFailure('upstream returned 503'), historyTask());
  assert.equal(liveStatus(f.panel), '提交历史读取失败。');
  const title = focusTarget();
  heading(f, f.panel).props.ref(title);
  await findButton(f.panel, '重试').props.onClick();
  const panel = f.render(f.history.type, f.history.props);
  assert.equal(liveStatus(panel), '提交历史读取失败。');
  assert.equal(alerts(panel).length, 1);
  assert.ok(findButton(panel, '重试'), '重试 stays in place and keeps focus');
  assert.equal(title.focused, 0);
});

test('a failed 加载更多 keeps the loaded rows and shows the error', async (t) => {
  const f = await historyFixture(t, (url) => (url.searchParams.get('cursor') ? platformFailure('upstream returned 503')
    : attemptsPage([{ id: 7, challenge_id: 'fixture', scoring_state: 'final', score: 80, created_at: '2026-10-02T08:00:00Z' }], 'page-2')), historyTask());
  await findButton(f.panel, '加载更多').props.onClick();
  const panel = f.render(f.history.type, f.history.props);
  assert.deepEqual(historyRows(panel).map((item) => item.match(/提交 #(\d+)/)[1]), ['7']);
  assert.equal(alerts(panel).length, 1);
  assert.match(alerts(panel)[0], /Playground 平台请求失败：upstream returned 503/);
  const more = findButton(panel, '加载更多');
  assert.ok(more, '加载更多 stays available for another try');
  assert.equal(more.props.disabled, false);
  assert.equal(findButton(panel, '重试'), undefined);
});

test('a submission attributed in the same drawer reloads the first page of the history', async (t) => {
  let items = [{ id: 102, challenge_id: 'fixture', scoring_state: 'final', score: 80, created_at: '2026-10-02T08:00:00Z' }];
  const before = withReceipt(historyTask({ attemptIds: [] }), confirmedReceipt(102, '2026-10-02T08:00:00.000Z'));
  const f = await historyFixture(t, () => attemptsPage(items), before);
  assert.equal(f.history.props.key, 's:fixture:102:2026-10-02T08:00:00.000Z');
  // An unchanged projection keeps the element key, so a re-render does not refetch.
  assert.equal(f.find(f.render(f.drawer.type, f.drawer.props), isHistory).props.key, 's:fixture:102:2026-10-02T08:00:00.000Z');
  // Confirming in the drawer's task card refreshes the projection with the new attributed attempt.
  items = [{ id: 104, challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: null, created_at: '2026-10-03T08:00:00Z' }, ...items];
  const after = withReceipt(before, confirmedReceipt(104, '2026-10-03T08:00:00.000Z'));
  const next = f.find(f.render(f.drawer.type, { ...f.drawer.props, projection: { state: 'ready', values: { playgroundTask: after } } }), isHistory);
  assert.equal(next.props.key, 's:fixture:104:2026-10-03T08:00:00.000Z');
  assert.deepEqual(next.props.attemptIds, [102, 104]);
  // React remounts an element whose key changed; mount() reproduces that with fresh state and effects.
  const panel = await f.mount(next);
  assert.deepEqual(f.requests.map(({ url }) => url.searchParams.get('cursor')), [null, null]);
  const rows = historyRows(panel);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /提交 #104.*本对话/);
  assert.match(rows[1], /提交 #102.*本对话/);
});

test('a re-upload under the same id reloads the history once, and a store publish alone does not', async (t) => {
  const row = { id: 102, challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: null, created_at: '2026-10-02T08:00:00Z' };
  // The first upload under 102 was rejected; the failed receipt keeps the id for the retry.
  const before = withReceipt(historyTask({ attemptIds: [] }), confirmedReceipt(102, '2026-10-02T08:00:00.000Z',
    { ok: false, bundleStatus: 'failed', violations: [{ message: 'bad bundle' }], error: { code: 'bundle_invalid', message: 'The platform rejected the bundle; see violations.' } }));
  assert.deepEqual(before.attemptIds, [102]);
  const f = await historyFixture(t, () => attemptsPage([row]), before);
  assert.equal(f.history.props.key, 's:fixture:102:2026-10-02T08:00:00.000Z');
  assert.equal(f.requests.length, 1);
  // A store publish re-renders the drawer with new refresh results but the same projection.
  const attempts = { 102: { attempt: { status: 'submitted', score: 0, scoringState: { state: 'evaluating', scoreIsFinal: false } } } };
  const published = f.find(f.render(f.drawer.type, { ...f.drawer.props, attempts }), isHistory);
  assert.equal(published.props.key, f.history.props.key);
  assert.equal(rerender(f, published, f.historyEffects).ran, 0);
  await settle();
  assert.equal(f.requests.length, 1);
  // "查询结果" spreads the fetched attempt, including its updatedAt, into the receipt but keeps the stamp.
  const queried = withReceipt(before, { ...before.receipt, status: 'failed', updatedAt: '2026-10-03T08:00:00Z' });
  const queriedHistory = f.find(f.render(f.drawer.type, { ...f.drawer.props, projection: { state: 'ready', values: { playgroundTask: queried } } }), isHistory);
  assert.equal(queriedHistory.props.key, f.history.props.key);
  // A retry uploads a new bundle under id 102; confirm writes a new receipt with the same id and a new stamp.
  const after = withReceipt(queried, confirmedReceipt(102, '2026-10-05T08:00:00.000Z'));
  assert.deepEqual(after.attemptIds, [102]);
  const drawerProps = { ...f.drawer.props, projection: { state: 'ready', values: { playgroundTask: after } } };
  const next = f.find(f.render(f.drawer.type, drawerProps), isHistory);
  assert.equal(next.props.key, 's:fixture:102:2026-10-05T08:00:00.000Z');
  assert.deepEqual(next.props.attemptIds, [102]);
  // React remounts an element whose key changed; mount() reproduces that with fresh state and effects.
  await f.mount(next);
  const mounted = f.effects.splice(0);
  assert.equal(f.requests.length, 2);
  // Further renders with the same receipt keep the new key and do not read again.
  const again = f.find(f.render(f.drawer.type, { ...drawerProps, attempts }), isHistory);
  assert.equal(again.props.key, next.props.key);
  assert.equal(rerender(f, again, mounted).ran, 0);
  await settle();
  assert.equal(f.requests.length, 2);
});

test('only the newest submission-history request updates the list', async (t) => {
  const pending = [];
  const f = await historyFixture(t, (url, init) => new Promise((resolve) => pending.push({ challengeId: url.searchParams.get('challenge_id'), signal: init.signal, resolve })), historyTask());
  // Re-run the mount effect for another challenge while the first read is still pending.
  const next = { ...f.history.props, challengeId: 'other' };
  f.effects.length = 0;
  f.render(f.history.type, next);
  f.effects.splice(0).forEach((effect) => effect());
  await settle();
  assert.equal(pending.length, 2);
  assert.deepEqual(pending.map((item) => item.challengeId), ['fixture', 'other']);
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending[1].signal.aborted, false);
  pending[1].resolve(attemptsPage([{ id: 2, challenge_id: 'other', score: null, created_at: '2026-10-02T08:00:00Z' }]));
  await settle();
  pending[0].resolve(attemptsPage([{ id: 1, challenge_id: 'fixture', score: null, created_at: '2026-10-01T08:00:00Z' }]));
  await settle();
  const content = text(f.render(f.history.type, next));
  assert.match(content, /提交 #2/);
  assert.doesNotMatch(content, /提交 #1/);
});
