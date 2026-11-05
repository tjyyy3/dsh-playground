import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPlaygroundClient } from '../lib/api.js';
import { publicChallengeUrl } from '../lib/links.js';
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
  find(render(row.type, row.props), (n) => n.props?.className === 'pg-task-row-select').props.onClick();
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
  f.find(f.render(row.type, row.props), (n) => n.props?.className === 'pg-task-row-select').props.onClick();
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

// Shared setup for the "open conversation" tests: one task session in the workbench, openTask recorded.
// Navigation is deferred by one microtask, so callers await settle() before reading `opened`.
// `options.reject` and `options.throws` are read at call time, so a test can change the outcome between clicks.
async function openTaskFixture(t, options = {}) {
  const f = await clientFixture(t);
  const Main = f.registrations.get('main').Component;
  const opened = [];
  const openTask = (id) => {
    opened.push(id);
    if (options.throws) throw Error('openSession threw');
    return options.reject ? Promise.reject(Error('session gone')) : undefined;
  };
  const session = { id: 's', displayTitle: 'Playground · Fixture' };
  const state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'participate' }, prepared: null, receipt: null };
  session.projectionValues = { playgroundTask: state };
  const props = { useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask: state } } } }),
    useSessionAccess: () => true, refreshProjections: async () => {}, run: async () => ({ ok: true }), openTask, openChat: () => {}, login: async () => {}, t: (s) => s };
  const drawer = () => f.find(f.render(Main, props), (n) => n.type?.name === 'TaskDetailDrawer');
  const row = () => { const element = f.find(f.render(Main, props), (n) => n.type?.name === 'TaskSummaryRow'); return f.render(element.type, element.props); };
  const announcement = () => text(f.find(f.render(Main, props), (n) => n.props?.role === 'status'));
  const visibleError = () => f.find(f.render(Main, props), (n) => n.props?.className?.includes?.('pg-open-error'));
  return { ...f, opened, drawer, row, announcement, visibleError };
}

test('a task row has two sibling buttons and "打开对话" opens the conversation without the drawer', async (t) => {
  const { opened, drawer, row } = await openTaskFixture(t);
  const tree = row();
  assert.notEqual(tree.type, 'button', 'the row itself is a container, not a button');
  assert.equal(tree.props.role, 'listitem');
  const buttons = findAll(tree, (n) => n.type === 'button');
  assert.equal(buttons.length, 2);
  // Neither button contains another button.
  for (const button of buttons) assert.equal(findAll(button, (n) => n.type === 'button').length, 1);
  const [select, open] = buttons;
  assert.equal(select.props.className, 'pg-task-row-select');
  // The only task is selected by default, so the main area keeps aria-pressed.
  assert.equal(select.props['aria-pressed'], true);
  assert.ok(text(select).includes('Fixture'));
  assert.equal(open.props['aria-label'], '打开对话：Fixture');
  assert.equal(text(open), '打开对话');
  open.props.onClick();
  await settle();
  assert.deepEqual(opened, ['s']);
  assert.equal(drawer(), undefined);
  select.props.onClick();
  assert.ok(drawer());
  assert.deepEqual(opened, ['s']);
});

test('the task drawer header opens the task conversation next to "关闭"', async (t) => {
  const { opened, drawer, row, render, find } = await openTaskFixture(t);
  find(row(), (n) => n.props?.className === 'pg-task-row-select').props.onClick();
  const element = drawer();
  const header = find(render(element.type, element.props), (n) => n.props?.className === 'pg-drawer-header');
  const labels = findAll(header, (n) => n.type === 'button').map((n) => n.props['aria-label']);
  assert.deepEqual(labels, ['打开任务对话：Fixture', '关闭任务详情']);
  find(header, (n) => n.type === 'button' && n.props['aria-label'] === '打开任务对话：Fixture').props.onClick();
  assert.equal(drawer(), undefined, 'the drawer closes once navigation starts');
  await settle();
  assert.deepEqual(opened, ['s']);
});

test('a rejected task conversation navigation is caught and announced from both buttons', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const { opened, drawer, row, render, find, announcement } = await openTaskFixture(t, { reject: true });
  find(row(), (n) => n.props?.className === 'pg-task-row-open').props.onClick();
  await settle();
  assert.deepEqual(opened, ['s']);
  assert.equal(announcement(), '无法打开任务对话，请重试。');
  assert.equal(drawer(), undefined);
  find(row(), (n) => n.props?.className === 'pg-task-row-select').props.onClick();
  assert.equal(announcement(), '已打开任务：Playground · Fixture');
  const element = drawer();
  find(render(element.type, element.props), (n) => n.type === 'button' && n.props['aria-label'] === '打开任务对话：Fixture').props.onClick();
  await settle();
  assert.deepEqual(opened, ['s', 's']);
  assert.equal(announcement(), '无法打开任务对话，请重试。');
  assert.equal(warn.mock.callCount(), 2);
});

test('a synchronous throw from openTask is caught and the drawer still closes', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const { opened, drawer, row, render, find, announcement } = await openTaskFixture(t, { throws: true });
  find(row(), (n) => n.props?.className === 'pg-task-row-select').props.onClick();
  const element = drawer();
  const open = find(render(element.type, element.props), (n) => n.type === 'button' && n.props['aria-label'] === '打开任务对话：Fixture');
  assert.doesNotThrow(() => open.props.onClick());
  assert.equal(drawer(), undefined, 'close() runs even though openTask throws');
  await settle();
  assert.deepEqual(opened, ['s']);
  assert.equal(announcement(), '无法打开任务对话，请重试。');
  assert.equal(warn.mock.callCount(), 1);
});

test('two consecutive failures from the same button both announce', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { opened, row, find, announcement } = await openTaskFixture(t, { reject: true });
  for (const attempt of [1, 2]) {
    find(row(), (n) => n.props?.className === 'pg-task-row-open').props.onClick();
    // The live region is emptied before navigating, so the same message is a fresh change each time.
    assert.equal(announcement(), '', `attempt ${attempt} clears the previous announcement`);
    await settle();
    assert.equal(announcement(), '无法打开任务对话，请重试。', `attempt ${attempt} is announced`);
  }
  assert.deepEqual(opened, ['s', 's']);
});

test('a failed navigation shows a visible note near the task list until the next attempt', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { row, find, visibleError } = await openTaskFixture(t, { reject: true });
  assert.equal(visibleError(), undefined);
  find(row(), (n) => n.props?.className === 'pg-task-row-open').props.onClick();
  await settle();
  const note = visibleError();
  assert.ok(note, 'the failure is visible');
  assert.equal(note.type, 'p');
  assert.equal(note.props.className, 'pg-note pg-error pg-open-error');
  assert.equal(note.props.role, 'none', 'the live region already announces it');
  assert.equal(text(note), '无法打开任务对话，请重试。');
  // The next attempt clears the note as it starts.
  find(row(), (n) => n.props?.className === 'pg-task-row-open').props.onClick();
  assert.equal(visibleError(), undefined);
  // Let the second rejection land while console.warn is still mocked; it shows the note again.
  await settle();
  assert.ok(visibleError());
});

