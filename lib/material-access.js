import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { PlaygroundApiError } from './api.js';

const purpose = 'challenge-materials';
const fullyQualified = (path) => typeof path === 'string' && (process.platform === 'win32'
  ? /^(?:[a-z]:[\\/]|\\\\)/i.test(path) : isAbsolute(path));
const within = (directory, path, recursive = true) => {
  const rest = relative(directory, path);
  return rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`)
    && (recursive || !rest.includes(sep)));
};
const covers = (scope, item) => scope.kind === 'directory'
  ? relative(scope.path, item.path) === '' || ((scope.recursive || item.kind === 'file') && within(scope.path, item.path, scope.recursive))
  : item.kind === 'file' && relative(scope.path, item.path) === '';
const failure = (code, message) => new PlaygroundApiError(message, { code });
const fingerprint = (input) => JSON.stringify(Object.keys(input).filter((key) => !['material_request_id', 'action'].includes(key))
  .sort().map((key) => [key, input[key]]));

/** Grants live only for this Host instance. */
export function createMaterialAccess(ctx) {
  const sessions = new Map();
  const forget = (sessionId) => sessions.delete(sessionId);
  ctx.on?.('session/event', (session, event) => {
    if (event.type === 'working-directory/change') forget(session.id);
    const change = event.type === 'tool/result' ? event.data.meta?.playgroundWorkflow : undefined;
    if (change?.kind === 'task' || change?.kind === 'bind') forget(session.id);
  });
  ctx.on?.('session/disposed', (session) => forget(session.id));
  ctx.on?.('agent/disposed', ({ agent }) => forget(agent.id));
  ctx.on?.('workspace/session-stop', ({ sessionId }) => forget(sessionId));
  ctx.on?.('domain/changed', (change) => {
    if (change.domain === 'workspace' && change.table === '' && change.operation === 'put') {
      for (const id of change.value.archivedSessionIds || []) forget(id);
    }
  });
  ctx.effect?.(() => () => sessions.clear());

  async function context(exec) {
    const session = exec?.agent?.session;
    const task = session && ctx.sessionProjections.stateOf(session, 'playgroundTask')?.task;
    const directory = session && ctx.workingDirectory?.get(session);
    const refuse = () => {
      throw failure('workspace_required', '无法确认当前赛题任务的已注册工作区，已停止材料读取。请先在当前对话绑定赛题并选择工作区。');
    };
    if (session && ctx.workspaceRegistry?.archivedSessionIds?.includes(session.id)) {
      forget(session.id);
      return refuse();
    }
    if (!session || !task || !fullyQualified(task.cwd) || !fullyQualified(directory) || !ctx.workspaceRegistry?.resolveByPath) return refuse();
    const workspace = await ctx.workspaceRegistry.resolveByPath(task.cwd).catch(() => undefined);
    const workspaceRoot = workspace && await realpath(workspace.path).catch(() => undefined);
    const current = await realpath(directory).catch(() => undefined);
    if (!workspaceRoot || !current || !within(workspaceRoot, current)) return refuse();
    let record = sessions.get(session.id);
    const key = JSON.stringify([workspace.id, workspaceRoot, current, task.challengeId]);
    if (!record || record.session !== session || record.key !== key) {
      record = { session, key, cwd: current, workspaceRoot, workspaceId: workspace.id, challengeId: task.challengeId, grants: [], pending: new Map() };
      sessions.set(session.id, record);
    }
    return record;
  }

  function request(record, input, operation, scopes) {
    const id = randomUUID();
    const entry = { id, input: { ...input }, operation, purpose, scopes, fingerprint: fingerprint(input) };
    record.pending.set(id, entry);
    for (const [key, value] of record.pending) if (key !== id && value.operation === operation) record.pending.delete(key);
    const error = failure('material_authorization_required', '需要用户授权外部比赛材料。请在任务详情的“外部材料权限”中核对文件或目录，选择仅本次操作或本次任务。读取授权不代表提交授权。');
    error.materialAccess = view(entry);
    throw error;
  }
  const view = (entry) => ({ requestId: entry.id, purpose: entry.purpose, operation: entry.operation,
    scopes: entry.scopes.map(({ path, kind, recursive }) => ({ path, kind, recursive })) });

  async function begin(exec, input, operation = 'check') {
    if (!['check', 'submit'].includes(operation)) throw failure('material_purpose_invalid', '此授权仅用于比赛材料读取和检查。');
    const record = await context(exec);
    const id = input.material_request_id;
    let once = [];
    let references = [];
    if (id !== undefined) {
      const pending = record.pending.get(id);
      if (!pending?.authorized || pending.operation !== operation || pending.fingerprint !== fingerprint(input)) {
        throw failure('material_authorization_expired', '这次材料授权已失效或不属于本次操作，请重新检查材料并由用户授权。');
      }
      // Consume before any await: another command cannot reuse the same one-operation grant.
      record.pending.delete(id);
      once = pending.scopes;
    }
    async function resolveAll(paths) {
      exec.signal?.throwIfAborted();
      if (await context(exec) !== record) throw failure('material_authorization_expired', '任务或工作区已变化，材料授权已失效。');
      const resolved = await Promise.all(paths.map(async ({ path, optional = false }) => {
        if (typeof path !== 'string' || !path.trim()) throw failure('invalid_argument', '材料路径不能为空。');
        const absolute = resolve(record.cwd, path);
        let canonical;
        try { canonical = await realpath(absolute); } catch (error) {
          if (optional && error.code === 'ENOENT') return null;
          throw failure('invalid_argument', `材料路径不存在或不可访问：${absolute}`);
        }
        const info = await stat(canonical);
        if (!info.isDirectory() && !info.isFile()) throw failure('invalid_argument', `比赛材料必须是普通文件或目录：${canonical}`);
        return { path: canonical, kind: info.isDirectory() ? 'directory' : 'file', recursive: false };
      }));
      if (await context(exec) !== record) throw failure('material_authorization_expired', '任务或工作区已变化，材料授权已失效。');
      const scopes = resolved.filter(Boolean);
      const missing = scopes.filter((item) => !within(record.workspaceRoot, item.path)
        && !once.some((scope) => covers(scope, item))
        && !record.grants.some((grant) => grant.purpose === purpose && covers(grant, item)));
      if (missing.length) request(record, input, operation, [...new Map(missing.map((scope) => [scope.path, scope])).values()]);
      references = scopes.map((item) => ({ ...item, recursive: item.kind === 'directory'
        && (within(record.workspaceRoot, item.path) || [...once, ...record.grants].some((scope) => covers(scope, item) && scope.recursive)) }));
      return resolved.map((item) => item?.path);
    }
    return {
      cwd: record.cwd,
      workspaceId: record.workspaceId,
      workspaceRoot: record.workspaceRoot,
      resolveAll,
      references: () => references.map((item) => ({ ...item })),
      async resolve(path) { return (await resolveAll([{ path }]))[0]; },
    };
  }

  async function status(exec) {
    const record = await context(exec);
    return { ok: true, requests: [...record.pending.values()].filter((item) => !item.authorized).map(view),
      grants: record.grants.map(({ path, kind, recursive }) => ({ path, kind, recursive })), cwd: record.cwd };
  }
  async function authorize(input, exec) {
    const record = await context(exec);
    const pending = record.pending.get(input.requestId);
    if (!pending || pending.authorized) throw failure('material_authorization_expired', '这次材料请求已失效，请重新检查材料。');
    const scopes = pending.scopes.map((scope) => ({ ...scope, recursive: scope.kind === 'directory' && input.recursive === true }));
    if (input.scope === 'task') record.grants.push(...scopes.map((scope) => ({ ...scope, purpose })));
    pending.scopes = scopes;
    pending.authorized = true;
    return { ok: true, operation: pending.operation, input: { ...pending.input,
      material_request_id: pending.id } };
  }
  return { begin, status, authorize, revoke: (exec) => { forget(exec.agent.id); return { ok: true }; } };
}
