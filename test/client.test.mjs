import assert from 'node:assert/strict';
import test from 'node:test';

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
    useEffect: (effect) => { effects.push(effect); }, Fragment: Symbol('fragment'),
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
    assert.equal(starts.length, 2);
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

test('historical auth/catalog cards show summaries and inert safe details', async (t) => {
  const f = await clientFixture(t);
  const Card = f.registrations.get('playground').Component;
  assert.equal(f.registrations.get('playground-auth-login').Component, Card);
  for (const [value, title, expected] of [
    [{ playgroundAuth: { authenticated: false, user: { email: 'private@example.test' }, cli: { token: 'private-token' } } }, '登录状态检测', '未登录'],
    [{ playgroundCatalog: { competitions: { total: 2 }, challenges: { total: 1, items: [{ title: 'Synthetic challenge' }] } }, authorization: 'private-token' }, '赛题目录查询', '共 2 个比赛、1 道赛题'],
  ]) {
    const tree = f.render(Card, { node: { outcome: { kind: 'success', text: JSON.stringify(value) } } });
    assert.match(text(tree), new RegExp(title));
    assert.match(text(tree), new RegExp(expected));
    assert.ok(f.find(tree, (node) => node.type === 'details'));
    assert.equal(f.find(tree, (node) => node.props?.onClick || node.props?.onToggle), undefined);
    assert.doesNotMatch(text(tree), /private-token|private@example/);
  }
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
