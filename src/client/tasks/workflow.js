import * as React from 'react';
import { h } from '../shared/react.js';
import { receiptAttemptId, receiptProgress, submissionCountsLine, withLatestAttempt } from './attempts.js';
import { css } from '../shared/styles.js';
import { PlaygroundToolCard } from '../cards/tool.js';

function MaterialPermissions({ sessionId, request, materials, resume, disabled }) {
  const [snapshot, setSnapshot] = React.useState(null);
  const [scope, setScope] = React.useState('operation');
  const [recursive, setRecursive] = React.useState(false);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const refresh = async () => {
    try {
      const value = await materials({ action: 'status', sessionId });
      if (value.ok === false) throw new Error(value.error.message);
      setSnapshot(value); setError('');
    } catch (failure) { setError(failure.message); }
  };
  React.useEffect(() => { setScope('operation'); setRecursive(false); refresh(); }, [sessionId, request?.requestId]);
  const act = async (input) => {
    setBusy(true); setError('');
    try {
      const result = await materials({ ...input, sessionId });
      if (result.ok === false) throw new Error(result.error.message);
      if (input.action === 'authorize') await resume(result.input);
      await refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const scopeText = (item) => `${item.kind === 'directory' ? `目录（${item.recursive ? '含子目录' : '仅直接文件'}）` : '文件'}：${item.path}`;
  return h('section', { className: 'pg-confirm', 'aria-label': '外部材料权限' },
    h('h4', null, '外部材料权限'),
    h('p', { className: 'pg-note' }, '仅用于当前任务所列比赛材料引用和后续读取。此授权不代表同意提交；平台提交仍需单独请求。任务结束、工作区切换或宿主重启后失效。'),
    ...(snapshot?.requests || []).map((item) => h('div', { key: item.requestId, className: 'pg-form' },
      h('p', { className: 'pg-note' }, item.operation === 'submit' ? '为已请求的提交传递材料引用。授权后继续交接，配额例外仍需答复。' : '记录材料引用。授权后继续记录，不会上传。'),
      ...item.scopes.map((entry) => h('p', { key: entry.path, className: 'pg-note pg-path' }, scopeText(entry))),
      h('label', { className: 'pg-field' }, '允许范围', h('select', { value: scope, disabled: disabled || busy, onChange: (event) => setScope(event.target.value) },
        h('option', { value: 'operation' }, '仅本次操作允许'), h('option', { value: 'task' }, '本次任务内允许'))),
      item.scopes.some((entry) => entry.kind === 'directory') ? h('label', { className: 'pg-field' },
        h('input', { type: 'checkbox', checked: recursive, disabled: disabled || busy, onChange: (event) => setRecursive(event.target.checked) }), '目录授权包含子目录') : null,
      h('button', { className: 'pg-button pg-primary', disabled: disabled || busy,
        onClick: () => act({ action: 'authorize', requestId: item.requestId, scope, recursive }) }, item.operation === 'submit' ? '允许引用并继续交接' : '允许引用并继续记录'))),
    snapshot?.grants?.length ? h(React.Fragment, null,
      h('p', { className: 'pg-note' }, '本次任务已允许的范围'),
      ...snapshot.grants.map((entry) => h('p', { key: entry.path, className: 'pg-note pg-path' }, scopeText(entry))),
      h('button', { className: 'pg-button', disabled: disabled || busy, onClick: () => act({ action: 'revoke' }) }, '撤销本任务全部材料授权')) : null,
    snapshot && !snapshot.requests.length && !snapshot.grants.length ? h('p', { className: 'pg-note' }, '没有待授权的外部材料，也没有任务级授权。') : null,
    h('button', { className: 'pg-button', disabled: busy, onClick: refresh }, '刷新材料权限'),
    error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null);
}

function TaskWorkflow({ sessionId, state, cwd, running, allowed, run, submission, materials, t }) {
  const task = state?.task;
  const receipt = state?.receipt;
  const progress = receiptProgress(receipt, t, { running });
  const [files, setFiles] = React.useState(state?.materials || {});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [request, setRequest] = React.useState(state?.submission);
  const [accessRequest, setAccessRequest] = React.useState(state?.materialAccess);
  const [showAccess, setShowAccess] = React.useState(Boolean(state?.materialAccess));
  React.useEffect(() => { setFiles(state?.materials || {}); }, [state?.materials]);
  React.useEffect(() => { setRequest(state?.submission); }, [state?.submission]);
  React.useEffect(() => {
    if (state?.materialAccess) { setAccessRequest(state.materialAccess); setShowAccess(true); }
  }, [state?.materialAccess]);
  const act = async (input) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = ['request', 'confirm_quota', 'cancel'].includes(input.action)
        ? await submission({ ...input, sessionId }) : await run(sessionId, input);
      if (result.ok === false) setError(result.error?.message || result.note || '操作未完成');
      if (result.submission) setRequest(result.submission);
      if (result.workflow?.kind === 'material-access') {
        setAccessRequest(result.workflow.request); setShowAccess(true);
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const disabled = busy || running || !allowed;
  const active = ['dispatching', 'dispatched', 'created', 'unknown'].includes(request?.status);
  const canCancel = ['awaiting_user', 'dispatching', 'dispatched', 'created', 'unknown'].includes(request?.status);
  const stages = { awaiting_user: '等待配额答复，尚未派发', dispatching: '正在交接', dispatched: '已派发给 Agent，尚未取得新编号',
    not_created: '未创建新提交', created: '已创建，上传状态未确认', uploaded: 'Agent 报告已上传', upload_failed: '已创建，Agent 报告上传失败',
    unknown: '结果未知，先核对已有提交', running: '平台已接收，处理中', final: '平台已返回最终结果' };
  return h('section', { className: 'pg-guide pg-workflow', 'aria-label': 'Playground 任务' },
    h('style', null, css + '.pg-form{display:grid;gap:8px;margin-top:10px}.pg-field{display:grid;gap:4px;font-size:12px}.pg-input{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:7px}.pg-confirm{margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2)}.pg-path{overflow-wrap:anywhere;white-space:pre-line}.pg-advanced{margin-top:10px}'),
    h('h3', { className: 'pg-brand' }, task ? `Playground · ${task.title}` : 'Playground · 开始任务'),
    task ? h('p', { className: 'pg-note pg-path' }, `赛题 ${task.challengeId} · ${cwd || task.cwd}`) : null,
    task && materials ? h(React.Fragment, null,
      h('button', { className: 'pg-button', 'aria-expanded': showAccess, onClick: () => setShowAccess(!showAccess) }, '外部材料权限'),
      showAccess ? h(MaterialPermissions, { sessionId, request: accessRequest, materials, resume: act, disabled }) : null) : null,
    task?.mode === 'author' ? h(React.Fragment, null,
      h('p', { className: 'pg-note' }, '出题模式目前只支持本地准备。'),
      h('button', { className: 'pg-button', disabled, onClick: () => act({ action: 'mode', mode: 'participate' }) }, '切回参赛')) : null,
    task && task.mode !== 'author' ? h(React.Fragment, null,
      h('p', { className: 'pg-note' }, '提交会交给本任务的 Agent。Agent 按当前题目和官方要求选择 CLI 或 API，取得编号后关联并跟踪结果。'),
      h('details', { className: 'pg-advanced' }, h('summary', null, '材料引用（可选）'),
        h('div', { className: 'pg-form' }, ...[['outputs_path', '产物目录'], ['bundle_path', '评测包路径'], ['trace_path', '执行轨迹路径'], ['manifest_path', 'Manifest 路径']].map(([key, label]) =>
          h('label', { key, className: 'pg-field' }, label, h('input', { className: 'pg-input', value: files[key] || '', disabled: disabled || active,
            onChange: (event) => setFiles({ ...files, [key]: event.target.value }) })))),
        h('p', { className: 'pg-note' }, '仅传递路径，不读取内容或检查格式。留空时由 Agent 根据任务上下文处理，外部材料需先授权。')),
      h('div', { className: 'pg-actions' },
        h('button', { className: 'pg-button pg-primary', disabled: disabled || active || request?.status === 'awaiting_user', onClick: () => act({ action: 'request', ...files }) }, '提交'),
        receipt?.attemptId ? h('button', { className: 'pg-button', disabled, onClick: () => act({ action: 'results' }) }, `查询结果 #${receipt.attemptId}`) : null)) : null,
    request ? h('div', { className: 'pg-confirm', role: 'status' },
      h('p', { className: 'pg-note' }, request.status === 'not_created' && request.recovery ? '已解除交接状态，服务器结果待核对' : stages[request.status] || request.status),
      request.policy?.announcement ? h('p', { className: 'pg-note' }, request.policy.announcement) : null,
      submissionCountsLine(request.counts) ? h('p', { className: 'pg-note' }, submissionCountsLine(request.counts)) : null,
      request.message ? h('p', { className: 'pg-note' }, request.reportedBy === 'agent' ? `Agent 报告：${request.message}` : request.message) : null,
      request.status === 'awaiting_user' ? h(React.Fragment, null,
        h('p', { className: 'pg-confirm-impact' }, `${request.policy?.reasonText || '本次提交有配额风险'}。继续可能消耗提交名额。`),
        h('div', { className: 'pg-actions' },
          h('button', { className: 'pg-button pg-primary', disabled, onClick: () => act({ action: 'confirm_quota', requestId: request.requestId }) }, '知悉配额风险，继续本次提交'))) : null,
      canCancel ? h('button', { className: 'pg-button', disabled: busy || !allowed, onClick: () => act({ action: 'cancel', requestId: request.requestId }) }, '取消本次请求') : null) : null,
    receipt ? h('details', { className: 'pg-raw' },
      h('summary', null, `${t('progress.attempt')} #${receipt.attemptId ?? '—'} · ${progress.badgeText} · ${progress.stageText} · ${progress.scoreText}`),
      h(PlaygroundToolCard, { phase: 'result', block: { meta: { playground: receipt } }, toolName: 'playground_get_attempt', t })) : null,
    error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null,
    running ? h('p', { className: 'pg-note' }, '此会话正在执行任务。取消生成不能撤回已经发生的服务器写入。') : null,
    !allowed ? h('p', { className: 'pg-note' }, '当前连接没有此会话的操作权限。') : null);
}

function SelectedTask({ session, projection, attempts, useSessionAccess, refreshProjections, ...props }) {
  const allowed = useSessionAccess(session.id, 'commands/execute');
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    refreshProjections(session.id).catch((failure) => setError(failure.message));
  }, [session.id, refreshProjections]);
  if (error || projection?.state === 'error' || projection?.state === 'migration-required') {
    return h('p', { className: 'pg-error', role: 'alert' }, error || projection.error?.message || '请先在 DSH 中打开此会话，完成会话迁移后再继续。');
  }
  if (projection?.state !== 'ready') return h('p', { className: 'pg-note', role: 'status' }, '正在读取任务状态…');
  const task = projection.values.playgroundTask;
  const receipt = withLatestAttempt(task?.receipt, attempts?.[receiptAttemptId(task?.receipt)]);
  return h(TaskWorkflow, { ...props, sessionId: session.id, state: receipt === task?.receipt ? task : { ...task, receipt },
    cwd: projection.values.workingDirectory || session.cwd, running: session.running, allowed });
}

export { SelectedTask };

