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
async function localizedFixture(t) {
  const messages = {};
  const f = await clientFixture(t, { effect: (fn) => fn(), locale: { register: (_name, value) => Object.assign(messages, value) } });
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