test('a successful navigation after a failure leaves no visible note', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const options = { reject: true };
  const { opened, row, find, visibleError } = await openTaskFixture(t, options);
  find(row(), (n) => n.props?.className === 'pg-task-row-open').props.onClick();
  await settle();
  assert.ok(visibleError());
  options.reject = false;
  find(row(), (n) => n.props?.className === 'pg-task-row-open').props.onClick();
  await settle();
  assert.equal(visibleError(), undefined);
  assert.deepEqual(opened, ['s', 's']);
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
    find(render(row.type, row.props), (n) => n.props?.className === 'pg-task-row-select').props.onClick();
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
  part('pg-task-row-select').props.onClick();
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
async function refreshHarness(t, receipts, platform, { visibility = 'visible', archived, uiWorkspace } = {}) {
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
    ...(uiWorkspace ? { uiWorkspace } : {}),
  });
  const Main = f.registrations.get('main').Component;
  const task = (title) => ({ challengeId: 'fixture', title, mode: 'participate' });
  const sessions = receipts.map(([id, receipt]) => ({ id, displayTitle: `Playground · ${id}`,
    projectionValues: { playgroundTask: { task: task(id), prepared: null, receipt } } }));
  const actions = f.registrations.get('main').definition.inject();
  const props = () => ({ ...actions, useSessions: (select) => select({ ids: sessions.map((item) => item.id), byId: Object.fromEntries(sessions.map((item) => [item.id, item])),
    projectionsBySession: Object.fromEntries(sessions.map((item) => [item.id, { state: 'ready', values: item.projectionValues }])) }),
  ...(archived ? { useWorkspaces: (select) => select({ phase: 'ready', items: [], archivedSessionIds: archived, pinnedSessionIds: [] }) } : {}),
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

test('archived tasks are neither polled nor read by the refresh button', async (t) => {
  const platform = new Map([[61, queuedAttempt], [62, queuedAttempt], [63, queuedAttempt]]);
  const h = await refreshHarness(t, [['a', receiptOf(61)], ['b', receiptOf(62)], ['c', receiptOf(63)]], platform, { archived: ['b'] });
  h.flush();
  assert.deepEqual(h.calls.map((call) => call.id), [61, 63]);
  await h.settled();
  h.tick(twoMinutes);
  assert.deepEqual(h.calls.map((call) => call.id), [61, 63, 61, 63]);
  await h.settled();
  h.button().props.onClick();
  assert.deepEqual(h.calls.map((call) => call.id).slice(4), [61, 63]);
  await h.settled();
  assert.deepEqual(h.rows().map((row) => row.id), ['a', 'c']);
});

test('a task with a pending submission can be archived, is not polled while archived, and is polled again after restore', async (t) => {
  const archived = [];
  const uiWorkspace = {
    archiveSession: async (id) => { archived.push(id); },
    unarchiveSession: async (id) => { archived.splice(archived.indexOf(id), 1); },
  };
  const platform = new Map([[61, queuedAttempt]]);
  const h = await refreshHarness(t, [['a', receiptOf(61)]], platform, { archived, uiWorkspace });
  const actions = h.f.registrations.get('main').definition.inject();
  h.flush();
  assert.deepEqual(h.calls.map((call) => call.id), [61]);
  await h.settled();
  assert.deepEqual(await actions.archiveTask('a'), { ok: true });
  h.flush();
  assert.deepEqual(h.rows(), []);
  assert.equal(h.button(), undefined, 'no refresh button without a task in the overview');
  h.tick(twoMinutes);
  await h.settled();
  assert.deepEqual(h.calls.map((call) => call.id), [61], 'the interval does not read an archived task');
  assert.deepEqual(await actions.unarchiveTask('a'), { ok: true });
  h.flush();
  // The receipt is untouched by the archive: the card is back with its pending state.
  assert.deepEqual(h.rows(), [{ id: 'a', badge: '排队中', score: '—' }]);
  assert.equal(h.sessions[0].projectionValues.playgroundTask.receipt.attemptId, 61);
  h.tick(twoMinutes);
  assert.deepEqual(h.calls.map((call) => call.id), [61, 61], 'polling resumes after restore');
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
  h.f.find(h.f.render(element.type, element.props), (node) => node.props?.className === 'pg-task-row-select').props.onClick();
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
  f.find(f.render(row.type, row.props), (node) => node.props?.className === 'pg-task-row-select').props.onClick();
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

const isOpenWeb = (node) => node.type === 'button' && (node.props.children || []).includes('在网页中打开');

test('catalog cards open the challenge web page in a new noopener window', async (t) => {
  const f = await clientFixture(t, { connection: { rpc: { call: async () => ({ ok: true, value: { webBase: 'https://play.bohrium.com',
    competitions: { items: [] }, challenges: { items: [
      { id: 'ai-github-98fdb6f0', title: 'Confirmed', webUrl: 'https://play.bohrium.com/challenge/ai-github-98fdb6f0' },
      { id: 'a b/c', title: 'Encoded', webUrl: 'https://play.bohrium.com/challenge/a%20b%2Fc' },
      { id: 'local', title: 'Local mock', webUrl: 'http://127.0.0.1:15000/challenge/local' },
      { id: 'upper', title: 'Upper https', webUrl: 'HTTPS://PLAY.BOHRIUM.COM/challenge/upper' },
      { id: 'upper-local', title: 'Upper localhost', webUrl: 'HTTP://LOCALHOST:1/challenge/upper-local' },
      { id: 'ipv6', title: 'IPv6 loopback', webUrl: 'http://[::1]:1/challenge/ipv6' },
      { id: 'plain', title: 'Plain http', webUrl: 'http://play.example.test/challenge/plain' },
      { id: 'script', title: 'Script', webUrl: 'javascript:alert(1)' },
      { id: 'data', title: 'Data', webUrl: 'data:text/html,<p>x</p>' },
      { id: 'account', title: 'Account', webUrl: 'https://user:secret@play.bohrium.com/challenge/account' },
      { id: 'none', title: 'Missing' },
    ] } } }) } } });
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  // Opening a web page needs no conversation, so the button shows even when task starts are blocked.
  const panel = await f.mount(f.workbench(undefined).catalog);
  const cards = findAll(panel, (node) => node.type === 'article');
  assert.equal(cards.length, 11);
  const buttons = cards.map((card) => findAll(card, isOpenWeb));
  assert.deepEqual(buttons.map((list) => list.length), [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
  assert.equal(buttons[0][0].props['aria-label'], '在网页中打开：Confirmed');
  assert.equal(buttons[0][0].props.disabled, undefined);
  for (const [button] of buttons.slice(0, 6)) button.props.onClick();
  // The opened address is the parsed one: scheme and host are lowercased.
  assert.deepEqual(opened, [
    ['https://play.bohrium.com/challenge/ai-github-98fdb6f0', '_blank', 'noopener,noreferrer'],
    ['https://play.bohrium.com/challenge/a%20b%2Fc', '_blank', 'noopener,noreferrer'],
    ['http://127.0.0.1:15000/challenge/local', '_blank', 'noopener,noreferrer'],
    ['https://play.bohrium.com/challenge/upper', '_blank', 'noopener,noreferrer'],
    ['http://localhost:1/challenge/upper-local', '_blank', 'noopener,noreferrer'],
    ['http://[::1]:1/challenge/ipv6', '_blank', 'noopener,noreferrer'],
  ]);
});

// Renders the main view with one task session, opens its drawer and returns the drawer's "在网页中打开" buttons.
function drawerWebButtons(f) {
  const main = f.registrations.get('main');
  return async (task, { loadCatalog = false } = {}) => {
    f.unmount(main.Component);
    const session = { id: 's', displayTitle: 'Playground · Fixture', retainedBy: { mainView: 1 }, projectionValues: { playgroundTask: { task, prepared: null, receipt: null } } };
    const props = { ...main.definition.inject(), useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: {} }),
      useSessionAccess: () => true, refreshProjections: async () => {}, openTask: () => {}, openChat: () => {}, t: (s) => s };
    let tree = f.render(main.Component, props);
    if (loadCatalog) await f.mount(f.find(tree, (n) => n.type?.name === 'CatalogPanel'));
    const row = f.find(tree, (n) => n.type?.name === 'TaskSummaryRow');
    f.find(f.render(row.type, row.props), (n) => n.props?.className === 'pg-task-row-select').props.onClick();
    tree = f.render(main.Component, props);
    const drawer = f.find(tree, (n) => n.type?.name === 'TaskDetailDrawer');
    return findAll(f.render(drawer.type, drawer.props), isOpenWeb);
  };
}

test('the task drawer opens the task challenge; older tasks use their own API base, then the catalog web root', async (t) => {
  const f = await clientFixture(t, { connection: { rpc: { call: async () => ({ ok: true, value: { webBase: 'https://play.bohrium.com',
    competitions: { items: [] }, challenges: { items: [] } } }) } } });
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  const drawerFor = drawerWebButtons(f);
  const recorded = await drawerFor({ challengeId: 'ai-github-98fdb6f0', title: 'Fixture', mode: 'participate', webUrl: 'https://play.bohrium.com/challenge/ai-github-98fdb6f0' });
  assert.equal(recorded.length, 1);
  recorded[0].props.onClick();
  // A task recorded before webUrl existed: no button until the catalog reports its web root.
  const legacy = { challengeId: 'a b/c', title: 'Fixture', mode: 'participate' };
  assert.equal((await drawerFor(legacy)).length, 0);
  const rebuilt = await drawerFor(legacy, { loadCatalog: true });
  assert.equal(rebuilt.length, 1);
  rebuilt[0].props.onClick();
  // A legacy task that recorded its API base opens that site, before and after the catalog reports another root.
  const local = { challengeId: 'a b/c', title: 'Fixture', mode: 'participate', baseUrl: 'http://127.0.0.1:15000/api' };
  const ownBase = await drawerFor(local);
  assert.equal(ownBase.length, 1);
  ownBase[0].props.onClick();
  const ownBaseAfterCatalog = await drawerFor(local, { loadCatalog: true });
  assert.equal(ownBaseAfterCatalog.length, 1);
  ownBaseAfterCatalog[0].props.onClick();
  // The recorded base keeps account details, query and hash; the derived link drops them.
  const stripped = await drawerFor({ ...local, baseUrl: 'https://user:secret@staging.example.test/api/?q=1#x' }, { loadCatalog: true });
  assert.equal(stripped.length, 1);
  stripped[0].props.onClick();
  assert.deepEqual(opened, [
    ['https://play.bohrium.com/challenge/ai-github-98fdb6f0', '_blank', 'noopener,noreferrer'],
    ['https://play.bohrium.com/challenge/a%20b%2Fc', '_blank', 'noopener,noreferrer'],
    ['http://127.0.0.1:15000/challenge/a%20b%2Fc', '_blank', 'noopener,noreferrer'],
    ['http://127.0.0.1:15000/challenge/a%20b%2Fc', '_blank', 'noopener,noreferrer'],
    ['https://staging.example.test/challenge/a%20b%2Fc', '_blank', 'noopener,noreferrer'],
  ]);
  for (const webUrl of ['http://play.example.test/challenge/x', 'ftp://play.bohrium.com/challenge/x', 'https://user:secret@play.bohrium.com/challenge/x', 'not a url']) {
    // A rejected recorded address is not replaced by one built from the catalog web root.
    assert.equal((await drawerFor({ challengeId: 'x', title: 'Fixture', mode: 'participate', webUrl }, { loadCatalog: true })).length, 0, webUrl);
  }
  assert.equal(opened.length, 5);
});

// The drawer's copy of the web-root rule must agree with the Host's lib/links.js on the same inputs.
test('legacy drawer tasks build the same challenge URL from their API base as publicChallengeUrl', async (t) => {
  const f = await clientFixture(t, { connection: { rpc: { call: async () => ({ ok: true, value: { webBase: 'https://play.bohrium.com',
    competitions: { items: [] }, challenges: { items: [] } } }) } } });
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  const drawerFor = drawerWebButtons(f);
  const id = 'a b/c?d#e';
  // [API base, whether the derived address may be opened]
  for (const [baseUrl, openable] of [
    ['https://play.bohrium.com/api', true],
    ['https://play.bohrium.com/api/', true],
    ['https://play.bohrium.com/', true],
    ['https://host/prefix/api', true],
    ['http://127.0.0.1:15000/api', true],
    ['https://user:secret@host/api', true],
    ['https://user:secret@host:8443/prefix/api?token=secret#frag', true],
    ['https://host/api/?q=1', true],
    ['http://play.example.test/api', false],
    ['https://user:secret@[bad/api', false],
    ['not a url', false],
  ]) {
    const expected = publicChallengeUrl(baseUrl, id);
    for (const loadCatalog of [false, true]) {
      opened.length = 0;
      const buttons = await drawerFor({ challengeId: id, title: 'Fixture', mode: 'participate', baseUrl }, { loadCatalog });
      assert.equal(buttons.length, openable ? 1 : 0, `${baseUrl} → ${expected}`);
      if (!openable) continue;
      buttons[0].props.onClick();
      assert.deepEqual(opened, [[expected, '_blank', 'noopener,noreferrer']], baseUrl);
    }
  }
});

test('legacy drawer tasks derive a web URL only for a non-empty string or finite-number challenge id', async (t) => {
  const f = await clientFixture(t);
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  const drawerFor = drawerWebButtons(f);
  const baseUrl = 'https://play.bohrium.com/api';
  const numeric = await drawerFor({ challengeId: 42, title: 'Fixture', mode: 'participate', baseUrl });
  assert.equal(numeric.length, 1);
  numeric[0].props.onClick();
  assert.deepEqual(opened, [[publicChallengeUrl(baseUrl, 42), '_blank', 'noopener,noreferrer']]);
  for (const challengeId of [{ id: 'x' }, ['x'], Number.NaN, Infinity, true]) {
    assert.equal((await drawerFor({ challengeId, title: 'Fixture', mode: 'participate', baseUrl })).length, 0, String(challengeId));
  }
});

const challengeCard = { id: 'a b/c', title: 'Synthetic', titleZh: '合成赛题', discipline: 'physics', webUrl: 'https://play.bohrium.com/challenge/a%20b%2Fc' };
const challengeDetail = (overrides = {}) => ({ ok: true, id: 'a b/c', title: 'Synthetic', titleZh: '合成赛题', discipline: 'physics', origin: 'github',
  difficulty: 3, status: 'open', attempts: 12, tags: ['optics', 'fitting'],
  resources: [{ name: 'data.csv', kind: 'dataset', description: 'Input table', role: 'input', source: 'https://example.test/data.csv' }],
  contentGated: false, content: 'line 1\nline 2', truncated: false, webUrl: 'https://play.bohrium.com/challenge/a%20b%2Fc', ...overrides });
const buttonLabelled = (label) => (node) => node.type === 'button' && (node.props.children || []).flat(Infinity).includes(label);

// The catalog panel with one card. Detail reads stay pending until a test resolves them, so each
// test controls the order in which reads settle. `open` clicks "查看详情" and mounts the drawer.
async function challengeDrawerHarness(t, { sessionId = 'source', access = true } = {}) {
  const reads = [];
  const call = (_path, _method, { args: { input } }, signal) => {
    if (input.action === 'catalog') return Promise.resolve({ ok: true, value: { webBase: 'https://play.bohrium.com', competitions: { items: [] }, challenges: { items: [challengeCard] } } });
    if (input.action === 'challenge') return new Promise((resolve, reject) => reads.push({ input, signal, resolve, reject }));
    return Promise.resolve({ ok: false, error: { code: 'transport' } });
  };
  const f = await clientFixture(t, { connection: { rpc: { call } } });
  const listeners = new Set();
  globalThis.document = { addEventListener: (type, listener) => { if (type === 'keydown') listeners.add(listener); },
    removeEventListener: (type, listener) => { if (type === 'keydown') listeners.delete(listener); } };
  t.after(() => { delete globalThis.document; });
  const catalogElement = f.workbench(sessionId, access).catalog;
  await f.mount(catalogElement);
  const catalog = () => f.render(catalogElement.type, catalogElement.props);
  const drawerElement = () => f.find(catalog(), (node) => node.type?.name === 'ChallengeDetailDrawer');
  let current;
  // `attach(tree)` runs between the first render and the mount effects, where React attaches the refs.
  const open = (attach) => {
    f.find(catalog(), buttonLabelled('查看详情')).props.onClick();
    const element = drawerElement();
    f.unmount(element.type);
    f.effects.length = 0;
    const tree = f.render(element.type, element.props);
    attach?.(tree);
    const effects = f.effects.splice(0);
    current = { element, effects, cleanups: effects.map((effect) => effect()) };
    return current;
  };
  const view = () => f.render(current.element.type, current.element.props);
  // What React does when the drawer leaves the tree.
  const unmountDrawer = () => current.cleanups.forEach((cleanup) => cleanup?.());
  const respond = async (index, value) => { reads[index].resolve({ ok: true, value }); await settle(); };
  return { f, reads, listeners, open, view, catalog, drawerElement, unmountDrawer, respond, escape: () => [...listeners].forEach((listener) => listener({ key: 'Escape' })) };
}

test('"查看详情" opens a challenge drawer that reads the detail once and shows facts, tags, resources and the web button', async (t) => {
  const h = await challengeDrawerHarness(t);
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  const button = h.f.find(h.catalog(), buttonLabelled('查看详情'));
  assert.equal(button.props['aria-label'], '查看详情：合成赛题');
  assert.equal(h.drawerElement(), undefined);
  h.open();
  assert.deepEqual(h.reads.map((read) => read.input), [{ action: 'challenge', challengeId: 'a b/c' }]);
  // Before the read settles the drawer already names the card's challenge.
  let tree = h.view();
  assert.equal(tree.props.className, 'pg-drawer-backdrop');
  const aside = h.f.find(tree, (node) => node.type === 'aside');
  assert.equal(aside.props.role, 'dialog');
  assert.equal(aside.props['aria-modal'], true);
  assert.match(text(tree), /合成赛题[\s\S]*正在读取赛题详情/);
  await h.respond(0, challengeDetail());
  tree = h.view();
  const content = text(tree);
  for (const expected of ['题目编号：a b/c', '方向', 'physics', '来源', 'github', '难度', '3', '状态', '提交次数', '12', 'optics', 'fitting',
    'data.csv', 'dataset', 'input', 'Input table', '来源：https://example.test/data.csv']) assert.ok(content.includes(expected), expected);
  // A resource source is text only: the drawer renders no link at all.
  assert.equal(findAll(tree, (node) => node.type === 'a' || node.props?.href !== undefined).length, 0);
  // Rendering again does not read again.
  h.view();
  assert.equal(h.reads.length, 1);
  findAll(tree, isOpenWeb)[0].props.onClick();
  assert.deepEqual(opened, [['https://play.bohrium.com/challenge/a%20b%2Fc', '_blank', 'noopener,noreferrer']]);
});

test('the challenge statement is collapsed until "展开题面" and then shows plain text with its line breaks', async (t) => {
  const h = await challengeDrawerHarness(t);
  h.open();
  // The note's number is the Host's `contentLimit`, not a number written into the Client.
  await h.respond(0, challengeDetail({ content: '# Heading\n\n**bold** line 2', truncated: true, contentLimit: 1234 }));
  let tree = h.view();
  assert.equal(h.f.find(tree, (node) => node.type === 'pre'), undefined);
  assert.doesNotMatch(text(tree), /Heading/);
  const toggle = h.f.find(tree, buttonLabelled('展开题面'));
  assert.equal(toggle.props['aria-expanded'], false);
  toggle.props.onClick();
  tree = h.view();
  const statement = h.f.find(tree, (node) => node.type === 'pre');
  assert.equal(statement.props.className, 'pg-statement');
  // The statement is one text child, unchanged: no markdown rendering, line breaks kept.
  assert.deepEqual(statement.props.children, ['# Heading\n\n**bold** line 2']);
  assert.equal(h.f.find(tree, buttonLabelled('收起题面')).props['aria-expanded'], true);
  assert.match(text(tree), /题面超过 1234 字，这里只显示前 1234 字/);
  assert.doesNotMatch(text(tree), /50000/);
  h.f.find(tree, buttonLabelled('收起题面')).props.onClick();
  assert.equal(h.f.find(h.view(), (node) => node.type === 'pre'), undefined);
});

test('a truncated statement without a usable contentLimit names no number', async (t) => {
  for (const contentLimit of [undefined, 0, -1, 1.5, '50000']) {
    const h = await challengeDrawerHarness(t);
    h.open();
    await h.respond(0, challengeDetail({ truncated: true, ...(contentLimit === undefined ? {} : { contentLimit }) }));
    h.f.find(h.view(), buttonLabelled('展开题面')).props.onClick();
    const content = text(h.view());
    assert.match(content, /题面过长，这里只显示前一部分；完整题面请在网页中查看。/, String(contentLimit));
    assert.doesNotMatch(content, /题面超过/, String(contentLimit));
    h.unmountDrawer();
  }
});

test('repeated challenge tags render once each, with unique keys', async (t) => {
  const h = await challengeDrawerHarness(t);
  h.open();
  await h.respond(0, challengeDetail({ tags: ['optics', 'fitting', 'optics', 'fitting', 'optics'] }));
  const list = h.f.find(h.view(), (node) => node.type === 'ul' && node.props['aria-label'] === '标签');
  const items = findAll(list, (node) => node.type === 'li');
  assert.deepEqual(items.map((item) => item.props.key), ['optics', 'fitting']);
  assert.deepEqual(items.map((item) => text(item)), ['optics', 'fitting']);
});

test('the challenge drawer subscribes to Escape once and calls the newest close', async (t) => {
  const h = await challengeDrawerHarness(t);
  const opened = h.open();
  assert.equal(h.listeners.size, 1);
  // A catalog re-render hands the drawer a new close function; the Escape effect must not resubscribe.
  const next = h.drawerElement();
  assert.notEqual(next.props.close, opened.element.props.close);
  let closed = 0;
  const { ran } = rerender(h.f, { type: next.type, props: { ...next.props, close: () => { closed += 1; } } }, opened.effects);
  assert.equal(ran, 0);
  assert.equal(h.listeners.size, 1);
  h.escape();
  assert.equal(closed, 1);
  assert.equal(h.reads[0].signal.aborted, true);
});

test('a gated challenge statement asks the user to read it on the web', async (t) => {
  const h = await challengeDrawerHarness(t);
  h.open();
  await h.respond(0, challengeDetail({ contentGated: true, content: '' }));
  const tree = h.view();
  assert.match(text(tree), /题面需要权限，请在网页中查看/);
  assert.equal(h.f.find(tree, buttonLabelled('展开题面')), undefined);
  assert.equal(findAll(tree, isOpenWeb).length, 1);
});

test('the challenge drawer closes from its button, the backdrop and Escape, aborting the read; reopening reads again', async (t) => {
  const h = await challengeDrawerHarness(t);
  const closers = [
    ['button', () => h.f.find(h.view(), (node) => node.type === 'button' && node.props['aria-label'] === '关闭赛题详情').props.onClick()],
    ['backdrop', () => h.view().props.onMouseDown()],
    ['escape', () => h.escape()],
  ];
  for (const [index, [label, closeIt]] of closers.entries()) {
    h.open();
    assert.equal(h.reads.length, index + 1, label);
    assert.equal(h.listeners.size, 1, label);
    // A press inside the drawer stays inside it.
    let stopped = false;
    h.f.find(h.view(), (node) => node.type === 'aside').props.onMouseDown({ stopPropagation: () => { stopped = true; } });
    assert.equal(stopped, true);
    assert.ok(h.drawerElement(), label);
    closeIt();
    assert.equal(h.drawerElement(), undefined, label);
    assert.equal(h.reads[index].signal.aborted, true, label);
    h.unmountDrawer();
    assert.equal(h.listeners.size, 0, label);
    // A late answer to the aborted read changes nothing.
    await h.respond(index, challengeDetail({ titleZh: 'Late title' }));
    assert.doesNotMatch(text(h.view()), /Late title/, label);
  }
});

test('only the newest challenge read updates the drawer', async (t) => {
  const h = await challengeDrawerHarness(t);
  h.open();
  h.f.find(h.view(), (node) => node.type === 'button' && node.props['aria-label'] === '关闭赛题详情').props.onClick();
  h.unmountDrawer();
  h.open();
  assert.equal(h.reads.length, 2);
  assert.equal(h.reads[1].signal.aborted, false);
  await h.respond(1, challengeDetail({ titleZh: 'Fresh title' }));
  await h.respond(0, challengeDetail({ titleZh: 'Stale title' }));
  const content = text(h.view());
  assert.match(content, /Fresh title/);
  assert.doesNotMatch(content, /Stale title/);
});

test('a failed challenge read shows a fixed message and "重试" without tokens or local paths', async (t) => {
  const h = await challengeDrawerHarness(t);
  h.open();
  const leaks = /secret-token|Bearer|Users|someone|upstream|\/home\//;
  // A business throw that reaches the Client as a gateway error.
  h.reads[0].resolve({ ok: false, error: { code: 'gateway/internal', message: 'upstream said no' } });
  await settle();
  let tree = h.view();
  // Cause-neutral: the same text covers network, missing challenge, access and an old Host.
  assert.match(text(h.f.find(tree, (node) => node.props?.role === 'alert')), /^赛题详情读取失败，请稍后重试，或在网页中查看。$/);
  assert.doesNotMatch(text(tree), leaks);
  h.f.find(tree, buttonLabelled('重试')).props.onClick();
  assert.equal(h.reads.length, 2);
  assert.deepEqual(h.reads[1].input, { action: 'challenge', challengeId: 'a b/c' });
  // A failure inside the result is shown the same way.
  await h.respond(1, { ok: false, error: { message: 'Bearer secret-token at C:\\Users\\someone\\x and /home/someone' } });
  tree = h.view();
  assert.match(text(tree), /赛题详情读取失败/);
  assert.doesNotMatch(text(tree), leaks);
  h.f.find(tree, buttonLabelled('重试')).props.onClick();
  h.reads[2].reject(new Error('Bearer secret-token'));
  await settle();
  assert.doesNotMatch(text(h.view()), leaks);
  h.f.find(h.view(), buttonLabelled('重试')).props.onClick();
  await h.respond(3, challengeDetail());
  tree = h.view();
  assert.equal(h.f.find(tree, (node) => node.props?.role === 'alert'), undefined);
  assert.match(text(tree), /data\.csv/);
});

test('the drawer start button closes the drawer and opens the workspace dialog through requestTask', async (t) => {
  const h = await challengeDrawerHarness(t);
  h.open();
  await h.respond(0, challengeDetail());
  const start = h.f.find(h.view(), (node) => node.type?.name === 'StartTaskButton');
  assert.equal(start.props.disabled, false);
  assert.equal(start.props.sessionId, 'source');
  const button = h.f.render(start.type, start.props);
  assert.match(text(button), /^开始参赛任务/);
  button.props.onClick();
  assert.equal(h.drawerElement(), undefined);
  const overlay = h.f.registrations.get('playground.task-start').definition.inject();
  assert.deepEqual(overlay.hooks.taskRequest.getSnapshot(), { id: 'a b/c', title: '合成赛题', mode: 'participate', sessionId: 'source' });
});

test('the drawer start button follows the catalog card start rule', async (t) => {
  for (const [sessionId, access, note] of [[null, true, '打开一个 DSH 对话后才能从目录创建任务。'], ['source', false, '当前连接没有在此对话中创建任务的权限。']]) {
    const h = await challengeDrawerHarness(t, { sessionId, access });
    // The card's start is blocked, but "查看详情" stays usable (calling onClick alone would pass on a disabled button).
    const catalog = h.catalog();
    assert.equal(h.f.find(catalog, (node) => node.type?.name === 'StartTaskButton').props.disabled, true, note);
    assert.notEqual(h.f.find(catalog, buttonLabelled('查看详情')).props.disabled, true, note);
    h.open();
    await h.respond(0, challengeDetail());
    const tree = h.view();
    assert.equal(h.f.find(tree, (node) => node.type?.name === 'StartTaskButton').props.disabled, true);
    assert.ok(text(tree).includes(note), note);
    // Opening the web page needs no conversation.
    assert.equal(findAll(tree, isOpenWeb).length, 1);
    h.unmountDrawer();
  }
});

// Archive: tasks a, b and c in the workbench, with DSH's archive set on the workspace list snapshot. The
// default uiWorkspace records each call (with all its arguments) and updates the set as DSH does.
async function archiveFixture(t, { archived = ['b'], running, uiWorkspace, useWorkspaces, mainView } = {}) {
  const calls = [];
  const set = { ids: archived };
  const ui = uiWorkspace ?? {
    archiveSession: async (...args) => { calls.push(['archive', ...args]); set.ids = [...set.ids, args[0]]; },
    unarchiveSession: async (...args) => { calls.push(['unarchive', ...args]); set.ids = set.ids.filter((id) => id !== args[0]); },
  };
  const f = await clientFixture(t, { uiWorkspace: ui });
  const main = f.registrations.get('main');
  const opened = [];
  const sessions = ['a', 'b', 'c'].map((id) => ({ id, displayTitle: `Playground · ${id}`, running: id === running,
    ...(id === mainView ? { retainedBy: { mainView: 1 } } : {}),
    projectionValues: { playgroundTask: { task: { challengeId: 'fixture', title: `Task ${id}`, mode: 'participate' }, prepared: null, receipt: null } } }));
  const props = () => ({ ...main.definition.inject(),
    useSessions: (select) => select({ ids: sessions.map((item) => item.id), byId: Object.fromEntries(sessions.map((item) => [item.id, item])), projectionsBySession: {} }),
    ...(useWorkspaces === null ? {} : { useWorkspaces: useWorkspaces ?? ((select) => select({ phase: 'ready', items: [], archivedSessionIds: set.ids, pinnedSessionIds: [] })) }),
    useSessionAccess: () => true, refreshProjections: async () => {}, run: async () => ({ ok: true }),
    openTask: (id) => { opened.push(id); }, openChat: () => { opened.push('chat'); }, login: async () => {}, t: (s) => s });
  // Renders like React: after each render, the workbench's effects whose dependencies changed clean up and
  // run again, and a second render shows what they changed.
  const slots = [];
  const renderOnce = () => {
    f.effects.length = 0;
    const result = f.render(main.Component, props());
    f.effects.splice(0).forEach((run, index) => {
      const slot = slots[index];
      if (slot && run.deps && slot.deps?.length === run.deps.length && run.deps.every((dep, i) => Object.is(dep, slot.deps[i]))) return;
      slot?.cleanup?.();
      slots[index] = { deps: run.deps, cleanup: run() };
    });
    return result;
  };
  const tree = () => { renderOnce(); return renderOnce(); };
  const rows = () => findAll(tree(), (n) => n.type?.name === 'TaskSummaryRow').map((element) => element.props);
  const count = () => text(f.find(tree(), (n) => n.props?.className === 'pg-badge' && /个任务/.test(text(n))));
  const toggle = () => f.find(tree(), (n) => n.props?.className === 'pg-archived-toggle');
  const archivedRows = () => findAll(tree(), (n) => n.type?.name === 'ArchivedTaskRow').map((element) => f.render(element.type, element.props));
  const announcement = () => text(f.find(tree(), (n) => n.props?.role === 'status'));
  const openDrawer = (id) => rows().find((row) => row.session.id === id).onSelect();
  const drawerElement = () => f.find(tree(), (n) => n.type?.name === 'TaskDetailDrawer');
  const drawer = () => { const element = drawerElement(); return element && f.render(element.type, element.props); };
  const closeDrawer = () => drawerElement().props.close();
  const control = () => {
    const element = f.find(drawer(), (n) => n.type?.name === 'TaskArchiveControl');
    return element && f.render(element.type, element.props);
  };
  const controlButton = () => findAll(control(), (n) => n.type === 'button')[0];
  const headerButton = () => f.find(tree(), (n) => n.type === 'button' && /^(返回所选任务对话|打开 DSH 对话)$/.test(text(n)));
  const selectedRows = () => rows().filter((row) => row.selected).map((row) => row.session.id);
  // One render without running effects: a test attaches refs on it before `tree()` runs the effects.
  const renderOnly = () => f.render(main.Component, props());
  return { ...f, calls, set, sessions, opened, tree, renderOnly, rows, count, toggle, archivedRows, announcement, openDrawer, drawer, closeDrawer, control, controlButton, headerButton, selectedRows };
}

test('the task overview counts only tasks that are not archived and lists archived ones behind 已归档 M 个', async (t) => {
  const a = await archiveFixture(t);
  assert.deepEqual(a.rows().map((row) => row.session.id), ['a', 'c']);
  assert.equal(a.count(), '2 个任务');
  assert.equal(text(a.toggle()), '已归档 1 个');
  assert.equal(a.toggle().props['aria-expanded'], false);
  assert.deepEqual(a.archivedRows(), [], 'archived tasks are collapsed by default');
  a.toggle().props.onClick();
  assert.equal(a.toggle().props['aria-expanded'], true);
  const [row] = a.archivedRows();
  assert.match(text(row), /Task b/);
  const buttons = findAll(row, (n) => n.type === 'button');
  assert.deepEqual(buttons.map((n) => [text(n), n.props['aria-label']]), [['取消归档', '取消归档：Task b']]);
  // Nothing archived: no toggle at all.
  const none = await archiveFixture(t, { archived: [] });
  assert.equal(none.count(), '3 个任务');
  assert.equal(none.toggle(), undefined);
});

test('an archived task is not selected by default, even when it is the conversation in the main view', async (t) => {
  const a = await archiveFixture(t, { archived: ['a'], mainView: 'a' });
  assert.deepEqual(a.rows().filter((row) => row.selected).map((row) => row.session.id), ['b']);
  a.find(a.tree(), (n) => n.type === 'button' && text(n) === '返回所选任务对话').props.onClick();
  assert.deepEqual(a.opened, ['b']);
});

test('归档任务 archives through DSH without stopping work, then the drawer offers 撤销', async (t) => {
  const a = await archiveFixture(t);
  a.openDrawer('a');
  assert.equal(text(a.controlButton()), '归档任务');
  assert.equal(a.controlButton().props.disabled, false);
  assert.equal(findAll(a.control(), (n) => n.type === 'button').length, 1);
  a.controlButton().props.onClick();
  // aria-disabled, not disabled, so the focused button keeps focus; a second press does nothing.
  assert.equal(a.controlButton().props['aria-disabled'], true, 'unavailable while the call is in flight');
  assert.equal(a.controlButton().props.disabled, false);
  assert.equal(text(a.controlButton()), '正在归档…');
  a.controlButton().props.onClick();
  await settle();
  // Exactly the session id: never { stopActivity: true }.
  assert.deepEqual(a.calls, [['archive', 'a']]);
  assert.deepEqual(a.rows().map((row) => row.session.id), ['c']);
  assert.equal(a.count(), '1 个任务');
  assert.equal(text(a.toggle()), '已归档 2 个');
  assert.equal(a.announcement(), '任务已归档');
  // No confirmation dialog: the drawer stays open on the archived task.
  assert.match(text(a.control()), /已归档/);
  // The same single button now reads 撤销: it is not replaced, so keyboard focus stays on it.
  assert.equal(findAll(a.control(), (n) => n.type === 'button').length, 1);
  assert.equal(text(a.controlButton()), '撤销');
  assert.equal(a.controlButton().props['aria-disabled'], undefined);
  a.controlButton().props.onClick();
  await settle();
  assert.deepEqual(a.calls, [['archive', 'a'], ['unarchive', 'a']]);
  assert.deepEqual(a.rows().map((row) => row.session.id), ['a', 'c']);
  assert.equal(text(a.controlButton()), '归档任务');
});

test('取消归档 in the archived list restores the task to the overview', async (t) => {
  const a = await archiveFixture(t);
  a.toggle().props.onClick();
  findAll(a.archivedRows()[0], (n) => n.type === 'button')[0].props.onClick();
  await settle();
  assert.deepEqual(a.calls, [['unarchive', 'b']]);
  assert.deepEqual(a.rows().map((row) => row.session.id), ['a', 'b', 'c']);
  assert.equal(a.count(), '3 个任务');
  assert.equal(a.toggle(), undefined);
});

test('归档任务 is disabled with the reason while the conversation is running', async (t) => {
  const a = await archiveFixture(t, { running: 'a' });
  a.openDrawer('a');
  const button = a.controlButton();
  assert.equal(text(button), '归档任务');
  assert.equal(button.props.disabled, true);
  assert.equal(button.props['aria-describedby'], 'pg-archive-running');
  assert.match(text(a.control()), /对话正在运行，停止后再归档。/);
  assert.deepEqual(a.calls, []);
});

test('a refused archive shows a short reason, never the raw error, and leaves the task in place', async (t) => {
  const failures = [];
  const ui = { archiveSession: async () => { throw failures.shift(); }, unarchiveSession: async () => {} };
  const a = await archiveFixture(t, { uiWorkspace: ui });
  const archiveError = (rpcError) => Object.assign(Error(`workspace session archive failed: ${rpcError.code}: ${rpcError.message}`), { name: 'WorkspaceArchiveError', rpcError });
  const cases = [
    [archiveError({ code: 'workspace/session-active', message: 'session has running work', details: { activity: {} } }), '对话还有运行中的工作（回复、子代理、后台作业或定时任务），停止后再归档。'],
    [archiveError({ code: 'storage/failed', message: 'disk full' }), '归档未完成：disk full。请重试。'],
    [Object.assign(Error('cannot write D:\\data\\registry.json'), { stack: 'Error: at archive (D:\\data\\x.js:1:1)' }), '归档未完成，请重试。'],
  ];
  a.openDrawer('a');
  for (const [failure, message] of cases) {
    failures.push(failure);
    a.controlButton().props.onClick();
    await settle();
    const note = a.find(a.control(), (n) => n.props?.className === 'pg-note pg-error pg-archive-error');
    assert.equal(text(note), message);
    assert.equal(note.props.role, 'alert');
    assert.equal(a.announcement(), message);
    assert.doesNotMatch(text(a.tree()), /D:\\|at archive|storage\/failed/);
    assert.equal(text(a.controlButton()), '归档任务', 'the task is still not archived');
  }
  assert.deepEqual(a.rows().map((row) => row.session.id), ['a', 'c']);
});

test('without DSH archive support nothing is archived, the controls are hidden, and a missing call never throws', async (t) => {
  for (const useWorkspaces of [null, (select) => select({ phase: 'ready', items: [] })]) {
    const a = await archiveFixture(t, { useWorkspaces });
    assert.deepEqual(a.rows().map((row) => row.session.id), ['a', 'b', 'c']);
    assert.equal(a.count(), '3 个任务');
    assert.equal(a.toggle(), undefined);
    a.openDrawer('a');
    assert.ok(a.find(a.tree(), (n) => n.type?.name === 'TaskDetailDrawer'));
    assert.equal(a.control(), null, 'no 归档任务 button');
    assert.doesNotMatch(text(a.tree()), /归档/);
  }
  // The archive set is reported but uiWorkspace has no archive call: a short message, no throw.
  const a = await archiveFixture(t, { uiWorkspace: { openSession: () => {} } });
  a.openDrawer('a');
  a.controlButton().props.onClick();
  await settle();
  assert.equal(text(a.find(a.control(), (n) => n.props?.className === 'pg-note pg-error pg-archive-error')), '当前 DSH 版本不支持归档对话。');
  const actions = a.registrations.get('main').definition.inject();
  assert.deepEqual(await actions.unarchiveTask('b'), { ok: false, message: '当前 DSH 版本不支持取消归档对话。' });
  const bare = await clientFixture(t);
  assert.deepEqual(await bare.registrations.get('main').definition.inject().archiveTask('a'), { ok: false, message: '当前 DSH 版本不支持归档对话。' });
});

test('归档任务 is disabled with the reason for the conversation open in DSH\'s main view', async (t) => {
  const a = await archiveFixture(t, { archived: [], mainView: 'a' });
  a.openDrawer('a');
  const button = a.controlButton();
  assert.equal(text(button), '归档任务');
  assert.equal(button.props.disabled, true);
  assert.equal(button.props['aria-describedby'], 'pg-archive-main-view');
  assert.match(text(a.control()), /这是 DSH 当前打开的对话，请先在侧边栏切换到其他对话再归档。/);
  // Another task in the same workbench can be archived.
  a.openDrawer('c');
  assert.equal(a.controlButton().props.disabled, false);
  assert.doesNotMatch(text(a.control()), /当前打开的对话/);
  a.controlButton().props.onClick();
  await settle();
  assert.deepEqual(a.calls, [['archive', 'c']]);
  // Both reasons at once are both described.
  const both = await archiveFixture(t, { archived: [], mainView: 'a', running: 'a' });
  both.openDrawer('a');
  assert.equal(both.controlButton().props['aria-describedby'], 'pg-archive-running pg-archive-main-view');
});

test('an archived task\'s drawer is read-only and nothing navigates to its conversation', async (t) => {
  const a = await archiveFixture(t);
  a.openDrawer('a');
  const drawerButtons = () => findAll(a.drawer(), (n) => n.type === 'button').map(text);
  assert.ok(drawerButtons().includes('打开任务对话'));
  assert.ok(a.find(a.drawer(), (n) => n.type?.name === 'SelectedTask'));
  a.controlButton().props.onClick();
  await settle();
  assert.ok(!drawerButtons().includes('打开任务对话'), 'no 打开任务对话 for an archived task');
  assert.equal(a.find(a.drawer(), (n) => n.type?.name === 'SelectedTask'), undefined, 'no check or confirm controls');
  assert.match(text(a.drawer()), /此任务已归档。DSH 不会打开已归档的对话；撤销后才能继续检查材料和确认提交。/);
  assert.ok(a.find(a.drawer(), (n) => n.type?.name === 'AttemptHistory'), 'the submission history is still shown');
  assert.match(text(a.control()), /已归档/);
  // The header skips the archived selection.
  a.headerButton().props.onClick();
  assert.deepEqual(a.opened, ['c']);
  // Archived tasks never get a row with 打开对话: they are only in the archived list.
  assert.ok(!a.rows().some((row) => row.session.id === 'a'));
  a.toggle().props.onClick();
  assert.ok(a.archivedRows().every((row) => !findAll(row, (n) => n.type === 'button').some((n) => /打开/.test(text(n)))));
  // 撤销 brings the controls back.
  a.controlButton().props.onClick();
  await settle();
  assert.ok(drawerButtons().includes('打开任务对话'));
  assert.ok(a.find(a.drawer(), (n) => n.type?.name === 'SelectedTask'));
});

test('closing the drawer of an archived task selects the first task that is not archived, or none', async (t) => {
  const a = await archiveFixture(t);
  a.openDrawer('a');
  a.controlButton().props.onClick();
  await settle();
  assert.ok(a.drawer(), 'the drawer stays open on the archived task');
  a.closeDrawer();
  assert.equal(a.drawer(), undefined);
  assert.deepEqual(a.selectedRows(), ['c']);
  a.headerButton().props.onClick();
  assert.deepEqual(a.opened, ['c']);
  // Nothing left that is not archived.
  const none = await archiveFixture(t, { archived: ['b', 'c'] });
  none.openDrawer('a');
  none.controlButton().props.onClick();
  await settle();
  none.closeDrawer();
  assert.deepEqual(none.rows(), []);
  assert.equal(none.drawer(), undefined);
  assert.equal(text(none.headerButton()), '打开 DSH 对话');
  none.headerButton().props.onClick();
  assert.deepEqual(none.opened, ['chat']);
});

test('an archive failure stays with its task: another task\'s drawer and the closed drawer do not show it', async (t) => {
  const ui = { archiveSession: async () => { throw Object.assign(Error('x'), { rpcError: { code: 'storage/failed', message: 'disk full' } }); }, unarchiveSession: async () => {} };
  const a = await archiveFixture(t, { uiWorkspace: ui });
  const errorNote = (node) => a.find(node, (n) => n.props?.className === 'pg-note pg-error pg-archive-error');
  a.openDrawer('a');
  a.controlButton().props.onClick();
  await settle();
  assert.equal(text(errorNote(a.control())), '归档未完成：disk full。请重试。');
  a.openDrawer('c');
  assert.equal(errorNote(a.control()), undefined, 'task c does not show task a\'s failure');
  a.openDrawer('a');
  assert.equal(errorNote(a.control()), undefined, 'reopening clears the old failure');
  a.controlButton().props.onClick();
  await settle();
  assert.ok(errorNote(a.control()));
  a.closeDrawer();
  assert.equal(errorNote(a.tree()), undefined, 'closing the drawer clears it');
});

test('an unarchive failure in the host\'s own format shows only the generic message', async (t) => {
  const ui = { archiveSession: async () => {}, unarchiveSession: async () => { throw Error('workspace session unarchive failed: storage/failed: registry write failed'); } };
  const a = await archiveFixture(t, { uiWorkspace: ui });
  a.toggle().props.onClick();
  findAll(a.archivedRows()[0], (n) => n.type === 'button')[0].props.onClick();
  await settle();
  const note = a.find(a.tree(), (n) => n.props?.className === 'pg-note pg-error pg-archive-error');
  assert.equal(text(note), '取消归档未完成，请重试。');
  assert.equal(a.announcement(), '取消归档未完成，请重试。');
  assert.doesNotMatch(text(a.tree()), /workspace session|storage\/failed|registry/);
  assert.equal(text(a.toggle()), '已归档 1 个', 'the task is still archived');
  const actions = a.registrations.get('main').definition.inject();
  assert.deepEqual(await actions.unarchiveTask('b'), { ok: false, message: '取消归档未完成，请重试。' });
});

const CLI_WARNING = 'Playground CLI 版本过旧（0.1.43，最新 0.1.47），可能影响评分。请用官方安装脚本 https://play.bohrium.com/install.sh 更新。';

test('#45: the confirmation card shows the CLI precheck result and an outdated-CLI warning', async (t) => {
  const f = await clientFixture(t);
  const base = { checkId: 'checked', challenge: { id: 'fixture', title: 'Fixture' }, args: { method: 'm' }, files: [], traceCount: 1 };
  for (const [prepared, expected, warned] of [
    [{ ...base, cliPrecheck: { status: 'passed' }, cliUpdate: { current: '0.1.43', latest: '0.1.47', warning: CLI_WARNING } }, /本地文件检查和 Playground CLI 预检均已通过/, true],
    [{ ...base, cliPrecheck: { status: 'skipped', note: '未找到 Playground CLI，未经 CLI 预检。' } }, /本地文件检查通过；未找到 Playground CLI，未经 CLI 预检。/, false],
    [base, /本地文件检查通过；最终协议/, false],
  ]) {
    const state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'participate' }, prepared, receipt: null };
    const content = text(taskDrawer(f, () => state, async () => ({ ok: true }))());
    assert.match(content, expected);
    assert.equal(content.includes(CLI_WARNING), warned);
    assert.equal(/CLI 需更新/.test(content), warned);
  }
});

test('#45: the login area shows the outdated-CLI warning from the auth query', async (t) => {
  let value = { authenticated: true, user: { name: 'Test user' }, cliUpdate: { current: '0.1.43', latest: '0.1.47', warning: CLI_WARNING } };
  const f = await clientFixture(t, { connection: { rpc: { call: async () => ({ ok: true, value }) } } });
  let content = text(await f.mount(f.workbench(undefined).auth));
  assert.match(content, /已登录/);
  assert.ok(content.includes(CLI_WARNING));
  value = { authenticated: false, cliUpdate: value.cliUpdate };
  content = text(await f.mount(f.workbench(undefined).auth));
  assert.match(content, /未登录/);
  assert.ok(content.includes(CLI_WARNING));
  value = { authenticated: true, user: { name: 'Test user' } };
  content = text(await f.mount(f.workbench(undefined).auth));
  assert.doesNotMatch(content, /CLI 需更新|版本过旧/);
});

// Competition selector: grouped options, default, info row and the query each choice sends.
const competitionTable = [
  { id: 'bohr-product', kind: 'competition', nameZh: '玻尔产品周赛', name: 'Bohrium Product Weekly Contest', status: 'live', startAt: '2026-10-21T16:00:00+08:00',
    dateText: '2026.10.21 起', timeText: '2026.10.21 16:00 起', rounds: '第一期 10.21 16:00 — 11.03 24:00 · 第二期 11.04 16:00 — 11.11 16:00',
    // As the Host sends it during period 2: each period's status, time and page, and the default period.
    periods: [
      { slug: '1', labelZh: '第一期', status: 'ended', startAt: '2026-10-21T16:00:00+08:00', endAt: '2026-11-03T24:00:00+08:00',
        dateText: '2026.10.21 — 2026.11.03', timeText: '2026.10.21 16:00 — 2026.11.03 24:00', webUrl: 'https://play.bohrium.com/competition/bohr-product?period=1' },
      { slug: '2', labelZh: '第二期', status: 'live', startAt: '2026-11-04T16:00:00+08:00', endAt: '2026-11-11T16:00:00+08:00',
        dateText: '2026.11.04 — 2026.11.11', timeText: '2026.11.04 16:00 — 2026.11.11 16:00', webUrl: 'https://play.bohrium.com/competition/bohr-product?period=2' }],
    defaultPeriod: '2', webUrl: 'https://play.bohrium.com/competition/bohr-product' },
  { id: 'knight-s4', kind: 'competition', season: 's4', nameZh: '科学骑士大师赛', status: 'live', dateText: '2026.07.27 — 2027.01.31',
    timeText: '2026.07.27 — 2027.01.31', webUrl: 'https://play.bohrium.com/hackathon-s4' },
  { id: 'season:s5', kind: 'season', season: 's5', nameZh: '春季赛 · 第五季', status: 'upcoming', dateText: '2026.12.01 — 2026.12.08',
    timeText: '2026.12.01 — 2026.12.08', webUrl: 'https://play.bohrium.com/hackathon-s5' },
  { id: 'light-chasing', kind: 'competition', nameZh: '追光者计划·招募赛', status: 'ended', dateText: '2026.10.10 — 2026.10.11',
    timeText: '2026.10.10 20:00 — 2026.10.11 20:00', webUrl: 'javascript:alert(1)' },
  { id: 'paper2arm-s1', kind: 'competition', season: 's1', nameZh: 'Paper2Arm 黑客松 · 第一季', status: 'ended', dateText: '2026.04.17',
    timeText: '2026.04.17', webUrl: 'https://play.bohrium.com/hackathon-s1' },
];

async function competitionPanel(t, table = competitionTable) {
  const calls = [];
  const f = await clientFixture(t, { connection: { rpc: { call: async (_route, _endpoint, payload) => {
    calls.push(payload.args.input);
    return { ok: true, value: { webBase: 'https://play.bohrium.com', competitions: { items: [] }, competitionTable: table,
      challenges: { items: [{ id: 'c1', title: 'Challenge' }] } } };
  } } } });
  const { catalog } = f.workbench('A');
  const panel = await f.mount(catalog);
  const select = (view) => f.find(view, (node) => node.type === 'select');
  const choose = async (value) => { select(f.render(catalog.type, catalog.props)).props.onChange({ target: { value } }); await settle(); return f.render(catalog.type, catalog.props); };
  return { f, calls, panel, select, choose };
}

test('the competition selector groups competitions by status and starts on 全部比赛', async (t) => {
  const { f, calls, panel, select } = await competitionPanel(t);
  const view = select(panel);
  assert.equal(view.props.value, '');
  const [all, ...groups] = view.props.children.flat(Infinity).filter(Boolean);
  assert.equal(all.type, 'option');
  assert.equal(all.props.value, '');
  assert.equal(text(all), '全部比赛');
  assert.deepEqual(groups.map((group) => [group.type, group.props.label]), [['optgroup', '进行中'], ['optgroup', '即将开始'], ['optgroup', '已结束']]);
  const options = (group) => findAll(group, (node) => node.type === 'option').map((node) => [node.props.value, text(node)]);
  assert.deepEqual(options(groups[0]), [
    ['competition:bohr-product', '玻尔产品周赛 · 进行中 · 2026.10.21 起'],
    ['competition:knight-s4', '科学骑士大师赛 · 进行中 · 2026.07.27 — 2027.01.31']]);
  assert.deepEqual(options(groups[1]), [['season:s5', '春季赛 · 第五季 · 即将开始 · 2026.12.01 — 2026.12.08']]);
  assert.deepEqual(options(groups[2]), [
    ['competition:light-chasing', '追光者计划·招募赛 · 已结束 · 2026.10.10 — 2026.10.11'],
    ['competition:paper2arm-s1', 'Paper2Arm 黑客松 · 第一季 · 已结束 · 2026.04.17']]);
  // The first read asks for everything: no competition and no season. There is no info row yet.
  assert.deepEqual(calls, [{ action: 'catalog', search: '', per_page: 20 }]);
  assert.equal(findAll(panel, (node) => node.props?.['aria-label'] === '比赛信息').length, 0);
  assert.equal(findAll(panel, isOpenWeb).length, 0, 'no competition chosen: no competition web button');
  assert.equal(f.find(panel, (node) => node.type === 'optgroup' && !node.props.children.flat(Infinity).length), undefined);
});

test('an empty status group is not rendered', async (t) => {
  const { panel, select } = await competitionPanel(t, [competitionTable[0]]);
  const groups = select(panel).props.children.flat(Infinity).filter((node) => node?.type === 'optgroup');
  assert.deepEqual(groups.map((group) => group.props.label), ['进行中']);
});

test('choosing a competition sends its id, shows the info row and opens its page in the browser', async (t) => {
  const harness = { id: 'harness', kind: 'competition', nameZh: 'Harness 优化赛', name: 'Harness Optimization', status: 'live', startAt: '2026-09-24T20:00:00+08:00',
    dateText: '2026.09.24 起', timeText: '2026.09.24 20:00 起', rounds: '第一季 09.24 20:00 起 · 第二季 10.30 20:00 起', webUrl: 'https://play.bohrium.com/competition/harness' };
  const { calls, choose } = await competitionPanel(t, [...competitionTable, harness]);
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  const panel = await choose('competition:harness');
  assert.deepEqual(calls.at(-1), { action: 'catalog', search: '', competition: 'harness', per_page: 20 });
  const [info] = findAll(panel, (node) => node.props?.['aria-label'] === '比赛信息');
  assert.ok(info);
  assert.match(text(info), /进行中/);
  assert.match(text(info), /时间：2026\.09\.24 20:00 起/);
  assert.match(text(info), /轮次：第一季 09\.24 20:00 起 · 第二季 10\.30 20:00 起/);
  assert.equal(findAll(info, (node) => node.props?.['aria-label'] === '选择分期').length, 0, 'no period choice without periods');
  const [open] = findAll(info, isOpenWeb);
  assert.equal(open.props['aria-label'], '在网页中打开：Harness 优化赛');
  open.props.onClick();
  assert.deepEqual(opened, [['https://play.bohrium.com/competition/harness', '_blank', 'noopener,noreferrer']]);
  // The challenge card keeps its own start, detail and web buttons.
  assert.equal(findAll(panel, (node) => node.type?.name === 'StartTaskButton').length, 1);
  assert.equal(findAll(panel, (node) => node.type === 'button' && /^查看详情/.test(node.props['aria-label'] || '')).length, 1);
});

test('a competition with periods gets a period choice that starts on the default period and opens that period\'s page', async (t) => {
  const { f, calls, choose } = await competitionPanel(t);
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  const panel = await choose('competition:bohr-product');
  assert.deepEqual(calls.at(-1), { action: 'catalog', search: '', competition: 'bohr-product', period: '2', per_page: 20 });
  const info = infoRow(panel);
  const periodSelect = f.find(info, (node) => node.props?.['aria-label'] === '选择分期');
  assert.equal(periodSelect.type, 'select');
  assert.equal(periodSelect.props.value, '2', 'the live period');
  assert.deepEqual(findAll(periodSelect, (node) => node.type === 'option').map((node) => [node.props.value, text(node)]), [
    ['', '全部期'], ['1', '第一期 · 已结束 · 2026.10.21 16:00 — 2026.11.03 24:00'], ['2', '第二期 · 进行中 · 2026.11.04 16:00 — 2026.11.11 16:00']]);
  // The row shows the period's status and time, not the whole competition's rounds.
  const note = squash(text(f.find(info, (node) => node.type === 'p')));
  assert.equal(note, '进行中 第二期 时间：2026.11.04 16:00 — 2026.11.11 16:00');
  const [open] = findAll(info, isOpenWeb);
  assert.equal(open.props['aria-label'], '在网页中打开：玻尔产品周赛 · 第二期');
  open.props.onClick();
  assert.deepEqual(opened, [['https://play.bohrium.com/competition/bohr-product?period=2', '_blank', 'noopener,noreferrer']]);
  // Other competitions have no period choice and send no period.
  const other = await choose('competition:knight-s4');
  assert.deepEqual(calls.at(-1), { action: 'catalog', search: '', competition: 'knight-s4', per_page: 20 });
  assert.equal(f.find(other, (node) => node.props?.['aria-label'] === '选择分期'), undefined);
  for (const value of ['season:s5', 'competition:light-chasing', '']) {
    assert.equal(f.find(await choose(value), (node) => node.props?.['aria-label'] === '选择分期'), undefined, value);
    assert.equal('period' in calls.at(-1), false, value);
  }
});

test('the default period follows the Host; a missing or unknown default starts on 全部期', async (t) => {
  const withDefault = (defaultPeriod) => competitionTable.map((item) => (item.id === 'bohr-product' ? { ...item, defaultPeriod } : item));
  for (const [defaultPeriod, expected] of [['1', '1'], [undefined, ''], ['3', ''], ['', '']]) {
    const { f, calls, choose } = await competitionPanel(t, withDefault(defaultPeriod));
    const panel = await choose('competition:bohr-product');
    assert.equal(f.find(panel, (node) => node.props?.['aria-label'] === '选择分期').props.value, expected, String(defaultPeriod));
    assert.equal(calls.at(-1).period, expected || undefined, String(defaultPeriod));
  }
});

test('changing the period reads page 1 again with the other controls, and 全部期 shows the competition\'s own time', async (t) => {
  const { f, pending, view, control, button, count } = await pagedCatalog(t);
  const opened = [];
  globalThis.window.open = (...args) => { opened.push(args); return null; };
  pending[0].resolve(catalogPage(['c0'], { total: 1 }));
  await settle();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  pending[1].resolve(catalogPage(range(0, 20), { total: 30, hasMore: true }));
  await settle();
  control('排序方式').props.onChange({ target: { value: 'attempts' } });
  pending[2].resolve(catalogPage(range(0, 20), { total: 30, hasMore: true }));
  await settle();
  button('加载更多').props.onClick();
  assert.deepEqual(pending[3].input, { action: 'catalog', search: '', competition: 'bohr-product', period: '2', sort: 'attempts', page: 2, per_page: 20 });
  pending[3].resolve(catalogPage(range(20, 30), { total: 30, hasMore: false }));
  await settle();
  assert.deepEqual(cardIds(view()), range(0, 30));
  // Period 1: page 1 of the same sort; the period 2 cards are hidden while it loads.
  control('选择分期').props.onChange({ target: { value: '1' } });
  assert.deepEqual(pending[4].input, { action: 'catalog', search: '', competition: 'bohr-product', period: '1', sort: 'attempts', per_page: 20 });
  assert.deepEqual(cardIds(view()), []);
  assert.match(text(view()), /正在读取所选比赛的赛题/);
  assert.equal(squash(text(f.find(infoRow(view()), (node) => node.type === 'p'))), '已结束 第一期 时间：2026.10.21 16:00 — 2026.11.03 24:00');
  pending[4].resolve(catalogPage(['p1', 'p2', 'p3'], { total: 3, hasMore: false }));
  await settle();
  assert.deepEqual(cardIds(view()), ['p1', 'p2', 'p3']);
  assert.equal(count(), '共 3 道');
  assert.equal(control('选择分期').props.value, '1');
  // The search keeps the period.
  f.find(view(), (node) => node.type === 'input').props.onChange({ target: { value: 'skill' } });
  f.find(view(), (node) => node.type === 'input').props.onKeyDown({ key: 'Enter' });
  assert.deepEqual(pending[5].input, { action: 'catalog', search: 'skill', competition: 'bohr-product', period: '1', sort: 'attempts', per_page: 20 });
  pending[5].resolve(catalogPage(['p1'], { total: 1 }));
  await settle();
  // 全部期: no period; the row shows the competition's status, time and rounds and opens its page.
  control('选择分期').props.onChange({ target: { value: '' } });
  assert.deepEqual(pending[6].input, { action: 'catalog', search: 'skill', competition: 'bohr-product', sort: 'attempts', per_page: 20 });
  pending[6].resolve(catalogPage(['p1', 'q1'], { total: 2 }));
  await settle();
  const info = infoRow(view());
  assert.equal(squash(text(f.find(info, (node) => node.type === 'p'))), '进行中 时间：2026.10.21 16:00 起 · 轮次：第一期 10.21 16:00 — 11.03 24:00 · 第二期 11.04 16:00 — 11.11 16:00');
  const [open] = findAll(info, isOpenWeb);
  assert.equal(open.props['aria-label'], '在网页中打开：玻尔产品周赛');
  open.props.onClick();
  assert.deepEqual(opened, [['https://play.bohrium.com/competition/bohr-product', '_blank', 'noopener,noreferrer']]);
  assert.deepEqual(cardIds(view()), ['p1', 'q1']);
  // Leaving the competition drops the period; coming back starts on the default period again.
  control('选择比赛').props.onChange({ target: { value: 'competition:knight-s4' } });
  assert.equal('period' in pending[7].input, false);
  pending[7].resolve(catalogPage(['s4'], { total: 1 }));
  await settle();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  assert.equal(pending[8].input.period, '2');
  assert.equal(pending.some((item) => item.input.page !== undefined && item !== pending[3]), false, 'only 加载更多 reads a later page');
});

test('a period answer that arrives after another period was chosen is dropped', async (t) => {
  const { f, pending, view, control } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(['c0'], { total: 1 }));
  await settle();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  pending[1].resolve(catalogPage(['p2a'], { total: 1 }));
  await settle();
  control('选择分期').props.onChange({ target: { value: '1' } });
  control('选择分期').props.onChange({ target: { value: '2' } });
  assert.deepEqual([pending[2].input.period, pending[3].input.period], ['1', '2']);
  assert.equal(pending[2].signal.aborted, true, 'choosing period 2 aborts the period 1 read');
  // The period 1 answer comes first, while period 2 still loads: nothing of it shows; the earlier period 2
  // list stays under the period 2 control.
  pending[2].resolve(catalogPage(['p1-late'], { total: 1, missing: 2 }));
  await settle();
  assert.deepEqual(cardIds(view()), ['p2a']);
  assert.doesNotMatch(text(view()), /读取失败，列表不完整/);
  assert.equal(control('选择分期').props.value, '2');
  pending[3].resolve(catalogPage(['p2a', 'p2b'], { total: 2 }));
  await settle();
  // And once more after period 2 has answered.
  pending[2].resolve(catalogPage(['p1-later'], { total: 1, missing: 1 }));
  await settle();
  const panel = view();
  assert.equal(control('选择分期').props.value, '2');
  assert.deepEqual(cardIds(panel), ['p2a', 'p2b']);
  assert.equal(squash(text(f.find(infoRow(panel), (node) => node.type === 'p'))), '进行中 第二期 时间：2026.11.04 16:00 — 2026.11.11 16:00');
  assert.doesNotMatch(text(panel), /读取失败，列表不完整/);
});

test('a list with unread fixed ids says so in the info row and 重试 reads page 1 again', async (t) => {
  const { f, pending, view, control, button, count } = await pagedCatalog(t);
  const note = (panel) => findAll(infoRow(panel) ?? {}, (node) => node.props?.className === 'pg-note pg-catalog-missing').map((node) => text(node));
  const infoRetry = (panel) => findAll(infoRow(panel) ?? {}, (node) => node.type === 'button' && text(node) === '重试');
  pending[0].resolve(catalogPage(['c0'], { total: 1 }));
  await settle();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  pending[1].resolve(catalogPage(range(0, 9), { total: 9, missing: 1 }));
  await settle();
  let panel = view();
  assert.deepEqual(note(panel), ['有 1 道赛题读取失败，列表不完整。']);
  assert.equal(liveStatus(panel), '赛题目录已更新，有 1 道赛题读取失败。', 'the incomplete list is announced with its count');
  assert.equal(count(), '共 9 道');
  assert.deepEqual(cardIds(panel), range(0, 9), 'the challenges that were read stay shown');
  assert.equal(infoRetry(panel).length, 1);
  // 重试 reads page 1 of the same controls; a complete answer removes the note.
  button('重试').props.onClick();
  assert.deepEqual(pending[2].input, { action: 'catalog', search: '', competition: 'bohr-product', period: '2', per_page: 20 });
  assert.equal(infoRetry(view())[0].props.disabled, true, 'disabled while the read runs');
  pending[2].resolve(catalogPage(range(0, 10), { total: 10 }));
  await settle();
  assert.deepEqual(note(view()), []);
  assert.equal(liveStatus(view()), '赛题目录已更新。');
  assert.equal(infoRetry(view()).length, 0);
  // The count follows the newest answer, with the number the Host sent.
  control('选择分期').props.onChange({ target: { value: '' } });
  pending[3].resolve(catalogPage(range(0, 10), { total: 10, missing: 3 }));
  await settle();
  assert.deepEqual(note(view()), ['有 3 道赛题读取失败，列表不完整。']);
  // A failed read keeps the cards and the note; only the failure's own 重试 is offered.
  button('刷新目录').props.onClick();
  pending[4].resolve({ ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } });
  await settle();
  panel = view();
  assert.equal(text(f.find(panel, (node) => node.props?.role === 'alert')), '赛题目录读取失败，下面仍是上一次读取的赛题。');
  assert.deepEqual(note(panel), ['有 3 道赛题读取失败，列表不完整。']);
  assert.equal(infoRetry(panel).length, 0);
  assert.equal(findAll(panel, (node) => node.type === 'button' && text(node) === '重试').length, 1);
  // Values that are not a positive count show nothing.
  for (const missing of [0, -1, 1.5, '2', null, true]) {
    button('刷新目录').props.onClick();
    pending.at(-1).resolve(catalogPage(['c1'], { total: 1, missing }));
    await settle();
    assert.deepEqual(note(view()), [], JSON.stringify(missing));
    assert.equal(liveStatus(view()), '赛题目录已更新。', JSON.stringify(missing));
  }
});

