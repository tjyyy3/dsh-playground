import assert from 'node:assert/strict';
import test from 'node:test';

let fixtureId = 0;
async function clientFixture(t, services = {}) {
  let plugin;
  const states = new Map();
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
    useEffect: () => {}, Fragment: Symbol('fragment'),
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
  plugin.apply({ ...services, effect: () => {}, slots: {
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
  return { registrations, find, render, unmount: (Component) => states.delete(Component) };
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
