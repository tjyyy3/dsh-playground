import assert from 'node:assert/strict';
import test from 'node:test';

test('F-01: workbench passes run to the selected task', async (t) => {
  let plugin;
  const updates = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, (v) => updates.push(v)],
    useEffect: () => {}, Fragment: Symbol('fragment'),
  };
  t.after(() => { delete globalThis.window; });
  globalThis.window = { __ModuleLoader__: { load: (module) => { plugin = module.factory((name) => { if (name !== 'react') throw Error(name); return React; }); } } };
  await import('../client.js');
  let Main;
  plugin.apply({ effect: () => {}, slots: {
    inject: (name, fn) => { if (name === 'main') fn(); },
    register: (_definition, Component) => { Main = Component; },
  } });
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of (node.props?.children || []).flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  }
  const calls = [];
  const session = { id: 's', displayTitle: 'Playground · Fixture', retainedBy: { mainView: 1 } };
  const state = { task: { challengeId: 'fixture', title: 'Fixture', mode: 'participate' }, prepared: {
    checkId: 'checked', challenge: { id: 'fixture', title: 'Fixture' }, args: {}, files: [],
  }, receipt: null };
  const tree = Main({ useSessions: (select) => select({ ids: ['s'], byId: { s: session }, projectionsBySession: { s: { state: 'ready', values: { playgroundTask: state } } } }),
    useSessionAccess: () => true, refreshProjections: async () => {}, run: async (...args) => { calls.push(args); return { ok: true }; }, openTask: () => {}, openChat: () => {}, login: async () => {}, t: (s) => s });
  const selected = find(tree, (n) => n.type?.name === 'SelectedTask');
  const task = selected.type(selected.props);
  const taskTree = task.type(task.props);
  const button = find(taskTree, (n) => n.type === 'button' && n.props.children.includes('确认目标并提交'));
  await button.props.onClick();
  assert.deepEqual(calls, [['s', 'checked', true]]);
  assert.equal(updates.some((v) => typeof v === 'string' && /run is not a function/.test(v)), false);
});