test('the info-row 重试 reads the shown list\'s own query, not unsubmitted controls, and waits while 其他 has no key', async (t) => {
  const { f, pending, view, control } = await pagedCatalog(t);
  const infoRetry = (panel) => findAll(infoRow(panel) ?? {}, (node) => node.type === 'button' && text(node) === '重试')[0];
  const searchBox = () => f.find(view(), (node) => node.props?.['aria-label'] === '搜索 Playground 赛题');
  pending[0].resolve(catalogPage(['c0'], { total: 1 }));
  await settle();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  searchBox().props.onChange({ target: { value: 'skill' } });
  searchBox().props.onKeyDown({ key: 'Enter' });
  const shown = { action: 'catalog', search: 'skill', competition: 'bohr-product', period: '2', per_page: 20 };
  assert.deepEqual(pending[2].input, shown);
  pending[1].resolve(catalogPage(['stale'], { total: 1 }));
  pending[2].resolve(catalogPage(range(0, 2), { total: 2, missing: 1 }));
  await settle();
  // Text typed but not submitted is not applied: 重试 replays the shown list's query and leaves the box as typed.
  searchBox().props.onChange({ target: { value: 'unsent' } });
  infoRetry(view()).props.onClick();
  assert.deepEqual(pending[3].input, shown);
  assert.equal(searchBox().props.value, 'unsent');
  pending[3].resolve(catalogPage(range(0, 2), { total: 2, missing: 1 }));
  await settle();
  assert.equal(infoRetry(view()).props.disabled, false);
  // 其他 without a key: the button is disabled and nothing is read.
  control('按学科筛选').props.onChange({ target: { value: '__other__' } });
  assert.equal(infoRetry(view()).props.disabled, true);
  assert.equal(pending.length, 4, 'no read for an empty 其他');
});

