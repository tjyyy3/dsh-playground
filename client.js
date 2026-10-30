window.__ModuleLoader__.load({
  id: '@playground/dsh-playground',
  factory(require) {
    const React = require('react');
    const { Modal } = require('@deepseek-ai/dsh-client-ui-primitives');
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store');
    const h = React.createElement;
    const locales = {
      zh: {
        tools: {
          playground_list_challenges: '赛题搜索', playground_get_challenge: '赛题详情',
          playground_list_attempts: '赛题提交', playground_get_attempt: '评测结果',
          playground_submit_attempt: '提交与评测', playground_list_competitions: '比赛与赛季',
          playground_get_competition: '比赛详情', playground_list_my_attempts: '我的提交',
          playground_start_task: '新建任务对话', playground_check_materials: '提交前检查', playground_task: '任务状态',
        },
        preparing: '正在准备参数…', running: '正在查询…', uploading: '正在提交评测包…', failed: '操作未完成', loaded: '查询完成',
        deadline: '截止时间', challengeCount: '赛题数量', threshold: '完成门槛',
        unknown: '未知', id: '编号', submissionId: '提交编号', challenge: '赛题', bundle: '评测包',
        total: '总计', trace: '轨迹步数', empty: '暂无匹配结果', more: '仅展示前 5 条，可在对话中继续查询。',
        finalScore: '最终分数', referenceScore: '参考分（未确认最终）', awaitingScore: '等待评分，暂无最终分数',
        metricTitle: '关键指标', metricHint: '指标可能来自上传校验；是否完成评分以平台状态为准。',
        snapshot: '状态以本次查询为准。', nextAttempt: '可以继续问：查询提交状态，编号', raw: '查看完整工具结果',
        states: { draft: '草稿', active: '进行中', ended: '已结束', archived: '已归档', open: '开放',
          submitted: '已提交', scored: '已评分', queued: '排队中', evaluating: '评测中', final: '评分完成',
          failed: '失败', ready: '已接收', incomplete: '材料不完整', awaiting_bundle: '等待评测包',
          awaiting_review: '等待审核', unknown: '未知', not_scored: '未评分' },
        metrics: { accuracy: '准确率', packaging: '包装完整性', executability: '可执行性', output_coverage: '输出覆盖',
          result_fidelity: '结果一致性', trace_quality: '轨迹质量', reproduction: '复现', evidence: '证据', total: '合计' },
      },
      en: {
        tools: {
          playground_list_challenges: 'Challenge search', playground_get_challenge: 'Challenge details',
          playground_list_attempts: 'Challenge submissions', playground_get_attempt: 'Evaluation results',
          playground_submit_attempt: 'Submit for evaluation', playground_list_competitions: 'Competitions',
          playground_get_competition: 'Competition details', playground_list_my_attempts: 'My submissions',
          playground_start_task: 'New task conversation', playground_check_materials: 'Submission checks', playground_task: 'Task status',
        },
        preparing: 'Preparing arguments…', running: 'Querying…', uploading: 'Submitting bundle…', failed: 'Operation incomplete', loaded: 'Query complete',
        deadline: 'Deadline', challengeCount: 'Challenges', threshold: 'Completion threshold',
        unknown: 'Unknown', id: 'ID', submissionId: 'Submission ID', challenge: 'Challenge', bundle: 'Bundle',
        total: 'Total', trace: 'Trace steps', empty: 'No matching results', more: 'Showing the first 5 entries. Ask in chat for more.',
        finalScore: 'Final score', referenceScore: 'Reference score (not confirmed final)', awaitingScore: 'Awaiting evaluation; no final score',
        metricTitle: 'Key metrics', metricHint: 'Metrics may come from upload validation. The platform state determines whether evaluation is complete.',
        snapshot: 'Status reflects this query.', nextAttempt: 'Ask in chat to refresh submission', raw: 'Full tool result',
        states: { draft: 'Draft', active: 'Active', ended: 'Ended', archived: 'Archived', open: 'Open',
          submitted: 'Submitted', scored: 'Scored', queued: 'Queued', evaluating: 'Evaluating', final: 'Final',
          failed: 'Failed', ready: 'Accepted', incomplete: 'Incomplete', awaiting_bundle: 'Awaiting bundle',
          awaiting_review: 'Awaiting review', unknown: 'Unknown', not_scored: 'Not scored' },
        metrics: { accuracy: 'Accuracy', packaging: 'Packaging', executability: 'Executability', output_coverage: 'Output coverage',
          result_fidelity: 'Result fidelity', trace_quality: 'Trace quality', reproduction: 'Reproduction', evidence: 'Evidence', total: 'Total' },
      },
    };
    const css = `
      .pg-guide,.pg-card{--pg-accent:#007f86;--pg-accent-strong:#00656b;--pg-accent-soft:#e7f7f6;--pg-success:#18794e;--pg-warning:#936b00;--pg-error:#b42318;box-sizing:border-box;max-width:100%;font:inherit;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px}.pg-guide{margin:4px 0 8px}.pg-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.pg-brand{display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere;font-weight:600;font-size:14px;line-height:1.4;margin:0}.pg-column-heading h2{margin:0}.pg-confirm-title{margin:0;font:inherit;font-size:14px;line-height:1.4}.pg-mark{color:var(--pg-accent);font-weight:700}.pg-guide p,.pg-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin:8px 0}.pg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pg-button{min-height:40px;font:inherit;font-size:12px;line-height:1.4;padding:8px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer}.pg-button:hover:not(:disabled){background:var(--pg-accent-soft);border-color:var(--pg-accent)}.pg-button:focus-visible,.pg-input:focus-visible,.pg-session-picker:focus-visible,.pg-split-control input:focus-visible,.pg-raw summary:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}.pg-button:disabled{opacity:.55;cursor:default}.pg-toggle{border:0;background:transparent;padding:3px 0;color:var(--dsw-alias-label-secondary)}.pg-card h3{font:inherit;font-weight:600;font-size:14px;line-height:1.5;margin:0;overflow-wrap:anywhere}.pg-badge{font-size:11px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px;color:var(--dsw-alias-label-secondary);white-space:nowrap}.pg-badge[data-tone=success]{color:var(--pg-success);border-color:var(--pg-success);background:var(--dsw-alias-bg-layer-1)}.pg-badge[data-tone=warning]{color:var(--pg-warning);border-color:var(--pg-warning);background:var(--dsw-alias-bg-layer-1)}.pg-badge[data-tone=error],.pg-error{color:var(--pg-error)}.pg-badge[data-tone=error]{border-color:var(--pg-error);background:var(--dsw-alias-bg-layer-1)}.pg-facts{display:flex;gap:8px 16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-score{font-size:15px;font-weight:600;margin:12px 0 8px}.pg-list{list-style:none;padding:0;margin:10px 0 0}.pg-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px}.pg-row .pg-badge{align-self:start}.pg-row-main{min-width:0;overflow-wrap:anywhere}.pg-row-sub{margin-top:4px;color:var(--dsw-alias-label-secondary)}.pg-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:8px;margin:8px 0}.pg-metric{padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px}.pg-metric dt{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.pg-metric dd{margin:5px 0 0;font-size:17px;font-weight:600}.pg-raw{font-size:12px;margin-top:10px;color:var(--dsw-alias-label-secondary)}.pg-raw summary{cursor:pointer}.pg-raw pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font:inherit;font-size:12px;line-height:1.6}.pg-error{font-size:12px;line-height:1.6;overflow-wrap:anywhere}.pg-card footer{margin-top:10px;font-size:11px;color:var(--dsw-alias-label-secondary)}.pg-primary{background:var(--pg-accent);border-color:var(--pg-accent);color:#fff;font-weight:600}.pg-primary:hover:not(:disabled){background:var(--pg-accent-strong);filter:none}.pg-confirm-impact{display:flex;align-items:flex-start;gap:8px;margin:10px 0;padding:10px;border:1px solid var(--pg-warning);border-radius:8px;color:var(--pg-warning);font-size:12px;line-height:1.5}.pg-readonly{box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}.pg-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    `;

    function stateLabel(state, t) {
      return Object.hasOwn(locales.en.states, state) ? t(`states.${state}`) : state || t('unknown');
    }

    function statusTone(state) {
      if (['failed', 'incomplete'].includes(state)) return 'error';
      if (['queued', 'evaluating', 'awaiting_bundle', 'awaiting_review', 'active'].includes(state)) return 'warning';
      if (['submitted', 'scored', 'final', 'ready', 'open'].includes(state)) return 'success';
      return 'neutral';
    }

    function scoreLabel(item, t) {
      if (item.scoringState?.scoreIsFinal === true) {
        return `${t('finalScore')}: ${item.scoringState.displayScore ?? item.score ?? '—'}`;
      }
      if (item.scoringState?.provisionalScore !== undefined || (item.score !== undefined && item.score !== 0)) {
        return `${t('referenceScore')}: ${item.scoringState?.provisionalScore ?? item.score}`;
      }
      return t('awaitingScore');
    }

    function TaskWorkflow({ sessionId, state, cwd, running, allowed, run, openTask, t }) {
      const task = state?.task;
      const prepared = state?.prepared;
      const receipt = state?.receipt;
      const [target, setTarget] = React.useState(task?.challengeId || '');
      const [files, setFiles] = React.useState({ bundle_path: '', trace_path: '', manifest_path: '', method: '', model: '' });
      const [showFiles, setShowFiles] = React.useState(false);
      const [showResult, setShowResult] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [edited, setEdited] = React.useState(false);
      React.useEffect(() => { setTarget(task?.challengeId || ''); }, [task?.challengeId]);
      React.useEffect(() => {
        const args = prepared?.args || receipt?.args;
        if (args) setFiles(Object.fromEntries(['bundle_path', 'trace_path', 'manifest_path', 'method', 'model'].map((key) => [key, args[key] || ''])));
      }, [prepared?.checkId, receipt?.attemptId]);
      const act = async (input, confirm = false) => {
        setBusy(true); setError('');
        try {
          const result = await run(sessionId, input, confirm);
          if (result.ok === false) setError(result.error?.message || result.note || '操作未完成');
          if (result.status === 'awaiting_confirmation') { setEdited(false); setShowFiles(false); }
          if (result.attemptId || result.id) setShowResult(true);
          if (result.sessionId) openTask(result.sessionId);
        } catch (failure) { setError(failure.message); }
        finally { setBusy(false); }
      };
      const disabled = busy || running || !allowed;
      return h('section', { className: 'pg-guide pg-workflow', 'aria-label': 'Playground 任务' },
        h('style', null, css + '.pg-form{display:grid;gap:8px;margin-top:10px}.pg-field{display:grid;gap:4px;font-size:12px}.pg-input{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:7px}.pg-confirm{margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2)}.pg-path{overflow-wrap:anywhere;white-space:pre-line}.pg-advanced{margin-top:10px}.pg-advanced summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}.pg-advanced[open] summary{color:var(--pg-accent)}'),
        h('div', { className: 'pg-head' }, h('h3', { className: 'pg-brand' }, task ? `Playground · ${task.title}` : 'Playground · 开始任务'),
          task ? h('label', { className: 'pg-field' }, '工作模式', h('select', { className: 'pg-input', 'aria-label': 'Playground 工作模式', value: task.mode, disabled,
            onChange: (event) => act({ action: 'mode', mode: event.target.value }) },
          h('option', { value: 'participate' }, '参赛'), h('option', { value: 'author' }, '出题'))) : null),
        task ? h('p', { className: 'pg-note pg-path' }, `赛题 ${task.challengeId} · ${cwd || task.cwd}`) : null,
        task?.mode === 'author' ? h('p', { className: 'pg-note' }, '可在当前工作区准备题面、资源说明和评分规则。本 MVP 尚未接入平台出题修改与发布。') : null,
        task && task.mode !== 'author' ? h(React.Fragment, null,
          h('div', { className: 'pg-actions' },
            h('button', { className: 'pg-button pg-primary', disabled, 'aria-expanded': showFiles, onClick: () => setShowFiles(!showFiles) }, '准备提交 / 检查材料'),
            receipt?.attemptId ? h('button', { className: 'pg-button', disabled, onClick: () => act({ action: 'results' }) }, `查询结果 #${receipt.attemptId}`) : null),
          showFiles ? h('div', { className: 'pg-form' },
            h('div', { className: 'pg-field' }, h('span', null, '目标赛题（来自当前任务）'), h('div', { className: 'pg-readonly pg-path', 'aria-label': '目标赛题（来自当前任务）' }, `${task.title} · ${target}`)),
            h('details', { className: 'pg-advanced' },
              h('summary', null, '高级选项：指定材料路径和方案信息'),
              h('div', { className: 'pg-form' },
                ...[['bundle_path', 'ARM ZIP 路径'], ['trace_path', '执行轨迹路径'], ['manifest_path', 'ARM manifest 路径（可选）'], ['method', '方案名称'], ['model', '声明模型（按赛题要求）']].map(([key, label]) => h('label', { key, className: 'pg-field' }, label,
                  h('input', { className: 'pg-input', value: files[key], disabled: busy, placeholder: key.endsWith('_path') ? '留空时从当前工作区自动发现' : '', onChange: (event) => { setFiles({ ...files, [key]: event.target.value }); setEdited(true); } }))))),
            h('p', { className: 'pg-note' }, '默认从当前工作区根目录、playground-submission/、.playground/ 中自动发现材料；只有存在多个候选或需要覆盖默认方案时才展开高级选项。检查不上传文件。'),
            h('button', { className: 'pg-button pg-primary', disabled: disabled || !target.trim(), onClick: () => act({ action: 'check', challenge_id: target, ...files }) }, '检查并生成确认卡'),
            receipt?.ok === false && receipt.attemptId ? h('button', { className: 'pg-button', disabled, onClick: () => act({ ...receipt.args, action: 'check', ...files, challenge_id: target, attempt_id: receipt.attemptId }) }, `检查后重传原提交 #${receipt.attemptId}`) : null) : null) : null,
        prepared && !edited ? h('div', { className: 'pg-confirm', 'aria-label': 'Playground 提交确认' },
          h('h4', { className: 'pg-confirm-title' }, '请确认本次提交'),
          h('p', { className: 'pg-confirm-impact' }, h('span', { className: 'pg-badge', 'data-tone': 'warning' }, '高影响操作'), '确认后会向 Playground 上传已检查的材料，并可能消耗一个提交名额；请先核对目标、工作区和文件摘要。'),
          h('p', { className: 'pg-note pg-path' }, `目标：${prepared.challenge.title}（${prepared.challenge.id}）\n平台：${prepared.baseUrl}\n工作区：${prepared.cwd}`),
          h('p', { className: 'pg-note' }, `${prepared.args.attempt_id ? `重传提交 #${prepared.args.attempt_id}` : '创建一条新提交'} · 方案：${prepared.args.method} · 轨迹 ${prepared.traceCount} 步`),
          h('ul', { className: 'pg-note pg-path' }, prepared.files.map((file) => h('li', { key: file.kind }, `${file.kind}: ${file.path} · ${file.bytes} bytes`, h('details', null, h('summary', null, 'SHA-256'), file.sha256)))),
          h('p', { className: 'pg-note' }, '本地文件检查通过；最终协议和有效性由平台校验。确认后将上传上述材料并提交评测。'),
          h('div', { className: 'pg-actions' }, h('button', { className: 'pg-button pg-primary', disabled, onClick: () => act(prepared.checkId, true) }, '确认目标并提交'),
            h('button', { className: 'pg-button', disabled, onClick: () => act({ action: 'cancel' }) }, '取消本次提交'))) : null,
        edited && prepared ? h('p', { className: 'pg-note' }, '输入已改变，请重新检查材料。') : null,
        receipt ? h('details', { className: 'pg-raw', open: showResult, onToggle: (event) => setShowResult(event.currentTarget.open) },
          h('summary', null, `提交 #${receipt.attemptId ?? '—'} · ${stateLabel(receipt.scoringState?.state || receipt.bundleStatus || receipt.status, t)} · ${scoreLabel(receipt, t)}`),
          h(PlaygroundToolCard, { phase: 'result', block: { meta: { playground: receipt } }, toolName: 'playground_get_attempt', t })) : null,
        error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null,
        running ? h('p', { className: 'pg-note', role: 'status' }, '此会话正在执行任务，请等待完成或返回对话停止生成后操作。') : !allowed ? h('p', { className: 'pg-note' }, '当前连接没有此会话的操作权限。') : null,
        busy ? h('p', { className: 'pg-note', role: 'status' }, '正在执行…') : null);
    }

    function SelectedTask({ session, projection, useSessionAccess, refreshProjections, ...props }) {
      const allowed = useSessionAccess(session.id, 'commands/execute');
      const [error, setError] = React.useState('');
      React.useEffect(() => {
        refreshProjections(session.id).catch((failure) => setError(failure.message));
      }, [session.id, refreshProjections]);
      if (error || projection?.state === 'error' || projection?.state === 'migration-required') {
        return h('p', { className: 'pg-error', role: 'alert' }, error || projection.error?.message || '请先在 DSH 中打开此会话，完成会话迁移后再继续。');
      }
      if (projection?.state !== 'ready') return h('p', { className: 'pg-note', role: 'status' }, '正在读取任务状态…');
      return h(TaskWorkflow, { ...props, sessionId: session.id, state: projection.values.playgroundTask,
        cwd: projection.values.workingDirectory || session.cwd, running: session.running, allowed });
    }

    function AuthStatusPanel({ sessionId, allowed, run, login }) {
      const [state, setState] = React.useState({ loading: true });
      const [email, setEmail] = React.useState('');
      const [password, setPassword] = React.useState('');
      const [loginBusy, setLoginBusy] = React.useState(false);
      const [loginError, setLoginError] = React.useState('');
      const check = async () => {
        if (!sessionId) return setState({ loading: false, error: '请先在 DSH 中打开一个对话。' });
        if (!allowed) return setState({ loading: false, error: '当前会话没有读取 Playground 身份的权限。' });
        setState({ loading: true });
        try {
          const result = await run(sessionId, { action: 'auth' });
          setState({ loading: false, ...(result.playgroundAuth || result) });
        } catch (failure) {
          setState({ loading: false, error: failure.message });
        }
      };
      React.useEffect(() => { check(); }, [sessionId, allowed]);
      const submitLogin = async () => {
        setLoginBusy(true); setLoginError('');
        try {
          await login(sessionId, email, password);
          setPassword('');
          await check();
        } catch (failure) { setLoginError(failure.message); }
        finally { setLoginBusy(false); }
      };
      return h('section', { className: 'pg-guide pg-auth', 'aria-label': 'Playground 登录状态', 'aria-live': 'polite', 'aria-busy': state.loading || loginBusy },
        h('div', { className: 'pg-head' }, h('h2', { className: 'pg-brand' }, 'Playground 连接状态'),
          h('button', { className: 'pg-button', disabled: state.loading, onClick: check }, state.loading ? '正在检测…' : '重新检测')),
        state.loading ? h('p', { className: 'pg-note', role: 'status' }, '正在检查当前 DSH 是否已配置 Playground 凭据…') : null,
        !state.loading && state.authenticated ? h(React.Fragment, null,
          h('p', { className: 'pg-note' }, h('span', { className: 'pg-badge', 'data-tone': 'success' }, '已登录'), ' ', state.user?.name || state.user?.email || 'Playground 用户'),
          state.user?.email ? h('p', { className: 'pg-note' }, state.user.email) : null,
          state.baseUrl ? h('p', { className: 'pg-note pg-path' }, `API：${state.baseUrl}`) : null)
          : !state.loading ? h(React.Fragment, null,
             h('p', { className: 'pg-note' }, h('span', { className: 'pg-badge', 'data-tone': 'warning' }, '未登录'), ' 公开赛题仍可浏览；查询个人提交和上传评测包需要 token。'),
            state.error ? h('p', { className: 'pg-error', role: 'alert' }, state.error) : null,
            h('ol', { className: 'pg-note pg-auth-steps' },
              h('li', null, '使用下面的登录表单；插件会调用已安装的 Playground CLI。'),
              h('li', null, '密码只通过受保护的凭据通道传给 CLI，不会写入聊天。'),
              h('li', null, '也可以在 DSH 启动前完成 playground auth login，再点击“重新检测”。'),
              h('li', null, '登录成功后即可创建任务、辅助做题、打包提交和查看个人结果。'),
            ),
            h('form', { className: 'pg-form', onSubmit: (event) => { event.preventDefault(); if (!loginBusy && email.trim() && password) submitLogin(); } },
              h('label', { className: 'pg-field' }, 'Playground 邮箱', h('input', { className: 'pg-input', type: 'email', value: email, autoComplete: 'username', onChange: (event) => setEmail(event.target.value) })),
              h('label', { className: 'pg-field' }, 'Playground 密码', h('input', { className: 'pg-input', type: 'password', value: password, autoComplete: 'current-password', onChange: (event) => setPassword(event.target.value) })),
              h('button', { type: 'submit', className: 'pg-button pg-primary', disabled: loginBusy || !email.trim() || !password }, loginBusy ? '正在登录…' : '登录 Playground'),
              loginError ? h('p', { className: 'pg-error', role: 'alert' }, loginError) : null,
            )) : null);
    }

    function CatalogPanel({ sessionId, allowed, run, requestTask, openChat }) {
      const [search, setSearch] = React.useState('');
      const [season, setSeason] = React.useState('');
      const [catalog, setCatalog] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [status, setStatus] = React.useState('');
      const load = async (nextSearch = search, nextSeason = season) => {
        if (!sessionId) return setError('请先在 DSH 中打开一个对话，再浏览 Playground 赛题。');
        if (!allowed) return setError('当前会话没有读取 Playground 目录的权限。');
        setBusy(true); setError(''); setStatus('正在读取比赛和赛题…');
        try {
          const result = await run(sessionId, { action: 'catalog', search: nextSearch.trim(), season: nextSeason || undefined, per_page: 12 });
          setCatalog(result.playgroundCatalog || result); setStatus('赛题目录已更新。');
        } catch (failure) { setError(failure.message); setStatus('赛题目录读取失败。'); }
        finally { setBusy(false); }
      };
      React.useEffect(() => { load(); }, [sessionId, allowed]);
      const competitions = catalog?.competitions?.items || [];
      const challenges = catalog?.challenges?.items || [];
      return h('section', { className: 'pg-guide pg-catalog', 'aria-label': 'Playground 赛题目录', 'aria-busy': busy },
        h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status),
        h('div', { className: 'pg-head' }, h('div', null, h('h2', { className: 'pg-brand' }, '选择比赛或赛题'),
          h('p', { className: 'pg-note' }, '先从目录选择题目，再创建独立任务对话；不需要记住赛题 ID。')),
          h('button', { className: 'pg-button', disabled: busy, onClick: () => load() }, busy ? '正在刷新…' : '刷新目录')),
        h('div', { className: 'pg-search' },
          h('input', { className: 'pg-input', 'aria-label': '搜索 Playground 赛题', placeholder: '按题目名称、方向或关键词搜索', value: search, onChange: (event) => setSearch(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') load(); } }),
          h('select', { className: 'pg-input', 'aria-label': '选择比赛', value: season, onChange: (event) => { setSeason(event.target.value); load(search, event.target.value); } },
            h('option', { value: '' }, '全部比赛'), competitions.map((item) => h('option', { key: item.slug, value: item.slug }, item.nameZh || item.name)))),
        error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null,
        busy && !catalog ? h('p', { className: 'pg-note', role: 'status' }, '正在读取比赛和赛题…') : null,
        catalog && !challenges.length ? h('p', { className: 'pg-note' }, '没有找到匹配赛题。换一个关键词或比赛筛选条件试试。') : null,
        h('div', { className: 'pg-challenge-grid' }, challenges.map((item) => h('article', { className: 'pg-card pg-challenge', key: item.id },
          h('div', { className: 'pg-head' }, h('h3', null, item.titleZh || item.title || item.id), item.status ? h('span', { className: 'pg-badge', 'data-tone': statusTone(item.status) }, locales.zh.states[item.status] || item.status) : null),
          h('p', { className: 'pg-note pg-path' }, [item.discipline, item.origin, item.difficulty !== undefined ? `难度 ${item.difficulty}` : null].filter(Boolean).join(' · ') || 'Playground 赛题'),
          h('p', { className: 'pg-note' }, `题目编号：${item.id}${item.attempts !== undefined ? ` · 已有 ${item.attempts} 次提交` : ''}`),
          h('div', { className: 'pg-actions' },
            h(StartTaskButton, { id: item.id, title: item.titleZh || item.title || item.id, mode: 'participate', sessionId, requestTask }),
            h(StartTaskButton, { id: item.id, title: item.titleZh || item.title || item.id, mode: 'author', sessionId, requestTask }))
        ))));
    }

    function TaskSummaryRow({ session, selected, onSelect }) {
      const state = session.projectionValues?.playgroundTask || {};
      const task = state.task;
      const receipt = state.receipt;
      const platformState = receipt?.scoringState?.state || receipt?.bundleStatus || receipt?.status;
      const title = task?.title || session.displayTitle?.replace(/^Playground · /, '') || 'Playground 任务';
      const challengeId = task?.challengeId || '赛题待读取';
      const stage = session.running ? 'Agent 执行中' : receipt ? '已提交，等待结果' : task ? '任务已创建' : '状态待读取';
      const score = receipt?.scoringState?.displayScore ?? receipt?.scoringState?.provisionalScore ?? receipt?.score;
      const updatedAt = session.updatedAt || session.lastActivityAt || session.createdAt;
      const updated = updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '暂无时间';
      return h('button', { type: 'button', className: `pg-task-row${selected ? ' is-selected' : ''}`, onClick: onSelect, 'aria-pressed': selected },
        h('span', { className: 'pg-task-row-main' },
          h('strong', null, title),
          h('span', { className: 'pg-task-row-meta' }, challengeId, ' · ', stage)),
        h('span', { className: 'pg-task-row-side' },
          h('span', { className: 'pg-badge', 'data-tone': statusTone(platformState || (session.running ? 'active' : 'unknown')) }, platformState ? (locales.zh.states[platformState] || platformState) : '未提交'),
          h('span', { className: 'pg-task-row-score' }, score !== undefined && score !== null ? `${score} 分` : '—'),
          h('span', { className: 'pg-task-row-updated' }, updated)));
    }

    function TaskDetailDrawer({ session, projection, close, ...props }) {
      React.useEffect(() => {
        const onKeyDown = (event) => { if (event.key === 'Escape') close(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [close]);
      const state = session?.projectionValues?.playgroundTask || {};
      const title = state.task?.title || session.displayTitle?.replace(/^Playground · /, '') || 'Playground 任务';
      return h('div', { className: 'pg-drawer-backdrop', onMouseDown: close },
        h('aside', { className: 'pg-drawer', role: 'dialog', 'aria-modal': true, 'aria-label': `${title} 任务详情`, onMouseDown: (event) => event.stopPropagation() },
          h('div', { className: 'pg-drawer-header' },
            h('div', null, h('p', { className: 'pg-eyebrow' }, '任务详情'), h('h2', { className: 'pg-drawer-title' }, title)),
            h('button', { type: 'button', className: 'pg-button pg-drawer-close', onClick: close, 'aria-label': '关闭任务详情' }, '关闭')),
          h('p', { className: 'pg-note pg-path' }, state.task?.challengeId ? `赛题 ${state.task.challengeId}` : '赛题信息待读取'),
          h(SelectedTask, { key: session.id, session, projection, ...props })));
    }

    function PlaygroundWorkbench({ useSessions, useSessionAccess, refreshProjections, openTask, openChat, run, requestTask, login, ...props }) {
      const catalog = useSessions((state) => state);
      const sessions = catalog.ids.map((id) => catalog.byId[id]).filter((session) => !session.parentId);
      const sourceSession = sessions.find((session) => (session.retainedBy?.mainView ?? 0) > 0) || sessions[0];
      const taskSessions = sessions.filter((session) => session.projectionValues?.playgroundTask?.task || session.displayTitle?.startsWith('Playground · '));
      const [selected, setSelected] = React.useState(() => taskSessions.find((session) => (session.retainedBy?.mainView ?? 0) > 0)?.id || taskSessions[0]?.id || '');
      const [split, setSplit] = React.useState(50);
      const [announcement, setAnnouncement] = React.useState('');
      const [drawerOpen, setDrawerOpen] = React.useState(false);
      React.useEffect(() => {
        if (selected && !taskSessions.some((session) => session.id === selected)) { setSelected(taskSessions[0]?.id || ''); setDrawerOpen(false); }
      }, [selected, taskSessions.map((session) => session.id).join(',')]);
      const session = catalog.byId[selected] || taskSessions[0];
      const sourceAllowed = useSessionAccess(sourceSession?.id || '', 'commands/execute');
      return h('main', { className: 'pg-workbench', 'aria-label': 'Playground 工作台' },
        h('style', null, css + '.pg-workbench{box-sizing:border-box;min-width:0;width:100%;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 24px) 24px 32px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.pg-workbench-inner{max-width:1180px;margin:0 auto}.pg-workbench h1{font-size:22px;margin:0}.pg-workbench .pg-toolbar{margin:20px 0;display:grid;gap:8px}.pg-search{display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,1fr);gap:8px;margin-top:14px}.pg-workbench .pg-guide{padding:20px}.pg-workbench-grid{display:grid;gap:12px;align-items:start;margin-top:12px}.pg-workbench-column{min-width:0}.pg-column-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;padding:0 2px}.pg-column-heading h2{font-size:14px;line-height:1.4}.pg-task-empty{padding:20px 14px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}.pg-task-list{display:grid;gap:6px}.pg-task-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);text-align:left;font:inherit;cursor:pointer}.pg-task-row:hover,.pg-task-row.is-selected{border-color:var(--pg-accent);background:var(--pg-accent-soft)}.pg-task-row-main{display:grid;min-width:0;gap:4px}.pg-task-row-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.pg-task-row-meta,.pg-task-row-updated{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pg-task-row-side{display:grid;justify-items:end;gap:3px;min-width:78px}.pg-task-row-score{font-size:12px;font-weight:600;color:var(--pg-accent-strong)}.pg-task-row-updated{font-size:10px}.pg-split-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px}.pg-split-control input{width:118px;accent-color:var(--pg-accent)}.pg-drawer-backdrop{position:fixed;inset:0;z-index:20;background:rgba(15,23,42,.22);display:flex;justify-content:flex-end}.pg-drawer{box-sizing:border-box;width:min(480px,92vw);height:100%;overflow:auto;padding:24px;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-12px 0 30px rgba(15,23,42,.16)}.pg-drawer-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px}.pg-drawer-title{margin:0;font-size:18px;line-height:1.4;overflow-wrap:anywhere}.pg-eyebrow{margin:0 0 4px;color:var(--pg-accent-strong);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}.pg-drawer-close{min-height:32px;padding:5px 9px}.pg-drawer .pg-workflow{margin-top:14px}.pg-workbench .pg-help{margin-top:20px;font-size:12px;line-height:1.8;color:var(--dsw-alias-label-secondary)}@media(max-width:820px){.pg-workbench-grid{grid-template-columns:1fr!important}.pg-split-control{justify-content:flex-start}.pg-drawer{width:min(520px,100vw)}}@media(max-width:600px){.pg-workbench{padding-right:14px;padding-left:14px}.pg-workbench .pg-guide{padding:14px}.pg-search{grid-template-columns:1fr}.pg-split-control input{width:96px}.pg-task-row{grid-template-columns:minmax(0,1fr) auto;padding:10px}.pg-drawer{padding:16px}}'),
        h('div', { className: 'pg-workbench-inner' },
          h('header', { className: 'pg-head' },
            h('h1', null, 'Playground 主控面板'),
            h('button', { className: 'pg-button', onClick: () => session ? openTask(session.id) : openChat() }, session ? '返回所选任务对话' : '打开 DSH 对话')),
          h('p', { className: 'pg-note' }, '从目录选择赛题，再用 DSH 原生对话和工作区完成方案。提交前回到任务卡检查材料并确认目标。'),
          h(AuthStatusPanel, { sessionId: sourceSession?.id, allowed: sourceAllowed, run, login }),
          h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, announcement),
          h('div', { className: 'pg-split-control' },
            h('span', null, '调整左右栏宽度'),
            h('input', { type: 'range', min: 35, max: 65, step: 5, value: split, 'aria-label': '调整左右栏宽度', 'aria-valuetext': `左侧 ${split}%，右侧 ${100 - split}%`, onChange: (event) => setSplit(Number(event.target.value)) }),
            h('span', null, `${split}% / ${100 - split}%`)),
          h('div', { className: 'pg-workbench-grid', style: { gridTemplateColumns: `minmax(0,${split}fr) minmax(0,${100 - split}fr)` } },
            h('section', { className: 'pg-workbench-column', 'aria-label': 'Playground 赛题目录' },
              h('div', { className: 'pg-column-heading' }, h('h2', null, '赛题目录')),
              h(CatalogPanel, { sessionId: sourceSession?.id, allowed: sourceAllowed, run, requestTask, openChat })),
            h('section', { className: 'pg-workbench-column', 'aria-label': 'Playground 任务总览' },
              h('div', { className: 'pg-column-heading' }, h('h2', null, '任务总览'), h('span', { className: 'pg-badge' }, `${taskSessions.length} 个任务`)),
              taskSessions.length ? h('div', { className: 'pg-task-list', role: 'list', 'aria-label': 'Playground 任务列表' },
                taskSessions.map((item) => h(TaskSummaryRow, { key: item.id, session: item, selected: item.id === selected, onSelect: () => { setSelected(item.id); setDrawerOpen(true); setAnnouncement(`已打开任务：${item.displayTitle}`); } })))
                : h('p', { className: 'pg-task-empty' }, '还没有 Playground 任务。先从左侧赛题目录选择一个题目。'))),
          drawerOpen && session ? h(TaskDetailDrawer, { session, projection: catalog.projectionsBySession[session.id], close: () => setDrawerOpen(false), useSessionAccess, refreshProjections, openTask, run, ...props }) : null,
          h('details', { className: 'pg-help' }, h('summary', null, '如何使用'),
            h('ol', null,
              h('li', null, '搜索比赛和赛题，阅读题目摘要后点击“开始参赛任务”或“开始出题任务”。'),
              h('li', null, '选择目标工作区，核对完整路径后确认创建独立任务对话；需要新工作区时使用原生目录选择器添加。'),
              h('li', null, '完成方案后，在对应任务卡检查材料，核对赛题、平台和文件，再明确确认提交。'),
              h('li', null, '查询结果与关键指标；排队状态表示尚未得到最终评分。')))));
    }

    function PlaygroundPanelIcon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
        h('path', { d: 'M8 3h8M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M7 15h10' }));
    }

    function PlaygroundToolCard({ phase, block, toolName, t, sessionId, run, requestTask, openTask, openWorkbench }) {
      const data = phase === 'result' ? block.meta?.playground : undefined;
      const text = phase === 'result' ? (block.content ?? []).filter((item) => item.type === 'text').map((item) => item.text).join('\n') : '';
      const isAttempt = toolName.includes('attempt');
      const failed = phase === 'result' && (block.isError || data?.ok === false);
      const state = data?.scoringState?.state || data?.status || data?.bundleStatus;
      return h('section', { className: 'pg-card', 'aria-label': t(`tools.${toolName}`) },
        h('style', null, css),
        h('div', { className: 'pg-head' },
          h('h3', null, data?.title || t(`tools.${toolName}`)),
        h('span', { className: 'pg-badge', 'data-tone': failed ? 'error' : data?.scoringState?.scoreIsFinal ? 'success' : statusTone(state) },
            failed ? t('failed') : phase === 'preparing' ? t('preparing') : phase === 'start' ? t(toolName === 'playground_submit_attempt' ? 'uploading' : 'running') : state ? stateLabel(state, t) : t('loaded'))),
        failed ? h('p', { className: 'pg-error', role: 'alert' }, data?.error?.message || block.error?.message || text || t('failed')) : null,
        phase === 'result' && data?.ok && run && (toolName === 'playground_get_challenge' || toolName === 'playground_list_challenges') ? h('div', { className: 'pg-actions' },
          ...(data.items || [data]).map((item) => h(StartTaskButton, { key: item.id, id: item.id, title: item.title, sessionId, requestTask }))) : null,
        data?.sessionId && openTask ? h('button', { className: 'pg-button', onClick: () => openTask(data.sessionId) }, '打开任务对话') : null,
        data?.status === 'awaiting_confirmation' && openWorkbench ? h('button', { className: 'pg-button', onClick: () => openWorkbench(sessionId) }, '前往工作台确认提交') : null,
        data ? h(React.Fragment, null,
          h('div', { className: 'pg-facts' },
            data.attemptId !== undefined || data.id !== undefined ? h('span', null, `${t(isAttempt ? 'submissionId' : 'id')}: ${data.attemptId ?? data.id}`) : null,
            data.challengeId ? h('span', null, `${t('challenge')}: ${data.challengeId}`) : null,
            data.bundleStatus ? h('span', null, `${t('bundle')}: ${stateLabel(data.bundleStatus, t)}`) : null,
            data.traceCount !== undefined ? h('span', null, `${t('trace')}: ${data.traceCount}`) : null,
            data.endAt ? h('span', null, `${t('deadline')}: ${new Date(data.endAt).toLocaleString()}`) : null,
            data.challengeCount !== undefined ? h('span', null, `${t('challengeCount')}: ${data.challengeCount}`) : null,
            data.completionThreshold !== undefined ? h('span', null, `${t('threshold')}: ${data.completionThreshold}`) : null,
            data.total !== undefined ? h('span', null, `${t('total')}: ${data.total}`) : null),
          isAttempt && !data.items && data.ok ? h('div', { className: 'pg-score' }, scoreLabel(data, t)) : null,
          data.items ? h('ul', { className: 'pg-list' }, data.items.length ? data.items.map((item) => h('li', { key: item.id, className: 'pg-row' },
            h('div', { className: 'pg-row-main' }, item.title || String(item.id),
              h('div', { className: 'pg-row-sub' }, `${t('id')}: ${item.id}`, item.endAt ? ` · ${new Date(item.endAt).toLocaleString()}` : '',
                isAttempt ? h('div', null, scoreLabel(item, t)) : null)),
            h('span', { className: 'pg-badge' }, stateLabel(item.scoringState?.state || item.status, t)))) : h('li', { className: 'pg-note' }, t('empty'))) : null,
          data.hasMore ? h('p', { className: 'pg-note' }, t('more')) : null,
          data.metrics?.length ? h(React.Fragment, null,
            h('p', { className: 'pg-note' }, t('metricTitle')),
            h('dl', { className: 'pg-metrics' }, data.metrics.map((item) => h('div', { key: item.label, className: 'pg-metric' },
              h('dt', null, Object.hasOwn(locales.en.metrics, item.label) ? t(`metrics.${item.label}`) : item.label),
              h('dd', null, String(item.score))))),
            h('p', { className: 'pg-note' }, t('metricHint'))) : null,
          data.violations?.length ? h('ul', { className: 'pg-error' }, data.violations.slice(0, 5).map((item, index) => h('li', { key: index }, item.message || item.rule))) : null,
          isAttempt && (data.attemptId ?? data.id) ? h('p', { className: 'pg-note' }, `${t('nextAttempt')} ${data.attemptId ?? data.id}`) : null) : null,
        phase === 'result' && text ? h('details', { className: 'pg-raw', open: !data }, h('summary', null, t('raw')), h('pre', null, text)) : null,
        phase === 'result' ? h('footer', null, t('snapshot')) : h('p', { className: 'pg-note', role: 'status' }, t('snapshot')));
    }

    function StartTaskButton({ id, title, mode = 'participate', sessionId, requestTask }) {
      return h('button', { className: 'pg-button', onClick: () => requestTask({ id: String(id), title: title || String(id), mode, sessionId }) },
        mode === 'author' ? `开始出题任务 · ${title || id}` : `开始参赛任务 · ${title || id}`);
    }

    function TaskStartOverlay(props) {
      const request = props.useTaskRequest((value) => value);
      return request ? h(TaskStartDialog, { key: `${request.sessionId}:${request.id}:${request.mode}`, ...props, request }) : null;
    }

    function TaskStartDialog({ request, useWorkspaces, closeTaskStart, addTaskWorkspace, run, openTask }) {
      const workspaces = useWorkspaces((value) => value);
      const [selectedId, setSelectedId] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [adding, setAdding] = React.useState(false);
      const [error, setError] = React.useState('');
      const workspace = workspaces.items.find((item) => item.workspaceId === selectedId);
      const confirm = async () => {
        if (!workspace || workspaces.phase !== 'ready' || busy || adding) return;
        setBusy(true); setError('');
        try { const result = await run(request.sessionId, { action: 'start', challenge_id: request.id, mode: request.mode, cwd: workspace.path, workspace_id: workspace.workspaceId });
          if (result.ok && result.sessionId) { closeTaskStart(); openTask(result.sessionId); }
          else setError(result.error?.message || '任务创建失败');
        } catch (failure) { setError(failure.message); } finally { setBusy(false); }
      };
      return h(Modal, { open: true, title: request.mode === 'author' ? '选择出题工作区' : '选择参赛工作区', closeLabel: '取消创建任务', onClose: () => { if (!busy && !adding) closeTaskStart(); },
        footer: h('div', { className: 'pg-actions' },
          h('button', { className: 'pg-button', disabled: busy || adding, onClick: closeTaskStart }, '取消'),
          h('button', { className: 'pg-button pg-primary', disabled: !workspace || workspaces.phase !== 'ready' || busy || adding, onClick: confirm }, busy ? '正在创建任务…' : '确认工作区并创建任务')) },
      h('style', null, css + '.pg-start-dialog{min-width:0}.pg-start-dialog .pg-input{box-sizing:border-box;width:100%;min-height:40px;font:inherit;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px}.pg-start-dialog .pg-path{white-space:pre-wrap;overflow-wrap:anywhere}'),
      h('div', { className: 'pg-start-dialog' },
        h('p', null, `赛题：${request.title}（${request.id}）`),
        h('p', { className: 'pg-note' }, `模式：${request.mode === 'author' ? '出题' : '参赛'}。新任务将在以下工作区读写文件，请确认目录。`),
        h('label', { className: 'pg-field' }, '目标工作区',
          h('select', { className: 'pg-input', 'aria-label': '目标工作区', value: workspace ? selectedId : '', disabled: workspaces.phase !== 'ready' || busy || adding,
            onChange: (event) => { setSelectedId(event.target.value); setError(''); } },
          h('option', { value: '' }, '请选择工作区'),
          workspaces.items.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, `${item.title || '未命名工作区'} · ${item.path}`)))),
        workspace ? h('p', { className: 'pg-readonly pg-path' }, `${workspace.title || '未命名工作区'}\n${workspace.path}`) : null,
        workspaces.phase !== 'ready' ? h('p', { className: 'pg-note', role: 'status' }, '工作区列表尚未就绪，请稍后重试。') : null,
        workspaces.phase === 'ready' && !workspaces.items.length ? h('p', { className: 'pg-note' }, '还没有工作区，请先添加。') : null,
        h('div', { className: 'pg-actions' }, h('button', { className: 'pg-button', disabled: busy || adding, onClick: async () => {
          setAdding(true); setError('');
          try { const created = await addTaskWorkspace(); if (created) setSelectedId(created.workspaceId); }
          catch (failure) { setError(failure.message); } finally { setAdding(false); }
        } }, adding ? '正在选择目录…' : '添加工作区…')),
        error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null));
    }

    function PlaygroundCommandCard({ node, sessionId, openTask, openWorkbench }) {
      let result;
      try { result = JSON.parse(node.outcome?.text || '{}'); } catch { result = { ok: false, error: { message: node.outcome?.text } }; }
      const workflow = result.playgroundWorkflow;
      const label = !node.outcome ? 'Playground · 正在执行…' : workflow?.kind === 'task' ? `任务已就绪 · ${workflow.task.title}`
        : workflow?.kind === 'mode' ? `工作模式已切换 · ${workflow.mode === 'author' ? '出题' : '参赛'}`
        : workflow?.kind === 'prepared' ? `材料已检查 · ${workflow.prepared.challenge.title} · 等待用户确认`
        : workflow?.kind === 'receipt' ? `提交回执 #${workflow.receipt.attemptId ?? '—'}`
        : result.sessionId ? '已创建独立任务对话' : workflow?.kind === 'clear' ? '提交准备已取消或失效' : 'Playground 操作';
      return h('section', { className: 'pg-card' }, h('style', null, css), h('strong', null, label),
        result.error ? h('p', { className: 'pg-error', role: 'alert' }, result.error.message) : null,
        workflow?.kind === 'prepared' ? h('button', { className: 'pg-button', onClick: () => openWorkbench(sessionId) }, '前往工作台确认提交') : null,
        result.sessionId ? h('button', { className: 'pg-button', onClick: () => openTask(result.sessionId) }, '打开任务对话') : null);
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands', 'remote.credentials', 'uiWorkspace', 'workspaces', 'layout', 'sessions'],
      apply(ctx) {
        const taskRequest = createSnapshotStore(null);
        const actions = {
          requestTask: (request) => taskRequest.set(request),
          closeTaskStart: () => taskRequest.set(null),
          addTaskWorkspace: async () => {
            const path = await ctx.uiWorkspace.pickDirectory();
            return path ? ctx.workspaces.create({ path }) : null;
          },
          openTask: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
          openChat: () => ctx.layout.selectPanel(null),
          openWorkbench: async (sessionId) => {
            await ctx.uiWorkspace.openSession(sessionId);
            ctx.layout.selectPanel('playground');
          },
          refreshProjections: (sessionId) => ctx.sessions.refreshProjections(sessionId),
          run: async (sessionId, input, confirm = false) => {
            const result = await ctx.remote.commands.execute(sessionId, confirm ? `/playground-confirm ${input}` : `/playground ${JSON.stringify(input)}`, []);
            if (!result.ok) throw new Error(result.error.message);
            if (!result.value) throw new Error('Playground 命令未注册，请重启 DSH 加载插件。');
            const text = result.value.result.text;
            if (!text?.startsWith('{')) throw new Error(text || 'Playground 未返回操作结果。');
            return JSON.parse(text);
          },
          login: async (sessionId, email, password) => {
            if (!sessionId) throw new Error('请先在 DSH 中打开一个对话。');
            await ctx.remote.credentials.set('PLAYGROUND_PASSWORD', password);
            const result = await ctx.remote.commands.execute(sessionId, `/playground-auth-login ${JSON.stringify({ email })}`, []);
            if (!result.ok) throw new Error(result.error.message);
            const text = result.value?.result?.text;
            if (!text?.startsWith('{')) throw new Error(text || 'Playground 登录命令未返回结果。');
            const value = JSON.parse(text);
            if (value.ok === false || value.error) throw new Error(value.error?.message || 'Playground 登录失败。');
            return value;
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
          name: 'main', key: 'playground', locale: 'playground', inject: () => actions,
        }, PlaygroundWorkbench));
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
          for (const key of ['playground', 'playground-confirm']) {
            yield ctx.slots.register({ name: 'conversation.chat.commandview', key, inject: () => actions }, PlaygroundCommandCard);
          }
        });
      },
    };
  },
});
