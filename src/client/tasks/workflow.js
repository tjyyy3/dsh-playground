import { msg } from '../shared/language.js';
import * as React from 'react';
import { h } from '../shared/react.js';
import { receiptProgress, submissionCountsLine, withLatestAttempt } from './attempts.js';
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
  const scopeText = (item) => msg(`${item.kind === 'directory' ? `目录（${item.recursive ? '含子目录' : '仅直接文件'}）` : '文件'}：${item.path}`, `${item.kind === 'directory' ? `Directory (${item.recursive ? 'including subfolders' : 'direct files only'})` : 'File'}: ${item.path}`);
  return h('section', { className: 'pg-confirm', 'aria-label': msg('外部材料权限', 'External material permissions') },
    h('h4', null, msg('外部材料权限', 'External material permissions')),
    h('p', { className: 'pg-note' }, msg('仅用于当前任务所列比赛材料引用和后续读取。此授权不代表同意提交；平台提交仍需单独请求。任务结束、工作区切换或宿主重启后失效。', 'Access covers the listed material references and subsequent reads for this task. Submitting to the platform requires a separate request. Access expires when the task ends, the workspace changes, or the host restarts.')),
    ...(snapshot?.requests || []).map((item) => h('div', { key: item.requestId, className: 'pg-form' },
      h('p', { className: 'pg-note' }, item.operation === 'submit' ? msg('为已请求的提交传递材料引用。授权后继续交接，配额例外仍需答复。', 'Pass material references for the requested submission. Granting access resumes the handoff. Quota exceptions still require your response.') : msg('记录材料引用。授权后继续记录，不会上传。', 'Record material references. Granting access resumes recording without uploading files.')),
      ...item.scopes.map((entry) => h('p', { key: entry.path, className: 'pg-note pg-path' }, scopeText(entry))),
      h('label', { className: 'pg-field' }, msg('允许范围', 'Allow access for'), h('select', { value: scope, disabled: disabled || busy, onChange: (event) => setScope(event.target.value) },
        h('option', { value: 'operation' }, msg('仅本次操作允许', 'This operation only')), h('option', { value: 'task' }, msg('本次任务内允许', 'This task')))),
      item.scopes.some((entry) => entry.kind === 'directory') ? h('label', { className: 'pg-field' },
        h('input', { type: 'checkbox', checked: recursive, disabled: disabled || busy, onChange: (event) => setRecursive(event.target.checked) }), msg('目录授权包含子目录', 'Include subfolders in directory access')) : null,
      h('button', { className: 'pg-button pg-primary', disabled: disabled || busy,
        onClick: () => act({ action: 'authorize', requestId: item.requestId, scope, recursive }) }, item.operation === 'submit' ? msg('允许引用并继续交接', 'Allow references and resume handoff') : msg('允许引用并继续记录', 'Allow references and resume recording')))),
    snapshot?.grants?.length ? h(React.Fragment, null,
      h('p', { className: 'pg-note' }, msg('本次任务已允许的范围', 'Access granted for this task')),
      ...snapshot.grants.map((entry) => h('p', { key: entry.path, className: 'pg-note pg-path' }, scopeText(entry))),
      h('button', { className: 'pg-button', disabled: disabled || busy, onClick: () => act({ action: 'revoke' }) }, msg('撤销本任务全部材料授权', 'Revoke all material access for this task'))) : null,
    snapshot && !snapshot.requests.length && !snapshot.grants.length ? h('p', { className: 'pg-note' }, msg('没有待授权的外部材料，也没有任务级授权。', 'No external materials await approval and this task has no active grants.')) : null,
    h('button', { className: 'pg-button', disabled: busy, onClick: refresh }, msg('刷新材料权限', 'Refresh permissions')),
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
      if (result.ok === false) setError(result.error?.message || result.note || msg('操作未完成', 'Operation did not finish'));
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
  const stages = { awaiting_user: msg('等待配额答复，尚未派发', 'Awaiting your quota decision before dispatch'), dispatching: msg('正在交接', 'Handing off'), dispatched: msg('已派发给 Agent，尚未取得新编号', 'Sent to the Agent. Awaiting a submission ID.'),
    not_created: msg('未创建新提交', 'No new submission created'), created: msg('已创建，上传状态未确认', 'Created. Upload unconfirmed.'), uploaded: msg('Agent 报告已上传', 'Agent reports a successful upload'), upload_failed: msg('已创建，Agent 报告上传失败', 'Created. Agent reports an upload failure.'),
    unknown: msg('结果未知，先核对已有提交', 'Outcome unknown. Check existing submissions first.'), running: msg('平台已接收，处理中', 'Received by the platform and processing'), final: msg('平台已返回最终结果', 'Final result received') };
  return h('section', { className: 'pg-guide pg-workflow', 'aria-label': msg('Playground 任务', 'Playground task') },
    h('style', null, css + '.pg-form{display:grid;gap:8px;margin-top:10px}.pg-field{display:grid;gap:4px;font-size:12px}.pg-input{width:100%}.pg-confirm{margin-top:10px;padding-top:10px;border-top:1px solid var(--pg-line)}.pg-path{overflow-wrap:anywhere;white-space:pre-line}.pg-advanced{margin-top:10px}'),
    h('h3', { className: 'pg-brand' }, task ? `Playground · ${task.title}` : msg('Playground · 开始任务', 'Playground · Start task')),
    task ? h('p', { className: 'pg-note pg-path' }, msg(`赛题 ${task.challengeId} · ${cwd || task.cwd}`, `Challenge ${task.challengeId} · ${cwd || task.cwd}`)) : null,
    task && materials ? h(React.Fragment, null,
      h('button', { className: 'pg-button', 'aria-expanded': showAccess, onClick: () => setShowAccess(!showAccess) }, msg('外部材料权限', 'External material permissions')),
      showAccess ? h(MaterialPermissions, { sessionId, request: accessRequest, materials, resume: act, disabled }) : null) : null,
    task?.mode === 'author' ? h(React.Fragment, null,
      h('p', { className: 'pg-note' }, msg('出题模式目前只支持本地准备。', 'Authoring mode currently supports local preparation only.')),
      h('button', { className: 'pg-button', disabled, onClick: () => act({ action: 'mode', mode: 'participate' }) }, msg('切回参赛', 'Switch to participation'))) : null,
    task && task.mode !== 'author' ? h(React.Fragment, null,
      h('p', { className: 'pg-note' }, msg('提交会交给本任务的 Agent。Agent 按当前题目和官方要求选择 CLI 或 API，取得编号后关联并跟踪结果。', 'The task Agent submits through the official CLI or API according to the challenge requirements. It records the submission ID and tracks the result.')),
      h('details', { className: 'pg-advanced' }, h('summary', null, msg('材料引用（可选）', 'Material references (optional)')),
        h('div', { className: 'pg-form' }, ...[['outputs_path', msg('产物目录', 'Output directory')], ['bundle_path', msg('评测包路径', 'Evaluation bundle path')], ['trace_path', msg('执行轨迹路径', 'Execution trace path')], ['manifest_path', msg('Manifest 路径', 'Manifest path')]].map(([key, label]) =>
          h('label', { key, className: 'pg-field' }, label, h('input', { className: 'pg-input', value: files[key] || '', disabled: disabled || active,
            onChange: (event) => setFiles({ ...files, [key]: event.target.value }) })))),
        h('p', { className: 'pg-note' }, msg('仅传递路径，不读取内容或检查格式。留空时由 Agent 根据任务上下文处理，外部材料需先授权。', 'Only paths are passed. The plugin does not read files or check their format. Leave the fields blank to use the task context. External materials require permission.'))),
      h('div', { className: 'pg-actions' },
        h('button', { className: 'pg-button pg-primary', disabled: disabled || active || request?.status === 'awaiting_user', onClick: () => act({ action: 'request', ...files }) }, msg('提交', 'Submit')),
        receipt?.attemptId ? h('button', { className: 'pg-button', disabled, onClick: () => act({ action: 'results' }) }, msg(`查询结果 #${receipt.attemptId}`, `Check result #${receipt.attemptId}`)) : null)) : null,
    request ? h('div', { className: 'pg-confirm', role: 'status' },
      h('p', { className: 'pg-note' }, request.status === 'not_created' && request.recovery ? msg('已解除交接状态，服务器结果待核对', 'Handoff cleared. The server outcome still needs verification.') : stages[request.status] || request.status),
      request.policy?.announcement ? h('p', { className: 'pg-note' }, request.policy.announcement) : null,
      submissionCountsLine(request.counts) ? h('p', { className: 'pg-note' }, submissionCountsLine(request.counts)) : null,
      request.message ? h('p', { className: 'pg-note' }, request.reportedBy === 'agent' ? msg(`Agent 报告：${request.message}`, `Agent report: ${request.message}`) : request.message) : null,
      request.status === 'awaiting_user' ? h(React.Fragment, null,
        h('p', { className: 'pg-confirm-impact' },
          h('span', { className: 'pg-badge', 'data-tone': 'warning' }, msg('等待你答复', 'Waiting for your reply')),
          msg(`${request.policy?.reasonText || '本次提交有配额风险'}。继续可能消耗提交名额。`, `${request.policy?.reasonText || 'This submission may count against your quota'}. Continuing may use a submission slot.`)),
        h('div', { className: 'pg-actions' },
          h('button', { className: 'pg-button pg-risk', disabled, onClick: () => act({ action: 'confirm_quota', requestId: request.requestId }) }, msg('知悉配额风险，继续本次提交', 'Accept quota risk and continue')))) : null,
      canCancel ? h('button', { className: 'pg-button', disabled: busy || !allowed, onClick: () => act({ action: 'cancel', requestId: request.requestId }) }, msg('取消本次请求', 'Cancel this request')) : null) : null,
    receipt ? h('details', { className: 'pg-raw' },
      h('summary', null, `${t('progress.attempt')} #${receipt.attemptId ?? '—'} · ${progress.badgeText} · ${progress.stageText} · ${progress.scoreText}`),
      h(PlaygroundToolCard, { phase: 'result', block: { meta: { playground: receipt } }, toolName: 'playground_get_attempt', t })) : null,
    error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null,
    running ? h('p', { className: 'pg-note' }, msg('此会话正在执行任务。取消生成不能撤回已经发生的服务器写入。', 'This chat is running a task. Stopping generation cannot undo completed server writes.')) : null,
    !allowed ? h('p', { className: 'pg-note' }, msg('当前连接没有此会话的操作权限。', 'This connection cannot perform actions in this chat.')) : null);
}

function SelectedTask({ session, projection, attempts, useSessionAccess, refreshProjections, ...props }) {
  const allowed = useSessionAccess(session.id, 'commands/execute');
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    refreshProjections(session.id).catch((failure) => setError(failure.message));
  }, [session.id, refreshProjections]);
  if (error || projection?.state === 'error' || projection?.state === 'migration-required') {
    return h('p', { className: 'pg-error', role: 'alert' }, error || projection.error?.message || msg('请先在 DSH 中打开此会话，完成会话迁移后再继续。', 'Open this chat in DSH to complete its migration before continuing.'));
  }
  if (projection?.state !== 'ready') return h('p', { className: 'pg-note', role: 'status' }, msg('正在读取任务状态…', 'Loading task status…'));
  const task = projection.values.playgroundTask;
  const receipt = withLatestAttempt(task, attempts, session.id);
  return h(TaskWorkflow, { ...props, sessionId: session.id, state: receipt === task?.receipt ? task : { ...task, receipt },
    cwd: projection.values.workingDirectory || session.cwd, running: session.running, allowed });
}

export { SelectedTask };