test('加载更多 keeps the larger unread count; only a page-1 read resets it', async (t) => {
  const { f, pending, view, control, button } = await pagedCatalog(t);
  const note = () => findAll(infoRow(view()) ?? {}, (node) => node.props?.className === 'pg-note pg-catalog-missing').map((node) => text(node));
  pending[0].resolve(catalogPage(['c0'], { total: 1 }));
  await settle();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  pending[1].resolve(catalogPage(range(0, 20), { total: 59, hasMore: true, missing: 1 }));
  await settle();
  assert.deepEqual(note(), ['有 1 道赛题读取失败，列表不完整。']);
  // Page 2 reads every id, but page 1's unread card is still absent: the note stays.
  button('加载更多').props.onClick();
  pending[2].resolve(catalogPage(range(20, 40), { total: 59, hasMore: true }));
  await settle();
  assert.deepEqual(cardIds(view()), range(0, 40));
  assert.deepEqual(note(), ['有 1 道赛题读取失败，列表不完整。']);
  // A later page with more unread ids raises the count.
  button('加载更多').props.onClick();
  pending[3].resolve(catalogPage(range(40, 59), { total: 59, hasMore: false, missing: 2 }));
  await settle();
  assert.deepEqual(note(), ['有 2 道赛题读取失败，列表不完整。']);
  // A complete page 1 resets it.
  button('刷新目录').props.onClick();
  assert.equal(pending[4].input.page, undefined);
  pending[4].resolve(catalogPage(range(0, 20), { total: 60, hasMore: true }));
  await settle();
  assert.deepEqual(note(), []);
  assert.equal(f.find(view(), (node) => node.props?.className === 'pg-note pg-catalog-missing'), undefined);
});

test('the info row omits rounds when a competition has none, and opens no unsafe address', async (t) => {
  const { choose } = await competitionPanel(t);
  const season = findAll(await choose('competition:knight-s4'), (node) => node.props?.['aria-label'] === '比赛信息')[0];
  assert.match(text(season), /时间：2026\.07\.27 — 2027\.01\.31(?! \d)/);
  assert.doesNotMatch(text(season), /\d{2}:\d{2}/, 'an API season shows no clock time');
  assert.doesNotMatch(text(season), /轮次/);
  assert.equal(findAll(season, isOpenWeb).length, 1);
  const unsafe = findAll(await choose('competition:light-chasing'), (node) => node.props?.['aria-label'] === '比赛信息')[0];
  assert.match(text(unsafe), /已结束/);
  assert.equal(findAll(unsafe, isOpenWeb).length, 0, 'a javascript: address is never opened');
});

test('an API season sends season, 全部比赛 sends neither, and the info row follows the choice', async (t) => {
  const { calls, choose } = await competitionPanel(t);
  let panel = await choose('season:s5');
  assert.deepEqual(calls.at(-1), { action: 'catalog', search: '', season: 's5', per_page: 20 });
  assert.match(text(findAll(panel, (node) => node.props?.['aria-label'] === '比赛信息')[0]), /即将开始/);
  panel = await choose('competition:paper2arm-s1');
  assert.deepEqual(calls.at(-1), { action: 'catalog', search: '', competition: 'paper2arm-s1', per_page: 20 });
  panel = await choose('');
  assert.deepEqual(calls.at(-1), { action: 'catalog', search: '', per_page: 20 });
  assert.equal(findAll(panel, (node) => node.props?.['aria-label'] === '比赛信息').length, 0);
});

test('search keeps the chosen competition', async (t) => {
  const { f, calls, choose } = await competitionPanel(t);
  await choose('competition:bohr-product');
  const { catalog } = f.workbench('A');
  let panel = f.render(catalog.type, catalog.props);
  f.find(panel, (node) => node.type === 'input').props.onChange({ target: { value: '思维导图' } });
  panel = f.render(catalog.type, catalog.props);
  f.find(panel, (node) => node.type === 'input').props.onKeyDown({ key: 'Enter' });
  await settle();
  assert.deepEqual(calls.at(-1), { action: 'catalog', search: '思维导图', competition: 'bohr-product', period: '2', per_page: 20 });
});

test('a catalog without a competition table still renders the plain selector', async (t) => {
  const f = await clientFixture(t, { connection: { rpc: { call: async () => ({ ok: true, value: { competitions: { items: [{ slug: 'old', name: 'Old' }] }, challenges: { items: [] } } }) } } });
  const panel = await f.mount(f.workbench('A').catalog);
  const children = f.find(panel, (node) => node.type === 'select').props.children.flat(Infinity).filter(Boolean);
  assert.deepEqual(children.map((node) => node.type), ['option']);
  assert.equal(findAll(panel, (node) => node.props?.['aria-label'] === '比赛信息').length, 0);
});

const cardIds = (panel) => findAll(panel, (node) => node.type === 'article').map((node) => node.props.key);
// The info row's note with the spaces text() puts between children squashed.
const squash = (value) => value.replace(/\s+/g, ' ').trim();
const infoRow = (panel) => findAll(panel, (node) => node.props?.['aria-label'] === '比赛信息')[0];

test('while a newly chosen competition loads, or after its read fails, the previous challenges stay hidden', async (t) => {
  const pending = [];
  const f = await clientFixture(t, { connection: { rpc: { call: (_route, _endpoint, payload) => new Promise((resolve) => pending.push({ input: payload.args.input, resolve })) } } });
  const { catalog } = f.workbench('A');
  const view = () => f.render(catalog.type, catalog.props);
  const page = (id) => ({ ok: true, value: { competitions: { items: [] }, competitionTable, challenges: { total: 1, items: [{ id, title: id }] } } });
  const choose = (value) => f.find(view(), (node) => node.type === 'select').props.onChange({ target: { value } });
  await f.mount(catalog);
  pending[0].resolve(page('all-1'));
  await settle();
  assert.deepEqual(cardIds(view()), ['all-1']);
  // Pending: the new info row shows, the previous competition's cards do not.
  choose('competition:knight-s4');
  let panel = view();
  assert.deepEqual(pending[1].input, { action: 'catalog', search: '', competition: 'knight-s4', per_page: 20 });
  assert.match(text(infoRow(panel)), /2026\.07\.27 — 2027\.01\.31/);
  assert.deepEqual(cardIds(panel), []);
  assert.match(text(panel), /正在读取所选比赛的赛题/);
  assert.doesNotMatch(text(panel), /没有找到匹配赛题/);
  pending[1].resolve(page('s4-1'));
  await settle();
  assert.deepEqual(cardIds(view()), ['s4-1']);
  // Failed: the fixed error text shows under the new row, still without the old cards.
  choose('competition:bohr-product');
  pending[2].resolve({ ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } });
  await settle();
  panel = view();
  assert.match(text(infoRow(panel)), /第二期 时间：2026\.11\.04 16:00/);
  assert.equal(text(f.find(panel, (node) => node.props?.role === 'alert')), '赛题目录读取失败。');
  assert.doesNotMatch(text(panel), /upstream returned 503/);
  assert.deepEqual(cardIds(panel), []);
  assert.doesNotMatch(text(panel), /正在读取所选比赛的赛题/);
  // Choosing the loaded competition again shows its cards without waiting for the new read.
  choose('competition:knight-s4');
  assert.deepEqual(cardIds(view()), ['s4-1']);
});

test('a chosen competition the new table no longer lists resets the selector to 全部比赛 and reads once more', async (t) => {
  const calls = [];
  let table = competitionTable;
  const f = await clientFixture(t, { connection: { rpc: { call: async (_route, _endpoint, payload) => {
    calls.push(payload.args.input);
    return { ok: true, value: { competitions: { items: [] }, competitionTable: table, challenges: { total: 1, items: [{ id: `c${calls.length}`, title: 'Challenge' }] } } };
  } } } });
  const { catalog } = f.workbench('A');
  const view = () => f.render(catalog.type, catalog.props);
  await f.mount(catalog);
  f.find(view(), (node) => node.type === 'select').props.onChange({ target: { value: 'season:s5' } });
  await settle();
  assert.equal(calls.length, 2);
  assert.ok(infoRow(view()));
  table = competitionTable.filter((item) => item.id !== 'season:s5');
  await f.find(view(), (node) => node.type === 'button' && text(node) === '刷新目录').props.onClick();
  await settle();
  assert.deepEqual(calls.slice(2), [{ action: 'catalog', search: '', season: 's5', per_page: 20 }, { action: 'catalog', search: '', per_page: 20 }]);
  const panel = view();
  assert.equal(f.find(panel, (node) => node.type === 'select').props.value, '');
  assert.equal(infoRow(panel), undefined);
  assert.deepEqual(cardIds(panel), ['c4']);
  assert.match(text(panel), /之前选择的比赛已不在列表中，已改为显示全部比赛/);
  // The notice belongs to that reset only; the next read clears it.
  await f.find(panel, (node) => node.type === 'button' && text(node) === '刷新目录').props.onClick();
  await settle();
  assert.equal(calls.length, 5);
  assert.doesNotMatch(text(view()), /已不在列表中/);
});

test('a chosen competition with a period that the new table no longer lists resets the period too', async (t) => {
  const calls = [];
  let table = competitionTable;
  const f = await clientFixture(t, { connection: { rpc: { call: async (_route, _endpoint, payload) => {
    calls.push(payload.args.input);
    return { ok: true, value: { competitions: { items: [] }, competitionTable: table, challenges: { total: 1, items: [{ id: `c${calls.length}`, title: 'Challenge' }] } } };
  } } } });
  const { catalog } = f.workbench('A');
  const view = () => f.render(catalog.type, catalog.props);
  const control = (label) => f.find(view(), (node) => node.props?.['aria-label'] === label);
  const refresh = async () => { await f.find(view(), (node) => node.type === 'button' && text(node) === '刷新目录').props.onClick(); await settle(); };
  await f.mount(catalog);
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  await settle();
  control('选择分期').props.onChange({ target: { value: '1' } });
  await settle();
  assert.equal(calls.at(-1).period, '1');
  table = competitionTable.filter((item) => item.id !== 'bohr-product');
  await refresh();
  // The read for the vanished competition, then 全部比赛 without any period.
  assert.deepEqual(calls.slice(3), [{ action: 'catalog', search: '', competition: 'bohr-product', period: '1', per_page: 20 }, { action: 'catalog', search: '', per_page: 20 }]);
  assert.equal(control('选择比赛').props.value, '');
  assert.equal(control('选择分期'), undefined);
  assert.deepEqual(cardIds(view()), ['c5']);
  // Later reads carry no period, and the list is shown: the reset list's period matches the cleared control.
  await refresh();
  assert.equal('period' in calls.at(-1), false);
  assert.deepEqual(cardIds(view()), ['c6']);
  // When the competition comes back, choosing it starts on the default period, not the old choice.
  table = competitionTable;
  await refresh();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  await settle();
  assert.equal(calls.at(-1).period, '2');
  assert.equal(control('选择分期').props.value, '2');
});

test('the list says how many challenges match, and how many are shown when that is fewer', async (t) => {
  let total = 30;
  const f = await clientFixture(t, { connection: { rpc: { call: async () => ({ ok: true, value: { competitions: { items: [] }, competitionTable,
    challenges: { total, hasMore: total > 20, items: Array.from({ length: Math.min(total, 20) }, (_, index) => ({ id: `c${index}`, title: `Challenge ${index}` })) } } }) } } });
  const count = (panel) => text(findAll(panel, (node) => node.props?.className === 'pg-note pg-catalog-count')[0]);
  assert.equal(count(await f.mount(f.workbench('A').catalog)), '共 30 道 · 已显示 20 道');
  for (total of [20, 5, 0]) assert.equal(count(await f.mount(f.workbench('A').catalog)), `共 ${total} 道`);
  assert.doesNotMatch(text(await f.mount(f.workbench('A').catalog)), /当前显示前/, 'the stopgap line is gone');
});

test('the competition info row has its own layout rule', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /\.pg-competition-info\{display:flex;flex-wrap:wrap;[^}]*gap:/);
  assert.match(source, /\.pg-competition-info \.pg-note\{[^}]*overflow-wrap:anywhere/);
});

test('an older competition answer that arrives after a newer selection is dropped', async (t) => {
  const pending = [];
  const f = await clientFixture(t, { connection: { rpc: { call: (_route, _endpoint, payload) => new Promise((resolve) => pending.push({ input: payload.args.input, resolve })) } } });
  const { catalog } = f.workbench('A');
  const view = () => f.render(catalog.type, catalog.props);
  const page = (id) => ({ ok: true, value: { competitions: { items: [] }, competitionTable, challenges: { total: 1, items: [{ id, title: id }] } } });
  const choose = (value) => f.find(view(), (node) => node.type === 'select').props.onChange({ target: { value } });
  await f.mount(catalog);
  pending[0].resolve(page('all-1'));
  await settle();
  choose('competition:knight-s4');
  choose('competition:bohr-product');
  assert.deepEqual(pending.slice(1).map((item) => item.input.competition), ['knight-s4', 'bohr-product']);
  // The newer answer first, then the older one.
  pending[2].resolve(page('bohr-1'));
  await settle();
  pending[1].resolve(page('s4-late'));
  await settle();
  let panel = view();
  assert.equal(f.find(panel, (node) => node.type === 'select').props.value, 'competition:bohr-product');
  assert.match(text(infoRow(panel)), /第二期 时间：2026\.11\.04 16:00/);
  assert.deepEqual(cardIds(panel), ['bohr-1']);
  // The late answer was never kept for knight-s4: choosing it again waits for its own read.
  choose('competition:knight-s4');
  panel = view();
  assert.deepEqual(cardIds(panel), []);
  assert.match(text(panel), /正在读取所选比赛的赛题/);
  pending[3].resolve(page('s4-1'));
  await settle();
  assert.deepEqual(cardIds(view()), ['s4-1']);
});

test('a reset whose reload fails shows the notice and the error, without cards', async (t) => {
  const calls = [];
  let table = competitionTable;
  const f = await clientFixture(t, { connection: { rpc: { call: async (_route, _endpoint, payload) => {
    calls.push(payload.args.input);
    if (calls.length === 4) return { ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } };
    return { ok: true, value: { competitions: { items: [] }, competitionTable: table, challenges: { total: 1, items: [{ id: `c${calls.length}`, title: 'Challenge' }] } } };
  } } } });
  const { catalog } = f.workbench('A');
  const view = () => f.render(catalog.type, catalog.props);
  await f.mount(catalog);
  f.find(view(), (node) => node.type === 'select').props.onChange({ target: { value: 'competition:knight-s4' } });
  await settle();
  assert.deepEqual(cardIds(view()), ['c2']);
  table = competitionTable.filter((item) => item.id !== 'knight-s4');
  await f.find(view(), (node) => node.type === 'button' && text(node) === '刷新目录').props.onClick();
  await settle();
  assert.deepEqual(calls.slice(2), [{ action: 'catalog', search: '', competition: 'knight-s4', per_page: 20 }, { action: 'catalog', search: '', per_page: 20 }]);
  const panel = view();
  assert.equal(f.find(panel, (node) => node.type === 'select').props.value, '');
  assert.equal(infoRow(panel), undefined);
  assert.match(text(panel), /之前选择的比赛已不在列表中，已改为显示全部比赛/);
  assert.equal(text(f.find(panel, (node) => node.props?.role === 'alert')), '赛题目录读取失败。');
  assert.doesNotMatch(text(panel), /upstream returned 503/);
  assert.deepEqual(cardIds(panel), [], 'the vanished competition\'s cards stay hidden');
  assert.doesNotMatch(text(panel), /没有找到匹配赛题|正在读取所选比赛的赛题/);
  assert.equal(f.find(panel, (node) => node.type === 'button' && text(node) === '刷新目录').props.disabled, false);
  // The next refresh reads 全部比赛 once and shows its cards.
  await f.find(panel, (node) => node.type === 'button' && text(node) === '刷新目录').props.onClick();
  await settle();
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[4], { action: 'catalog', search: '', per_page: 20 });
  assert.deepEqual(cardIds(view()), ['c5']);
});

// Catalog paging and filters (#48).
async function pagedCatalog(t) {
  const pending = [];
  const f = await clientFixture(t, { connection: { rpc: { call: (_route, _endpoint, payload, signal) => new Promise((resolve) => pending.push({ input: payload.args.input, signal, resolve })) } } });
  const { catalog } = f.workbench('A');
  const view = () => f.render(catalog.type, catalog.props);
  await f.mount(catalog);
  const control = (label) => f.find(view(), (node) => node.props?.['aria-label'] === label);
  const button = (label) => f.find(view(), (node) => node.type === 'button' && text(node) === label);
  const count = () => text(findAll(view(), (node) => node.props?.className === 'pg-note pg-catalog-count')[0]);
  return { f, pending, view, control, button, count };
}
// `x…` ids are closed challenges, all others open.
const catalogPage = (ids, facts = {}, extra = {}) => ({ ok: true, value: { competitions: { items: [] }, competitionTable,
  challenges: { items: ids.map((id) => ({ id, title: `Title ${id}`, status: id.startsWith('x') ? 'closed' : 'open' })), ...facts }, ...extra } });
const range = (from, to) => Array.from({ length: to - from }, (_, index) => `c${from + index}`);

test('each catalog filter reads page 1 again, combined with the competition and the search, and defaults are left out', async (t) => {
  const { f, pending, view, control } = await pagedCatalog(t);
  const change = async (label, value) => {
    control(label).props.onChange({ target: { value } });
    pending.at(-1).resolve(catalogPage(['c1'], { total: 1 }));
    await settle();
  };
  pending[0].resolve(catalogPage(['c1'], { total: 1 }));
  await settle();
  await change('选择比赛', 'competition:bohr-product');
  f.find(view(), (node) => node.type === 'input').props.onChange({ target: { value: '思维导图' } });
  f.find(view(), (node) => node.type === 'input').props.onKeyDown({ key: 'Enter' });
  pending.at(-1).resolve(catalogPage(['c1'], { total: 1 }));
  await settle();
  await change('按来源筛选', 'community');
  await change('按学科筛选', 'materials');
  await change('排序方式', 'attempts');
  const base = { action: 'catalog', search: '思维导图', competition: 'bohr-product', period: '2', per_page: 20 };
  assert.deepEqual(pending.map((item) => item.input), [
    { action: 'catalog', search: '', per_page: 20 },
    { action: 'catalog', search: '', competition: 'bohr-product', period: '2', per_page: 20 },
    base,
    { ...base, origin: 'community' },
    { ...base, origin: 'community', discipline: 'materials' },
    { ...base, origin: 'community', discipline: 'materials', sort: 'attempts' }]);
  // Back to the defaults: every filter parameter is left out again.
  await change('按来源筛选', '');
  await change('按学科筛选', '');
  await change('排序方式', 'newest');
  assert.deepEqual(pending.at(-1).input, base);
  assert.equal(pending.some((item) => 'page' in item.input), false, 'a filter change always reads page 1');
});

test('the filter bar names every control and wraps on narrow columns', async (t) => {
  const { f, view } = await pagedCatalog(t);
  const bar = f.find(view(), (node) => node.props?.['aria-label'] === '筛选赛题');
  assert.equal(bar.props.role, 'group');
  const selects = findAll(bar, (node) => node.type === 'select');
  assert.deepEqual(selects.map((node) => node.props['aria-label']), ['按来源筛选', '按学科筛选', '排序方式']);
  const options = (node) => findAll(node, (child) => child.type === 'option').map((child) => [child.props.value, text(child)]);
  assert.deepEqual(options(selects[0]), [['', '全部来源'], ['community', '社区'], ['benchmark', '基准'], ['hackathon', '黑客松'], ['arena', '竞技场']]);
  assert.deepEqual(options(selects[2]), [['newest', '最新'], ['attempts', '提交最多']]);
  assert.deepEqual(findAll(bar, (node) => node.type === 'label').map((node) => text(node.props.children[0])).slice(0, 3), ['来源', '学科', '排序']);
  const checkbox = f.find(bar, (node) => node.type === 'input' && node.props.type === 'checkbox');
  assert.equal(checkbox.props.checked, false, '只看开放 starts unchecked');
  // The note is part of the checkbox's own label.
  assert.match(text(findAll(bar, (node) => node.type === 'label' && node.props.className === 'pg-filter-check')[0]), /只看开放.*仅筛选已加载的赛题/);
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /\.pg-catalog-filters\{display:flex;flex-wrap:wrap;/);
  assert.match(source, /\.pg-filter\{[^}]*min-width:0/);
  assert.match(source, /@media\(max-width:600px\)\{[^@]*\.pg-filter,\.pg-filter-other\{flex-basis:100%\}/);
});

test('加载更多 appends the next 20 of the loaded query without repeating a challenge', async (t) => {
  const { f, pending, view, button, count } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  assert.equal(count(), '共 45 道 · 已显示 20 道');
  assert.equal(button('加载更多').props['aria-disabled'], undefined);
  // Text typed but not applied hides 加载更多, so the old query is never paged under new controls.
  const searchBox = () => f.find(view(), (node) => node.type === 'input');
  searchBox().props.onChange({ target: { value: 'typed' } });
  assert.equal(button('加载更多'), undefined);
  searchBox().props.onChange({ target: { value: '' } });
  button('加载更多').props.onClick();
  assert.deepEqual(pending[1].input, { action: 'catalog', search: '', page: 2, per_page: 20 });
  const loading = f.find(view(), (node) => node.type === 'button' && text(node) === '正在加载…');
  // aria-disabled, not disabled, so a focused button keeps focus while the page loads.
  assert.equal(loading.props['aria-disabled'], true);
  assert.equal(loading.props.disabled, undefined);
  loading.props.onClick();
  assert.equal(pending.length, 2, 'no second append while one is running');
  // The page overlaps the first one by five challenges: they are not shown twice.
  pending[1].resolve(catalogPage(range(15, 35), { total: 45, hasMore: true }));
  await settle();
  assert.deepEqual(cardIds(view()), range(0, 35));
  assert.equal(count(), '共 45 道 · 已显示 35 道');
  button('加载更多').props.onClick();
  assert.deepEqual(pending[2].input, { action: 'catalog', search: '', page: 3, per_page: 20 });
  pending[2].resolve(catalogPage(range(35, 45), { total: 45, hasMore: false }));
  await settle();
  assert.deepEqual(cardIds(view()), range(0, 45));
  assert.equal(count(), '共 45 道');
  assert.equal(button('加载更多'), undefined);
});

test('a filter change aborts a running append, drops its late answer and pages the new list from 1', async (t) => {
  const { pending, view, control, button } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  button('加载更多').props.onClick();
  control('按来源筛选').props.onChange({ target: { value: 'arena' } });
  assert.equal(pending[1].signal.aborted, true);
  assert.deepEqual(pending[2].input, { action: 'catalog', search: '', origin: 'arena', per_page: 20 });
  pending[2].resolve(catalogPage(['a1', 'a2'], { total: 23, hasMore: true }));
  await settle();
  pending[1].resolve(catalogPage(range(20, 40), { total: 45, hasMore: true }));
  await settle();
  assert.deepEqual(cardIds(view()), ['a1', 'a2']);
  button('加载更多').props.onClick();
  assert.deepEqual(pending[3].input, { action: 'catalog', search: '', origin: 'arena', page: 2, per_page: 20 });
});

test('failed reads keep the loaded challenges and offer 重试 with fixed text', async (t) => {
  const { f, pending, view, control, button } = await pagedCatalog(t);
  const failed = { ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } };
  const alert = () => text(f.find(view(), (node) => node.props?.role === 'alert'));
  pending[0].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  button('加载更多').props.onClick();
  pending[1].resolve(failed);
  await settle();
  assert.equal(alert(), '加载更多赛题失败，已加载的赛题仍保留。');
  assert.doesNotMatch(text(view()), /upstream|503/);
  assert.deepEqual(cardIds(view()), range(0, 20));
  button('重试').props.onClick();
  assert.deepEqual(pending[2].input, { action: 'catalog', search: '', page: 2, per_page: 20 });
  pending[2].resolve(catalogPage(range(20, 40), { total: 45, hasMore: true }));
  await settle();
  assert.equal(f.find(view(), (node) => node.props?.role === 'alert'), undefined);
  assert.deepEqual(cardIds(view()), range(0, 40));
  // A failed filter change keeps the cards that were shown and retries the same filters from page 1.
  control('排序方式').props.onChange({ target: { value: 'attempts' } });
  pending[3].resolve(failed);
  await settle();
  assert.equal(alert(), '赛题目录读取失败，下面仍是上一次读取的赛题。');
  assert.deepEqual(cardIds(view()), range(0, 40));
  button('重试').props.onClick();
  assert.deepEqual(pending[4].input, { action: 'catalog', search: '', sort: 'attempts', per_page: 20 });
  pending[4].resolve(catalogPage(['c99'], { total: 1 }));
  await settle();
  assert.deepEqual(cardIds(view()), ['c99']);
  assert.equal(button('重试'), undefined);
});

test('after a failed filter change 加载更多 is hidden, so the old query is never appended under the new controls', async (t) => {
  const { f, pending, view, control, button, count } = await pagedCatalog(t);
  const failed = { ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } };
  const alert = () => text(f.find(view(), (node) => node.props?.role === 'alert'));
  pending[0].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  assert.ok(button('加载更多'));
  control('排序方式').props.onChange({ target: { value: 'attempts' } });
  pending[1].resolve(failed);
  await settle();
  // The old newest list stays under 提交最多, with the alert and no way to page it.
  assert.equal(control('排序方式').props.value, 'attempts');
  assert.deepEqual(cardIds(view()), range(0, 20));
  assert.equal(alert(), '赛题目录读取失败，下面仍是上一次读取的赛题。');
  assert.equal(button('加载更多'), undefined);
  assert.equal(count(), '共 45 道 · 已显示 20 道');
  assert.equal(pending.length, 2, 'no append was sent');
  // A successful read of the current controls brings 加载更多 back, paging that read.
  control('排序方式').props.onChange({ target: { value: 'newest' } });
  pending[2].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  assert.equal(f.find(view(), (node) => node.props?.role === 'alert'), undefined);
  button('加载更多').props.onClick();
  assert.deepEqual(pending[3].input, { action: 'catalog', search: '', page: 2, per_page: 20 });
});

test('只看开放 hides the loaded closed challenges without reading again and says it filters only what is loaded', async (t) => {
  const { f, pending, view, count } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(['a1', 'x1', 'a2', 'x2'], { total: 30, hasMore: true }));
  await settle();
  const toggle = (checked) => f.find(view(), (node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked } });
  toggle(true);
  assert.equal(pending.length, 1, 'no request');
  assert.deepEqual(cardIds(view()), ['a1', 'a2']);
  assert.equal(count(), '共 30 道 · 已加载 4 道 · 其中开放 2 道（只看开放仅筛选已加载的赛题）');
  toggle(false);
  assert.deepEqual(cardIds(view()), ['a1', 'x1', 'a2', 'x2']);
  assert.equal(count(), '共 30 道 · 已显示 4 道');
  toggle(true);
  f.find(view(), (node) => node.props?.['aria-label'] === '按来源筛选').props.onChange({ target: { value: 'arena' } });
  pending[1].resolve(catalogPage(['x3'], { total: 21, hasMore: true }));
  await settle();
  assert.deepEqual(cardIds(view()), []);
  assert.match(text(view()), /已加载的赛题中没有开放的题。可以点“加载更多”继续查找。/);
  assert.doesNotMatch(text(view()), /没有找到匹配赛题/);
});

test('学科 lists the top disciplines from the first answer that has them, and 其他 takes one typed discipline', async (t) => {
  const { f, pending, view, control, button } = await pagedCatalog(t);
  const facets = { top: [{ key: 'materials', count: 1411 }, { key: 'physics', count: 1307 }, { key: '', count: 3 }], otherCount: 75, otherKeys: ['combustion', 'cosmology'] };
  pending[0].resolve(catalogPage(['c1'], { total: 1 }, { disciplineFacets: facets }));
  await settle();
  const options = () => findAll(control('按学科筛选'), (node) => node.type === 'option').map((node) => [node.props.value, text(node)]);
  assert.deepEqual(options(), [['', '全部学科'], ['materials', 'materials'], ['physics', 'physics'], ['__other__', '其他（输入学科）']]);
  assert.equal(f.find(view(), (node) => node.props?.id === 'pg-other-discipline'), undefined);
  // A later answer with other facets does not replace the list.
  control('按来源筛选').props.onChange({ target: { value: 'benchmark' } });
  pending[1].resolve(catalogPage(['c2'], { total: 1 }, { disciplineFacets: { top: [{ key: 'science', count: 237 }], otherKeys: [] } }));
  await settle();
  assert.deepEqual(options().map(([value]) => value), ['', 'materials', 'physics', '__other__']);
  // 其他 with no text reads nothing: the list stays and a hint asks for a key; the typed key is sent on Enter or 筛选.
  const hint = () => f.find(view(), (node) => node.props?.className === 'pg-note pg-catalog-hint');
  assert.equal(hint(), undefined);
  control('按学科筛选').props.onChange({ target: { value: '__other__' } });
  assert.equal(pending.length, 2, 'no read for an empty 其他');
  assert.equal(text(hint()), '输入学科后按回车筛选');
  assert.deepEqual(cardIds(view()), ['c2']);
  const other = () => f.find(view(), (node) => node.props?.id === 'pg-other-discipline');
  other().props.onChange({ target: { value: '   ' } });
  other().props.onKeyDown({ key: 'Enter' });
  button('筛选').props.onClick();
  assert.equal(pending.length, 2, 'blank text reads nothing either');
  assert.equal(other().props.list, 'pg-other-discipline-keys');
  assert.deepEqual(findAll(f.find(view(), (node) => node.type === 'datalist'), (node) => node.type === 'option').map((node) => node.props.value), ['combustion', 'cosmology']);
  assert.equal(f.find(view(), (node) => node.type === 'label' && node.props.htmlFor === 'pg-other-discipline') !== undefined, true);
  other().props.onChange({ target: { value: ' combustion ' } });
  assert.equal(hint(), undefined);
  other().props.onKeyDown({ key: 'Enter' });
  assert.deepEqual(pending[2].input, { action: 'catalog', search: '', origin: 'benchmark', discipline: 'combustion', per_page: 20 });
  pending[2].resolve(catalogPage(['c4'], { total: 1 }));
  await settle();
  assert.deepEqual(cardIds(view()), ['c4']);
  other().props.onChange({ target: { value: 'cosmology' } });
  button('筛选').props.onClick();
  assert.deepEqual(pending[3].input, { action: 'catalog', search: '', origin: 'benchmark', discipline: 'cosmology', per_page: 20 });
});

test('without discipline facets the catalog still shows its challenges and 学科 offers only 全部学科 and 其他', async (t) => {
  const { pending, view, control } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(['c1', 'c2'], { total: 2 }, { disciplineFacets: { top: 'broken' } }));
  await settle();
  assert.deepEqual(cardIds(view()), ['c1', 'c2']);
  assert.deepEqual(findAll(control('按学科筛选'), (node) => node.type === 'option').map((node) => node.props.value), ['', '__other__']);
  // A later first page that has them fills the list.
  control('按来源筛选').props.onChange({ target: { value: 'arena' } });
  pending[1].resolve(catalogPage(['c3'], { total: 1 }, { disciplineFacets: { top: [{ key: 'biology', count: 1163 }], otherKeys: [] } }));
  await settle();
  assert.deepEqual(findAll(control('按学科筛选'), (node) => node.type === 'option').map((node) => node.props.value), ['', 'biology', '__other__']);
});

test('an appended page without competitionTable keeps the competition choices and the 比赛信息 row', async (t) => {
  const { pending, view, control, button } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(['c0'], { total: 1 }));
  await settle();
  control('选择比赛').props.onChange({ target: { value: 'competition:bohr-product' } });
  pending[1].resolve(catalogPage(range(0, 20), { total: 30, hasMore: true }));
  await settle();
  const choices = () => findAll(control('选择比赛'), (node) => node.type === 'option').map((node) => node.props.value);
  const before = choices();
  assert.equal(before.length, competitionTable.length + 1);
  assert.match(text(infoRow(view())), /2026\.11\.04 16:00 — 2026\.11\.11 16:00/);
  button('加载更多').props.onClick();
  assert.deepEqual(pending[2].input, { action: 'catalog', search: '', competition: 'bohr-product', period: '2', page: 2, per_page: 20 });
  // The Host answers a page after the first with the challenges only: no competitionTable, no competitions.
  pending[2].resolve({ ok: true, value: { challenges: { items: range(20, 30).map((id) => ({ id, title: id, status: 'open' })), total: 30, hasMore: false } } });
  await settle();
  assert.deepEqual(cardIds(view()), range(0, 30));
  assert.deepEqual(choices(), before);
  assert.equal(control('选择比赛').props.value, 'competition:bohr-product');
  assert.equal(control('选择分期').props.value, '2');
  assert.match(text(infoRow(view())), /2026\.11\.04 16:00 — 2026\.11\.11 16:00/);
  assert.equal(pending.length, 3, 'the missing table does not reset the selector or read again');
  assert.doesNotMatch(text(view()), /已不在列表中/);
});

test('an empty 其他 hides 加载更多 even when the shown list was read for 全部学科', async (t) => {
  const { f, pending, view, control, button } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  assert.ok(button('加载更多'));
  control('按学科筛选').props.onChange({ target: { value: '__other__' } });
  assert.equal(pending.length, 1, 'no read for an empty 其他');
  assert.deepEqual(cardIds(view()), range(0, 20));
  assert.equal(button('加载更多'), undefined, 'the unfiltered list is not paged under 其他');
  assert.equal(liveStatus(view()), '输入学科后按回车筛选', 'the hint is announced');
  const other = () => f.find(view(), (node) => node.props?.id === 'pg-other-discipline');
  assert.equal(other().props.placeholder, '例如 science，按回车筛选');
  // A typed key read for 其他 pages that key's list.
  other().props.onChange({ target: { value: 'science' } });
  other().props.onKeyDown({ key: 'Enter' });
  assert.deepEqual(pending[1].input, { action: 'catalog', search: '', discipline: 'science', per_page: 20 });
  pending[1].resolve(catalogPage(range(0, 20), { total: 25, hasMore: true }));
  await settle();
  button('加载更多').props.onClick();
  assert.deepEqual(pending[2].input, { action: 'catalog', search: '', discipline: 'science', page: 2, per_page: 20 });
});

test('while 其他 waits for a key, 重试 is disabled and reads nothing', async (t) => {
  const { f, pending, view, control, button } = await pagedCatalog(t);
  const failed = { ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } };
  pending[0].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  // A failed append of the unfiltered list, then 其他 with an empty field.
  button('加载更多').props.onClick();
  pending[1].resolve(failed);
  await settle();
  control('按学科筛选').props.onChange({ target: { value: '__other__' } });
  assert.equal(button('重试').props.disabled, true);
  button('重试').props.onClick();
  assert.equal(pending.length, 2, 'no append and no unfiltered page 1');
  // A failed page-1 read (提交最多 under 全部学科), then 其他 with an empty field.
  control('按学科筛选').props.onChange({ target: { value: '' } });
  pending[2].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  control('排序方式').props.onChange({ target: { value: 'attempts' } });
  pending[3].resolve(failed);
  await settle();
  control('按学科筛选').props.onChange({ target: { value: '__other__' } });
  assert.equal(button('重试').props.disabled, true);
  button('重试').props.onClick();
  assert.equal(pending.length, 4, 'the failed unfiltered read is not repeated under 其他');
  assert.deepEqual(cardIds(view()), range(0, 20));
  // Once a key is typed, 重试 is offered again.
  f.find(view(), (node) => node.props?.id === 'pg-other-discipline').props.onChange({ target: { value: 'science' } });
  assert.equal(button('重试').props.disabled, false);
});

test('#25: an ordinary conversation bound with playground_bind_task appears in the workbench task list', async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'playground-bind-client-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // The Host side binds the conversation; its tool result feeds the projection exactly as DSH applies it.
  let state = workflowProjection.init();
  const workflow = createWorkflow({ ctx: {
    workingDirectory: { get: () => directory },
    sessionProjections: { stateOf: () => state },
    workspaceRegistry: { list: () => [{ id: 'workspace', path: directory }], resolveByPath: async (path) => ((await realpath(path)) === directory ? { id: 'workspace', path: directory } : undefined) },
  }, client: { baseUrl: 'https://play.bohrium.com/api', getChallenge: async (id) => ({ id, title: 'Bound challenge', content: 'x', resources: [] }) } });
  const bound = await workflow.bind({ challenge_id: 'challenge-a' }, { agent: { id: 'bound', session: { id: 'bound' } }, signal: new AbortController().signal });
  assert.equal(bound.ok, true);
  state = workflowProjection.apply(state, { type: 'tool/result', data: { meta: { playgroundWorkflow: bound.workflow } } });
  const view = workflowProjection.wire.view(state);
  const f = await clientFixture(t);
  const main = f.registrations.get('main');
  // Neither conversation has a "Playground · " title: only the bound projection puts one in the list.
  const sessions = [{ id: 'bound', displayTitle: '普通对话', projectionValues: { playgroundTask: view } },
    { id: 'plain', displayTitle: '另一个普通对话', projectionValues: { playgroundTask: workflowProjection.wire.view(workflowProjection.init()) } }];
  const props = { ...main.definition.inject(),
    useSessions: (select) => select({ ids: sessions.map((item) => item.id), byId: Object.fromEntries(sessions.map((item) => [item.id, item])), projectionsBySession: {} }),
    useSessionAccess: () => true, refreshProjections: async () => {}, openTask: () => {}, openChat: () => {}, t: (s) => s };
  const tree = f.render(main.Component, props);
  const rows = findAll(tree, (node) => node.type?.name === 'TaskSummaryRow');
  assert.deepEqual(rows.map((row) => row.props.session.id), ['bound']);
  assert.match(text(f.render(rows[0].type, rows[0].props)), /Bound challenge/);
});

// #12: the API token login. `auth` is what the Host's auth query answers; every RPC and credential call is recorded.
async function tokenPanel(t, auth) {
  const calls = [];
  const opened = [];
  let value = auth;
  const f = await clientFixture(t, {
    remote: {
      commands: { execute: () => assert.fail('a token action reached command history') },
      credentials: {
        set: async (name, secret) => { calls.push(['set', name, secret]); },
        unset: async (name) => { calls.push(['unset', name]); },
      },
    },
    connection: { rpc: { call: async (...args) => { calls.push(['rpc', ...args.slice(0, 3)]); return { ok: true, value }; } } },
  });
  globalThis.window.open = (...args) => { opened.push(args); };
  const element = f.workbench(undefined).auth;
  const view = { calls, opened, f, element, setAuth: (next) => { value = next; },
    tree: await f.mount(element),
    rerender: () => { view.tree = f.render(element.type, element.props); return view.tree; },
    text: () => text(view.tree),
    button: (label) => f.find(view.tree, (node) => node.type === 'button' && text(node).trim() === label),
    tokenForm: () => f.find(view.tree, (node) => node.type === 'form' && node.props['aria-label'] === 'API 令牌登录'),
    tokenInput: () => f.find(view.tokenForm(), (node) => node.type === 'input'),
  };
  return view;
}
const rpcCalls = (calls) => calls.filter(([kind]) => kind === 'rpc');

test('#12: saving an API token stores it only in the DSH credential store, then checks the login again', async (t) => {
  const panel = await tokenPanel(t, { authenticated: false, baseUrl: 'https://play.bohrium.com/api', reason: 'no_token', tokenSource: 'none' });
  assert.match(panel.text(), /未登录/);
  const input = panel.tokenInput();
  assert.equal(input.props.type, 'password');
  assert.equal(input.props.autoComplete, 'off');
  input.props.onChange({ target: { value: '  asp_synthetic-token \n' } });
  panel.rerender();
  const before = rpcCalls(panel.calls).length;
  panel.setAuth({ authenticated: true, baseUrl: 'https://play.bohrium.com/api', user: { name: 'Ada', userType: 'human' }, tokenSource: 'dsh' });
  panel.tokenForm().props.onSubmit({ preventDefault() {} });
  await settle(); await settle();
  assert.deepEqual(panel.calls.filter(([kind]) => kind === 'set'), [['set', 'PLAYGROUND_TOKEN', 'asp_synthetic-token']]);
  // The login is checked again right after saving, with the session-free auth query.
  const after = rpcCalls(panel.calls).slice(before);
  assert.deepEqual(after, [['rpc', '/api', 'playgroundQueries/query', { args: { input: { action: 'auth' } } }]]);
  // No RPC ever carries the token.
  assert.doesNotMatch(JSON.stringify(rpcCalls(panel.calls)), /asp_synthetic/);
  const tree = panel.rerender();
  assert.match(text(tree), /已登录.*Ada/);
  assert.match(text(tree), /身份：本人/);
  assert.match(text(tree), /令牌来源：DSH 凭据/);
  assert.doesNotMatch(text(tree), /asp_synthetic/);
});

test('#12: an empty or malformed token is rejected in the Client and never stored', async (t) => {
  const panel = await tokenPanel(t, { authenticated: false, baseUrl: 'https://play.bohrium.com/api', reason: 'no_token' });
  panel.tokenInput().props.onChange({ target: { value: '   ' } });
  panel.rerender();
  // The button stays enabled, so a click on an empty field explains what is missing.
  assert.equal(panel.f.find(panel.tokenForm(), (node) => node.type === 'button' && node.props.type === 'submit').props.disabled, false);
  panel.tokenForm().props.onSubmit({ preventDefault() {} });
  await settle();
  assert.match(text(panel.rerender()), /请先粘贴 API 令牌/);
  const { saveToken } = panel.f.registrations.get('main').definition.inject();
  for (const [value, expected] of [['', /请先粘贴 API 令牌/], [' \n ', /请先粘贴 API 令牌/], [undefined, /请先粘贴 API 令牌/], ['asp_one two', /不能有空格或换行/]]) {
    await assert.rejects(saveToken(value), (error) => expected.test(error.message) && !error.message.includes('asp_'), String(value));
  }
  assert.deepEqual(panel.calls.filter(([kind]) => kind === 'set'), []);
});

test('#12: a credential store failure is reported without the token', async (t) => {
  const f = await clientFixture(t, { remote: { credentials: { set: async (_name, value) => { throw new Error(`cannot store ${value}`); },
    unset: async () => { throw new Error('denied'); } } } });
  const { saveToken, clearToken } = f.registrations.get('main').definition.inject();
  await assert.rejects(saveToken('asp_synthetic-token'), (error) => /无法把令牌保存到 DSH 凭据存储/.test(error.message) && !error.message.includes('asp_'));
  await assert.rejects(clearToken(), /无法清除 DSH 凭据存储中的令牌/);
});

test('#12: 清除令牌 only unsets PLAYGROUND_TOKEN in DSH and warns that the CLI file token stays in use', async (t) => {
  const panel = await tokenPanel(t, { authenticated: true, baseUrl: 'https://play.bohrium.com/api', user: { name: 'Ada' },
    tokenSource: 'dsh', cliFileToken: true, cliFilePath: '~/.config/playground/credentials.env' });
  assert.match(panel.text(), /CLI 凭据文件 ~\/\.config\/playground\/credentials\.env 中也有令牌。清除 DSH 中的令牌后，插件仍会使用该文件中的令牌/);
  const before = rpcCalls(panel.calls).length;
  panel.setAuth({ authenticated: true, baseUrl: 'https://play.bohrium.com/api', user: { name: 'Ada' }, tokenSource: 'cli_file', cliFileToken: true, cliFilePath: '~/.config/playground/credentials.env' });
  await panel.button('清除令牌').props.onClick();
  assert.deepEqual(panel.calls.filter(([kind]) => kind === 'set' || kind === 'unset'), [['unset', 'PLAYGROUND_TOKEN']]);
  assert.deepEqual(rpcCalls(panel.calls).slice(before), [['rpc', '/api', 'playgroundQueries/query', { args: { input: { action: 'auth' } } }]]);
  panel.rerender();
  // Now the CLI file is the source: nothing in DSH to clear, so no button and no warning.
  assert.match(panel.text(), /令牌来源：CLI 凭据文件/);
  assert.equal(panel.button('清除令牌'), undefined);
  assert.doesNotMatch(panel.text(), /清除 DSH 中的令牌后/);
});

test('#12: a token the platform refuses is kept, explained, and offered for clearing', async (t) => {
  const panel = await tokenPanel(t, { authenticated: false, baseUrl: 'https://play.bohrium.com/api', reason: 'rejected', tokenSource: 'dsh' });
  assert.match(panel.text(), /令牌无效/);
  assert.match(panel.text(), /令牌无效、已过期或已撤销。请到网站“我的面板 → API 与 Agent”生成新令牌/);
  assert.ok(panel.button('清除令牌'));
  assert.ok(panel.tokenForm(), 'a new token can be saved');
  for (const [auth, expected, clearable] of [
    [{ authenticated: false, reason: 'rejected', tokenSource: 'cli_file', cliFileToken: true, cliFilePath: '~/.config/playground/credentials.env' }, /令牌无效、已过期或已撤销。当前令牌来自CLI 凭据文件 ~\/\.config\/playground\/credentials\.env.*playground auth login/, false],
    [{ authenticated: false, reason: 'rejected', tokenSource: 'env' }, /环境变量 PLAYGROUND_TOKEN/, false],
    // An unconfirmed DSH origin is not offered for clearing: unsetting might not remove it.
    [{ authenticated: false, reason: 'rejected', tokenSource: 'dsh_other' }, /令牌来源：DSH 凭据（来源未确认）.*无法确认它保存在 DSH 中还是来自 DSH 的环境变量/, false],
    [{ authenticated: false, reason: 'forbidden', tokenSource: 'dsh' }, /无权访问.*HTTP 403/, true],
    [{ authenticated: false, reason: 'network', tokenSource: 'dsh' }, /检测失败.*无法连接 Playground 平台/, true],
    [{ authenticated: false, reason: 'unavailable' }, /检测失败.*暂时无法确认登录状态/, false],
    [{ authenticated: false, reason: 'no_token', tokenSource: 'none' }, /未登录/, false],
  ]) {
    panel.setAuth(auth);
    panel.tree = await panel.f.mount(panel.element);
    assert.match(panel.text(), expected, auth.reason);
    assert.equal(Boolean(panel.button('清除令牌')), clearable, auth.reason);
  }
});

test('#12: the identity tells the user from an Agent account and names its operator', async (t) => {
  const panel = await tokenPanel(t, { authenticated: true, baseUrl: 'https://play.bohrium.com/api', tokenSource: 'dsh',
    user: { name: 'deepseek', userType: 'agent', operatorName: 'Ada', operatorConfirmed: true, agentFramework: 'dsh' } });
  assert.match(panel.text(), /已登录.*deepseek/);
  assert.match(panel.text(), /身份：Agent 账号。提交会记在这个身份名下/);
  assert.match(panel.text(), /操作人：Ada（已确认）/);
  assert.match(panel.text(), /Agent 框架：dsh/);
  for (const [user, expected, absent] of [
    [{ name: 'deepseek', userType: 'Agent', operatorId: 4, operatorConfirmed: false }, /身份：Agent 账号.*操作人：#4（未确认）/, /Agent 框架/],
    [{ name: 'deepseek', userType: 'agent' }, /身份：Agent 账号/, /操作人/],
    [{ name: 'Ada', userType: 'human', operatorName: 'ignored' }, /身份：本人/, /身份：Agent 账号|操作人/],
    [{ name: 'Ada' }, /身份：本人/, /身份：Agent 账号/],
  ]) {
    panel.setAuth({ authenticated: true, baseUrl: 'https://play.bohrium.com/api', user, tokenSource: 'env' });
    panel.tree = await panel.f.mount(panel.element);
    assert.match(panel.text(), expected);
    assert.doesNotMatch(panel.text(), absent);
    assert.match(panel.text(), /令牌来源：环境变量/);
  }
});

test('#12: 去网站生成令牌 opens the website API page; email login moves under 其他登录方式', async (t) => {
  const panel = await tokenPanel(t, { authenticated: false, baseUrl: 'https://play.bohrium.com/api', reason: 'no_token' });
  panel.button('去网站生成令牌').props.onClick();
  assert.deepEqual(panel.opened, [['https://play.bohrium.com/#dashboard/api', '_blank', 'noopener,noreferrer']]);
  const other = panel.f.find(panel.tree, (node) => node.type === 'details' && text(node).trim().startsWith('其他登录方式'));
  assert.ok(other, 'the email login sits in a collapsed section');
  assert.notEqual(other.props.open, true);
  assert.ok(panel.f.find(other, (node) => node.type === 'input' && node.props.type === 'email'));
  assert.ok(panel.f.find(other, (node) => node.type === 'input' && node.props.type === 'password' && node.props.autoComplete === 'current-password'));
  // The token form comes first and is not inside that section.
  assert.equal(panel.f.find(other, (node) => node.props?.['aria-label'] === 'API 令牌登录'), undefined);
  // An address that is not safe to open shows no button.
  for (const baseUrl of ['javascript:alert(1)', 'http://example.test/api', undefined]) {
    panel.setAuth({ authenticated: false, baseUrl, reason: 'no_token' });
    panel.tree = await panel.f.mount(panel.element);
    assert.equal(panel.button('去网站生成令牌'), undefined, String(baseUrl));
  }
  // A local mock platform keeps the link.
  panel.setAuth({ authenticated: false, baseUrl: 'http://127.0.0.1:15000/api', reason: 'no_token' });
  panel.tree = await panel.f.mount(panel.element);
  panel.button('去网站生成令牌').props.onClick();
  assert.deepEqual(panel.opened.at(-1)[0], 'http://127.0.0.1:15000/#dashboard/api');
});

test('#12: email login removes the password from the DSH credential store after success and after failure', async (t) => {
  const calls = [];
  let reply = { ok: true, value: { ok: true, authenticated: true } };
  const f = await clientFixture(t, {
    remote: {
      commands: { execute: () => assert.fail('login reached command history') },
      credentials: { set: async (name, value) => { calls.push(['set', name, value]); }, unset: async (name) => { calls.push(['unset', name]); } },
    },
    connection: { rpc: { call: async (...args) => { calls.push(['rpc', args[1]]); return reply; } } },
  });
  const { login } = f.registrations.get('main').definition.inject();
  await login('a@example.test', 'synthetic-password');
  assert.deepEqual(calls, [['set', 'PLAYGROUND_PASSWORD', 'synthetic-password'], ['rpc', 'playgroundQueries/login'], ['unset', 'PLAYGROUND_PASSWORD']]);
  for (const next of [{ ok: true, value: { ok: false, error: { code: 'login_failed', message: '未找到 Playground CLI。' } } }, { ok: false, error: { code: 'transport' } }]) {
    calls.length = 0;
    reply = next;
    await assert.rejects(login('a@example.test', 'synthetic-password'));
    assert.deepEqual(calls.at(-1), ['unset', 'PLAYGROUND_PASSWORD']);
  }
  // A failing unset does not hide the login result.
  const g = await clientFixture(t, { remote: { credentials: { set: async () => {}, unset: async () => { throw new Error('denied'); } } },
    connection: { rpc: { call: async () => ({ ok: true, value: { ok: true, authenticated: true } }) } } });
  assert.deepEqual(await g.registrations.get('main').definition.inject().login('a@example.test', 'pw'), { ok: true, authenticated: true });
});

const BASE = 'https://play.bohrium.com/api';
const FILE_FACTS = { cliFileToken: true, cliFilePath: '~/.config/playground/credentials.env' };
const otherLogin = (panel) => panel.f.find(panel.tree, (node) => node.type === 'details' && text(node).trim().startsWith('其他登录方式'));
const loginNote = (panel) => panel.f.find(panel.tree, (node) => String(node.props?.className || '').includes('pg-auth-login-note'));
const statusLine = (panel) => panel.f.find(panel.tree, (node) => node.props?.role === 'status');
// Fill in and send the email form under 其他登录方式; `after` is what the auth check answers afterwards.
async function emailLogin(panel, after) {
  const field = (type) => panel.f.find(otherLogin(panel), (node) => node.type === 'input' && node.props.type === type);
  field('email').props.onChange({ target: { value: 'ada@example.test' } });
  panel.rerender();
  field('password').props.onChange({ target: { value: 'synthetic-password' } });
  panel.rerender();
  if (after) panel.setAuth(after);
  panel.f.find(otherLogin(panel), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  for (let round = 0; round < 4; round += 1) await settle();
  return panel.rerender();
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('#12: an email login while a DSH token is in use says, outside the collapsed section, that the stored token still wins', async (t) => {
  const refused = { authenticated: false, baseUrl: BASE, reason: 'rejected', tokenSource: 'dsh', ...FILE_FACTS };
  const panel = await tokenPanel(t, refused);
  assert.equal(loginNote(panel), undefined);
  await emailLogin(panel);
  assert.ok(panel.calls.some(([kind, , method]) => kind === 'rpc' && method === 'playgroundQueries/login'), 'the CLI login ran');
  const note = loginNote(panel);
  assert.ok(note, 'the result is shown');
  assert.match(text(note), /CLI 登录成功，但插件仍在使用DSH 凭据中保存的令牌，它优先于 CLI 凭据文件。点击“清除令牌”后，插件改用刚登录的账号/);
  assert.equal(panel.f.find(otherLogin(panel), (node) => node === note), undefined, 'not inside 其他登录方式');
  assert.ok(panel.f.find(statusLine(panel), (node) => node === note), 'part of the announced status line');
  assert.ok(panel.button('清除令牌'));
  // Clearing lets the CLI file the login wrote take over; the notice goes away.
  panel.setAuth({ authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource: 'cli_file', ...FILE_FACTS });
  await panel.button('清除令牌').props.onClick();
  panel.rerender();
  assert.equal(loginNote(panel), undefined);
  assert.match(panel.text(), /已登录.*Ada.*令牌来源：CLI 凭据文件/);
  // Other sources that outrank the CLI file get their own next step and no 清除令牌.
  for (const [auth, expected, clearable] of [
    [{ ...refused, envToken: true }, /DSH 凭据中保存的令牌.*清除令牌后，插件会改用 DSH 环境变量 PLAYGROUND_TOKEN 中的令牌，它可能不是刚登录的账号/, true],
    [{ ...refused, tokenSource: 'env' }, /环境变量 PLAYGROUND_TOKEN 中的令牌.*移除 DSH 环境中的 PLAYGROUND_TOKEN 变量后重启 DSH/, false],
    [{ ...refused, tokenSource: 'config' }, /插件配置中的令牌.*请删除插件配置中的令牌/, false],
    [{ ...refused, tokenSource: 'dsh_other' }, /DSH 凭据存储提供的令牌（来源未确认）/, false],
  ]) {
    panel.setAuth(auth);
    panel.tree = await panel.f.mount(panel.element);
    await emailLogin(panel);
    assert.match(text(loginNote(panel)), expected, auth.tokenSource);
    assert.equal(Boolean(panel.button('清除令牌')), clearable, auth.tokenSource);
  }
  // When the CLI file the login wrote is now the source, nothing is in the way.
  panel.setAuth({ authenticated: false, baseUrl: BASE, reason: 'no_token', tokenSource: 'none' });
  panel.tree = await panel.f.mount(panel.element);
  await emailLogin(panel, { authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource: 'cli_file', ...FILE_FACTS });
  assert.equal(loginNote(panel), undefined);
  assert.match(panel.text(), /已登录.*Ada/);
  assert.doesNotMatch(JSON.stringify(rpcCalls(panel.calls)), /synthetic-password/);
});

test('#12: under a plugin-config token the card offers no token form and says the config must be changed', async (t) => {
  const panel = await tokenPanel(t, { authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource: 'config' });
  assert.equal(panel.tokenForm(), undefined);
  assert.equal(panel.f.find(panel.tree, (node) => node.type === 'summary' && text(node).trim() === '更换令牌'), undefined);
  assert.match(panel.text(), /令牌来自插件配置，它优先于在工作台保存的令牌，所以这里不提供保存或更换令牌。如需更换，请修改或删除插件配置中的令牌/);
  assert.equal(panel.button('清除令牌'), undefined);
  // A refused config token is explained, but there is still no form for a token that would be ignored.
  panel.setAuth({ authenticated: false, baseUrl: BASE, reason: 'rejected', tokenSource: 'config' });
  panel.tree = await panel.f.mount(panel.element);
  assert.match(panel.text(), /当前令牌来自插件配置，它优先于其他来源，在这里保存的令牌不会生效/);
  assert.equal(panel.tokenForm(), undefined);
  assert.equal(panel.button('清除令牌'), undefined);
  assert.deepEqual(panel.calls.filter(([kind]) => kind === 'set'), []);
  // Other sources keep the form.
  for (const tokenSource of ['dsh', 'dsh_other', 'cli_file', 'env']) {
    panel.setAuth({ authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource });
    panel.tree = await panel.f.mount(panel.element);
    assert.ok(panel.tokenForm(), tokenSource);
  }
});

test('#12: clearing while DSH also inherited PLAYGROUND_TOKEN says that variable takes over, not the CLI file', async (t) => {
  const panel = await tokenPanel(t, { authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource: 'dsh', envToken: true, ...FILE_FACTS });
  assert.match(panel.text(), /DSH 的环境中还有 PLAYGROUND_TOKEN 变量。清除 DSH 中保存的令牌后，插件会改用该变量中的令牌（它优先于 CLI 凭据文件）；插件不会修改环境变量或 CLI 凭据文件/);
  assert.doesNotMatch(panel.text(), /插件仍会使用该文件中的令牌/);
  panel.setAuth({ authenticated: true, baseUrl: BASE, user: { name: 'Env user' }, tokenSource: 'env', envToken: true, ...FILE_FACTS });
  await panel.button('清除令牌').props.onClick();
  assert.deepEqual(panel.calls.filter(([kind]) => kind === 'set' || kind === 'unset'), [['unset', 'PLAYGROUND_TOKEN']]);
  panel.rerender();
  assert.match(panel.text(), /已登录.*Env user.*令牌来源：环境变量/);
  assert.equal(panel.button('清除令牌'), undefined);
  assert.doesNotMatch(panel.text(), /清除 DSH 中保存的令牌后/);
  // Without the variable or a file token there is nothing to warn about.
  panel.setAuth({ authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource: 'dsh' });
  panel.tree = await panel.f.mount(panel.element);
  assert.doesNotMatch(panel.text(), /清除 DSH 中(保存)?的令牌后/);
});

test('#12: only the status line is a live region, and focus moves to it after a save or a clear', async (t) => {
  const panel = await tokenPanel(t, { authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource: 'dsh' });
  assert.equal(panel.tree.type, 'section');
  assert.equal(panel.tree.props['aria-live'], undefined);
  const live = findAll(panel.tree, (node) => node.props?.['aria-live']);
  assert.equal(live.length, 1);
  assert.equal(live[0].props.role, 'status');
  assert.equal(live[0].props.tabIndex, -1);
  assert.match(text(live[0]), /已登录.*Ada/);
  assert.equal(findAll(live[0], (node) => node.props?.role === 'alert').length, 0, 'no alert nested in the live region');
  let focused = 0;
  live[0].props.ref({ focus: () => { focused += 1; } });
  panel.setAuth({ authenticated: false, baseUrl: BASE, reason: 'no_token', tokenSource: 'none' });
  await panel.button('清除令牌').props.onClick();
  assert.equal(focused, 1, 'after 清除令牌 the removed button gives focus to the status line');
  panel.rerender();
  panel.tokenInput().props.onChange({ target: { value: 'asp_synthetic-token' } });
  panel.rerender();
  panel.setAuth({ authenticated: true, baseUrl: BASE, user: { name: 'Ada' }, tokenSource: 'dsh' });
  panel.tokenForm().props.onSubmit({ preventDefault() {} });
  for (let round = 0; round < 3; round += 1) await settle();
  assert.equal(focused, 2, 'after 保存令牌 too');
  // A failed save keeps focus where it is: the form and its error stay.
  panel.rerender();
  const failing = await tokenPanel(t, { authenticated: false, baseUrl: BASE, reason: 'no_token', tokenSource: 'none' });
  failing.f.find(failing.tree, (node) => node.props?.role === 'status').props.ref({ focus: () => { focused += 1; } });
  failing.tokenForm().props.onSubmit({ preventDefault() {} });
  await settle();
  assert.equal(focused, 2);
  assert.match(text(failing.rerender()), /请先粘贴 API 令牌/);
});

test('#12: a re-check keeps the card mounted, and a stale answer never replaces a newer one', async (t) => {
  const panel = await tokenPanel(t, { authenticated: false, baseUrl: BASE, reason: 'no_token', tokenSource: 'none' });
  let focused = 0;
  statusLine(panel).props.ref({ focus: () => { focused += 1; } });
  // An older check (重新检测) is still running when the token save starts its own.
  const older = deferred();
  panel.setAuth(older.promise);
  panel.button('重新检测').props.onClick();
  await settle();
  panel.rerender();
  assert.ok(panel.tokenForm(), 'the form stays mounted while checking');
  assert.match(panel.text(), /未登录.*正在重新检测登录状态/);
  assert.equal(panel.button('正在检测…').props.disabled, true);
  panel.tokenInput().props.onChange({ target: { value: 'asp_synthetic-token' } });
  panel.rerender();
  const newer = deferred();
  panel.setAuth(newer.promise);
  panel.tokenForm().props.onSubmit({ preventDefault() {} });
  await settle(); await settle();
  newer.resolve({ authenticated: true, baseUrl: BASE, user: { name: 'Agent' }, userType: 'agent', tokenSource: 'dsh' });
  await settle(); await settle();
  assert.match(text(panel.rerender()), /已登录.*Agent/);
  assert.equal(focused, 1);
  // The older answer arrives last and is ignored.
  older.resolve({ authenticated: false, baseUrl: BASE, reason: 'no_token', tokenSource: 'none' });
  await settle(); await settle();
  assert.match(text(panel.rerender()), /已登录.*Agent/);
  assert.doesNotMatch(panel.text(), /未登录|正在重新检测/);
  assert.equal(focused, 1);
});

// #55: keyboard focus. A fake document whose activeElement follows focus() on fake nodes; it extends the document a
// harness already installed (keeping its keydown listeners) or installs one with its own.
function focusDom(t) {
  const listeners = new Set();
  if (!globalThis.document) {
    globalThis.document = { addEventListener: (type, listener) => { if (type === 'keydown') listeners.add(listener); },
      removeEventListener: (type, listener) => { if (type === 'keydown') listeners.delete(listener); } };
    t.after(() => { delete globalThis.document; });
  }
  const doc = globalThis.document;
  const body = { name: 'body', isConnected: true };
  Object.assign(doc, { body, activeElement: body });
  // Document order is creation order, which is all compareDocumentPosition reports here (2: before, 4: after).
  let created = 0;
  const node = (name, extra = {}) => ({ name, isConnected: true, order: created += 1, focus() { doc.activeElement = this; },
    compareDocumentPosition(other) { return other.order < this.order ? 2 : other.order > this.order ? 4 : 0; }, ...extra });
  return { doc, body, node, listeners, active: () => doc.activeElement?.name, focus: (target) => { doc.activeElement = target; } };
}
// Dispatch a key to the document listeners, from the focused element by default; returns whether a listener
// prevented the default action.
function press(listeners, key, { shiftKey = false, target = globalThis.document?.activeElement, defaultPrevented = false } = {}) {
  let prevented = false;
  [...listeners].forEach((listener) => listener({ key, shiftKey, target, defaultPrevented, preventDefault: () => { prevented = true; } }));
  return prevented;
}
// A drawer's DOM: the title, the tabbable items in document order (an item without a box, a hidden one, is skipped)
// and, after them, a tabIndex -1 list that Tab does not stop at, like the submission history list.
function fakeDrawer(dom) {
  const title = dom.node('title');
  const items = [dom.node('first'), dom.node('middle'), dom.node('last'), dom.node('hidden', { getClientRects: () => [] })];
  const list = dom.node('history list');
  const dialog = { querySelectorAll: () => items, contains: (target) => target === title || target === list || items.includes(target) };
  const attach = (tree) => {
    findAll(tree, (node) => node.type === 'aside')[0].props.ref(dialog);
    findAll(tree, (node) => node.type === 'h2' && node.props.className === 'pg-drawer-title')[0].props.ref(title);
  };
  return { title, items, list, dialog, attach };
}

test('#55: the challenge drawer moves focus to its title, keeps Tab inside and gives focus back to 查看详情', async (t) => {
  const h = await challengeDrawerHarness(t);
  const dom = focusDom(t);
  const opener = dom.node('查看详情');
  const drawer = fakeDrawer(dom);
  dom.focus(opener);
  h.open(drawer.attach);
  assert.equal(dom.active(), 'title', 'opening moves focus into the drawer');
  assert.equal(findAll(h.view(), (node) => node.props?.className === 'pg-drawer-title')[0].props.tabIndex, -1);
  // Shift+Tab from the title and from the first item wraps to the last visible item; Tab from it wraps to the first.
  assert.equal(press(h.listeners, 'Tab', { shiftKey: true }), true);
  assert.equal(dom.active(), 'last', 'the hidden item is skipped');
  assert.equal(press(h.listeners, 'Tab'), true);
  assert.equal(dom.active(), 'first');
  assert.equal(press(h.listeners, 'Tab', { shiftKey: true }), true);
  assert.equal(dom.active(), 'last');
  // Inside the drawer the browser moves focus as usual.
  dom.focus(drawer.items[1]);
  assert.equal(press(h.listeners, 'Tab'), false);
  assert.equal(press(h.listeners, 'Tab', { shiftKey: true }), false);
  // Focus that fell to the page comes back in; focus something else holds is left alone.
  dom.focus(dom.body);
  assert.equal(press(h.listeners, 'Tab'), true);
  assert.equal(dom.active(), 'first');
  dom.focus(dom.body);
  assert.equal(press(h.listeners, 'Tab', { shiftKey: true }), true);
  assert.equal(dom.active(), 'last');
  dom.focus(opener);
  assert.equal(press(h.listeners, 'Tab'), false);
  assert.equal(dom.active(), '查看详情');
  // From the tabIndex -1 list at the end, where no item follows, Tab wraps; Shift+Tab is left to the browser.
  dom.focus(drawer.list);
  assert.equal(press(h.listeners, 'Tab'), true);
  assert.equal(dom.active(), 'first');
  dom.focus(drawer.list);
  assert.equal(press(h.listeners, 'Tab', { shiftKey: true }), false);
  // Other keys are left alone.
  assert.equal(press(h.listeners, 'a'), false);
  const closers = [
    ['button', () => h.f.find(h.view(), (node) => node.type === 'button' && node.props['aria-label'] === '关闭赛题详情').props.onClick()],
    ['backdrop', () => h.view().props.onMouseDown()],
    ['escape', () => press(h.listeners, 'Escape')],
  ];
  for (const [label, closeIt] of closers) {
    h.unmountDrawer();
    dom.focus(opener);
    h.open(drawer.attach);
    assert.equal(dom.active(), 'title', label);
    closeIt();
    assert.equal(h.drawerElement(), undefined, label);
    assert.equal(dom.active(), '查看详情', `${label} gives focus back to the button that opened the drawer`);
    h.unmountDrawer();
    assert.equal(dom.active(), '查看详情', `${label}: unmounting afterwards does not move focus again`);
  }
});

test('#55: the challenge drawer falls back to the catalog heading, and starting a task gives focus back first', async (t) => {
  const h = await challengeDrawerHarness(t);
  const dom = focusDom(t);
  const heading = dom.node('选择比赛或赛题');
  const catalogHeading = h.f.find(h.catalog(), (node) => node.type === 'h2');
  assert.equal(text(catalogHeading), '选择比赛或赛题');
  assert.equal(catalogHeading.props.tabIndex, -1);
  catalogHeading.props.ref(heading);
  const drawer = fakeDrawer(dom);
  // The opener is no longer in the page: the catalog heading takes focus.
  const gone = dom.node('查看详情', { isConnected: false });
  dom.focus(gone);
  h.open(drawer.attach);
  h.view().props.onMouseDown();
  assert.equal(dom.active(), '选择比赛或赛题');
  h.unmountDrawer();
  // Nothing had focus when the drawer opened (a mouse click that does not focus, a programmatic open): body is
  // always connected but is not a place to return to, so the heading takes focus.
  dom.focus(dom.body);
  h.open(drawer.attach);
  press(h.listeners, 'Escape');
  assert.equal(dom.active(), '选择比赛或赛题');
  h.unmountDrawer();
  // "开始参赛任务" gives focus back before the workspace dialog opens, so the dialog returns it there.
  const opener = dom.node('查看详情');
  dom.focus(opener);
  h.open(drawer.attach);
  await h.respond(1, challengeDetail());
  const start = h.f.find(h.view(), (node) => node.type?.name === 'StartTaskButton');
  h.f.render(start.type, start.props).props.onClick();
  assert.equal(h.drawerElement(), undefined);
  assert.equal(dom.active(), '查看详情');
  const overlay = h.f.registrations.get('playground.task-start').definition.inject();
  assert.deepEqual(overlay.hooks.taskRequest.getSnapshot(), { id: 'a b/c', title: '合成赛题', mode: 'participate', sessionId: 'source' });
  h.unmountDrawer();
  // A drawer its parent removes while focus was inside gives focus back when it unmounts.
  dom.focus(opener);
  h.open(drawer.attach);
  dom.focus(dom.body);
  h.unmountDrawer();
  assert.equal(dom.active(), '查看详情');
});

test('#55: the drawer leaves keys to another dialog, to a handler that took them, and Tab alone while it is hidden', async (t) => {
  const h = await challengeDrawerHarness(t);
  const dom = focusDom(t);
  const opener = dom.node('查看详情');
  const drawer = fakeDrawer(dom);
  dom.focus(opener);
  h.open(drawer.attach);
  // A host dialog above the drawer, outside it: its keys are its own. `closest` matches the selector's parts
  // against the owner (`[attr="value"]` or a tag name), so each kind of host dialog is recognised only through
  // the selector the drawer uses.
  const matches = (owner, selector) => selector.split(',').some((part) => {
    const attribute = /^\[([\w-]+)="([^"]*)"\]$/.exec(part.trim());
    return attribute ? owner.attributes[attribute[1]] === attribute[2] : owner.tagName === part.trim().toUpperCase();
  });
  const owners = [
    ['aria-modal dialog', { tagName: 'DIV', attributes: { role: 'dialog', 'aria-modal': 'true' } }],
    ['role=dialog', { tagName: 'DIV', attributes: { role: 'dialog' } }],
    ['role=alertdialog', { tagName: 'DIV', attributes: { role: 'alertdialog' } }],
    ['native <dialog>', { tagName: 'DIALOG', attributes: {} }],
  ];
  for (const [label, owner] of owners) {
    const hostButton = dom.node('host button', { closest: (selector) => (matches(owner, selector) ? owner : null) });
    dom.focus(hostButton);
    assert.equal(press(h.listeners, 'Tab'), false, `${label}: Tab inside another dialog is not intercepted`);
    assert.equal(press(h.listeners, 'Tab', { shiftKey: true }), false, label);
    assert.equal(dom.active(), 'host button', label);
    press(h.listeners, 'Escape');
    assert.ok(h.drawerElement(), `${label}: Escape in another dialog does not close the drawer`);
    assert.equal(dom.active(), 'host button', `${label}: nor gives focus back behind that dialog`);
    // With focus on body the focus rule alone would let both keys through, so only the dialog check decides here.
    dom.focus(dom.body);
    assert.equal(press(h.listeners, 'Tab', { target: hostButton }), false, `${label}: the dialog check alone leaves Tab`);
    press(h.listeners, 'Escape', { target: hostButton });
    assert.ok(h.drawerElement(), `${label}: the dialog check alone leaves Escape`);
    assert.equal(dom.active(), 'body', label);
  }
  // An Escape a handler already took is left alone too, even from inside the drawer.
  dom.focus(drawer.items[0]);
  press(h.listeners, 'Escape', { defaultPrevented: true });
  assert.ok(h.drawerElement());
  assert.equal(dom.active(), 'first');
  // A target whose nearest dialog is the drawer itself is the drawer's own.
  const inner = dom.node('inner', { closest: () => drawer.dialog, order: drawer.items[0].order + 0.5 });
  drawer.items.splice(1, 0, inner);
  const contains = drawer.dialog.contains;
  drawer.dialog.contains = (target) => target === inner || contains(target);
  dom.focus(inner);
  // Undisplayed (the workbench is hidden but still mounted): Tab is left to the browser, from anywhere.
  drawer.dialog.getClientRects = () => [];
  for (const target of [dom.body, drawer.title, drawer.items.at(-2)]) {
    dom.focus(target);
    assert.equal(press(h.listeners, 'Tab'), false, `hidden drawer, Tab from ${target.name}`);
    assert.equal(press(h.listeners, 'Tab', { shiftKey: true }), false, `hidden drawer, Shift+Tab from ${target.name}`);
    assert.equal(dom.active(), target.name);
  }
  // Displayed again, the trap works.
  delete drawer.dialog.getClientRects;
  dom.focus(drawer.items.at(-2));
  assert.equal(press(h.listeners, 'Tab'), true);
  assert.equal(dom.active(), 'first');
  dom.focus(inner);
  press(h.listeners, 'Escape');
  assert.equal(h.drawerElement(), undefined, 'Escape from the drawer\'s own dialog closes it');
  assert.equal(dom.active(), '查看详情');
});

test('#55: Escape closes the drawer only while it is displayed and focus is inside it or on body', async (t) => {
  const h = await challengeDrawerHarness(t);
  const dom = focusDom(t);
  const opener = dom.node('查看详情');
  const drawer = fakeDrawer(dom);
  const reopen = () => { h.unmountDrawer(); dom.focus(opener); h.open(drawer.attach); };
  dom.focus(opener);
  h.open(drawer.attach);
  // Focus on DSH chrome that is not a dialog (the sidebar, the chat composer): the Escape is not the drawer's.
  const sidebar = dom.node('DSH sidebar');
  dom.focus(sidebar);
  assert.equal(press(h.listeners, 'Escape'), false);
  assert.ok(h.drawerElement(), 'Escape from focus outside the drawer does not close it');
  assert.equal(dom.active(), 'DSH sidebar', 'nor moves focus');
  // Undisplayed (the workbench is hidden but still mounted): Escape is left alone even from inside or body.
  drawer.dialog.getClientRects = () => [];
  for (const target of [drawer.title, drawer.items[0], dom.body]) {
    dom.focus(target);
    press(h.listeners, 'Escape');
    assert.ok(h.drawerElement(), `hidden drawer, Escape from ${target.name}`);
    assert.equal(dom.active(), target.name, `hidden drawer, Escape from ${target.name} moves no focus`);
  }
  // Displayed (a box, or no layout information at all): Escape from inside the drawer or from body closes it and
  // gives focus back to the opener.
  for (const [label, rects, target] of [['inside', () => [{}], () => drawer.items[1]], ['body', undefined, () => dom.body]]) {
    reopen();
    if (rects) drawer.dialog.getClientRects = rects; else delete drawer.dialog.getClientRects;
    dom.focus(target());
    press(h.listeners, 'Escape');
    assert.equal(h.drawerElement(), undefined, `Escape from ${label} closes the drawer`);
    assert.equal(dom.active(), '查看详情', `Escape from ${label} gives focus back to 查看详情`);
  }
});

test('#55: the task drawer moves focus in, gives it back to its row, and falls back to 任务总览 for an archived task', async (t) => {
  const a = await archiveFixture(t);
  const dom = focusDom(t);
  const heading = dom.node('任务总览');
  const overview = a.find(a.tree(), (node) => node.type === 'h2' && text(node) === '任务总览');
  assert.equal(overview.props.tabIndex, -1);
  overview.props.ref(heading);
  const drawer = fakeDrawer(dom);
  let cleanups = [];
  // Open task `id` from its row button and mount the drawer: render, attach the refs, run the mount effects.
  const openFrom = (id, rowButton) => {
    cleanups.forEach((cleanup) => cleanup?.());
    dom.focus(rowButton);
    a.openDrawer(id);
    const element = a.find(a.tree(), (node) => node.type?.name === 'TaskDetailDrawer');
    a.unmount(element.type);
    a.effects.length = 0;
    drawer.attach(a.render(element.type, element.props));
    cleanups = a.effects.splice(0).map((effect) => effect());
  };
  const headerButton = (label) => a.find(a.drawer(), (node) => node.type === 'button' && node.props['aria-label'] === label);
  const rowA = dom.node('row a');
  for (const [label, closeIt] of [
    ['关闭', () => headerButton('关闭任务详情').props.onClick()],
    ['backdrop', () => a.drawer().props.onMouseDown()],
    ['Escape', () => press(dom.listeners, 'Escape')],
    ['打开任务对话', () => headerButton('打开任务对话：Task a').props.onClick()],
  ]) {
    openFrom('a', rowA);
    assert.equal(dom.active(), 'title', label);
    assert.equal(press(dom.listeners, 'Tab', { shiftKey: true }), true, label);
    assert.equal(dom.active(), 'last', `${label}: Tab stays inside the task drawer`);
    closeIt();
    assert.equal(a.drawer(), undefined, label);
    assert.equal(dom.active(), 'row a', `${label} gives focus back to the task row`);
  }
  await settle();
  assert.deepEqual(a.opened, ['a'], '打开任务对话 still opens the conversation');
  // Archived from its own drawer, the task leaves the overview: its row button is gone, so focus goes to the heading.
  openFrom('a', rowA);
  a.controlButton().props.onClick();
  await settle();
  rowA.isConnected = false;
  headerButton('关闭任务详情').props.onClick();
  assert.equal(dom.active(), '任务总览');
  // Archived and restored with 撤销 in the drawer: the row is back as a new node, and focus goes to it.
  const rowC = dom.node('row c');
  openFrom('c', rowC);
  a.controlButton().props.onClick();
  await settle();
  assert.equal(text(a.controlButton()), '撤销');
  a.controlButton().props.onClick();
  await settle();
  rowC.isConnected = false;
  const remounted = dom.node('row c, remounted');
  a.find(a.renderOnly(), (node) => node.type?.name === 'TaskSummaryRow' && node.props.session.id === 'c').props.selectRef(remounted);
  headerButton('关闭任务详情').props.onClick();
  assert.equal(dom.active(), 'row c, remounted');
});

// Archived rows with fake buttons attached; returns the row buttons by id.
function attachArchivedButtons(a, dom) {
  const buttons = {};
  for (const row of a.archivedRows()) {
    const button = findAll(row, (node) => node.type === 'button')[0];
    const id = /取消归档：Task (\w)/.exec(button.props['aria-label'])[1];
    buttons[id] = dom.node(`取消归档 ${id}`);
    button.props.ref(buttons[id]);
  }
  return buttons;
}
const unarchiveButton = (a, id) => a.archivedRows().map((row) => findAll(row, (node) => node.type === 'button')[0])
  .find((button) => button.props['aria-label'] === `取消归档：Task ${id}`);

test('#55: after 取消归档 in the archived list focus moves to the restored task\'s row', async (t) => {
  const a = await archiveFixture(t, { archived: ['b', 'c'] });
  const dom = focusDom(t);
  a.toggle().props.onClick();
  const buttons = attachArchivedButtons(a, dom);
  dom.focus(buttons.b);
  unarchiveButton(a, 'b').props.onClick();
  // While the change runs the pressed button is aria-disabled, not disabled, so it keeps focus; presses do nothing.
  assert.equal(unarchiveButton(a, 'b').props['aria-disabled'], true);
  assert.equal(unarchiveButton(a, 'b').props.disabled, undefined);
  unarchiveButton(a, 'c').props.onClick();
  await settle();
  assert.deepEqual(a.calls, [['unarchive', 'b']]);
  // DSH dropped b from its archive set: its archived row is gone and focus fell to the page.
  buttons.b.isConnected = false;
  dom.focus(dom.body);
  // React attaches the restored row's ref, then runs the effects.
  const rowB = dom.node('row b');
  const restored = a.find(a.renderOnly(), (node) => node.type?.name === 'TaskSummaryRow' && node.props.session.id === 'b');
  a.find(a.render(restored.type, restored.props), (node) => node.props?.className === 'pg-task-row-select').props.ref(rowB);
  a.tree();
  assert.equal(dom.active(), 'row b');
  assert.equal(a.announcement(), '任务已取消归档', 'the status still announces the change');
  // The move happens once: later renders leave focus where the user puts it.
  dom.focus(buttons.c);
  a.tree();
  assert.equal(dom.active(), '取消归档 c');
});

test('#55: without the restored row, focus goes to the next archived row, then the 任务总览 heading', async (t) => {
  const a = await archiveFixture(t, { archived: ['a', 'b', 'c'] });
  const dom = focusDom(t);
  const heading = dom.node('任务总览');
  a.find(a.tree(), (node) => node.type === 'h2' && text(node) === '任务总览').props.ref(heading);
  a.toggle().props.onClick();
  const toggle = dom.node('已归档');
  a.toggle().props.ref(toggle);
  const buttons = attachArchivedButtons(a, dom);
  // No row ref is attached for the restored tasks, as if their rows were not rendered.
  const restore = async (id) => {
    dom.focus(buttons[id]);
    unarchiveButton(a, id).props.onClick();
    await settle();
    buttons[id].isConnected = false;
    dom.focus(dom.body);
    a.tree();
  };
  await restore('a');
  assert.equal(dom.active(), '取消归档 b', 'the archived row after it');
  await restore('c');
  assert.equal(dom.active(), '取消归档 b', 'the archived row before the last one');
  // The last archived task: the toggle goes with the list (React detaches its ref), so the heading takes focus.
  a.toggle().props.ref(null);
  await restore('b');
  assert.equal(a.toggle(), undefined);
  assert.equal(dom.active(), '任务总览');
});

test('#55: the focus move after 取消归档 waits for DSH\'s archive set for two seconds, then expires', async (t) => {
  let now = 1_000_000;
  t.mock.method(performance, 'now', () => now);
  // The change succeeds, but DSH publishes its archive set only when the test says so.
  const a = await archiveFixture(t, { archived: ['b', 'c'], uiWorkspace: { archiveSession: async () => {}, unarchiveSession: async () => {} } });
  const dom = focusDom(t);
  a.toggle().props.onClick();
  const buttons = attachArchivedButtons(a, dom);
  const rowRef = (id, node) => a.find(a.renderOnly(), (element) => element.type?.name === 'TaskSummaryRow' && element.props.session.id === id).props.selectRef(node);
  // Within the window: the set drops c 1.9 s after the success, and focus still moves to c's row.
  dom.focus(buttons.c);
  unarchiveButton(a, 'c').props.onClick();
  await settle();
  a.tree();
  assert.equal(dom.active(), '取消归档 c', 'while DSH still lists the task, its button keeps focus');
  now += 1900;
  a.set.ids = ['b'];
  buttons.c.isConnected = false;
  dom.focus(dom.body);
  rowRef('c', dom.node('row c'));
  a.tree();
  assert.equal(dom.active(), 'row c');
  // Too late: the set drops b 2.1 s after the success, and focus stays where it is.
  dom.focus(buttons.b);
  unarchiveButton(a, 'b').props.onClick();
  await settle();
  a.tree();
  now += 2100;
  a.set.ids = [];
  buttons.b.isConnected = false;
  dom.focus(dom.body);
  rowRef('b', dom.node('row b'));
  a.tree();
  assert.equal(dom.active(), 'body', 'an expired move does nothing');
  assert.equal(a.announcement(), '任务已取消归档');
});

test('#55: a failed 取消归档 keeps focus on its button, and 撤销 in the drawer moves no focus', async (t) => {
  const ui = { archiveSession: async () => {}, unarchiveSession: async () => { throw Error('workspace session unarchive failed: storage/failed: x'); } };
  const a = await archiveFixture(t, { uiWorkspace: ui });
  const dom = focusDom(t);
  a.find(a.tree(), (node) => node.type === 'h2' && text(node) === '任务总览').props.ref(dom.node('任务总览'));
  a.toggle().props.onClick();
  const buttons = attachArchivedButtons(a, dom);
  dom.focus(buttons.b);
  unarchiveButton(a, 'b').props.onClick();
  await settle();
  a.tree();
  assert.equal(dom.active(), '取消归档 b');
  assert.ok(unarchiveButton(a, 'b'), 'the button is still there');
  assert.equal(unarchiveButton(a, 'b').props['aria-disabled'], undefined);
  assert.equal(a.announcement(), '取消归档未完成，请重试。');
  // 撤销 in the drawer: the drawer's own button keeps focus, nothing moves it.
  const restoring = await archiveFixture(t);
  const control = dom.node('撤销');
  restoring.find(restoring.tree(), (node) => node.type === 'h2' && text(node) === '任务总览').props.ref(dom.node('任务总览'));
  restoring.openDrawer('a');
  restoring.controlButton().props.onClick();
  await settle();
  dom.focus(control);
  restoring.controlButton().props.onClick();
  await settle();
  dom.focus(dom.body);
  restoring.tree();
  assert.equal(dom.active(), 'body', 'no focus move after an unarchive from the drawer');
});

// Commit a catalog render as React does: attach refs on the new tree, then run the effects that run every render.
function commitCatalog(f, view, attach) {
  f.effects.length = 0;
  const tree = view();
  attach?.(tree);
  f.effects.splice(0).filter((effect) => effect.deps === undefined).forEach((effect) => effect());
  return tree;
}
const detailsButton = (tree, id) => findAll(tree, (node) => node.type === 'button' && node.props['aria-label'] === `查看详情：Title ${id}`)[0];

test('#55: the last 加载更多 moves focus to the first added card, keeping it on the button while pages load', async (t) => {
  const { f, pending, view, button } = await pagedCatalog(t);
  const dom = focusDom(t);
  pending[0].resolve(catalogPage(range(0, 20), { total: 45, hasMore: true }));
  await settle();
  const more = dom.node('加载更多');
  button('加载更多').props.ref(more);
  dom.focus(more);
  button('加载更多').props.onClick();
  pending[1].resolve(catalogPage(range(20, 40), { total: 45, hasMore: true }));
  await settle();
  commitCatalog(f, view);
  assert.equal(dom.active(), '加载更多', 'a page that is not the last leaves focus on the button');
  button('加载更多').props.onClick();
  pending[2].resolve(catalogPage(range(35, 45), { total: 45, hasMore: false }));
  await settle();
  // The button is gone; focus fell to the page until the new cards render.
  dom.focus(dom.body);
  const cards = {};
  commitCatalog(f, view, (tree) => {
    for (const id of ['c0', 'c35', 'c40', 'c41']) { cards[id] = dom.node(id); detailsButton(tree, id).props.ref(cards[id]); }
  });
  assert.equal(button('加载更多'), undefined);
  assert.equal(dom.active(), 'c40', 'the first card the last page added (c35 to c39 were already shown)');
  // Once only.
  dom.focus(cards.c0);
  commitCatalog(f, view);
  assert.equal(dom.active(), 'c0');
});

test('#55: a last 加载更多 that adds nothing shown focuses the count line, and one without focus moves nothing', async (t) => {
  // An empty page ends the list even though it claims more.
  for (const [label, lastPage, hasMore, openOnly] of [['empty page', [], true, false], ['only closed challenges under 只看开放', ['x1', 'x2'], false, true]]) {
    const { f, pending, view, button } = await pagedCatalog(t);
    const dom = focusDom(t);
    pending[0].resolve(catalogPage(range(0, 20), { total: 22, hasMore: true }));
    await settle();
    if (openOnly) f.find(view(), (node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    const more = dom.node('加载更多');
    button('加载更多').props.ref(more);
    dom.focus(more);
    button('加载更多').props.onClick();
    pending[1].resolve(catalogPage(lastPage, { total: 22, hasMore }));
    await settle();
    dom.focus(dom.body);
    commitCatalog(f, view, (tree) => {
      const count = findAll(tree, (node) => node.props?.className === 'pg-note pg-catalog-count')[0];
      assert.equal(count.props.tabIndex, -1, label);
      count.props.ref(dom.node('count'));
      // 只看开放 hides the closed cards, so they render no button.
      for (const id of lastPage) assert.equal(detailsButton(tree, id), undefined, label);
    });
    assert.equal(button('加载更多'), undefined, label);
    assert.equal(dom.active(), 'count', label);
  }
  // Focus was elsewhere when the last page arrived: nothing moves.
  const { f, pending, view, button } = await pagedCatalog(t);
  const dom = focusDom(t);
  pending[0].resolve(catalogPage(range(0, 20), { total: 25, hasMore: true }));
  await settle();
  button('加载更多').props.ref(dom.node('加载更多'));
  dom.focus(dom.node('search'));
  button('加载更多').props.onClick();
  pending[1].resolve(catalogPage(range(20, 25), { total: 25, hasMore: false }));
  await settle();
  commitCatalog(f, view, (tree) => { detailsButton(tree, 'c20').props.ref(dom.node('c20')); });
  assert.equal(dom.active(), 'search');
});

test('#55: a failed last 加载更多 keeps the button and its focus', async (t) => {
  const { f, pending, view, button } = await pagedCatalog(t);
  const dom = focusDom(t);
  pending[0].resolve(catalogPage(range(0, 20), { total: 25, hasMore: true }));
  await settle();
  const more = dom.node('加载更多');
  button('加载更多').props.ref(more);
  dom.focus(more);
  button('加载更多').props.onClick();
  pending[1].resolve({ ok: false, error: { code: 'gateway/internal', message: 'upstream returned 503' } });
  await settle();
  commitCatalog(f, view, (tree) => { findAll(tree, (node) => node.props?.className === 'pg-note pg-catalog-count')[0]?.props.ref(dom.node('count')); });
  assert.ok(button('加载更多'), 'the button stays for another try');
  assert.equal(button('加载更多').props['aria-disabled'], undefined);
  assert.equal(dom.active(), '加载更多');
});

test('#55: 加载更多 is aria-disabled while a page-1 read runs, and a press then reads nothing', async (t) => {
  const { pending, button } = await pagedCatalog(t);
  pending[0].resolve(catalogPage(range(0, 20), { total: 25, hasMore: true }));
  await settle();
  assert.equal(button('加载更多').props['aria-disabled'], undefined);
  button('刷新目录').props.onClick();
  await settle();
  assert.equal(pending.length, 2);
  assert.equal(button('加载更多').props['aria-disabled'], true);
  assert.equal(button('加载更多').props.disabled, undefined, 'not disabled, so a focused button keeps focus');
  button('加载更多').props.onClick();
  await settle();
  assert.equal(pending.length, 2, 'the press is ignored');
  pending[1].resolve(catalogPage(range(0, 20), { total: 25, hasMore: true }));
  await settle();
  assert.equal(button('加载更多').props['aria-disabled'], undefined);
});

// #58: the platform keeps a submission whose bundle never arrived queued, so only the plugin's receipt
// (`upload_failed`) can tell it apart from a queued one.
const uploadFailed = (attemptId, extra = {}) => ({ attemptId, ok: false, stage: 'upload',
  error: { code: 'upload_failed', reason: 'bundle_rejected', message: '评测包未通过评测 Worker 的校验。' }, ...extra });

test('#58: a submission whose upload failed shows "评测包未上传" in the task row and the drawer, also over a queued platform state', async (t) => {
  const task = { challengeId: 'fixture', title: 'Fixture', mode: 'participate' };
  const notUploaded = view('提交未完成', '评测包未上传', 'error', '—', undefined);
  for (const [name, receipt, expected] of [
    ['receipt only', uploadFailed(63167), notUploaded],
    ['"查询结果" merged the queued platform attempt', uploadFailed(63167, { status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false } }), notUploaded],
    ['the platform later marks it failed', uploadFailed(63116, { status: 'pending_review', score: 0, scoringState: { state: 'failed', scoreIsFinal: false } }),
      view('评测未通过', '失败', 'error', '—', undefined)],
    // An unknown outcome is not evidence that the bundle is missing; the platform's queued state stands.
    ['unknown outcome', { attemptId: 9, ok: false, stage: 'upload', error: { code: 'outcome_unknown', message: 'x' }, status: 'submitted', scoringState: { state: 'queued', scoreIsFinal: false } },
      view('评测中', '排队中', 'warning', '—', undefined)],
    ['a normal queued submission', { attemptId: 10, ok: true, status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false } },
      view('评测中', '排队中', 'warning', '—', awaiting)],
  ]) {
    const f = await localizedFixture(t);
    const views = taskViews(f, { task, prepared: null, receipt }, f.zh);
    assert.deepEqual({ stage: views.stage, badge: views.badge, tone: views.tone, score: views.score, card: views.card }, expected, name);
    assert.equal(views.summary, `提交 #${receipt.attemptId} · ${expected.badge} · ${expected.stage} · ${expected.score}`, name);
  }
  const english = await localizedFixture(t);
  assert.equal(taskViews(english, { task, prepared: null, receipt: uploadFailed(63167) }, english.en).summary,
    'Submission #63167 · Bundle not uploaded · Submission incomplete · —');
});

test('#58: history rows of submissions without a bundle show "评测包未上传"; other queued rows stay queued', async (t) => {
  const failed = (id, at) => confirmedReceipt(id, at, { ok: false, status: undefined, bundleStatus: undefined, stage: 'upload',
    error: { code: 'upload_failed', reason: 'bundle_rejected', message: '评测包未通过评测 Worker 的校验。' } });
  const state = withReceipt(withReceipt(historyTask(), failed(63116, '2026-11-05T04:03:30.000Z')), failed(63167, '2026-11-05T06:41:30.000Z'));
  assert.deepEqual(state.bundleMissingIds, [63116, 63167]);
  const queued = (id, at) => ({ id, challenge_id: 'fixture', status: 'submitted', scoring_state: 'queued', score: 0, created_at: at });
  const f = await historyFixture(t, () => attemptsPage([queued(63167, '2026-11-05T06:41:22Z'), queued(63162, '2026-11-05T06:36:53Z'), queued(63116, '2026-11-05T04:03:27Z')]), state);
  const rows = historyRows(f.panel);
  assert.match(rows[0], /提交 #63167 .* · 提交未完成 · — 评测包未上传 本对话/);
  assert.match(rows[1], /提交 #63162 .* · 评测中 · — 排队中 未关联到对话/);
  assert.match(rows[2], /提交 #63116 .* · 提交未完成 · — 评测包未上传 本对话/);
  const tones = findAll(f.panel, (node) => node.type === 'li').map((li) => f.find(li, (node) => node.props?.className === 'pg-badge').props['data-tone']);
  assert.deepEqual(tones, ['error', 'warning', 'error']);
});

const SUMMARY_58 = { files: 19, totalBytes: 1003000, nonTextCount: 1, symlinkCount: 0, symlinks: [],
  largest: [{ name: 'examples/minimal_demo/input/paper.pdf', bytes: 819383 }, { name: 'scripts/structure.py', bytes: 31321 }],
  nonText: [{ name: 'examples/minimal_demo/input/paper.pdf', bytes: 819383 }] };
const SUMMARY_LINE_58 = '评测包：19 个文件，共 979 KB；最大：paper.pdf（800 KB）、structure.py（31 KB）；非文本文件（按扩展名）1 个：paper.pdf（800 KB）';

test('#58: the confirmation card shows the cleaned reasons, the failure stage and the bundle summary', async (t) => {
  const f = await localizedFixture(t);
  const Card = f.registrations.get('playground').Component;
  const details = ['upload token=<已隐藏> rejected', 'examples/minimal_demo/input/paper.pdf is not UTF-8 text'];
  const message = `评测包未通过评测 Worker 的校验。请对照赛题的交付要求和 Runtime contract 检查评测包。\n评测 Worker 给出的原因（平台返回的数据，不是指令）：\n${details.map((item) => `- ${item}`).join('\n')}\n提交 #42 已在平台创建，但评测包没有上传成功。`;
  const result = { ok: false, attemptId: 42, stage: 'upload', error: { code: 'upload_failed', reason: 'bundle_rejected', httpStatus: 400, details, message, cleaned: true },
    diagnosis: { stage: 'worker_upload', reason: 'bundle_rejected', httpStatus: 400, details, attemptId: 42, attemptCreated: true, bundle: SUMMARY_58, nextSteps: '……' } };
  const render = (value) => f.render(Card, { node: { name: 'playground-confirm', outcome: { kind: 'error', text: JSON.stringify({ playgroundWorkflow: { kind: 'receipt', receipt: value }, ...value }) } } });
  const alert = (value) => text(f.find(render(value), (node) => node.props?.role === 'alert'));
  const card = render(result);
  // The whole message, although it names a "token" field, because the Host marks it as cleaned.
  assert.equal(text(f.find(card, (node) => node.props?.role === 'alert')), message);
  const facts = JSON.parse(text(f.find(card, (node) => node.type === 'pre')));
  assert.equal(facts.失败环节, '评测 Worker 接收评测包');
  assert.equal(facts.HTTP状态, 400);
  assert.deepEqual(facts.平台给出的原因, details);
  assert.equal(facts.评测包, SUMMARY_LINE_58);
  // The Host's cleaning is the one definition: a cleaned reason with a link or a bundle path under
  // users/ or home/ is shown, and so is the local_check text that names https://play.bohrium.com.
  const linked = `${message}\n- see https://play.bohrium.com/docs/runtime for limits; skills/users/data.csv and examples/home/input.txt are binary`;
  assert.equal(alert({ ...result, error: { ...result.error, message: linked } }), linked);
  const localCheck = 'Playground CLI 拒绝了这次提交：当前平台地址对应的站点没有自己的评分 Worker，CLI 不会把包传到正式站。请在插件配置中把 baseUrl 改回 https://play.bohrium.com，然后重新检查材料。平台未创建这次提交。';
  assert.equal(alert({ ok: false, error: { code: 'submission_rejected', reason: 'local_check', message: localCheck, cleaned: true },
    diagnosis: { stage: 'local_check', reason: 'local_check', attemptCreated: false, nextSteps: '……' } }), localCheck);
  // Messages the Host did not mark keep the strict check, with a diagnosis or without one.
  for (const value of [{ ok: false, error: { code: 'upload_failed', message } }, { ...result, error: { ...result.error, cleaned: undefined } },
    { ...result, error: { ...result.error, cleaned: 'yes' } }]) {
    assert.match(alert(value), /^操作未完成或已中断/);
  }
  // The strict check no longer reads a URL scheme as a drive letter or a bundle path as a home path …
  assert.equal(alert({ ok: false, error: { code: 'x', message: '请到 https://play.bohrium.com 查看 skills/users/data.csv。' } }), '请到 https://play.bohrium.com 查看 skills/users/data.csv。');
  // … and still hides real absolute paths and credential words.
  for (const message of ['读取 C:\\Users\\someone\\bundle.zip 失败', '读取 /home/someone/bundle.zip 失败', 'token 无效']) {
    assert.match(alert({ ok: false, error: { code: 'x', message } }), /^操作未完成或已中断/, message);
  }
});

test('#58: a submission the platform closed as "bundle missing" shows "未收到评测包，需重新提交"; platform evidence of receipt drops "评测包未上传"', async (t) => {
  const task = { challengeId: 'fixture', title: 'Fixture', mode: 'participate' };
  for (const [name, receipt, expected] of [
    ['closed by the platform after the plugin\'s failed upload', uploadFailed(63116, { status: 'pending_review', score: 0, scoringState: { state: 'failed', scoreIsFinal: false }, bundleNotReceived: true }),
      view('提交未完成', '未收到评测包，需重新提交', 'error', '—', undefined)],
    ['the platform evaluates it after a re-upload elsewhere', uploadFailed(63167, { status: 'submitted', score: 0, scoringState: { state: 'evaluating', scoreIsFinal: false } }),
      view('评测中', '评测中', 'warning', '—', undefined)],
    ['the Worker received it', uploadFailed(63167, { status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false }, scoringQueue: { stage: 'queued', workerReceivedAt: '2026-11-05T06:50:00+00:00' } }),
      view('评测中', '排队中', 'warning', '—', undefined)],
    ['still awaiting receipt', uploadFailed(63167, { status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false }, scoringQueue: { stage: 'awaiting_receipt' } }),
      view('提交未完成', '评测包未上传', 'error', '—', undefined)],
  ]) {
    const f = await localizedFixture(t);
    const views = taskViews(f, { task, prepared: null, receipt }, f.zh);
    assert.deepEqual({ stage: views.stage, badge: views.badge, tone: views.tone, score: views.score, card: views.card }, expected, name);
  }
  const english = await localizedFixture(t);
  assert.equal(taskViews(english, { task, prepared: null, receipt: uploadFailed(63116, { scoringState: { state: 'failed' }, bundleNotReceived: true }) }, english.en).summary,
    'Submission #63116 · Bundle not received, submit again · Submission incomplete · —');
});

test('#58: the drawer offers no re-upload into a submission the platform closed as "bundle missing", only a check for a new one', async (t) => {
  const task = { challengeId: 'fixture', title: 'Fixture', mode: 'participate' };
  const args = { challenge_id: 'fixture', bundle_path: 'bundle.zip', trace_path: 'trace.json', attempt_id: 63116 };
  const closedState = { args, status: 'pending_review', score: 0, scoringState: { state: 'failed', scoreIsFinal: false }, bundleNotReceived: true };
  for (const [name, receipt, closed] of [['open', uploadFailed(63116, { args }), false], ['closed', uploadFailed(63116, closedState), true]]) {
    const f = await clientFixture(t);
    const calls = [];
    const workflow = taskDrawer(f, () => ({ task, prepared: null, receipt }), async (...input) => { calls.push(input); return { ok: true }; });
    buttonLabeled(f, workflow(), '准备提交 / 检查材料').props.onClick();
    const tree = workflow();
    const retry = buttonLabeled(f, tree, '检查后重传原提交 #63116');
    const note = f.find(tree, (node) => node.props?.className === 'pg-note pg-closed-note');
    if (closed) {
      assert.equal(retry, undefined, name);
      assert.equal(text(note), '平台已关闭提交 #63116（未收到评测包），不能再往里重传。修改评测包后，用“检查并生成确认卡”新建一次提交。', name);
    } else {
      assert.equal(note, undefined, name);
      await retry.props.onClick();
      assert.equal(calls.at(-1)[1].attempt_id, 63116, name);
    }
    // The check for a new submission stays and sends no attempt_id.
    await buttonLabeled(f, tree, '检查并生成确认卡').props.onClick();
    assert.equal(calls.at(-1)[1].action, 'check', name);
    assert.equal('attempt_id' in calls.at(-1)[1], false, name);
  }
});

test('#58: the history row of the task\'s submission the platform closed agrees with the task row; a submission made elsewhere shows the platform\'s failure', async (t) => {
  const closed = confirmedReceipt(63116, '2026-11-05T04:03:30.000Z', { ok: false, status: 'pending_review', bundleStatus: undefined, stage: 'upload', score: 0,
    scoringState: { state: 'failed', scoreIsFinal: false }, bundleNotReceived: true,
    error: { code: 'upload_failed', reason: 'bundle_rejected', message: '评测包未通过评测 Worker 的校验。' } });
  const state = withReceipt(historyTask(), closed);
  // `/me/attempts` items carry no closure marker: both rows arrive as plain failures.
  const failedRow = (id, at) => ({ id, challenge_id: 'fixture', status: 'pending_review', scoring_state: 'failed', score: 0, created_at: at, updated_at: at });
  const f = await historyFixture(t, () => attemptsPage([failedRow(63116, '2026-11-05T04:03:27Z'), failedRow(62912, '2026-11-04T10:00:00Z')]), state);
  const rows = historyRows(f.panel);
  assert.match(rows[0], /提交 #63116 .* · 提交未完成 · — 未收到评测包，需重新提交 本对话/);
  assert.match(rows[1], /提交 #62912 .* · 评测未通过 · — 失败 未关联到对话/);
  const tones = findAll(f.panel, (node) => node.type === 'li').map((li) => f.find(li, (node) => node.props?.className === 'pg-badge').props['data-tone']);
  assert.deepEqual(tones, ['error', 'error']);
  // The task row and the drawer summary say the same for #63116.
  const g = await localizedFixture(t);
  const views = taskViews(g, state, g.zh);
  assert.equal(views.summary, '提交 #63116 · 未收到评测包，需重新提交 · 提交未完成 · —');
});

test('#58: an earlier submission of the task the platform closed keeps its history label after a newer submission, with an empty store', async (t) => {
  const closed = confirmedReceipt(63116, '2026-11-05T04:03:30.000Z', { ok: false, status: 'pending_review', bundleStatus: undefined, stage: 'upload', score: 0,
    scoringState: { state: 'failed', scoreIsFinal: false }, bundleNotReceived: true,
    error: { code: 'upload_failed', reason: 'bundle_rejected', message: '评测包未通过评测 Worker 的校验。' } });
  const state = withReceipt(withReceipt(historyTask(), closed), confirmedReceipt(63200, '2026-11-05T08:00:00.000Z'));
  assert.equal(state.receipt.attemptId, 63200);
  assert.deepEqual(state.bundleClosedIds, [63116]);
  const row = (id, scoring, at) => ({ id, challenge_id: 'fixture', status: scoring === 'failed' ? 'pending_review' : 'submitted', scoring_state: scoring, score: 0, created_at: at, updated_at: at });
  const f = await historyFixture(t, () => attemptsPage([row(63200, 'queued', '2026-11-05T08:00:00Z'), row(63116, 'failed', '2026-11-05T04:03:27Z')]), state);
  const rows = historyRows(f.panel);
  assert.match(rows[0], /提交 #63200 .* · 评测中 · — 排队中 本对话/);
  assert.match(rows[1], /提交 #63116 .* · 提交未完成 · — 未收到评测包，需重新提交 本对话/);
});

test('#58: the drawer hides the re-upload button once polling, through the workbench store, shows the platform closed the submission', async (t) => {
  const args = { challenge_id: 'fixture', bundle_path: 'bundle.zip', trace_path: 'trace.json', attempt_id: 63167 };
  const platform = new Map([[63167, { status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false }, scoringQueue: { stage: 'awaiting_receipt' } }]]);
  const h = await refreshHarness(t, [['a', uploadFailed(63167, { args })]], platform);
  h.flush();
  await h.settled();
  const row = h.f.find(h.view.tree, (node) => node.type?.name === 'TaskSummaryRow');
  h.f.find(h.f.render(row.type, row.props), (node) => node.props?.className === 'pg-task-row-select').props.onClick();
  const workflow = () => {
    const drawer = h.f.find(h.flush(), (node) => node.type?.name === 'TaskDetailDrawer');
    const selected = h.f.find(h.f.render(drawer.type, drawer.props), (node) => node.type?.name === 'SelectedTask');
    const task = h.f.render(selected.type, selected.props);
    return h.f.render(task.type, task.props);
  };
  buttonLabeled(h.f, workflow(), '准备提交 / 检查材料').props.onClick();
  assert.ok(buttonLabeled(h.f, workflow(), '检查后重传原提交 #63167'));
  platform.set(63167, { status: 'pending_review', score: 0, scoringState: { state: 'failed', scoreIsFinal: false }, bundleNotReceived: true });
  h.tick(twoMinutes);
  await h.settled();
  const tree = workflow();
  assert.equal(buttonLabeled(h.f, tree, '检查后重传原提交 #63167'), undefined);
  assert.equal(text(h.f.find(tree, (node) => node.props?.className === 'pg-note pg-closed-note')),
    '平台已关闭提交 #63167（未收到评测包），不能再往里重传。修改评测包后，用“检查并生成确认卡”新建一次提交。');
  // Only the store holds the closure: the task's own receipt never carried the flag.
  assert.equal(h.sessions[0].projectionValues.playgroundTask.receipt.bundleNotReceived, undefined);
  assert.ok(buttonLabeled(h.f, tree, '检查并生成确认卡'));
});

test('#58: a submission whose upload failed is polled until the platform closes it as "bundle missing" or scores it', async (t) => {
  const awaitingReceipt = { status: 'submitted', score: 0, scoringState: { state: 'queued', scoreIsFinal: false }, scoringQueue: { stage: 'awaiting_receipt' } };
  const platform = new Map([[63167, awaitingReceipt], [63200, awaitingReceipt]]);
  const h = await refreshHarness(t, [['a', uploadFailed(63167)], ['b', uploadFailed(63200)],
    ['c', uploadFailed(63116, { status: 'pending_review', scoringState: { state: 'failed', scoreIsFinal: false }, bundleNotReceived: true })]], platform);
  h.flush();
  // The marked submissions are polled; the one the platform already closed is not.
  assert.deepEqual(h.calls.map((call) => call.id), [63167, 63200]);
  await h.settled();
  const badge = (id) => h.rows().find((row) => row.id === id).badge;
  assert.deepEqual(['a', 'b', 'c'].map(badge), ['评测包未上传', '评测包未上传', '未收到评测包，需重新提交']);
  h.tick(twoMinutes);
  assert.deepEqual(h.calls.map((call) => call.id), [63167, 63200, 63167, 63200]);
  await h.settled();
  // The platform closes #63167; #63200 was re-uploaded elsewhere and gets a final score.
  platform.set(63167, { status: 'pending_review', score: 0, scoringState: { state: 'failed', scoreIsFinal: false }, bundleNotReceived: true });
  platform.set(63200, finalAttempt(70));
  h.tick(twoMinutes);
  assert.equal(h.calls.length, 6);
  await h.settled();
  assert.deepEqual(['a', 'b'].map(badge), ['未收到评测包，需重新提交', '评分完成']);
  // Nothing is left to wait for: polling stops.
  assert.equal(h.document.listeners.size, 0);
  h.tick(twoMinutes * 3);
  assert.equal(h.calls.length, 6);
});

test('#58: the material check card warns when the bundle is the one the Worker refused', async (t) => {
  const f = await localizedFixture(t);
  const Card = f.registrations.get('playground_check_materials').Component;
  const warning = '这个评测包与上次被拒收的完全相同（SHA-256 一致）：评测 Worker 会以同样的原因再次拒收，请先修改评测包再检查。';
  const card = f.render(Card, { phase: 'result', toolName: 'playground_check_materials', t: f.zh,
    block: { meta: { playground: { ok: true, status: 'awaiting_confirmation', bundleSummary: SUMMARY_58, bundleWarning: warning } } } });
  const line = f.find(card, (node) => node.props?.className === 'pg-note pg-bundle-warning');
  assert.equal(line.props.role, 'status');
  assert.equal(text(line).replace(/\s+/g, ' '), `评测包未改动 ${warning}`);
  const plain = f.render(Card, { phase: 'result', toolName: 'playground_check_materials', t: f.zh,
    block: { meta: { playground: { ok: true, status: 'awaiting_confirmation', bundleSummary: SUMMARY_58 } } } });
  assert.equal(f.find(plain, (node) => node.props?.className === 'pg-note pg-bundle-warning'), undefined);
});

test('#58: the material check card and the confirmation section show a compact bundle summary', async (t) => {
  const f = await localizedFixture(t);
  const Card = f.registrations.get('playground_check_materials').Component;
  const card = f.render(Card, { phase: 'result', toolName: 'playground_check_materials', t: f.zh,
    block: { meta: { playground: { ok: true, status: 'awaiting_confirmation', bundleSummary: { ...SUMMARY_58, symlinkCount: 2, symlinks: ['a', 'b'] } } } } });
  assert.equal(text(f.find(card, (node) => node.props?.className === 'pg-note pg-bundle-summary')), `${SUMMARY_LINE_58}；符号链接 2 个`);
  const prepared = { checkId: 'synthetic-check', challenge: { id: 'fixture', title: 'Fixture' }, baseUrl: 'http://127.0.0.1:15000/api', cwd: '/synthetic',
    args: { challenge_id: 'fixture', method: 'DSH Playground plugin' }, traceCount: 1, files: [{ kind: 'bundle', path: '/synthetic/bundle.zip', bytes: 1, sha256: 'abc' }],
    cliPrecheck: { status: 'passed' }, bundleSummary: SUMMARY_58, bundleWarning: '这个评测包与上次被拒收的完全相同（SHA-256 一致）。' };
  const task = { challengeId: 'fixture', title: 'Fixture', mode: 'participate' };
  const Main = f.registrations.get('main').Component;
  const session = { id: 's', displayTitle: 'Playground · Fixture', projectionValues: { playgroundTask: { task, prepared, receipt: null } } };
  const props = { useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask: { task, prepared, receipt: null } } } } }),
    useSessionAccess: () => true, refreshProjections: async () => {}, run: async () => ({ ok: true }), openTask: () => {}, openChat: () => {}, login: async () => {}, t: f.zh };
  const rowElement = f.find(f.render(Main, props), (node) => node.type?.name === 'TaskSummaryRow');
  f.find(f.render(rowElement.type, rowElement.props), (node) => node.props?.className === 'pg-task-row-select').props.onClick();
  const drawer = f.find(f.render(Main, props), (node) => node.type?.name === 'TaskDetailDrawer');
  const selected = f.find(f.render(drawer.type, drawer.props), (node) => node.type?.name === 'SelectedTask');
  const workflow = f.render(selected.type, selected.props);
  const confirmSection = f.find(f.render(workflow.type, workflow.props), (node) => node.props?.['aria-label'] === 'Playground 提交确认');
  assert.equal(text(f.find(confirmSection, (node) => node.props?.className === 'pg-note pg-bundle-summary')), SUMMARY_LINE_58);
  // The check's warning that this bundle is the one the Worker refused sits next to it.
  assert.equal(text(f.find(confirmSection, (node) => node.props?.className === 'pg-note pg-bundle-warning')).replace(/\s+/g, ' '),
    '评测包未改动 这个评测包与上次被拒收的完全相同（SHA-256 一致）。');
});

// #57: playground_submit gets its own tool card; an approved submission shows its receipt like the 确认提交 card.
test('#57: the playground_submit card shows the receipt, a refused approval and the waiting state', async (t) => {
  const opened = [];
  const f = await localizedFixture(t);
  const registration = f.registrations.get('playground_submit');
  assert.ok(registration, 'the tool card is registered');
  const Card = registration.Component;
  assert.equal(f.zh('tools.playground_submit'), '确认提交（审批）');
  assert.equal(f.en('tools.playground_submit'), 'Submit (approval)');
  const openWorkbench = (sessionId) => opened.push(sessionId);
  const receipt = { attemptId: 42, challengeId: 'challenge-a', scoringState: { state: 'queued', scoreIsFinal: false }, status: 'submitted' };
  const approved = f.render(Card, { phase: 'result', toolName: 'playground_submit', t: f.zh, sessionId: 'task-1', openWorkbench,
    block: { content: [{ type: 'text', text: '## Submission 42 confirmed' }], meta: { playground: { ok: true, attemptId: 42, status: 'submitted',
      scoringState: { state: 'queued', scoreIsFinal: false }, workflow: { kind: 'receipt', receipt } } } } });
  assert.equal(text(f.find(approved, (node) => node.props?.className === 'pg-note pg-receipt')), '提交 #42 · 排队中');
  assert.match(text(approved), /提交编号: 42/);
  assert.equal(f.find(approved, (node) => node.props?.role === 'alert'), undefined);
  assert.equal(f.find(approved, (node) => node.type === 'button' && text(node) === '前往工作台确认提交'), undefined);
  // A refused approval keeps the card: the message and a way to the workbench.
  const message = '没有提交：审批面板中选择了拒绝（或本会话的审批策略为不询问、直接拒绝），没有写入平台。确认卡仍然有效，可以在 Playground 工作台的任务详情里点“确认目标并提交”。';
  const refused = f.render(Card, { phase: 'result', toolName: 'playground_submit', t: f.zh, sessionId: 'task-1', openWorkbench,
    block: { content: [], meta: { playground: { ok: false, error: { code: 'approval_rejected', message } } } } });
  assert.equal(text(f.find(refused, (node) => node.props?.role === 'alert')), message);
  assert.equal(f.find(refused, (node) => node.props?.className === 'pg-note pg-receipt'), undefined);
  const button = f.find(refused, (node) => node.type === 'button' && text(node) === '前往工作台确认提交');
  assert.ok(button);
  button.props.onClick();
  assert.deepEqual(opened, ['task-1']);
  // A refusal that cleared the card (another login) offers no confirmation in the workbench.
  const cleared = f.render(Card, { phase: 'result', toolName: 'playground_submit', t: f.zh, sessionId: 'task-1', openWorkbench,
    block: { content: [], meta: { playground: { ok: false, error: { code: 'identity_changed', message: '身份已变化' }, workflow: { kind: 'clear' } } } } });
  assert.equal(f.find(cleared, (node) => node.type === 'button' && text(node) === '前往工作台确认提交'), undefined);
  // While the panel waits for the user.
  const waiting = f.render(Card, { phase: 'start', toolName: 'playground_submit', t: f.zh, block: {} });
  assert.match(text(waiting), /等待“允许一次”或正在提交…/);
});
