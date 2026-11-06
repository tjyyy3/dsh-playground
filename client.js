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
          playground_start_task: '新建任务对话', playground_bind_task: '绑定当前对话', playground_check_materials: '提交前检查', playground_task: '任务状态',
          playground_submit: '确认提交（审批）',
        },
        preparing: '正在准备参数…', running: '正在查询…', uploading: '正在提交评测包…', approving: '等待“允许一次”或正在提交…', failed: '操作未完成', loaded: '查询完成',
        deadline: '截止时间', challengeCount: '赛题数量', threshold: '完成门槛',
        unknown: '未知', id: '编号', submissionId: '提交编号', challenge: '赛题', bundle: '评测包',
        total: '总计', trace: '轨迹步数', empty: '暂无匹配结果', more: '仅展示前 5 条，可在对话中继续查询。',
        finalScore: '最终分数', referenceScore: '参考分（未确认最终）', awaitingScore: '等待评分，暂无最终分数',
        metricTitle: '关键指标', metricHint: '指标可能来自上传校验；是否完成评分以平台状态为准。',
        snapshot: '状态以本次查询为准。', nextAttempt: '可以继续问：查询提交状态，编号', raw: '查看完整工具结果',
        states: { draft: '草稿', active: '进行中', ended: '已结束', archived: '已归档', open: '开放',
          submitted: '已提交', scored: '已评分', queued: '排队中', evaluating: '评测中', final: '评分完成',
          failed: '失败', ready: '已接收', incomplete: '材料不完整', awaiting_bundle: '等待评测包',
          awaiting_review: '等待审核', unknown: '未知', not_scored: '未评分', rejected: '未通过',
          late_scored: '赛后已评分', pending_review: '等待审核', scoring: '评测中' },
        progress: { created: '任务已创建', running: 'Agent 执行中', submitted: '已提交，等待结果', evaluating: '评测中',
          final: '已出最终分', finalLate: '已出最终分（赛后）', failed: '评测未通过', incomplete: '提交未完成',
          notSubmitted: '未提交', notUploaded: '评测包未上传', notReceived: '未收到评测包，需重新提交', attempt: '提交', reference: '参考', points: '分' },
        metrics: { accuracy: '准确率', packaging: '包装完整性', executability: '可执行性', output_coverage: '输出覆盖',
          result_fidelity: '结果一致性', trace_quality: '轨迹质量', reproduction: '复现', evidence: '证据', total: '合计' },
      },
      en: {
        tools: {
          playground_list_challenges: 'Challenge search', playground_get_challenge: 'Challenge details',
          playground_list_attempts: 'Challenge submissions', playground_get_attempt: 'Evaluation results',
          playground_submit_attempt: 'Submit for evaluation', playground_list_competitions: 'Competitions',
          playground_get_competition: 'Competition details', playground_list_my_attempts: 'My submissions',
          playground_start_task: 'New task conversation', playground_bind_task: 'Bind this conversation', playground_check_materials: 'Submission checks', playground_task: 'Task status',
          playground_submit: 'Submit (approval)',
        },
        preparing: 'Preparing arguments…', running: 'Querying…', uploading: 'Submitting bundle…', approving: 'Awaiting approval or submitting…', failed: 'Operation incomplete', loaded: 'Query complete',
        deadline: 'Deadline', challengeCount: 'Challenges', threshold: 'Completion threshold',
        unknown: 'Unknown', id: 'ID', submissionId: 'Submission ID', challenge: 'Challenge', bundle: 'Bundle',
        total: 'Total', trace: 'Trace steps', empty: 'No matching results', more: 'Showing the first 5 entries. Ask in chat for more.',
        finalScore: 'Final score', referenceScore: 'Reference score (not confirmed final)', awaitingScore: 'Awaiting evaluation; no final score',
        metricTitle: 'Key metrics', metricHint: 'Metrics may come from upload validation. The platform state determines whether evaluation is complete.',
        snapshot: 'Status reflects this query.', nextAttempt: 'Ask in chat to refresh submission', raw: 'Full tool result',
        states: { draft: 'Draft', active: 'Active', ended: 'Ended', archived: 'Archived', open: 'Open',
          submitted: 'Submitted', scored: 'Scored', queued: 'Queued', evaluating: 'Evaluating', final: 'Final',
          failed: 'Failed', ready: 'Accepted', incomplete: 'Incomplete', awaiting_bundle: 'Awaiting bundle',
          awaiting_review: 'Awaiting review', unknown: 'Unknown', not_scored: 'Not scored', rejected: 'Rejected',
          late_scored: 'Scored after deadline', pending_review: 'Pending review', scoring: 'Scoring' },
        progress: { created: 'Task created', running: 'Agent running', submitted: 'Submitted, awaiting result', evaluating: 'Evaluating',
          final: 'Final score available', finalLate: 'Final score available (after deadline)', failed: 'Evaluation not passed', incomplete: 'Submission incomplete',
          notSubmitted: 'Not submitted', notUploaded: 'Bundle not uploaded', notReceived: 'Bundle not received, submit again', attempt: 'Submission', reference: 'Ref.', points: 'pts' },
        metrics: { accuracy: 'Accuracy', packaging: 'Packaging', executability: 'Executability', output_coverage: 'Output coverage',
          result_fidelity: 'Result fidelity', trace_quality: 'Trace quality', reproduction: 'Reproduction', evidence: 'Evidence', total: 'Total' },
      },
    };
    const css = `
      .pg-guide,.pg-card{--pg-accent:#007f86;--pg-accent-strong:#00656b;--pg-accent-soft:#e7f7f6;--pg-success:#18794e;--pg-warning:#936b00;--pg-error:#b42318;box-sizing:border-box;max-width:100%;font:inherit;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px}.pg-guide{margin:4px 0 8px}.pg-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.pg-brand{display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere;font-weight:600;font-size:14px;line-height:1.4;margin:0}.pg-column-heading h2{margin:0}.pg-confirm-title{margin:0;font:inherit;font-size:14px;line-height:1.4}.pg-mark{color:var(--pg-accent);font-weight:700}.pg-guide p,.pg-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin:8px 0}.pg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pg-button{min-height:40px;font:inherit;font-size:12px;line-height:1.4;padding:8px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer}.pg-button:hover:not(:disabled){background:var(--pg-accent-soft);border-color:var(--pg-accent)}.pg-button:focus-visible,.pg-input:focus-visible,.pg-session-picker:focus-visible,.pg-split-control input:focus-visible,.pg-raw summary:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}.pg-button:disabled,.pg-button[aria-disabled="true"]{opacity:.55;cursor:default}.pg-toggle{border:0;background:transparent;padding:3px 0;color:var(--dsw-alias-label-secondary)}.pg-card h3{font:inherit;font-weight:600;font-size:14px;line-height:1.5;margin:0;overflow-wrap:anywhere}.pg-badge{font-size:11px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px;color:var(--dsw-alias-label-secondary);white-space:nowrap}.pg-badge[data-tone=success]{color:var(--pg-success);border-color:var(--pg-success);background:var(--dsw-alias-bg-layer-1)}.pg-badge[data-tone=warning]{color:var(--pg-warning);border-color:var(--pg-warning);background:var(--dsw-alias-bg-layer-1)}.pg-badge[data-tone=error],.pg-error{color:var(--pg-error)}.pg-badge[data-tone=error]{border-color:var(--pg-error);background:var(--dsw-alias-bg-layer-1)}.pg-facts{display:flex;gap:8px 16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-score{font-size:15px;font-weight:600;margin:12px 0 8px}.pg-list{list-style:none;padding:0;margin:10px 0 0}.pg-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px}.pg-row .pg-badge{align-self:start}.pg-row-main{min-width:0;overflow-wrap:anywhere}.pg-row-sub{margin-top:4px;color:var(--dsw-alias-label-secondary)}.pg-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:8px;margin:8px 0}.pg-metric{padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px}.pg-metric dt{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.pg-metric dd{margin:5px 0 0;font-size:17px;font-weight:600}.pg-raw{font-size:12px;margin-top:10px;color:var(--dsw-alias-label-secondary)}.pg-raw summary{cursor:pointer}.pg-raw pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font:inherit;font-size:12px;line-height:1.6}.pg-error{font-size:12px;line-height:1.6;overflow-wrap:anywhere;white-space:pre-line}.pg-card footer{margin-top:10px;font-size:11px;color:var(--dsw-alias-label-secondary)}.pg-primary{background:var(--pg-accent);border-color:var(--pg-accent);color:#fff;font-weight:600}.pg-primary:hover:not(:disabled){background:var(--pg-accent-strong);filter:none}.pg-confirm-impact{display:flex;align-items:flex-start;gap:8px;margin:10px 0;padding:10px;border:1px solid var(--pg-warning);border-radius:8px;color:var(--pg-warning);font-size:12px;line-height:1.5}.pg-readonly{box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}.pg-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    `;

    // Task-start dialog styles. The accent matches the shared --pg-accent; every other tone comes
    // from DSH tokens so the dialog follows light and dark themes.
    const taskModalCss = `
        .pg-task-modal{--pg-task-accent:#007f86;--pg-task-accent-hover:#006b72;--pg-task-text:var(--dsw-alias-label-primary,#24282e);--pg-task-secondary:var(--dsw-alias-label-secondary,#68717c);--pg-task-base:var(--dsw-alias-bg-base,#fff);--pg-task-subtle:color-mix(in srgb,var(--pg-task-text) 3%,var(--pg-task-base));--pg-task-border:var(--dsw-alias-border-l2,#d4dbe1);--pg-task-error:var(--dsw-alias-state-error-primary,#b42318);box-sizing:border-box;width:544px;max-width:100%;max-height:calc(100dvh - 96px);gap:0;padding:0;border-radius:16px;background:var(--pg-task-base);color:var(--pg-task-text);font:inherit;font-size:14px;overflow:hidden}
        .pg-task-modal *{box-sizing:border-box}.pg-task-modal ::selection{background:color-mix(in srgb,var(--pg-task-accent) 25%,var(--pg-task-base));color:var(--pg-task-text)}
        .pg-task-modal svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
        .pg-task-header{position:relative;flex:none;padding:24px 24px 0}.pg-task-header h2{padding-right:36px;margin:0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.2px}.pg-task-subtitle{margin:6px 0 0;color:var(--pg-task-secondary);font-size:13px;line-height:20px}
        .pg-task-close{position:absolute;top:20px;right:20px;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--pg-task-secondary);cursor:pointer}.pg-task-close:hover:not(:disabled){background:var(--pg-task-subtle);color:var(--pg-task-text)}
        .pg-task-body{display:grid;gap:24px;min-height:0;padding:24px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--pg-task-border) transparent}
        .pg-task-summary{padding:16px;border-radius:10px;background:var(--pg-task-subtle)}.pg-task-summary-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.pg-task-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;margin:0;font-size:16px;line-height:25px;font-weight:500}.pg-task-mode{flex:none;margin-top:2px;padding:1px 7px;border:1px solid var(--pg-task-border);border-radius:5px;color:var(--pg-task-secondary);font-size:11px;line-height:18px;white-space:nowrap}.pg-task-id{margin:7px 0 0;color:var(--pg-task-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
        .pg-task-field{display:grid;gap:8px}.pg-task-field label{font-size:14px;font-weight:500;line-height:21px}.pg-task-select-wrap{position:relative;min-width:0}.pg-task-select-wrap>svg{position:absolute;top:13px;left:13px;pointer-events:none;color:var(--pg-task-secondary)}.pg-task-select-wrap>.pg-task-chevron{top:14px;right:13px;left:auto;width:15px;height:15px}
        .pg-task-select{appearance:none;display:block;width:100%;height:44px;padding:0 40px;border:1px solid var(--pg-task-border);border-radius:8px;background:var(--pg-task-base);color:var(--pg-task-text);font:inherit;font-size:14px;line-height:22px}.pg-task-select[data-empty=true]{color:var(--pg-task-secondary)}.pg-task-select:hover:not(:disabled){border-color:var(--pg-task-secondary)}.pg-task-select:disabled{background:var(--pg-task-subtle);color:var(--pg-task-secondary)}.pg-task-select[aria-invalid=true]{border-color:var(--pg-task-error)}
        .pg-task-path{margin:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#e9ecf0);border-radius:7px;background:var(--pg-task-subtle);color:var(--pg-task-secondary);font-size:12px;line-height:20px;overflow-wrap:anywhere;white-space:pre-wrap}.pg-task-hint{margin:0;color:var(--pg-task-secondary);font-size:12px;line-height:19px}
        .pg-task-add{justify-self:start;display:flex;align-items:center;gap:7px;height:36px;margin-top:4px;padding:0 10px 0 8px;border:1px solid var(--pg-task-border);border-radius:7px;background:var(--pg-task-base);color:var(--pg-task-secondary);font:inherit;font-size:12px;cursor:pointer}.pg-task-add svg{width:15px;height:15px}.pg-task-add:hover:not(:disabled){background:var(--pg-task-subtle);border-color:var(--pg-task-secondary)}.pg-task-error{margin:2px 0 0;color:var(--pg-task-error);font-size:12px;line-height:20px;overflow-wrap:anywhere}
        .pg-task-footer{flex:none;padding:16px 24px 20px;border-top:1px solid var(--dsw-alias-border-l1,#eceff2)}.pg-task-footer p{margin:0 0 16px;color:var(--pg-task-secondary);font-size:12px;line-height:19px}.pg-task-actions{display:flex;justify-content:flex-end;gap:8px}
        .pg-task-button{display:flex;align-items:center;justify-content:center;gap:8px;min-width:76px;height:42px;padding:0 16px;border:1px solid var(--pg-task-border);border-radius:8px;background:var(--pg-task-base);color:var(--pg-task-text);font:inherit;font-size:14px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer}.pg-task-button:hover:not(:disabled){background:var(--pg-task-subtle);border-color:var(--pg-task-secondary)}.pg-task-create{min-width:144px;border-color:transparent;background:var(--pg-task-accent);color:#fff}.pg-task-create:hover:not(:disabled){background:var(--pg-task-accent-hover);border-color:transparent}.pg-task-button:disabled,.pg-task-add:disabled,.pg-task-close:disabled{cursor:default;color:var(--dsw-alias-label-tertiary,#7d8791)}.pg-task-create:disabled{border-color:transparent;background:color-mix(in srgb,var(--pg-task-text) 8%,var(--pg-task-base))}.pg-task-create[data-busy=true]{background:var(--pg-task-accent);color:#fff}.pg-task-create svg{width:15px;height:15px;animation:pg-task-spin 1s linear infinite}
        .pg-task-modal button:focus-visible,.pg-task-select:focus-visible{outline:2px solid var(--pg-task-accent);outline-offset:3px}.pg-task-select:focus-visible{border-color:var(--pg-task-accent);outline-offset:2px}
        @keyframes pg-task-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.pg-task-create svg{animation:none}}
        @media(max-width:600px){.pg-task-header{padding:22px 20px 0}.pg-task-header h2{font-size:19px}.pg-task-body{padding:20px;gap:20px}.pg-task-footer{padding:16px 20px 20px}.pg-task-summary{padding:14px}}
      `;

    function stateLabel(state, t) {
      return Object.hasOwn(locales.en.states, state) ? t(`states.${state}`) : state || t('unknown');
    }

    function statusTone(state) {
      if (['failed', 'incomplete', 'rejected'].includes(state)) return 'error';
      if (['queued', 'evaluating', 'scoring', 'pending_review', 'awaiting_bundle', 'awaiting_review', 'active'].includes(state)) return 'warning';
      if (['submitted', 'scored', 'late_scored', 'final', 'ready', 'open'].includes(state)) return 'success';
      return 'neutral';
    }

    // The Host builds challenge web addresses; check them again before opening. Only https, plus http
    // for a local mock platform, and never an address that carries account details.
    function openableWebUrl(value) {
      if (typeof value !== 'string' || !value) return undefined;
      let url;
      try { url = new URL(value); } catch { return undefined; }
      if (url.username || url.password) return undefined;
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url.href : undefined;
    }

    // Mirrors challengeWebBase in lib/links.js: drop userinfo, query, hash and a trailing /api.
    function webRootOf(apiBase) {
      let root = String(apiBase || '');
      try {
        const parsed = new URL(root);
        parsed.username = ''; parsed.password = ''; parsed.search = ''; parsed.hash = '';
        root = parsed.href;
      } catch {
        root = root.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1');
      }
      return root.replace(/\/+$/, '').replace(/\/api$/i, '').replace(/\/+$/, '');
    }

    // Tasks recorded before webUrl existed rebuild it like the Host projection view does: from the API base
    // the task was created against, and from the catalog's web root only when the task recorded no base.
    // The session list may carry the persisted state rather than the Host view, so this repeats it here.
    function taskWebUrl(task, webBase) {
      if (typeof task?.webUrl === 'string' && task.webUrl) return task.webUrl;
      const id = task?.challengeId;
      if (!((typeof id === 'string' && id) || Number.isFinite(id))) return undefined;
      const root = typeof task.baseUrl === 'string' && task.baseUrl ? webRootOf(task.baseUrl) : typeof webBase === 'string' ? webBase : '';
      return root ? `${root}/challenge/${encodeURIComponent(id)}` : undefined;
    }

    // DSH desktop hands https windows to the system browser.
    function openWebButton(value, title) {
      const url = openableWebUrl(value);
      if (!url) return null;
      return h('button', { type: 'button', className: 'pg-button', 'aria-label': title ? `在网页中打开：${title}` : '在网页中打开',
        onClick: () => { window.open(url, '_blank', 'noopener,noreferrer'); } }, '在网页中打开');
    }

    // Chinese lookup for workbench text that stays Chinese regardless of the host language, such as
    // the task list row, which sits among hard-coded Chinese labels. The workbench does receive `t`.
    const zhText = (key) => key.split('.').reduce((value, part) => value?.[part], locales.zh) ?? key;

    // Score rules shared by every attempt display. A failed or rejected attempt has no score, even if a
    // final flag is set. Only a score the platform marks final is a score. A non-zero non-final score is
    // a reference while evaluation is pending. Receipts saved by older versions may carry `scoringState`
    // as a bare string (CLI output copied verbatim); it names the state only and never implies that the
    // score is final. New receipts always carry the normalised object.
    function attemptScore(item) {
      const raw = item?.scoringState;
      const scoring = typeof raw === 'string' ? { state: raw } : raw || {};
      const failed = [scoring.state, item?.status].some((value) => ['failed', 'rejected'].includes(value)) || item?.bundleStatus === 'failed';
      const scoreIsFinal = !failed && scoring.scoreIsFinal === true;
      const finalScore = scoreIsFinal ? scoring.displayScore ?? item?.score : undefined;
      const reference = scoreIsFinal || failed ? undefined : scoring.provisionalScore ?? scoring.displayScore ?? item?.score;
      return { scoring, failed, scoreIsFinal, finalScore, referenceScore: Number.isFinite(reference) && reference !== 0 ? reference : undefined };
    }

    const stageTones = { final: 'success', finalLate: 'success', failed: 'error', evaluating: 'warning', incomplete: 'error' };

    // Mirrors platformReceivedBundle in lib/workflow.js: an evaluating, scoring or final state, or the
    // time the Worker received the bundle, proves it arrived.
    function platformReceivedBundle(attempt) {
      const state = typeof attempt?.scoringState === 'string' ? attempt.scoringState : attempt?.scoringState?.state;
      return ['evaluating', 'scoring', 'final', 'late_scored'].includes(state)
        || (typeof attempt?.scoringQueue?.workerReceivedAt === 'string' && attempt.scoringQueue.workerReceivedAt !== '');
    }
    // Mirrors receiptBundleMissing in lib/workflow.js: the plugin's receipt says the upload into this submission
    // failed, and the platform shows no sign that the bundle arrived since.
    const receiptBundleMissing = (receipt) => receipt?.ok === false && receipt?.error?.code === 'upload_failed'
      && Number.isSafeInteger(Number(receipt?.attemptId)) && Number(receipt.attemptId) > 0 && !platformReceivedBundle(receipt);
    // Mirrors taskBundleMissingIds in lib/workflow.js; states without the field derive it from the latest receipt.
    function taskBundleMissingIds(state) {
      const ids = Array.isArray(state?.bundleMissingIds) ? [...state.bundleMissingIds] : [];
      if (receiptBundleMissing(state?.receipt)) ids.push(state.receipt.attemptId);
      return ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    }

    // One compact line about the checked bundle (lib/bundle.js summarizeZip), or undefined without a summary.
    function bundleSummaryLine(summary) {
      if (!summary || typeof summary !== 'object' || !Number.isFinite(summary.files)) return undefined;
      const size = (bytes) => !Number.isFinite(bytes) ? '?' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB`
        : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
      const named = (item) => `${String(item?.name ?? '').split('/').pop()}（${size(item?.bytes)}）`;
      const largest = Array.isArray(summary.largest) ? summary.largest.slice(0, 3).map(named).join('、') : '';
      const nonText = Array.isArray(summary.nonText) ? summary.nonText.slice(0, 3).map(named).join('、') : '';
      return [`评测包：${summary.files} 个文件，共 ${size(summary.totalBytes)}`,
        largest ? `最大：${largest}` : '',
        summary.nonTextCount ? `非文本文件（按扩展名）${summary.nonTextCount} 个：${nonText}${summary.nonTextCount > 3 ? ' 等' : ''}` : '非文本文件（按扩展名）0 个',
        summary.symlinkCount ? `符号链接 ${summary.symlinkCount} 个` : '',
        summary.layout && typeof summary.layout === 'object'
          ? `外层结构：outputs/ ${summary.layout.hasOutputs ? '有文件' : '无文件'}，arm_manifest.json ${summary.layout.hasManifest ? '有' : '缺失'}` : '',
        summary.complete === false ? 'ZIP 目录未能读完' : ''].filter(Boolean).join('；');
    }

    // Stage, badge and score display for one submission receipt. The task list row, the drawer summary
    // and any submission history share it, so the stage, badge and score always follow the platform state.
    // The plugin's own `ok: false` marks an unfinished submission only while the platform has reported no
    // state: "查询结果" merges the platform attempt over the receipt and keeps a stale `ok: false`. A bundle
    // the platform accepted as incomplete stays submitted; its "材料不完整" badge carries a warning tone.
    // The platform keeps a submission whose bundle never arrived queued until it gives up on it (it reports
    // no bundle state for any submission), so only the plugin's own receipt can tell it apart from a
    // queued one: the confirmation created it and the upload into it failed (`upload_failed`). Such a
    // submission shows "评测包未上传" until the platform reports a failure or a final score, or shows that the
    // bundle arrived (an evaluating or scoring state, or the Worker's receipt time). `bundleMissing` passes the
    // same evidence for a history row, which carries no receipt of its own. A submission the platform closed
    // as "bundle missing" (`bundleNotReceived`, from lib/api.js) shows "未收到评测包，需重新提交" instead of a
    // generic failure: only a new submission helps.
    function receiptProgress(receipt, t = zhText, { running = false, bundleMissing = false } = {}) {
      const { scoring, failed, scoreIsFinal, finalScore, referenceScore } = attemptScore(receipt);
      const states = [scoring.state, receipt?.status];
      const known = (value) => (value && value !== 'unknown' ? value : undefined);
      const state = known(scoring.state) || known(receipt?.bundleStatus) || known(receipt?.status);
      const uploadFailed = receipt?.ok === false && !receipt.status && !scoring.state;
      const notReceived = Boolean(receipt) && receipt.bundleNotReceived === true && !scoreIsFinal;
      const notUploaded = Boolean(receipt) && !failed && !scoreIsFinal && !platformReceivedBundle(receipt)
        && (bundleMissing || receiptBundleMissing(receipt));
      const receiptStage = !receipt ? 'created'
        : notReceived ? 'incomplete'
        : failed ? 'failed'
          : scoreIsFinal ? (states.includes('late_scored') ? 'finalLate' : 'final')
            : notUploaded ? 'incomplete'
              : states.some((value) => ['queued', 'evaluating', 'scoring', 'pending_review'].includes(value)) ? 'evaluating'
                : uploadFailed || states.includes('draft') ? 'incomplete'
                  : 'submitted';
      const stage = running ? 'running' : receiptStage;
      const scoreText = Number.isFinite(finalScore) ? `${finalScore} ${t('progress.points')}`
        : referenceScore !== undefined ? `${t('progress.reference')} ${referenceScore}` : '—';
      const badgeText = !receipt ? t('progress.notSubmitted') : notReceived ? t('progress.notReceived')
        : notUploaded ? t('progress.notUploaded') : state ? stateLabel(state, t)
        : receipt.ok === false ? t('progress.notSubmitted') : t('unknown');
      const badgeTone = !receipt ? (running ? 'warning' : 'neutral')
        : receiptStage === 'submitted' && receipt.bundleStatus === 'incomplete' ? 'warning'
          : stageTones[receiptStage] || 'neutral';
      return { stage, stageText: t(`progress.${stage}`), state, badgeText, badgeTone,
        scoreIsFinal, score: finalScore, referenceScore, scoreText };
    }

    // Score line for attempt cards and lists; follows the same rules as `receiptProgress`. A failed or
    // rejected attempt gets no score line, and neither does a draft, which has nothing to score.
    function scoreLabel(item, t) {
      const { scoring, failed, scoreIsFinal, finalScore, referenceScore } = attemptScore(item);
      if ([scoring.state, item?.status].includes('draft')) return undefined;
      if (scoreIsFinal) return `${t('finalScore')}: ${finalScore ?? '—'}`;
      if (failed) return undefined;
      if (referenceScore !== undefined) return `${t('referenceScore')}: ${referenceScore}`;
      return t('awaitingScore');
    }

    // The workbench refreshes unscored submissions every two minutes while it is open.
    const attemptRefreshMs = 120000;
    // How long after a successful 取消归档 in the archived list focus may still move to the restored task's row.
    const unarchiveFocusMs = 2000;
    // No archive failure to show (the workbench keeps the failed conversation id with the message).
    const noArchiveError = Object.freeze({ id: '', message: '' });

    // A receipt whose evaluation has ended: a final score, or a failed or rejected attempt.
    // A submission the platform closed as "bundle missing" is settled too.
    const receiptSettled = (receipt) => receipt?.bundleNotReceived === true
      || ['final', 'finalLate', 'failed'].includes(receiptProgress(receipt, zhText).stage);

    // The submission id of a receipt, or undefined when it is not a positive integer.
    const receiptAttemptId = (receipt) => {
      const id = Number(receipt?.attemptId);
      return Number.isSafeInteger(id) && id > 0 ? id : undefined;
    };

    // A refresh round never has more than this many requests in flight.
    const refreshConcurrency = 4;
    // A visibility change starts a round only when the previous one began at least this long ago.
    const visibleRefreshGapMs = 30000;

    // A submission still waiting for a platform result. A scored or incomplete bundle, a draft and a
    // failed upload never change on their own, so they are not polled. `awaiting_review` is polled like
    // `pending_review`, although the stage display still shows it as submitted.
    // A submission whose upload failed by this task's receipt is polled too: the platform later closes it
    // ("bundle missing") or, after a re-upload from elsewhere, starts evaluating it.
    function receiptPending(receipt) {
      if (receiptAttemptId(receipt) === undefined || receipt.bundleStatus === 'incomplete') return false;
      const { stage } = receiptProgress(receipt, zhText);
      if (stage === 'evaluating') return true;
      if (stage === 'incomplete' && receiptBundleMissing(receipt) && receipt.bundleNotReceived !== true) return true;
      const awaitingReview = [attemptScore(receipt).scoring.state, receipt.status].includes('awaiting_review');
      return stage === 'submitted' && ([undefined, 'submitted'].includes(receipt.status) || awaitingReview);
    }

    // The platform fields a refreshed submission lays over a receipt or a history row.
    const ATTEMPT_STATE_FIELDS = ['status', 'bundleStatus', 'score', 'scoringState', 'scoringQueue', 'bundleNotReceived'];

    // Identity of the receipt a stored result was fetched for. A receipt that has changed since, by a
    // resubmission under the same id or by "查询结果", no longer matches the stored result.
    const receiptKey = (receipt) => receipt ? JSON.stringify([receipt.attemptId, receipt.updatedAt, receipt.ok, receipt.status,
      receipt.bundleStatus, receipt.score, receipt.scoringState]) : undefined;

    // Lays the latest platform state of a submission over its receipt. `entry` is `{ attempt, receiptKey }`
    // from the workbench store. A result fetched for an earlier state of the receipt is ignored. Only the
    // fields the platform returned replace receipt values. A non-final lookup never replaces a receipt
    // that already has a final, failed or rejected result.
    function withLatestAttempt(receipt, entry) {
      if (!receipt || !entry?.attempt || entry.receiptKey !== receiptKey(receipt)) return receipt;
      const merged = { ...receipt };
      for (const field of ATTEMPT_STATE_FIELDS) if (entry.attempt[field] != null) merged[field] = entry.attempt[field];
      return receiptSettled(receipt) && !receiptSettled(merged) ? receipt : merged;
    }

    // A submission-history row with the workbench refresh's result for the same id laid over it, but
    // only when that result settles a row that was still unsettled. The refresh and the history read
    // happen at different times, so the store never moves a row backwards or between unsettled states.
    // A row updated after the stored result (a re-upload under the same id) keeps its own state.
    // `/me/attempts` rows carry no closure marker, so the platform's "bundle missing" closure of the same id,
    // from the refreshed result or the task's merged receipt (`closed`), is laid over every row that shows no
    // received bundle or final score, settled ones included: the row then agrees with the task row.
    function withSettledAttempt(item, entry, { closed = false } = {}) {
      const row = (closed || entry?.attempt?.bundleNotReceived === true) && item.bundleNotReceived !== true
        && !platformReceivedBundle(item) && !attemptScore(item).scoreIsFinal ? { ...item, bundleNotReceived: true } : item;
      if (!entry?.attempt || receiptSettled(row)) return row;
      if (Date.parse(row.updatedAt) > Date.parse(entry.attempt.updatedAt)) return row;
      const merged = { ...row };
      for (const field of ATTEMPT_STATE_FIELDS) if (entry.attempt[field] != null) merged[field] = entry.attempt[field];
      return receiptSettled(merged) ? merged : row;
    }

    const clock = (time) => `${String(new Date(time).getHours()).padStart(2, '0')}:${String(new Date(time).getMinutes()).padStart(2, '0')}`;

    // Reads the given submissions through the session-free `attempt` query, one request per id, and keeps
    // the results in `store`, each with the receipt it was fetched for. Nothing is written to any
    // conversation. A round never overlaps another and keeps at most `refreshConcurrency` requests in flight.
    async function refreshAttempts(store, ids) {
      const wanted = [...new Set(ids)];
      if (!wanted.length || store.controller || store.disposed) return;
      const controller = new AbortController();
      store.controller = controller;
      store.startedAt = Date.now();
      const keys = wanted.map((id) => receiptKey(store.receipts.get(id)));
      store.publish();
      const outcomes = [];
      let next = 0;
      const worker = async () => {
        while (next < wanted.length && !controller.signal.aborted) {
          const index = next++;
          try { outcomes[index] = { value: await store.query({ action: 'attempt', attemptId: wanted[index] }, controller.signal) }; } catch { /* counted as failed */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(refreshConcurrency, wanted.length) }, worker));
      if (store.controller !== controller) return;
      store.controller = null;
      const usable = (outcome) => outcome && outcome.value && typeof outcome.value === 'object';
      const fresh = wanted.flatMap((id, index) => usable(outcomes[index]) ? [[id, { attempt: outcomes[index].value, receiptKey: keys[index] }]] : []);
      store.attempts = { ...store.attempts, ...Object.fromEntries(fresh) };
      store.failed = fresh.length < wanted.length;
      if (!store.failed) { store.refreshedAt = Date.now(); store.partial = false; } else if (fresh.length) store.partial = true;
      store.publish();
    }

    function TaskWorkflow({ sessionId, state, cwd, running, allowed, run, openTask, t }) {
      const task = state?.task;
      const prepared = state?.prepared;
      const receipt = state?.receipt;
      const progress = receiptProgress(receipt, t, { running });
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
      // Agent-supplied fields that a new submission sends; a retry uploads only the bundle.
      // Whitespace is collapsed for display so a newline in a value cannot add a fake card line.
      const declared = prepared && !prepared.args.attempt_id ? [['声明结果', prepared.args.outcome], ['说明', prepared.args.detail], ['署名', prepared.args.author_name]]
        .filter(([, value]) => typeof value === 'string' && value.trim()).map(([label, value]) => `${label}：${value.trim().replace(/\s+/g, ' ')}`).join(' · ') : '';
      return h('section', { className: 'pg-guide pg-workflow', 'aria-label': 'Playground 任务' },
        h('style', null, css + '.pg-form{display:grid;gap:8px;margin-top:10px}.pg-field{display:grid;gap:4px;font-size:12px}.pg-input{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:7px}.pg-confirm{margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2)}.pg-path{overflow-wrap:anywhere;white-space:pre-line}.pg-advanced{margin-top:10px}.pg-advanced summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}.pg-advanced[open] summary{color:var(--pg-accent)}'),
        h('div', { className: 'pg-head' }, h('h3', { className: 'pg-brand' }, task ? `Playground · ${task.title}` : 'Playground · 开始任务')),
        task ? h('p', { className: 'pg-note pg-path' }, `赛题 ${task.challengeId} · ${cwd || task.cwd}`) : null,
        // Author mode is not offered in the UI yet; a task already in author mode can only switch back.
        task?.mode === 'author' ? h(React.Fragment, null,
          h('p', { className: 'pg-note' }, '可在当前工作区准备题面、资源说明和评分规则。本 MVP 尚未接入平台出题修改与发布。'),
          h('div', { className: 'pg-actions' },
            h('button', { className: 'pg-button pg-primary', disabled, onClick: () => act({ action: 'mode', mode: 'participate' }) }, '切回参赛'))) : null,
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
            // The platform does not score an upload into a submission it closed as "bundle missing", so
            // that receipt offers no re-upload; the check above creates a new submission.
            receipt?.ok === false && receipt.attemptId && receipt.bundleNotReceived === true
              ? h('p', { className: 'pg-note pg-closed-note' }, `平台已关闭提交 #${receipt.attemptId}（未收到评测包），不能再往里重传。修改评测包后，用“检查并生成确认卡”新建一次提交。`)
              : receipt?.ok === false && receipt.attemptId ? h('button', { className: 'pg-button', disabled, onClick: () => act({ ...receipt.args, action: 'check', ...files, challenge_id: target, attempt_id: receipt.attemptId }) }, `检查后重传原提交 #${receipt.attemptId}`) : null) : null) : null,
        prepared && !edited ? h('div', { className: 'pg-confirm', 'aria-label': 'Playground 提交确认' },
          h('h4', { className: 'pg-confirm-title' }, '请确认本次提交'),
          h('p', { className: 'pg-confirm-impact' }, h('span', { className: 'pg-badge', 'data-tone': 'warning' }, '高影响操作'), '确认后会向 Playground 上传已检查的材料，并可能消耗一个提交名额；请先核对目标、工作区和文件摘要。'),
          h('p', { className: 'pg-note pg-path' }, `目标：${prepared.challenge.title}（${prepared.challenge.id}）\n平台：${prepared.baseUrl}\n工作区：${prepared.cwd}`),
          h('p', { className: 'pg-note' }, `${prepared.args.attempt_id ? `重传提交 #${prepared.args.attempt_id}` : '创建一条新提交'} · 方案：${prepared.args.method} · 轨迹 ${prepared.traceCount} 步`),
          declared ? h('p', { className: 'pg-note pg-path' }, declared) : null,
          h('ul', { className: 'pg-note pg-path' }, prepared.files.map((file) => h('li', { key: file.kind }, `${file.kind}: ${file.path} · ${file.bytes} bytes`, h('details', null, h('summary', null, 'SHA-256'), file.sha256)))),
          bundleSummaryLine(prepared.bundleSummary) ? h('p', { className: 'pg-note pg-bundle-summary' }, bundleSummaryLine(prepared.bundleSummary)) : null,
          typeof prepared.bundleWarning === 'string' ? h('p', { className: 'pg-note pg-bundle-warning', role: 'status' }, h('span', { className: 'pg-badge', 'data-tone': 'warning' }, '评测包未改动'), ' ', prepared.bundleWarning) : null,
          h('p', { className: 'pg-note' }, `${prepared.cliPrecheck?.status === 'passed' ? '本地文件检查和 Playground CLI 预检均已通过；'
            : prepared.cliPrecheck?.note ? `本地文件检查通过；${prepared.cliPrecheck.note}` : '本地文件检查通过；'}最终协议和有效性由平台校验。确认后将上传上述材料并提交评测。`),
          prepared.cliUpdate?.warning ? h('p', { className: 'pg-note', role: 'status' }, h('span', { className: 'pg-badge', 'data-tone': 'warning' }, 'CLI 需更新'), ' ', prepared.cliUpdate.warning) : null,
          h('div', { className: 'pg-actions' }, h('button', { className: 'pg-button pg-primary', disabled, onClick: () => act(prepared.checkId, true) }, '确认目标并提交'),
            h('button', { className: 'pg-button', disabled, onClick: () => act({ action: 'cancel' }) }, '取消本次提交'))) : null,
        edited && prepared ? h('p', { className: 'pg-note' }, '输入已改变，请重新检查材料。') : null,
        receipt ? h('details', { className: 'pg-raw', open: showResult, onToggle: (event) => setShowResult(event.currentTarget.open) },
          h('summary', null, `${t('progress.attempt')} #${receipt.attemptId ?? '—'} · ${progress.badgeText} · ${progress.stageText} · ${progress.scoreText}`),
          h(PlaygroundToolCard, { phase: 'result', block: { meta: { playground: receipt } }, toolName: 'playground_get_attempt', t })) : null,
        error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null,
        running ? h('p', { className: 'pg-note', role: 'status' }, '此会话正在执行任务，请等待完成或返回对话停止生成后操作。') : !allowed ? h('p', { className: 'pg-note' }, '当前连接没有此会话的操作权限。') : null,
        busy ? h('p', { className: 'pg-note', role: 'status' }, '正在执行…') : null);
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

    // Where the Host found the token it uses (`tokenSource` of the auth query); the value never reaches the Client.
    // `dsh_other` is a value the DSH credential store answered from an origin the Host could not confirm, so
    // unsetting it might not remove it; it gets no 清除令牌.
    const TOKEN_SOURCES = { dsh: 'DSH 凭据', dsh_other: 'DSH 凭据（来源未确认）', cli_file: 'CLI 凭据文件', env: '环境变量', config: '插件配置' };
    // The sources that win over the CLI credentials file an email login writes.
    const ABOVE_CLI_FILE = { dsh: 'DSH 凭据中保存的令牌', dsh_other: 'DSH 凭据存储提供的令牌（来源未确认）', env: '环境变量 PLAYGROUND_TOKEN 中的令牌', config: '插件配置中的令牌' };
    const TOKEN_PAGE = '网站“我的面板 → API 与 Agent”';
    const isAgentUser = (user) => typeof user?.userType === 'string' && user.userType.trim().toLowerCase() === 'agent';
    // The website's API token page (我的面板 → API 与 Agent), on the site the plugin talks to.
    function tokenPageUrl(apiBase) {
      const root = typeof apiBase === 'string' && apiBase ? webRootOf(apiBase) : '';
      return root ? openableWebUrl(`${root}/#dashboard/api`) : undefined;
    }
    const authCss = '.pg-auth .pg-form{display:grid;gap:8px;margin-top:10px}.pg-auth .pg-field{display:grid;gap:4px;font-size:12px}.pg-auth .pg-input{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:7px}.pg-auth-other{margin-top:12px;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-auth-other summary{cursor:pointer}.pg-auth-other summary:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}';

    // Why a saved or found token does not log in, with the next step for where it came from.
    function tokenProblem(state) {
      const source = state.tokenSource;
      const fromFile = state.cliFilePath ? `CLI 凭据文件 ${state.cliFilePath}` : 'CLI 凭据文件';
      const next = source === 'dsh' ? `请到${TOKEN_PAGE}生成新令牌，粘贴到下方保存（会替换当前令牌），或点击“清除令牌”。`
        : source === 'cli_file' ? `当前令牌来自${fromFile}。请在下方保存新令牌（DSH 凭据优先于该文件），或在终端运行 playground auth login 重新登录。`
          : source === 'env' ? '当前令牌来自环境变量 PLAYGROUND_TOKEN。请在下方保存新令牌（DSH 凭据优先于环境变量），或更新该环境变量后重启 DSH。'
            : source === 'config' ? '当前令牌来自插件配置，它优先于其他来源，在这里保存的令牌不会生效。请修改或删除插件配置中的令牌。'
              : source === 'dsh_other' ? '当前令牌由 DSH 凭据存储提供，但插件无法确认它保存在 DSH 中还是来自 DSH 的环境变量。请在下方保存新令牌（会替换 DSH 中保存的令牌），或检查 DSH 环境中的 PLAYGROUND_TOKEN 变量。'
                : `请到${TOKEN_PAGE}生成新令牌并保存。`;
      if (state.reason === 'rejected') return ['令牌无效', `令牌无效、已过期或已撤销。${next}`];
      return ['无权访问', `Playground 拒绝了当前账号的访问（HTTP 403）。请确认账号状态，或换用其他账号的令牌。${next}`];
    }

    // What clearing the DSH copy leads to. DSH's credentials-local answers PLAYGROUND_TOKEN from its own
    // environment when nothing is saved, before the plugin reads the CLI credentials file. A value DSH then
    // takes from a `.env` file is not reported to the Client, so the note cannot mention it (see README).
    function clearNote(state) {
      if (state.tokenSource !== 'dsh') return '';
      if (state.envToken) return `DSH 的环境中还有 PLAYGROUND_TOKEN 变量。清除 DSH 中保存的令牌后，插件会改用该变量中的令牌（它优先于 CLI 凭据文件）；插件不会修改环境变量${state.cliFileToken ? '或 CLI 凭据文件' : ''}。`;
      if (state.cliFileToken) return `CLI 凭据文件 ${state.cliFilePath || ''} 中也有令牌。清除 DSH 中的令牌后，插件仍会使用该文件中的令牌；插件不会修改这个文件。`;
      return '';
    }

    // After a successful email login: the CLI wrote its credentials file, but a higher source still wins.
    function loginOverridden(state) {
      const what = ABOVE_CLI_FILE[state.tokenSource];
      if (!what) return '';
      const next = state.tokenSource === 'dsh'
        ? (state.envToken
          ? '清除令牌后，插件会改用 DSH 环境变量 PLAYGROUND_TOKEN 中的令牌，它可能不是刚登录的账号；如需改用该账号，还需移除这个环境变量并重启 DSH。'
          : '点击“清除令牌”后，插件改用刚登录的账号。')
        : state.tokenSource === 'config' ? '如需改用刚登录的账号，请删除插件配置中的令牌。'
          : state.tokenSource === 'env' ? '如需改用刚登录的账号，请移除 DSH 环境中的 PLAYGROUND_TOKEN 变量后重启 DSH。'
            : '如需改用刚登录的账号，请移除 DSH 凭据中的 PLAYGROUND_TOKEN，以及 DSH 环境中的同名变量，然后重启 DSH。';
      return `CLI 登录成功，但插件仍在使用${what}，它优先于 CLI 凭据文件。${next}`;
    }

    function AuthStatusPanel({ query, login, saveToken, clearToken }) {
      // `state` is the last auth answer (null until the first one). It stays rendered while a re-check runs,
      // so the controls keep their place; `checking` only marks the re-check.
      const [state, setState] = React.useState(null);
      const [checking, setChecking] = React.useState(true);
      // `seq` numbers the checks so only the latest answer is shown; `status` is the status line, which takes
      // focus after a save, clear or login (`refocus`) because the control that was used may be gone.
      const [latest] = React.useState(() => ({ seq: 0, status: null, refocus: false }));
      const [email, setEmail] = React.useState('');
      const [password, setPassword] = React.useState('');
      const [loginBusy, setLoginBusy] = React.useState(false);
      const [loginError, setLoginError] = React.useState('');
      const [loginDone, setLoginDone] = React.useState(false);
      const [token, setToken] = React.useState('');
      const [tokenBusy, setTokenBusy] = React.useState(false);
      const [tokenError, setTokenError] = React.useState('');
      const check = async () => {
        const seq = ++latest.seq;
        setChecking(true);
        let next;
        try { next = await query({ action: 'auth' }); } catch (failure) { next = { error: failure.message }; }
        // A check started later is still running or has answered; its answer is the current one.
        if (seq !== latest.seq) return;
        setState(next && typeof next === 'object' ? next : {});
        setChecking(false);
        if (latest.refocus) { latest.refocus = false; latest.status?.focus?.(); }
      };
      React.useEffect(() => { check(); }, [query]);
      const submitLogin = async () => {
        setLoginBusy(true); setLoginError(''); setLoginDone(false);
        try {
          await login(email, password);
          setPassword('');
          setLoginDone(true);
          latest.refocus = true;
          await check();
        } catch (failure) { setLoginError(failure.message); }
        finally { setLoginBusy(false); }
      };
      // The token goes only to the DSH credential store; the auth check that follows carries no token.
      const submitToken = async () => {
        if (!token.trim()) { setTokenError('请先粘贴 API 令牌。'); return; }
        setTokenBusy(true); setTokenError(''); setLoginDone(false);
        try {
          await saveToken(token);
          setToken('');
          latest.refocus = true;
          await check();
        } catch (failure) { setTokenError(failure.message); }
        finally { setTokenBusy(false); }
      };
      const removeToken = async () => {
        setTokenBusy(true); setTokenError(''); setLoginDone(false);
        try {
          await clearToken();
          latest.refocus = true;
          await check();
        } catch (failure) { setTokenError(failure.message); }
        finally { setTokenBusy(false); }
      };
      const loading = !state;
      const current = state || {};
      const user = current.user || {};
      const agent = isAgentUser(user);
      const operator = user.operatorName || (user.operatorId !== undefined && user.operatorId !== null && user.operatorId !== '' ? `#${user.operatorId}` : '');
      const operatorState = user.operatorConfirmed === true ? '（已确认）' : user.operatorConfirmed === false ? '（未确认）' : '';
      const sourceLabel = TOKEN_SOURCES[current.tokenSource];
      const stored = current.tokenSource === 'dsh';
      // A plugin-config token wins over everything, so a token saved here would never be used.
      const fromConfig = current.tokenSource === 'config';
      const pageUrl = tokenPageUrl(current.baseUrl);
      const refused = current.reason === 'rejected' || current.reason === 'forbidden';
      const [refusedBadge, refusedText] = refused ? tokenProblem(current) : [];
      const failedCheck = current.reason === 'network' || current.reason === 'unavailable';
      const note = clearNote(current);
      const overridden = loginDone && !loading ? loginOverridden(current) : '';
      const badge = (tone, label) => h('span', { className: 'pg-badge', 'data-tone': tone }, label);
      const sourceTail = sourceLabel ? ` 令牌来源：${sourceLabel}` : '';
      const summary = loading ? '正在检查当前 DSH 是否已配置 Playground 凭据…'
        : current.authenticated ? h(React.Fragment, null, badge('success', '已登录'), ' ', user.name || user.email || 'Playground 用户')
          : refused ? h(React.Fragment, null, badge('error', refusedBadge), sourceTail)
            : failedCheck ? h(React.Fragment, null, badge('error', '检测失败'), sourceTail)
              : h(React.Fragment, null, badge(current.error ? 'error' : 'warning', current.error ? '检测失败' : '未登录'), ' 公开赛题仍可浏览；查询个人提交和上传评测包需要登录。');
      const clearButton = stored ? h('button', { type: 'button', className: 'pg-button', disabled: tokenBusy, onClick: removeToken }, '清除令牌') : null;
      const tokenForm = h('form', { className: 'pg-form pg-auth-token', 'aria-label': 'API 令牌登录', onSubmit: (event) => { event.preventDefault(); if (!tokenBusy) submitToken(); } },
        h('p', { className: 'pg-note' }, `在${TOKEN_PAGE}登录后生成个人令牌或 Agent 账号令牌，粘贴到这里保存。令牌只保存在 DSH 凭据存储中，不会写入对话、命令或日志；保存后自动检测登录状态。`),
        pageUrl ? h('div', { className: 'pg-actions' }, h('button', { type: 'button', className: 'pg-button', onClick: () => { window.open(pageUrl, '_blank', 'noopener,noreferrer'); } }, '去网站生成令牌')) : null,
        h('label', { className: 'pg-field' }, 'API 令牌', h('input', { className: 'pg-input', type: 'password', value: token, autoComplete: 'off', spellCheck: false, onChange: (event) => setToken(event.target.value) })),
        // Enabled while the field is empty, so a click explains what is missing instead of doing nothing.
        h('div', { className: 'pg-actions' }, h('button', { type: 'submit', className: 'pg-button pg-primary', disabled: tokenBusy }, tokenBusy ? '正在保存…' : '保存令牌')),
        tokenError ? h('p', { className: 'pg-error', role: 'alert' }, tokenError) : null);
      const configNote = fromConfig ? h('p', { className: 'pg-note pg-auth-config' }, '令牌来自插件配置，它优先于在工作台保存的令牌，所以这里不提供保存或更换令牌。如需更换，请修改或删除插件配置中的令牌。') : null;
      // Only the status line is a live region; the forms and longer notes are not re-announced on every check.
      return h('section', { className: 'pg-guide pg-auth', 'aria-label': 'Playground 登录状态', 'aria-busy': checking || loginBusy || tokenBusy },
        h('style', null, authCss),
        h('div', { className: 'pg-head' }, h('h2', { className: 'pg-brand' }, 'Playground 连接状态'),
          h('button', { className: 'pg-button', disabled: checking, onClick: check }, checking ? '正在检测…' : '重新检测')),
        h('div', { className: 'pg-auth-status', role: 'status', 'aria-live': 'polite', tabIndex: -1, ref: (node) => { latest.status = node; } },
          h('p', { className: 'pg-note' }, summary),
          !loading && checking ? h('p', { className: 'pg-note' }, '正在重新检测登录状态…') : null,
          overridden ? h('p', { className: 'pg-note pg-auth-login-note' }, badge('warning', '仍在使用原令牌'), ' ', overridden) : null),
        !loading && current.cliUpdate?.warning ? h('p', { className: 'pg-note pg-cli-update' }, badge('warning', 'CLI 需更新'), ' ', current.cliUpdate.warning) : null,
        loading ? null : current.authenticated ? h(React.Fragment, null,
          h('p', { className: 'pg-note pg-auth-identity' }, `身份：${agent ? 'Agent 账号' : '本人'}。提交会记在这个身份名下。`),
          agent && operator ? h('p', { className: 'pg-note' }, `操作人：${operator}${operatorState}`) : null,
          agent && user.agentFramework ? h('p', { className: 'pg-note' }, `Agent 框架：${user.agentFramework}`) : null,
          user.email ? h('p', { className: 'pg-note' }, user.email) : null,
          sourceLabel ? h('p', { className: 'pg-note' }, `令牌来源：${sourceLabel}`) : null,
          note ? h('p', { className: 'pg-note pg-auth-file' }, note) : null,
          current.baseUrl ? h('p', { className: 'pg-note pg-path' }, `API：${current.baseUrl}`) : null,
          clearButton ? h('div', { className: 'pg-actions' }, clearButton) : null,
          fromConfig ? configNote : h('details', { className: 'pg-auth-other' }, h('summary', null, '更换令牌'), tokenForm))
          : h(React.Fragment, null,
            refused ? h('p', { className: 'pg-error', role: 'alert' }, refusedText)
              : failedCheck ? h('p', { className: 'pg-error', role: 'alert' }, current.reason === 'network'
                ? '无法连接 Playground 平台，暂时无法确认登录状态。请检查网络后点击“重新检测”。'
                : 'Playground 平台暂时无法确认登录状态，请稍后点击“重新检测”。')
                : current.error ? h('p', { className: 'pg-error', role: 'alert' }, current.error) : null,
            note ? h('p', { className: 'pg-note pg-auth-file' }, note) : null,
            clearButton ? h('div', { className: 'pg-actions' }, clearButton) : null,
            fromConfig ? configNote : tokenForm,
            h('details', { className: 'pg-auth-other' }, h('summary', null, '其他登录方式'),
              h('p', { className: 'pg-note' }, '用 Playground CLI 注册、设有密码的账号可以用邮箱和密码登录。插件会调用已安装的 Playground CLI；密码只通过 DSH 凭据通道传给 CLI，不会写入对话，登录结束后即从 DSH 凭据中删除。登录写入 CLI 凭据文件，而 DSH 凭据、DSH 环境变量或插件配置中的令牌都优先于这个文件。也可以在 DSH 启动前完成 playground auth login，再点击“重新检测”。'),
              h('form', { className: 'pg-form', onSubmit: (event) => { event.preventDefault(); if (!loginBusy && email.trim() && password) submitLogin(); } },
                h('label', { className: 'pg-field' }, 'Playground 邮箱', h('input', { className: 'pg-input', type: 'email', value: email, autoComplete: 'username', onChange: (event) => setEmail(event.target.value) })),
                h('label', { className: 'pg-field' }, 'Playground 密码', h('input', { className: 'pg-input', type: 'password', value: password, autoComplete: 'current-password', onChange: (event) => setPassword(event.target.value) })),
                h('button', { type: 'submit', className: 'pg-button pg-primary', disabled: loginBusy || !email.trim() || !password }, loginBusy ? '正在登录…' : '登录 Playground'),
                loginError ? h('p', { className: 'pg-error', role: 'alert' }, loginError) : null))));
    }

    // The competition selector. The Host returns built-in competitions (queried by `competition`) and API
    // seasons the table lacks (queried by `season`); the select value says which. A bare value is a season slug.
    const COMPETITION_GROUPS = [['live', '进行中'], ['upcoming', '即将开始'], ['ended', '已结束']];
    const COMPETITION_TONES = { live: 'success', upcoming: 'warning' };
    const competitionStatusText = (status) => (COMPETITION_GROUPS.find(([key]) => key === status) || [])[1] || '';
    const competitionValue = (item) => (item.kind === 'season' ? `season:${item.season}` : `competition:${item.id}`);
    const competitionLabel = (item) => [item.nameZh || item.name || item.id, competitionStatusText(item.status), item.dateText].filter(Boolean).join(' · ');
    function competitionFilter(value) {
      if (!value) return {};
      if (value.startsWith('competition:')) return { competition: value.slice('competition:'.length) };
      return { season: value.startsWith('season:') ? value.slice('season:'.length) : value };
    }
    // A competition with periods (玻尔产品周赛) gets a period choice: 全部期 ('') or one slug. Choosing the
    // competition starts on the Host's `defaultPeriod` (the live period, else the most recently started one,
    // else the first); one the periods do not hold starts on 全部期.
    const competitionPeriods = (item) => (Array.isArray(item?.periods)
      ? item.periods.filter((period) => period && typeof period === 'object' && typeof period.slug === 'string' && period.slug) : []);
    const startingPeriod = (item) => (competitionPeriods(item).some((period) => period.slug === item.defaultPeriod) ? item.defaultPeriod : '');

    // Catalog filters. 来源 and 排序 are the list API's own values. 学科 lists the top disciplines the Host
    // sends (`disciplineFacets`) and 其他, which opens a free-text field for one exact discipline key: the API
    // matches `disc` exactly and cannot ask for "none of the top ones". The API has no open-status filter, so
    // 只看开放 hides the loaded cards that are not open and reads nothing.
    const CATALOG_PER_PAGE = 20;
    const OTHER_DISCIPLINE = '__other__';
    const ORIGIN_OPTIONS = [['', '全部来源'], ['community', '社区'], ['benchmark', '基准'], ['hackathon', '黑客松'], ['arena', '竞技场']];
    const SORT_OPTIONS = [['newest', '最新'], ['attempts', '提交最多']];
    // The catalog query of one filter set; defaults (all origins, all disciplines, newest, page 1) are left out.
    function catalogInput(filters, page = 1) {
      return { action: 'catalog', search: filters.search.trim(), ...competitionFilter(filters.season),
        ...(filters.period ? { period: filters.period } : {}),
        ...(filters.origin ? { origin: filters.origin } : {}), ...(filters.discipline ? { discipline: filters.discipline } : {}),
        ...(filters.sort === 'attempts' ? { sort: 'attempts' } : {}), ...(page > 1 ? { page } : {}), per_page: CATALOG_PER_PAGE };
    }
    // Cards with an id, each id once; `seen` holds the ids already listed when a page is appended.
    function uniqueCards(items, seen = new Set()) {
      const cards = [];
      for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item !== 'object' || item.id === undefined || item.id === null || seen.has(String(item.id))) continue;
        seen.add(String(item.id));
        cards.push(item);
      }
      return cards;
    }
    function catalogFacets(value) {
      if (!value || typeof value !== 'object' || !Array.isArray(value.top)) return undefined;
      const key = (entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 100;
      return { top: value.top.filter((entry) => key(entry?.key)).map((entry) => entry.key),
        otherKeys: Array.isArray(value.otherKeys) ? value.otherKeys.filter(key) : [] };
    }
    // The list facts of one catalog page. `missing` counts the fixed ids the Host could not read (0 when none).
    const pageFacts = (page) => ({ total: Number.isInteger(page?.total) ? page.total : undefined, hasMore: page?.hasMore === true,
      missing: Number.isSafeInteger(page?.missing) && page.missing > 0 ? page.missing : 0 });

    function CatalogPanel({ sessionId, allowed, query, requestTask, onWebBase }) {
      const [search, setSearch] = React.useState('');
      const [season, setSeason] = React.useState('');
      // The chosen period of a competition with periods; '' is 全部期 and the value for every other choice.
      const [period, setPeriod] = React.useState('');
      const [origin, setOrigin] = React.useState('');
      // The 学科 select: '' (all), a top discipline key, or OTHER_DISCIPLINE with the key typed in `otherDiscipline`.
      const [disciplineChoice, setDisciplineChoice] = React.useState('');
      const [otherDiscipline, setOtherDiscipline] = React.useState('');
      const [sort, setSort] = React.useState('newest');
      const [openOnly, setOpenOnly] = React.useState(false);
      const [catalog, setCatalog] = React.useState(null);
      // The shown list: the cards of every page read so far for one query (`input`), the last page's facts,
      // and the selector and period values it was read for; the grid stays hidden while they differ from
      // `season` and `period`.
      const [list, setList] = React.useState(null);
      // The 学科 choices of the first catalog answer that had them; later answers do not replace them.
      const [facets, setFacets] = React.useState(null);
      // '' when idle, 'load' for a first page, 'more' for an appended page.
      const [busy, setBusy] = React.useState('');
      // The failed read: { kind: 'load', filters } or { kind: 'more' }. Its text is fixed; causes are not shown.
      const [failure, setFailure] = React.useState(null);
      const [status, setStatus] = React.useState('');
      const [notice, setNotice] = React.useState('');
      // Mutable holder (not render state): only the newest read, first page or appended, may update the panel.
      // Its focus targets come from callback refs: the heading, the count line, 加载更多 and each card's 查看详情 by id.
      // `refocus` holds the ids a last 加载更多 added while it had focus; the effect below moves focus once they render.
      const [latest] = React.useState(() => ({ controller: null, facets: null, heading: null, count: null, more: null, details: new Map(), refocus: null }));
      // The catalog card whose detail drawer is open; the drawer reads the full detail itself.
      const [detail, setDetail] = React.useState(null);
      const filters = { search, season, period, origin, sort, discipline: disciplineChoice === OTHER_DISCIPLINE ? otherDiscipline.trim() : disciplineChoice };
      // Page 1 for the current filters with `changes` applied; it replaces the list. Any read still running,
      // an appended page included, is aborted and can no longer change the panel.
      const load = async (changes = {}, nextNotice = '') => {
        const next = { ...filters, ...changes };
        latest.controller?.abort();
        const controller = new AbortController();
        latest.controller = controller;
        setBusy('load'); setFailure(null); setNotice(nextNotice); setStatus('正在读取比赛和赛题…');
        try {
          const input = catalogInput(next);
          const result = await query(input, controller.signal);
          if (latest.controller !== controller) return;
          setCatalog(result);
          const facts = pageFacts(result?.challenges);
          // `filters` keeps the controls this list was read with, so its own 重试 can read the same query again.
          setList({ season: next.season, period: next.period, filters: next, input, page: 1, items: uniqueCards(result?.challenges?.items), ...facts });
          const received = latest.facets ? undefined : catalogFacets(result?.disciplineFacets);
          if (received) { latest.facets = received; setFacets(received); }
          if (typeof result?.webBase === 'string') onWebBase?.(result.webBase);
          // A chosen competition the new table no longer lists: go back to 全部比赛 and read once more.
          const table = Array.isArray(result?.competitionTable) ? result.competitionTable : undefined;
          if (next.season && table && !table.some((item) => item && typeof item === 'object' && competitionValue(item) === next.season)) {
            setSeason(''); setPeriod('');
            load({ ...next, season: '', period: '' }, '之前选择的比赛已不在列表中，已改为显示全部比赛。');
            return;
          }
          setStatus(facts.missing ? `赛题目录已更新，有 ${facts.missing} 道赛题读取失败。` : '赛题目录已更新。');
        } catch {
          if (latest.controller !== controller) return;
          setFailure({ kind: 'load', filters: next }); setStatus('赛题目录读取失败。');
        } finally {
          if (latest.controller === controller) { latest.controller = null; setBusy(''); }
        }
      };
      // 其他 with an empty field reads nothing: the list stays and a hint asks for a key.
      const otherPending = disciplineChoice === OTHER_DISCIPLINE && !otherDiscipline.trim();
      // 加载更多 is offered only while the shown list is the one the controls describe: not after a failed
      // page-1 read (the old list stays under the new controls), not while the controls hold edits not
      // read yet (typed search, another filter) and not while 其他 waits for a key, whose query would
      // otherwise equal 全部学科's. Otherwise it would append the old query's next page.
      const canLoadMore = Boolean(list?.hasMore) && list.season === season && list.period === period && failure?.kind !== 'load' && !otherPending
        && JSON.stringify(list.input) === JSON.stringify(catalogInput(filters));
      // The next page of the shown list's own query, appended without repeats.
      const loadMore = async () => {
        const shown = list;
        if (!canLoadMore || latest.controller) return;
        const controller = new AbortController();
        latest.controller = controller;
        setBusy('more'); setFailure(null); setStatus('正在加载更多赛题…');
        try {
          const page = shown.page + 1;
          const result = await query({ ...shown.input, page }, controller.signal);
          if (latest.controller !== controller) return;
          const facts = pageFacts(result?.challenges);
          const added = uniqueCards(result?.challenges?.items, new Set(shown.items.map((item) => String(item.id))));
          // An empty page ends the list even if it claims more.
          const hasMore = facts.hasMore && Array.isArray(result?.challenges?.items) && result.challenges.items.length > 0;
          // The last page removes 加载更多; if it still had focus, focus moves on instead of falling to the page.
          if (!hasMore && latest.more && typeof document !== 'undefined' && document.activeElement === latest.more) latest.refocus = added.map((item) => String(item.id));
          // Each page re-reads the fixed ids, so an id that page 1 could not read may still be absent: the larger
          // unread count stays until the next page-1 read.
          setList({ ...shown, page, items: [...shown.items, ...added], ...facts, total: facts.total ?? shown.total,
            missing: Math.max(shown.missing, facts.missing), hasMore });
          setStatus(added.length ? `已加载 ${added.length} 道赛题。` : '没有更多赛题。');
        } catch {
          if (latest.controller !== controller) return;
          setFailure({ kind: 'more' }); setStatus('加载更多赛题失败。');
        } finally {
          if (latest.controller === controller) { latest.controller = null; setBusy(''); }
        }
      };
      // A failed append is retried as long as the controls still describe the shown list; after edits since,
      // 重试 reads page 1 of the controls instead of doing nothing. While 其他 waits for a key it reads
      // nothing (and is disabled): any read then would be the unfiltered list.
      const retry = () => {
        if (otherPending) return undefined;
        return failure?.kind === 'more' ? (canLoadMore ? loadMore() : load()) : load(failure?.filters);
      };
      React.useEffect(() => {
        load();
        return () => { latest.controller?.abort(); latest.controller = null; };
      }, [query]);
      // After the last 加载更多: the first added card that is shown (只看开放 may hide it), else the count line, else
      // the heading (the count line is absent when the list reports no total).
      React.useEffect(() => {
        const ids = latest.refocus;
        if (!ids) return;
        latest.refocus = null;
        [...ids.map((id) => latest.details.get(id)), latest.count, latest.heading].find(Boolean)?.focus?.();
      });
      const competitions = Array.isArray(catalog?.competitionTable) ? catalog.competitionTable.filter((item) => item && typeof item === 'object') : [];
      const selectedCompetition = season ? competitions.find((item) => competitionValue(item) === season) : undefined;
      const periods = competitionPeriods(selectedCompetition);
      const selectedPeriod = period ? periods.find((item) => item.slug === period) : undefined;
      // Challenges show only for the selection they were read for, never under another competition's or period's info row.
      const shownList = list && list.season === season && list.period === period ? list : null;
      const loaded = shownList ? shownList.items : [];
      const challenges = openOnly ? loaded.filter((item) => item.status === 'open') : loaded;
      const total = shownList?.total;
      // Fixed ids of the shown list that the Host could not read; the info row says the list is incomplete.
      const missing = shownList?.missing || 0;
      // Under 只看开放 the grid shows fewer cards than are loaded, so the line counts loaded, then open ones.
      const countLine = shownList ? [total !== undefined ? `共 ${total} 道` : '',
        openOnly ? `已加载 ${loaded.length} 道` : total !== undefined && loaded.length < total ? `已显示 ${loaded.length} 道` : '',
        openOnly ? `其中开放 ${challenges.length} 道（只看开放仅筛选已加载的赛题）` : ''].filter(Boolean).join(' · ') : '';
      // The info row describes the chosen period when there is one, else the whole competition.
      const infoStatus = selectedPeriod ? selectedPeriod.status : selectedCompetition?.status;
      const infoTime = selectedPeriod ? `${selectedPeriod.labelZh || selectedPeriod.slug} 时间：${selectedPeriod.timeText || selectedPeriod.dateText || '日期待定'}`
        : `时间：${selectedCompetition?.timeText || selectedCompetition?.dateText || '日期待定'}`;
      const infoName = [selectedCompetition?.nameZh || selectedCompetition?.name, selectedPeriod?.labelZh].filter(Boolean).join(' · ');
      const failureText = failure?.kind === 'more' ? '加载更多赛题失败，已加载的赛题仍保留。'
        : failure ? (loaded.length ? '赛题目录读取失败，下面仍是上一次读取的赛题。' : '赛题目录读取失败。') : '';
      const applyOther = () => { if (otherDiscipline.trim()) load({ discipline: otherDiscipline.trim() }); };
      // Browsing is session-free; creating a task still runs through an open conversation.
      const startBlocked = !sessionId ? '打开一个 DSH 对话后才能从目录创建任务。'
        : !allowed ? '当前连接没有在此对话中创建任务的权限。' : '';
      return h('section', { className: 'pg-guide pg-catalog', 'aria-label': 'Playground 赛题目录', 'aria-busy': Boolean(busy) },
        h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status),
        h('div', { className: 'pg-head' }, h('div', null, h('h2', { className: 'pg-brand', tabIndex: -1, ref: (node) => { latest.heading = node; } }, '选择比赛或赛题'),
          h('p', { className: 'pg-note' }, '先从目录选择题目，再创建独立任务对话；不需要记住赛题 ID。')),
          h('button', { className: 'pg-button', disabled: busy === 'load', onClick: () => load() }, busy === 'load' ? '正在刷新…' : '刷新目录')),
        h('div', { className: 'pg-search' },
          h('input', { className: 'pg-input', 'aria-label': '搜索 Playground 赛题', placeholder: '按题目名称、方向或关键词搜索', value: search, onChange: (event) => setSearch(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') load(); } }),
          h('select', { className: 'pg-input', 'aria-label': '选择比赛', value: season, onChange: (event) => {
            const value = event.target.value;
            const nextPeriod = startingPeriod(competitions.find((item) => competitionValue(item) === value));
            setSeason(value); setPeriod(nextPeriod); load({ season: value, period: nextPeriod });
          } },
            h('option', { value: '' }, '全部比赛'),
            // The Host sends the list ordered live, upcoming, ended; each status becomes one group.
            COMPETITION_GROUPS.map(([group, label]) => {
              const members = competitions.filter((item) => item.status === group);
              return members.length ? h('optgroup', { key: group, label }, members.map((item) => h('option', { key: competitionValue(item), value: competitionValue(item) }, competitionLabel(item)))) : null;
            }))),
        // Each change reads page 1 again, combined with the competition and the search box; 只看开放 reads nothing.
        h('div', { className: 'pg-catalog-filters', role: 'group', 'aria-label': '筛选赛题' },
          h('label', { className: 'pg-filter' }, h('span', null, '来源'),
            h('select', { className: 'pg-input', 'aria-label': '按来源筛选', value: origin, onChange: (event) => { setOrigin(event.target.value); load({ origin: event.target.value }); } },
              ORIGIN_OPTIONS.map(([value, label]) => h('option', { key: value || 'all', value }, label)))),
          h('label', { className: 'pg-filter' }, h('span', null, '学科'),
            h('select', { className: 'pg-input', 'aria-label': '按学科筛选', value: disciplineChoice, onChange: (event) => {
              const value = event.target.value;
              setDisciplineChoice(value);
              if (value === OTHER_DISCIPLINE && !otherDiscipline.trim()) { setStatus('输入学科后按回车筛选'); return; }
              load({ discipline: value === OTHER_DISCIPLINE ? otherDiscipline.trim() : value });
            } },
              h('option', { value: '' }, '全部学科'),
              (facets?.top || []).map((key) => h('option', { key, value: key }, key)),
              h('option', { value: OTHER_DISCIPLINE }, '其他（输入学科）'))),
          disciplineChoice === OTHER_DISCIPLINE ? h('div', { className: 'pg-filter pg-filter-other' },
            h('label', { htmlFor: 'pg-other-discipline' }, '其他学科（英文学科名，精确匹配）'),
            h('div', { className: 'pg-filter-row' },
              h('input', { id: 'pg-other-discipline', className: 'pg-input', value: otherDiscipline, maxLength: 100, placeholder: '例如 science，按回车筛选',
                ...(facets?.otherKeys?.length ? { list: 'pg-other-discipline-keys' } : {}),
                onChange: (event) => setOtherDiscipline(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') applyOther(); } }),
              h('button', { type: 'button', className: 'pg-button', onClick: applyOther }, '筛选')),
            facets?.otherKeys?.length ? h('datalist', { id: 'pg-other-discipline-keys' }, facets.otherKeys.map((key) => h('option', { key, value: key }))) : null) : null,
          h('label', { className: 'pg-filter' }, h('span', null, '排序'),
            h('select', { className: 'pg-input', 'aria-label': '排序方式', value: sort, onChange: (event) => { setSort(event.target.value); load({ sort: event.target.value }); } },
              SORT_OPTIONS.map(([value, label]) => h('option', { key: value, value }, label)))),
          h('label', { className: 'pg-filter-check' },
            h('input', { type: 'checkbox', checked: openOnly, onChange: (event) => setOpenOnly(event.target.checked) }), '只看开放',
            h('span', { className: 'pg-note' }, '（仅筛选已加载的赛题）'))),
        selectedCompetition ? h('div', { className: 'pg-competition-info', role: 'group', 'aria-label': '比赛信息' },
          // Changing the period reads page 1 again with the other controls.
          periods.length ? h('label', { className: 'pg-filter' }, h('span', null, '分期'),
            h('select', { className: 'pg-input', 'aria-label': '选择分期', value: period, onChange: (event) => { setPeriod(event.target.value); load({ period: event.target.value }); } },
              h('option', { value: '' }, '全部期'),
              periods.map((item) => h('option', { key: item.slug, value: item.slug },
                [item.labelZh || item.slug, competitionStatusText(item.status), item.timeText || item.dateText].filter(Boolean).join(' · '))))) : null,
          h('p', { className: 'pg-note' }, h('span', { className: 'pg-badge', 'data-tone': COMPETITION_TONES[infoStatus] }, competitionStatusText(infoStatus)),
            ` ${infoTime}`,
            !selectedPeriod && selectedCompetition.rounds ? ` · 轮次：${selectedCompetition.rounds}` : ''),
          openWebButton(selectedPeriod ? selectedPeriod.webUrl : selectedCompetition.webUrl, infoName),
          // Some fixed ids could not be read: the list is short by that many. 重试 reads page 1 of the shown
          // list's own query, not edits made to the controls since; while a failed read shows its own 重试, this
          // one is left out.
          missing ? h('p', { className: 'pg-note pg-catalog-missing' }, `有 ${missing} 道赛题读取失败，列表不完整。`) : null,
          missing && !failure ? h('button', { type: 'button', className: 'pg-button', disabled: Boolean(busy) || otherPending, onClick: () => load(shownList.filters) }, '重试') : null) : null,
        notice ? h('p', { className: 'pg-note' }, notice) : null,
        failure ? h('div', { className: 'pg-catalog-failure' }, h('p', { className: 'pg-error', role: 'alert' }, failureText),
          h('button', { type: 'button', className: 'pg-button', disabled: Boolean(busy) || otherPending, onClick: retry }, '重试')) : null,
        startBlocked && challenges.length ? h('p', { className: 'pg-note' }, startBlocked) : null,
        busy === 'load' && !catalog ? h('p', { className: 'pg-note', role: 'status' }, '正在读取比赛和赛题…') : null,
        busy === 'load' && catalog && !shownList ? h('p', { className: 'pg-note' }, '正在读取所选比赛的赛题…') : null,
        shownList && !loaded.length ? h('p', { className: 'pg-note' }, '没有找到匹配赛题。换一个关键词或筛选条件试试。') : null,
        shownList && loaded.length && !challenges.length ? h('p', { className: 'pg-note' }, `已加载的赛题中没有开放的题。${canLoadMore ? '可以点“加载更多”继续查找。' : ''}`) : null,
        otherPending ? h('p', { className: 'pg-note pg-catalog-hint' }, '输入学科后按回车筛选') : null,
        countLine ? h('p', { className: 'pg-note pg-catalog-count', tabIndex: -1, ref: (node) => { latest.count = node; } }, countLine) : null,
        h('div', { className: 'pg-challenge-grid' }, challenges.map((item) => h('article', { className: 'pg-card pg-challenge', key: item.id },
          h('div', { className: 'pg-head' }, h('h3', null, item.titleZh || item.title || item.id), item.status ? h('span', { className: 'pg-badge', 'data-tone': statusTone(item.status) }, locales.zh.states[item.status] || item.status) : null),
          h('p', { className: 'pg-note pg-path' }, [item.discipline, item.origin, item.difficulty !== undefined ? `难度 ${item.difficulty}` : null].filter(Boolean).join(' · ') || 'Playground 赛题'),
          h('p', { className: 'pg-note' }, `题目编号：${item.id}${item.attempts !== undefined ? ` · 已有 ${item.attempts} 次提交` : ''}`),
          h('div', { className: 'pg-actions' },
            h(StartTaskButton, { id: item.id, title: item.titleZh || item.title || item.id, mode: 'participate', sessionId, requestTask, disabled: Boolean(startBlocked) }),
            h('button', { type: 'button', className: 'pg-button', 'aria-haspopup': 'dialog', 'aria-label': `查看详情：${item.titleZh || item.title || item.id}`, onClick: () => setDetail(item),
              ref: (node) => { if (node) latest.details.set(String(item.id), node); else latest.details.delete(String(item.id)); } }, '查看详情'),
            openWebButton(item.webUrl, item.titleZh || item.title || item.id))
        ))),
        // aria-disabled, not disabled, while a read runs: a disabled button would drop keyboard focus. loadMore
        // itself ignores a press while any read is running.
        canLoadMore ? h('button', { type: 'button', className: 'pg-button pg-load-more', 'aria-disabled': busy ? true : undefined, 'aria-busy': busy === 'more', onClick: loadMore,
          ref: (node) => { latest.more = node; } }, busy === 'more' ? '正在加载…' : '加载更多') : null,
        // Keyed by challenge, so opening another card (or reopening this one) mounts a fresh drawer that reads again.
        detail ? h(ChallengeDetailDrawer, { key: String(detail.id), challenge: detail, query, sessionId, requestTask, startBlocked, close: () => setDetail(null),
          focusFallback: () => latest.heading }) : null);
    }

    const challengeDetailCss = '.pg-detail-facts{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:12px 0;font-size:13px}.pg-detail-facts dt{color:var(--dsw-alias-label-secondary)}.pg-detail-facts dd{margin:0;overflow-wrap:anywhere}.pg-detail-section{margin-top:16px}.pg-detail-section h3{margin:0 0 6px;font-size:14px}.pg-detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.pg-detail-resources{margin:0;padding:0;list-style:none;display:grid;gap:8px}.pg-detail-resources li{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font-size:13px;overflow-wrap:anywhere}.pg-statement{box-sizing:border-box;max-height:min(60vh,520px);overflow:auto;margin:8px 0 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:1.7}';

    // What Tab can reach inside a drawer; elements without a box (a closed <details>, display:none) are skipped.
    const tabbableSelector = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
    function tabbables(container) {
      return [...(container.querySelectorAll?.(tabbableSelector) || [])].filter((node) => typeof node.getClientRects !== 'function' || node.getClientRects().length > 0);
    }

    // Node.compareDocumentPosition bits: the other node comes before, or after, the reference node.
    const DOCUMENT_POSITION_PRECEDING = 2;
    const DOCUMENT_POSITION_FOLLOWING = 4;

    // Keyboard focus for a modal drawer. Mounting moves focus to the drawer's title (tabIndex -1), Tab and Shift+Tab
    // cycle inside the drawer, and Escape calls the newest `focus.dismiss`. `focus.restore` gives focus back to the
    // element that had it when the drawer first rendered (the button that opened it) if that is still in the page,
    // else to the first connected node `fallback()` returns (one node or a list). Every close from inside the drawer
    // restores first, so the workspace dialog or a navigation that follows takes focus from there. A drawer its
    // parent removes restores only when focus was lost with it; when the whole panel is gone, no target is
    // connected and nothing is focused.
    // The keydown listener is on the document, so it acts only on keys that belong to this drawer: never on a key
    // pressed inside another dialog (a host prompt above the drawer) or one a handler already took, and on Tab and
    // Escape only while the drawer is displayed and focus is inside it or nowhere (body). A drawer left mounted in a
    // hidden workbench, or focus the host moved elsewhere, leaves both keys to the browser and the host: no close
    // and no focus move.
    function useDrawerFocus(fallback) {
      const [focus] = React.useState(() => ({ opener: typeof document === 'undefined' ? null : document.activeElement, dialog: null, title: null, restored: false, dismiss: () => {} }));
      focus.fallback = fallback;
      focus.restore = () => {
        if (focus.restored) return;
        focus.restored = true;
        // `body` is not a place to return to: a drawer opened while nothing had focus uses the fallback.
        const body = typeof document === 'undefined' ? undefined : document.body;
        [focus.opener, focus.fallback?.()].flat().find((node) => node && node !== body && node.isConnected)?.focus?.();
      };
      React.useEffect(() => {
        focus.restored = false;
        focus.title?.focus?.();
        // A dialog around `target` that is not this drawer and not inside it.
        const inForeignDialog = (target) => {
          const owner = target?.closest?.('[aria-modal="true"],[role="dialog"],[role="alertdialog"],dialog');
          return Boolean(owner && owner !== focus.dialog && !focus.dialog?.contains?.(owner));
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape' && event.key !== 'Tab') return;
          if (event.defaultPrevented || inForeignDialog(event.target)) return;
          if (typeof focus.dialog?.getClientRects === 'function' && !focus.dialog.getClientRects().length) return;
          const active = document.activeElement;
          const inside = Boolean(active && focus.dialog?.contains?.(active));
          if (!inside && active && active !== document.body) return;
          if (event.key === 'Escape') { focus.dismiss(); return; }
          if (!focus.dialog) return;
          const items = tabbables(focus.dialog);
          // Wrap by document position, so focus on an element Tab does not stop at (the title, the history list or
          // heading at the end) wraps too: Tab when no item follows it, Shift+Tab when none precedes it.
          const bit = event.shiftKey ? DOCUMENT_POSITION_PRECEDING : DOCUMENT_POSITION_FOLLOWING;
          const wrap = !items.length || !inside || !items.some((node) => node !== active && (active.compareDocumentPosition?.(node) & bit));
          if (!wrap) return;
          event.preventDefault?.();
          (items.length ? (event.shiftKey ? items.at(-1) : items[0]) : focus.title)?.focus?.();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          const active = document.activeElement;
          if (!active || active === document.body) focus.restore();
        };
      }, []);
      return focus;
    }

    // Right-side drawer for one catalog challenge. It reads the detail once when it opens, through the
    // session-free query service, so opening it writes nothing into any conversation. Closing aborts the read.
    function ChallengeDetailDrawer({ challenge, query, sessionId, requestTask, startBlocked, close, focusFallback }) {
      const [detail, setDetail] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [failed, setFailed] = React.useState(false);
      const [expanded, setExpanded] = React.useState(false);
      const [status, setStatus] = React.useState('');
      // Mutable holder (not render state): only the newest read may update the drawer, and none after closing.
      const [latest] = React.useState(() => ({ controller: null, closed: false }));
      const challengeId = String(challenge.id);
      const load = async () => {
        latest.controller?.abort();
        if (latest.closed) return;
        const controller = new AbortController();
        latest.controller = controller;
        setBusy(true); setFailed(false); setStatus('正在读取赛题详情…');
        try {
          const result = await query({ action: 'challenge', challengeId }, controller.signal);
          if (latest.controller !== controller) return;
          if (!result || typeof result !== 'object' || result.ok === false) throw new Error('challenge detail unavailable');
          setDetail(result); setStatus('赛题详情已读取。');
        } catch {
          if (latest.controller !== controller) return;
          // Fixed text: the thrown message may come from the platform and is never shown here.
          setFailed(true); setStatus('赛题详情读取失败。');
        } finally {
          if (latest.controller === controller) { latest.controller = null; setBusy(false); }
        }
      };
      const focus = useDrawerFocus(focusFallback);
      const dismiss = () => {
        latest.closed = true;
        latest.controller?.abort();
        latest.controller = null;
        focus.restore();
        close();
      };
      // The Escape listener calls through the holder, so it subscribes once even though `close` changes per render.
      focus.dismiss = dismiss;
      React.useEffect(() => {
        latest.closed = false;
        load();
        return () => { latest.closed = true; latest.controller?.abort(); latest.controller = null; };
      }, [query, challengeId]);
      const shown = detail || challenge;
      const title = shown.titleZh || shown.title || challengeId;
      const facts = [['方向', shown.discipline], ['来源', shown.origin], ['难度', shown.difficulty],
        ['状态', shown.status ? locales.zh.states[shown.status] || shown.status : undefined], ['提交次数', shown.attempts]]
        .filter(([, value]) => value !== undefined && value !== null && value !== '');
      // Deduplicated here too: before the read settles the tags come from the catalog card, and each tag is a key.
      const tags = Array.isArray(shown.tags) ? [...new Set(shown.tags.filter((tag) => typeof tag === 'string' && tag))] : [];
      const resources = Array.isArray(detail?.resources) ? detail.resources.filter((item) => item && typeof item === 'object') : [];
      const content = typeof detail?.content === 'string' ? detail.content : '';
      // Starting goes through the shared workspace dialog; the drawer closes so the dialog is the only modal.
      const startTask = (request) => { dismiss(); requestTask(request); };
      return h('div', { className: 'pg-drawer-backdrop', onMouseDown: dismiss },
        h('aside', { className: 'pg-drawer', role: 'dialog', 'aria-modal': true, 'aria-label': `${title} 赛题详情`, 'aria-busy': busy, onMouseDown: (event) => event.stopPropagation(), ref: (node) => { focus.dialog = node; } },
          h('style', null, challengeDetailCss),
          h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status),
          h('div', { className: 'pg-drawer-header' },
            h('div', { className: 'pg-drawer-heading' }, h('p', { className: 'pg-eyebrow' }, '赛题详情'), h('h2', { className: 'pg-drawer-title', tabIndex: -1, ref: (node) => { focus.title = node; } }, title)),
            h('div', { className: 'pg-drawer-actions' },
              h('button', { type: 'button', className: 'pg-button pg-drawer-close', onClick: dismiss, 'aria-label': '关闭赛题详情' }, '关闭'))),
          h('p', { className: 'pg-note pg-path' }, `题目编号：${challengeId}`),
          facts.length ? h('dl', { className: 'pg-detail-facts' }, facts.flatMap(([label, value]) => [h('dt', { key: `${label}-t` }, label), h('dd', { key: `${label}-d` }, String(value))])) : null,
          tags.length ? h('ul', { className: 'pg-detail-tags', 'aria-label': '标签' }, tags.map((tag) => h('li', { key: tag, className: 'pg-badge' }, tag))) : null,
          h('div', { className: 'pg-actions' },
            h(StartTaskButton, { id: challengeId, title, mode: 'participate', sessionId, requestTask: startTask, disabled: Boolean(startBlocked) }),
            openWebButton(detail?.webUrl || challenge.webUrl, title)),
          startBlocked ? h('p', { className: 'pg-note' }, startBlocked) : null,
          failed ? h('div', { className: 'pg-detail-section' },
            h('p', { className: 'pg-error', role: 'alert' }, '赛题详情读取失败，请稍后重试，或在网页中查看。'),
            h('div', { className: 'pg-actions' }, h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: () => load() }, busy ? '正在读取…' : '重试'))) : null,
          busy && !detail && !failed ? h('p', { className: 'pg-note' }, '正在读取赛题详情…') : null,
          detail ? h('section', { className: 'pg-detail-section', 'aria-label': '资源' },
            h('h3', null, '资源'),
            resources.length ? h('ul', { className: 'pg-detail-resources' }, resources.map((item, index) => h('li', { key: `${index}:${item.name || ''}` },
              h('strong', null, item.name || '未命名资源'),
              [item.kind, item.role].filter(Boolean).length ? h('span', { className: 'pg-note' }, ` · ${[item.kind, item.role].filter(Boolean).join(' · ')}`) : null,
              item.description ? h('p', { className: 'pg-note' }, item.description) : null,
              // Platform text, shown as text only: never a link.
              item.source ? h('p', { className: 'pg-note pg-path' }, `来源：${item.source}`) : null)))
              : h('p', { className: 'pg-note' }, '这道题没有列出资源。')) : null,
          detail ? h('section', { className: 'pg-detail-section', 'aria-label': '题面' },
            h('h3', null, '题面'),
            detail.contentGated ? h('p', { className: 'pg-note' }, '题面需要权限，请在网页中查看')
              : !content ? h('p', { className: 'pg-note' }, '这道题没有题面文字。')
              : [h('button', { key: 'toggle', type: 'button', className: 'pg-button', 'aria-expanded': expanded, onClick: () => setExpanded(!expanded) }, expanded ? '收起题面' : '展开题面'),
                // Plain text with its line breaks kept; the plugin has no markdown renderer.
                expanded ? h('pre', { key: 'statement', className: 'pg-statement', tabIndex: 0, 'aria-label': '题面全文' }, content) : null,
                // The number comes from the Host's cap (`contentLimit`); without it the note names no number.
                expanded && detail.truncated ? h('p', { key: 'truncated', className: 'pg-note' }, Number.isSafeInteger(detail.contentLimit) && detail.contentLimit > 0
                  ? `题面超过 ${detail.contentLimit} 字，这里只显示前 ${detail.contentLimit} 字；完整题面请在网页中查看。`
                  : '题面过长，这里只显示前一部分；完整题面请在网页中查看。') : null]) : null));
    }

    // Two sibling buttons, never nested: the main area selects the task and opens its drawer;
    // "打开对话" switches to the task's DSH conversation without opening the drawer.
    function TaskSummaryRow({ session, attempts, selected, onSelect, onOpen, selectRef }) {
      const state = session.projectionValues?.playgroundTask || {};
      const task = state.task;
      const receipt = withLatestAttempt(state.receipt, attempts?.[receiptAttemptId(state.receipt)]);
      const progress = receiptProgress(receipt, zhText, { running: session.running });
      const title = task?.title || session.displayTitle?.replace(/^Playground · /, '') || 'Playground 任务';
      const challengeId = task?.challengeId || '赛题待读取';
      const stage = receipt || task || session.running ? progress.stageText : '状态待读取';
      const updatedAt = session.updatedAt || session.lastActivityAt || session.createdAt;
      const updated = updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '暂无时间';
      return h('div', { className: `pg-task-row${selected ? ' is-selected' : ''}`, role: 'listitem' },
        h('button', { type: 'button', className: 'pg-task-row-select', onClick: onSelect, 'aria-pressed': selected, ref: selectRef },
          h('span', { className: 'pg-task-row-main' },
            h('strong', null, title),
            h('span', { className: 'pg-task-row-meta' }, challengeId, ' · ', stage)),
          h('span', { className: 'pg-task-row-side' },
            h('span', { className: 'pg-badge', 'data-tone': progress.badgeTone }, progress.badgeText),
            h('span', { className: 'pg-task-row-score' }, progress.scoreText),
            h('span', { className: 'pg-task-row-updated' }, updated))),
        h('button', { type: 'button', className: 'pg-task-row-open', onClick: onOpen, 'aria-label': `打开对话：${title}` }, '打开对话'));
    }

    // Mirrors taskAttemptIds in lib/workflow.js: projections persisted without attemptIds derive it from the receipt.
    function taskAttemptIds(state) {
      const ids = Array.isArray(state?.attemptIds) ? state.attemptIds : [state?.receipt?.attemptId];
      return ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    }

    // Every submission of the current account for this challenge, including CLI or other-tool submissions.
    // Read through the session-free query service, so opening the drawer writes nothing into a conversation.
    // `attempts` is the workbench store of refreshed submissions; it is only read here, never polled.
    // `bundleMissingIds` are the submissions whose bundle this task's receipts say never arrived.
    // `closedIds` are the task's submissions its receipts or the store show closed as "bundle missing".
    function AttemptHistory({ challengeId, attemptIds, bundleMissingIds = [], closedIds = [], attempts, query, t }) {
      const [history, setHistory] = React.useState({ items: [], nextCursor: null, loaded: false });
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [signedOut, setSignedOut] = React.useState(false);
      const [status, setStatus] = React.useState('');
      // Mutable holder (not render state): only the newest request may update the list; `list` and `heading` are focus targets.
      // `refocus` is set by "重试": its button disappears once a read succeeds, so focus must move into the section.
      const [latest] = React.useState(() => ({ controller: null, list: null, heading: null, refocus: false }));
      // An empty or signed-out result renders no list, so focus goes to the always-present heading.
      const refocusHeading = () => { if (latest.refocus) { latest.refocus = false; latest.heading?.focus?.(); } };
      // The error stays visible until the next read settles, so "重试" keeps its place (and focus) while it runs.
      const load = async (cursor) => {
        latest.controller?.abort();
        const controller = new AbortController();
        latest.controller = controller;
        setBusy(true); setStatus('正在读取提交历史…');
        try {
          const result = await query({ action: 'my_attempts', challengeId, limit: 50, ...(cursor ? { cursor } : {}) }, controller.signal);
          if (latest.controller !== controller) return;
          if (result?.ok === false) {
            if (result.error?.code === 'authentication_required') {
              setSignedOut(true); setError(''); setHistory({ items: [], nextCursor: null, loaded: true }); setStatus('登录后可查看提交历史。');
              refocusHeading();
            } else {
              // "重试" stays rendered and keeps focus; the status changes so a repeated failure is still announced.
              latest.refocus = false;
              setError(safeMessage(result.error?.message) || '提交历史读取失败，请重试。'); setStatus('提交历史读取失败。');
            }
            return;
          }
          // One row per attempt id, across pages and within a page; the first occurrence wins.
          const items = cursor ? [...history.items] : [];
          const seen = new Set(items.map((item) => item.id));
          for (const item of Array.isArray(result?.items) ? result.items : []) {
            if (!item || typeof item !== 'object' || seen.has(item.id)) continue;
            seen.add(item.id);
            items.push(item);
          }
          const nextCursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null;
          setSignedOut(false); setError('');
          setHistory({ items, nextCursor, loaded: true });
          setStatus(items.length ? `已加载 ${items.length} 条提交` : '这道题还没有提交记录。');
          // The last page removes "加载更多"; move focus to the list instead of letting it fall back to the page.
          if (cursor && !nextCursor) latest.list?.focus?.();
          // After "重试" a non-empty list takes focus when it attaches (see the `ul` ref).
          if (!items.length) refocusHeading();
        } catch (failure) {
          if (latest.controller !== controller) return;
          latest.refocus = false;
          setError(failure.message); setStatus('提交历史读取失败。');
        } finally {
          if (latest.controller === controller) { latest.controller = null; setBusy(false); }
        }
      };
      React.useEffect(() => {
        load();
        return () => { latest.controller?.abort(); latest.controller = null; };
      }, [query, challengeId]);
      const time = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
      const items = [...history.items].sort((a, b) => (time(b.createdAt) - time(a.createdAt)) || ((Number(b.id) || 0) - (Number(a.id) || 0)));
      const linked = new Set(attemptIds);
      const missing = new Set(bundleMissingIds);
      return h('section', { className: 'pg-guide pg-history', 'aria-label': '提交历史', 'aria-busy': busy },
        h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status),
        h('h3', { className: 'pg-brand', tabIndex: -1, ref: (node) => { latest.heading = node; } }, '提交历史'),
        h('p', { className: 'pg-note' }, '当前账号在这道题上的全部提交，从新到旧排列；包括在终端或其他工具中完成的提交。'),
        signedOut ? h('p', { className: 'pg-note' }, '登录后可查看提交历史。关闭任务详情后，在“Playground 连接状态”中登录。') : null,
        error ? h('p', { className: 'pg-error', role: 'alert' }, error) : null,
        error && !items.length ? h('div', { className: 'pg-actions' },
          h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: () => { latest.refocus = true; return load(); } }, busy ? '正在读取…' : '重试')) : null,
        busy && !history.loaded ? h('p', { className: 'pg-note' }, '正在读取提交历史…') : null,
        history.loaded && !signedOut && !items.length && !error ? h('p', { className: 'pg-note' }, '这道题还没有提交记录。') : null,
        items.length ? h('ul', { className: 'pg-list', 'aria-label': '提交历史列表', tabIndex: -1, ref: (node) => {
          latest.list = node;
          if (node && latest.refocus) { latest.refocus = false; node.focus?.(); }
        } }, items.map((item) => {
          // Same stage, badge and score rules as the task row and the drawer summary; `running` describes
          // the conversation, not this attempt, so it is not passed.
          const progress = receiptProgress(withSettledAttempt(item, attempts?.[Number(item.id)], { closed: closedIds.includes(Number(item.id)) }), t, { bundleMissing: missing.has(Number(item.id)) });
          const created = Number.isFinite(Date.parse(item.createdAt))
            ? new Date(item.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '提交时间未知';
          const own = linked.has(Number(item.id));
          return h('li', { key: item.id, className: 'pg-row' },
            h('div', { className: 'pg-row-main' }, `提交 #${item.id ?? '—'}`,
              h('div', { className: 'pg-row-sub' }, created, ' · ', progress.stageText, ' · ', progress.scoreText)),
            h('div', { className: 'pg-history-side' },
              h('span', { className: 'pg-badge', 'data-tone': progress.badgeTone }, progress.badgeText),
              h('span', { className: 'pg-badge', 'data-tone': own ? 'success' : 'neutral' }, own ? '本对话' : '未关联到对话')));
        })) : null,
        history.nextCursor && !signedOut ? h('div', { className: 'pg-actions' },
          h('button', { type: 'button', className: 'pg-button', disabled: busy, onClick: () => load(history.nextCursor) }, busy ? '正在读取…' : '加载更多')) : null);
    }

    // DSH's own conversation archive: hidden from the sidebar and the task overview, restorable, content kept.
    // `archive` is undefined when this DSH does not report its archive set; the control is then not shown.
    function TaskArchiveControl({ session, archive }) {
      if (!archive) return null;
      const busy = archive.busy === session.id;
      const archived = Boolean(archive.archived);
      // Why "归档任务" is unavailable. Archiving the conversation in DSH's main view makes DSH clear that view
      // and leave this panel, which would close the workbench before "撤销" could be seen.
      const notes = archived ? [] : [
        session.running ? ['pg-archive-running', '对话正在运行，停止后再归档。'] : null,
        (session.retainedBy?.mainView ?? 0) > 0 ? ['pg-archive-main-view', '这是 DSH 当前打开的对话，请先在侧边栏切换到其他对话再归档。'] : null,
      ].filter(Boolean);
      return h('div', { className: 'pg-actions pg-archive' },
        archived ? h('span', { className: 'pg-badge', 'data-tone': 'neutral' }, '已归档') : null,
        // One button for both directions, so it stays mounted and keeps keyboard focus when its label changes.
        // While a change is in flight it is aria-disabled instead of disabled, which would drop focus.
        h('button', { type: 'button', className: `pg-button ${archived ? 'pg-unarchive' : 'pg-archive-button'}`, disabled: notes.length > 0,
          'aria-disabled': archive.busy ? true : undefined, 'aria-describedby': notes.length ? notes.map(([id]) => id).join(' ') : undefined,
          onClick: () => { if (!archive.busy) archive.change(session.id, !archived); } },
        busy ? (archived ? '正在撤销…' : '正在归档…') : archived ? '撤销' : '归档任务'),
        ...notes.map(([id, note]) => h('span', { key: id, id, className: 'pg-note' }, note)),
        archive.error ? h('p', { className: 'pg-note pg-error pg-archive-error', role: 'alert' }, archive.error) : null);
    }

    function ArchivedTaskRow({ session, archive, buttonRef }) {
      const title = session.projectionValues?.playgroundTask?.task?.title || session.displayTitle?.replace(/^Playground · /, '') || 'Playground 任务';
      // aria-disabled while a change is in flight, as in the drawer: the pressed button keeps focus, and after a
      // failure it is still there with focus. The workbench moves focus on after a success removes the row.
      return h('div', { className: 'pg-task-row pg-archived-row', role: 'listitem' },
        h('span', { className: 'pg-archived-title' }, title),
        h('button', { type: 'button', className: 'pg-task-row-open pg-unarchive', 'aria-disabled': archive.busy ? true : undefined, 'aria-label': `取消归档：${title}`, ref: buttonRef,
          onClick: () => { if (!archive.busy) archive.change(session.id, false, { fromList: true }); } }, archive.busy === session.id ? '正在取消…' : '取消归档'));
    }

    function TaskDetailDrawer({ session, projection, close, query, webBase, archive, focusFallback, ...props }) {
      const focus = useDrawerFocus(focusFallback);
      // Every way out of the drawer gives focus back first; Escape calls through the holder.
      const dismiss = () => { focus.restore(); close(); };
      focus.dismiss = dismiss;
      const state = session?.projectionValues?.playgroundTask || {};
      const title = state.task?.title || session.displayTitle?.replace(/^Playground · /, '') || 'Playground 任务';
      // Prefer the freshly refreshed projection for attribution; the catalog value may lag behind.
      const current = (projection?.state === 'ready' && projection.values?.playgroundTask) || state;
      const historyChallenge = current.task?.challengeId || state.task?.challengeId;
      const attemptIds = taskAttemptIds(current);
      // The task's receipt with its refreshed platform state, as the task row and the drawer summary show it.
      const latestReceipt = withLatestAttempt(current.receipt, props.attempts?.[receiptAttemptId(current.receipt)]);
      // Every submission of the task shown closed as "bundle missing": by a receipt the task recorded
      // (bundleClosedIds, kept after newer receipts), by its latest receipt with the refreshed state laid
      // over it, or by a refreshed entry in the workbench store.
      const closedIds = [...new Set([
        ...(Array.isArray(current.bundleClosedIds) ? current.bundleClosedIds.map(Number) : []),
        ...(latestReceipt?.bundleNotReceived === true ? [receiptAttemptId(latestReceipt)] : []),
        ...attemptIds.filter((id) => props.attempts?.[id]?.attempt?.bundleNotReceived === true),
      ])].filter((id) => Number.isSafeInteger(id) && id > 0);
      const openWeb = openWebButton(taskWebUrl(current.task?.challengeId ? current.task : state.task, webBase), title);
      const archived = Boolean(archive?.archived);
      return h('div', { className: 'pg-drawer-backdrop', onMouseDown: dismiss },
        h('aside', { className: 'pg-drawer', role: 'dialog', 'aria-modal': true, 'aria-label': `${title} 任务详情`, onMouseDown: (event) => event.stopPropagation(), ref: (node) => { focus.dialog = node; } },
          h('div', { className: 'pg-drawer-header' },
            h('div', { className: 'pg-drawer-heading' }, h('p', { className: 'pg-eyebrow' }, '任务详情'), h('h2', { className: 'pg-drawer-title', tabIndex: -1, ref: (node) => { focus.title = node; } }, title)),
            h('div', { className: 'pg-drawer-actions' },
              // Close after starting navigation so a workbench the host keeps mounted does not come back
              // to an open modal drawer whose Escape listener is still attached. Navigation is deferred, so
              // focus is back on the task row before the conversation opens.
              // DSH does not open an archived conversation, so its drawer offers no way there.
              archived ? null : h('button', { type: 'button', className: 'pg-button pg-drawer-open', onClick: () => { props.openConversation(session.id); dismiss(); }, 'aria-label': `打开任务对话：${title}` }, '打开任务对话'),
              h('button', { type: 'button', className: 'pg-button pg-drawer-close', onClick: dismiss, 'aria-label': '关闭任务详情' }, '关闭'))),
          h('p', { className: 'pg-note pg-path' }, state.task?.challengeId ? `赛题 ${state.task.challengeId}` : '赛题信息待读取'),
          openWeb ? h('div', { className: 'pg-actions' }, openWeb) : null,
          h(TaskArchiveControl, { session, archive }),
          // An archived task is read-only here: its state and history, without the check and confirm controls,
          // which would act on a conversation DSH has archived.
          archived ? h('p', { className: 'pg-note pg-archived-note' }, '此任务已归档。DSH 不会打开已归档的对话；撤销后才能继续检查材料和确认提交。')
            : h(SelectedTask, { key: session.id, session, projection, ...props }),
          // The newest attributed id and the receipt's confirmation stamp are part of the key: a submission
          // confirmed in this drawer, including a re-upload under the same id, remounts the list and reloads
          // page one. "查询结果" keeps the stamp, so a results query does not remount it or drop loaded pages.
          historyChallenge && query ? h(AttemptHistory, { key: `${session.id}:${historyChallenge}:${attemptIds.at(-1) ?? ''}:${current.receipt?.confirmedAt ?? ''}`, challengeId: historyChallenge, attemptIds, bundleMissingIds: taskBundleMissingIds(current), closedIds, attempts: props.attempts, query, t: props.t }) : null));
    }

    function PlaygroundWorkbench({ useSessions, useSessionAccess, refreshProjections, openTask, openChat, run, query, requestTask, login, saveToken, clearToken, useWorkspaces, archiveTask, unarchiveTask, ...props }) {
      const catalog = useSessions((state) => state);
      // DSH's archive set lives on the workspace list snapshot. Without it nothing counts as archived and
      // the archive controls stay hidden.
      const archivedIds = typeof useWorkspaces === 'function' ? useWorkspaces((value) => value?.archivedSessionIds) : undefined;
      const archiveAvailable = Array.isArray(archivedIds);
      const archivedSet = new Set(archiveAvailable ? archivedIds : []);
      const sessions = catalog.ids.map((id) => catalog.byId[id]).filter((session) => !session.parentId);
      const sourceSession = sessions.find((session) => (session.retainedBy?.mainView ?? 0) > 0) || sessions[0];
      const allTaskSessions = sessions.filter((session) => session.projectionValues?.playgroundTask?.task || session.displayTitle?.startsWith('Playground · '));
      // Everything below counts, refreshes and selects by default from the tasks that are not archived.
      const taskSessions = allTaskSessions.filter((session) => !archivedSet.has(session.id));
      const archivedTasks = allTaskSessions.filter((session) => archivedSet.has(session.id));
      const [selected, setSelected] = React.useState(() => taskSessions.find((session) => (session.retainedBy?.mainView ?? 0) > 0)?.id || taskSessions[0]?.id || '');
      const [showArchived, setShowArchived] = React.useState(false);
      // Id of the conversation whose archive change is in flight, and the last failure with the conversation
      // it belongs to: a drawer shows only its own task's failure.
      const [archiveBusy, setArchiveBusy] = React.useState('');
      const [archiveError, setArchiveError] = React.useState(noArchiveError);
      const [split, setSplit] = React.useState(50);
      const [announcement, setAnnouncement] = React.useState('');
      const [drawerOpen, setDrawerOpen] = React.useState(false);
      // Focus targets from callback refs: each task row's main button and each archived row's 取消归档 by id, the
      // archived-list toggle and the 任务总览 heading. `restored` is a successful 取消归档 from the archived list whose
      // focus move is still due: { id, next, previous } with the archived rows around it when it was pressed.
      const [nav] = React.useState(() => ({ rows: new Map(), archived: new Map(), toggle: null, heading: null, restored: null }));
      const refInto = (map, id) => (node) => { if (node) map.set(id, node); else map.delete(id); };
      // Web root reported by the latest catalog read; only tasks recorded without webUrl or baseUrl use it.
      const [webBase, setWebBase] = React.useState('');
      const [openError, setOpenError] = React.useState('');
      // Latest platform state of each task's submission. Mutable holder plus a version counter: it lives
      // in memory only and never reaches a session projection, so refreshing writes no conversation record.
      const [, setVersion] = React.useState(0);
      const [store] = React.useState(() => {
        const holder = { attempts: {}, refreshedAt: undefined, failed: false, partial: false, controller: null, disposed: false, startedAt: undefined,
          version: 0, query: null, pendingIds: [], taskIds: [], receipts: new Map() };
        holder.publish = () => setVersion(++holder.version);
        return holder;
      });
      const receiptsById = new Map();
      for (const item of taskSessions) {
        const receipt = item.projectionValues?.playgroundTask?.receipt;
        const id = receiptAttemptId(receipt);
        if (id !== undefined && !receiptsById.has(id)) receiptsById.set(id, receipt);
      }
      const taskIds = [...receiptsById.keys()];
      const pendingIds = taskIds.filter((id) => taskSessions.some((item) => {
        const receipt = item.projectionValues?.playgroundTask?.receipt;
        return receiptAttemptId(receipt) === id && receiptPending(withLatestAttempt(receipt, store.attempts[id]));
      }));
      const anyPending = pendingIds.length > 0;
      // The timers and listeners below read these at call time. Declared first, so they are current
      // when the mount and polling effects run.
      React.useEffect(() => { store.query = query; store.taskIds = taskIds; store.pendingIds = pendingIds; store.receipts = receiptsById; });
      const pageVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
      // Opening the workbench reads the pending submissions once. A mount that follows a cleanup, as in
      // StrictMode, starts over.
      React.useEffect(() => {
        store.disposed = false;
        if (pageVisible()) refreshAttempts(store, store.pendingIds);
        return () => { store.disposed = true; store.controller?.abort(); store.controller = null; };
      }, []);
      // While any submission is unscored: every two minutes, and when the page becomes visible again unless a
      // round began in the last 30 seconds. It depends on whether anything is pending, not on which ids, so a
      // task finishing neither requests again nor resets the timer. The ids are read when a round starts.
      React.useEffect(() => {
        if (!anyPending) return undefined;
        const tick = () => { if (pageVisible()) refreshAttempts(store, store.pendingIds); };
        const onVisibility = () => { if (store.startedAt === undefined || Date.now() - store.startedAt >= visibleRefreshGapMs) tick(); };
        // Pending submissions that appear before any round has run (a list that loaded after mounting).
        if (store.startedAt === undefined) tick();
        const timer = setInterval(tick, attemptRefreshMs);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
        return () => {
          clearInterval(timer);
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [anyPending]);
      const refreshing = Boolean(store.controller);
      // A task archived from its open drawer stays selected so the drawer can offer "撤销"; once the drawer
      // is closed, the selection moves back to a task that is not archived.
      React.useEffect(() => {
        if (selected && !allTaskSessions.some((session) => session.id === selected)) { setSelected(taskSessions[0]?.id || ''); setDrawerOpen(false); }
        else if (!drawerOpen && archivedSet.has(selected)) setSelected(taskSessions[0]?.id || '');
      }, [selected, drawerOpen, allTaskSessions.map((session) => session.id).join(','), archivedTasks.map((session) => session.id).join(',')]);
      // After 取消归档 in the archived list. While DSH's archive set still holds the task its row and button stay, with
      // focus. Once it is gone: the restored task's row, else the archived row after it (or before it, for the last),
      // else the archived-list toggle, else the 任务总览 heading (the toggle is gone with the last archived task).
      // Focus the user moved elsewhere in the meantime is left alone. The move expires `unarchiveFocusMs` after the
      // change succeeded: DSH normally publishes its archive set at once, and a move much later would pull focus away
      // from whatever the user does by then (a click on empty space also leaves focus on body). After expiry focus
      // stays where it is, as without the move. The window uses the monotonic `performance.now()`, so a system clock
      // adjustment neither stretches nor cuts it.
      React.useEffect(() => {
        const pending = nav.restored;
        if (!pending) return;
        if (performance.now() - pending.at > unarchiveFocusMs) { nav.restored = null; return; }
        if (archivedSet.has(pending.id)) return;
        nav.restored = null;
        const active = typeof document === 'undefined' ? undefined : document.activeElement;
        if (active && active !== document.body && active.isConnected !== false) return;
        [nav.rows.get(pending.id), nav.archived.get(pending.next), nav.archived.get(pending.previous), nav.toggle, nav.heading].find(Boolean)?.focus?.();
      });
      const session = (archivedSet.has(selected) && !drawerOpen ? undefined : catalog.byId[selected]) || taskSessions[0];
      // "归档任务", "撤销" and "取消归档". No confirmation: the conversation can be restored. The actions report
      // failures as a short message and never throw; the catch only covers a host that throws anyway.
      // `fromList` marks 取消归档 in the archived list: a success removes that row and its button, so focus moves to
      // the restored task's row (see the effect below). The drawer's single button stays and keeps focus itself.
      const toggleArchive = (id, archive, { fromList = false } = {}) => {
        if (archiveBusy) return undefined;
        setArchiveBusy(id);
        setArchiveError(noArchiveError);
        setAnnouncement('');
        nav.restored = null;
        const order = archivedTasks.map((item) => item.id);
        const index = order.indexOf(id);
        const neighbours = { next: order[index + 1], previous: order[index - 1] };
        return Promise.resolve().then(() => (archive ? archiveTask : unarchiveTask)(id)).catch(() => ({ ok: false, message: archive ? '归档未完成，请重试。' : '取消归档未完成，请重试。' }))
          .then((result) => {
            setArchiveBusy('');
            if (result?.ok === false) { setArchiveError({ id, message: result.message }); setAnnouncement(result.message); }
            else {
              setAnnouncement(archive ? '任务已归档' : '任务已取消归档');
              if (fromList && !archive) nav.restored = { id, ...neighbours, at: performance.now() };
            }
          });
      };
      const archive = archiveAvailable ? { busy: archiveBusy, change: toggleArchive } : undefined;
      // Selecting another task or closing the drawer drops the last failure.
      const closeDrawer = () => { setDrawerOpen(false); setArchiveError(noArchiveError); };
      // DSH does not open archived conversations: the header skips an archived selection.
      const openable = session && !archivedSet.has(session.id) ? session : taskSessions[0];
      // The row's "打开对话" and the drawer's "打开任务对话": a failed navigation is reported, not left unhandled.
      // Navigation is deferred so a synchronous throw is caught too and the caller (the drawer's close) always continues.
      // Both messages are cleared first, so a repeated failure changes the live region again and a success leaves no stale note.
      const openConversation = (id) => {
        setAnnouncement('');
        setOpenError('');
        return Promise.resolve().then(() => openTask(id)).catch((failure) => {
          console.warn('Playground: failed to open the task conversation', failure);
          setAnnouncement('无法打开任务对话，请重试。');
          setOpenError('无法打开任务对话，请重试。');
        });
      };
      const sourceAllowed = useSessionAccess(sourceSession?.id || '', 'commands/execute');
      return h('main', { className: 'pg-workbench', 'aria-label': 'Playground 工作台' },
        h('style', null, css + '.pg-workbench{box-sizing:border-box;min-width:0;width:100%;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 24px) 24px 32px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.pg-workbench-inner{max-width:1180px;margin:0 auto}.pg-workbench h1{font-size:22px;margin:0}.pg-workbench .pg-toolbar{margin:20px 0;display:grid;gap:8px}.pg-search{display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,1fr);gap:8px;margin-top:14px}.pg-competition-info{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:10px}.pg-competition-info .pg-note{flex:1 1 280px;min-width:0;margin:0;overflow-wrap:anywhere}.pg-catalog-filters{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 10px;margin-top:10px}.pg-filter{display:grid;gap:4px;flex:1 1 130px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-filter .pg-input{width:100%;min-width:0;box-sizing:border-box}.pg-filter-other{flex:2 1 240px}.pg-filter-row{display:flex;gap:6px;min-width:0}.pg-filter-row .pg-input{flex:1 1 auto}.pg-filter-check{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;flex:1 1 150px;min-height:32px;font-size:12px}.pg-filter-check .pg-note{margin:0;font-size:11px}.pg-catalog-count{margin:10px 0 0;overflow-wrap:anywhere}.pg-catalog-failure{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px}.pg-catalog-failure .pg-error{flex:1 1 220px;margin:0}.pg-load-more{display:block;margin:12px auto 0}.pg-workbench .pg-guide{padding:20px}.pg-workbench-grid{display:grid;gap:12px;align-items:start;margin-top:12px}.pg-workbench-column{min-width:0}.pg-column-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;padding:0 2px}.pg-column-heading h2{font-size:14px;line-height:1.4}.pg-refresh-controls{display:flex;align-items:center;gap:8px}.pg-refresh{min-height:32px;padding:5px 10px}.pg-refresh-status{margin:0 2px 8px}.pg-task-empty{padding:20px 14px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}.pg-task-list{display:grid;gap:6px}.pg-task-row{width:100%;min-width:0;box-sizing:border-box;display:flex;align-items:center;gap:6px;padding-right:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.pg-task-row-select{flex:1 1 auto;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}.pg-task-row-open{flex:none;min-height:28px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--pg-accent-strong);font:inherit;font-size:11px;line-height:1.4;white-space:nowrap;cursor:pointer}.pg-task-row-open:hover{border-color:var(--pg-accent);background:var(--pg-accent-soft)}.pg-task-row-select:focus-visible,.pg-task-row-open:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}.pg-task-row:hover,.pg-task-row.is-selected{border-color:var(--pg-accent);background:var(--pg-accent-soft)}.pg-task-row-main{display:grid;min-width:0;gap:4px}.pg-task-row-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.pg-task-row-meta,.pg-task-row-updated{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pg-task-row-side{display:grid;justify-items:end;gap:3px;min-width:78px}.pg-task-row-score{font-size:12px;font-weight:600;color:var(--pg-accent-strong)}.pg-task-row-updated{font-size:10px}.pg-split-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px}.pg-split-control input{width:118px;accent-color:var(--pg-accent)}.pg-drawer-backdrop{position:fixed;inset:0;z-index:20;background:rgba(15,23,42,.22);display:flex;justify-content:flex-end}.pg-drawer{box-sizing:border-box;width:min(480px,92vw);height:100%;overflow:auto;padding:24px;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-12px 0 30px rgba(15,23,42,.16)}.pg-drawer-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px}.pg-drawer-title{margin:0;font-size:18px;line-height:1.4;overflow-wrap:anywhere}.pg-eyebrow{margin:0 0 4px;color:var(--pg-accent-strong);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}.pg-drawer-close,.pg-drawer-open{min-height:32px;padding:5px 9px}.pg-drawer-heading{min-width:0}.pg-drawer-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;flex:0 1 auto}.pg-drawer .pg-workflow{margin-top:14px}.pg-drawer .pg-history{margin-top:14px}.pg-history-side{display:grid;justify-items:end;gap:4px}.pg-drawer .pg-archive{align-items:center;flex-wrap:wrap}.pg-archived{margin-top:10px;display:grid;gap:6px}.pg-archived-toggle{justify-self:start;min-height:28px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}.pg-archived-toggle:hover{color:var(--pg-accent-strong);background:var(--pg-accent-soft)}.pg-archived-toggle:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}.pg-archived-row{justify-content:space-between;padding:8px 10px 8px 12px;background:var(--dsw-alias-bg-base)}.pg-archived-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-workbench .pg-help{margin-top:20px;font-size:12px;line-height:1.8;color:var(--dsw-alias-label-secondary)}@media(max-width:820px){.pg-workbench-grid{grid-template-columns:1fr!important}.pg-split-control{justify-content:flex-start}.pg-drawer{width:min(520px,100vw)}}@media(max-width:600px){.pg-workbench{padding-right:14px;padding-left:14px}.pg-workbench .pg-guide{padding:14px}.pg-search{grid-template-columns:1fr}.pg-filter,.pg-filter-other{flex-basis:100%}.pg-load-more{width:100%}.pg-split-control input{width:96px}.pg-task-row{padding-right:8px}.pg-task-row-select{gap:8px;padding:10px}.pg-task-row-side{min-width:0}.pg-drawer{padding:16px}}'),
        h('div', { className: 'pg-workbench-inner' },
          h('header', { className: 'pg-head' },
            h('h1', null, 'Playground 主控面板'),
            h('button', { className: 'pg-button', onClick: () => openable ? openTask(openable.id) : openChat() }, openable ? '返回所选任务对话' : '打开 DSH 对话')),
          h('p', { className: 'pg-note' }, '从目录选择赛题，再用 DSH 原生对话和工作区完成方案。提交前回到任务卡检查材料并确认目标。'),
          h(AuthStatusPanel, { query, login, saveToken, clearToken }),
          h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, announcement),
          h('div', { className: 'pg-split-control' },
            h('span', null, '调整左右栏宽度'),
            h('input', { type: 'range', min: 35, max: 65, step: 5, value: split, 'aria-label': '调整左右栏宽度', 'aria-valuetext': `左侧 ${split}%，右侧 ${100 - split}%`, onChange: (event) => setSplit(Number(event.target.value)) }),
            h('span', null, `${split}% / ${100 - split}%`)),
          h('div', { className: 'pg-workbench-grid', style: { gridTemplateColumns: `minmax(0,${split}fr) minmax(0,${100 - split}fr)` } },
            h('section', { className: 'pg-workbench-column', 'aria-label': 'Playground 赛题目录' },
              h('div', { className: 'pg-column-heading' }, h('h2', null, '赛题目录')),
              h(CatalogPanel, { sessionId: sourceSession?.id, allowed: sourceAllowed, query, requestTask, onWebBase: setWebBase })),
            h('section', { className: 'pg-workbench-column', 'aria-label': 'Playground 任务总览' },
              h('div', { className: 'pg-column-heading' }, h('h2', { tabIndex: -1, ref: (node) => { nav.heading = node; } }, '任务总览'),
                h('span', { className: 'pg-refresh-controls' }, h('span', { className: 'pg-badge' }, `${taskSessions.length} 个任务`),
                  taskSessions.length ? h('button', { type: 'button', className: 'pg-button pg-refresh', disabled: refreshing || !taskIds.length,
                    onClick: () => refreshAttempts(store, store.taskIds) }, refreshing ? '正在刷新…' : '刷新') : null)),
              store.failed ? h('p', { className: 'pg-note pg-refresh-status pg-error', role: 'status' },
                store.partial ? '刷新失败，部分任务显示的不是最新状态'
                  : store.refreshedAt ? `刷新失败，显示的是 ${clock(store.refreshedAt)} 的状态` : '刷新失败，显示的是任务记录中的状态')
                : store.refreshedAt ? h('p', { className: 'pg-note pg-refresh-status' }, `状态更新于 ${clock(store.refreshedAt)}`) : null,
              // Visible copy of the navigation failure; the live region above already announces it.
              openError ? h('p', { className: 'pg-note pg-error pg-open-error', role: 'none' }, openError) : null,
              taskSessions.length ? h('div', { className: 'pg-task-list', role: 'list', 'aria-label': 'Playground 任务列表' },
                taskSessions.map((item) => h(TaskSummaryRow, { key: item.id, session: item, attempts: store.attempts, selected: item.id === selected, onSelect: () => { setSelected(item.id); setDrawerOpen(true); setArchiveError(noArchiveError); setAnnouncement(`已打开任务：${item.displayTitle}`); }, onOpen: () => openConversation(item.id), selectRef: refInto(nav.rows, item.id) })))
                : h('p', { className: 'pg-task-empty' }, archivedTasks.length ? '没有未归档的任务。' : '还没有 Playground 任务。先从左侧赛题目录选择一个题目。'),
              // Visible copy of an archive failure while the drawer is closed; the drawer shows its own.
              archive && archiveError.message && !drawerOpen ? h('p', { className: 'pg-note pg-error pg-archive-error', role: 'none' }, archiveError.message) : null,
              archive && archivedTasks.length ? h('div', { className: 'pg-archived' },
                h('button', { type: 'button', className: 'pg-archived-toggle', 'aria-expanded': showArchived, 'aria-controls': 'pg-archived-list',
                  onClick: () => setShowArchived(!showArchived), ref: (node) => { nav.toggle = node; } }, `已归档 ${archivedTasks.length} 个`),
                showArchived ? h('div', { id: 'pg-archived-list', className: 'pg-task-list pg-archived-list', role: 'list', 'aria-label': '已归档的 Playground 任务' },
                  archivedTasks.map((item) => h(ArchivedTaskRow, { key: item.id, session: item, archive, buttonRef: refInto(nav.archived, item.id) }))) : null) : null)),
          // The drawer gives focus back to the row that opened it. When that node is gone it tries the task's current
          // row (archive then 撤销 in the drawer remounts the row as a new node), then, for a task archived in the
          // drawer, the 任务总览 heading.
          drawerOpen && session ? h(TaskDetailDrawer, { session, projection: catalog.projectionsBySession[session.id], close: closeDrawer, focusFallback: () => [nav.rows.get(session.id), nav.heading], attempts: store.attempts, useSessionAccess, refreshProjections, openTask, openConversation, run, query, webBase,
            archive: archive && { ...archive, archived: archivedSet.has(session.id), error: archiveError.id === session.id ? archiveError.message : '' }, ...props }) : null,
          h('details', { className: 'pg-help' }, h('summary', null, '如何使用'),
            h('ol', null,
              h('li', null, '搜索比赛和赛题，阅读题目摘要后点击“开始参赛任务”。'),
              h('li', null, '选择目标工作区，核对完整路径后确认创建独立任务对话；需要新工作区时使用原生目录选择器添加。'),
              h('li', null, '完成方案后，在对应任务卡检查材料，核对赛题、平台和文件，再明确确认提交。'),
              h('li', null, '查询结果与关键指标；排队状态表示尚未得到最终评分。')))));
    }

    function PlaygroundPanelIcon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
        h('path', { d: 'M8 3h8M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M7 15h10' }));
    }

    function PlaygroundToolCard({ phase, block, toolName, t, sessionId, requestTask, openTask, openWorkbench }) {
      const data = phase === 'result' ? block.meta?.playground : undefined;
      const text = phase === 'result' ? (block.content ?? []).filter((item) => item.type === 'text').map((item) => item.text).join('\n') : '';
      // playground_submit returns a confirmation's receipt, shown like the 确认提交 command card.
      const approvedSubmit = toolName === 'playground_submit';
      const isAttempt = toolName.includes('attempt') || approvedSubmit;
      const failed = phase === 'result' && (block.isError || data?.ok === false);
      const state = data?.scoringState?.state || data?.status || data?.bundleStatus;
      const receipt = approvedSubmit && data?.workflow?.kind === 'receipt' ? data.workflow.receipt : undefined;
      const receiptId = receipt?.attemptId ?? data?.attemptId;
      const receiptState = receipt?.scoringState?.state || data?.scoringState?.state || receipt?.status || data?.status;
      const receiptLine = approvedSubmit && receiptId !== undefined
        ? `${t('progress.attempt')} #${receiptId} · ${receiptState ? stateLabel(receiptState, t) : t('awaitingScore')}` : '';
      // A refused approval, a login refused, unreachable or failed before asking, or a card that did not reach
      // the CLI, leaves the confirmation card valid.
      const cardKept = approvedSubmit && failed && !data?.workflow
        && ['approval_rejected', 'approval_cancelled', 'approval_unavailable', 'authentication_required', 'network_error', 'login_check_failed', 'cli_not_started'].includes(data?.error?.code);
      return h('section', { className: 'pg-card', 'aria-label': t(`tools.${toolName}`) },
        h('style', null, css),
        h('div', { className: 'pg-head' },
          h('h3', null, data?.title || t(`tools.${toolName}`)),
        h('span', { className: 'pg-badge', 'data-tone': failed ? 'error' : data?.scoringState?.scoreIsFinal ? 'success' : statusTone(state) },
            failed ? t('failed') : phase === 'preparing' ? t('preparing') : phase === 'start' ? t(approvedSubmit ? 'approving' : toolName === 'playground_submit_attempt' ? 'uploading' : 'running') : state ? stateLabel(state, t) : t('loaded'))),
        failed ? h('p', { className: 'pg-error', role: 'alert' }, data?.error?.message || block.error?.message || text || t('failed')) : null,
        receiptLine ? h('p', { className: 'pg-note pg-receipt', role: 'status' }, receiptLine) : null,
        cardKept && openWorkbench ? h('button', { className: 'pg-button', onClick: () => openWorkbench(sessionId) }, '前往工作台确认提交') : null,
        phase === 'result' && data?.ok && requestTask && (toolName === 'playground_get_challenge' || toolName === 'playground_list_challenges') ? h('div', { className: 'pg-actions' },
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
          isAttempt && !data.items && data.ok && scoreLabel(data, t) ? h('div', { className: 'pg-score' }, scoreLabel(data, t)) : null,
          data.items ? h('ul', { className: 'pg-list' }, data.items.length ? data.items.map((item) => h('li', { key: item.id, className: 'pg-row' },
            h('div', { className: 'pg-row-main' }, item.title || String(item.id),
              h('div', { className: 'pg-row-sub' }, `${t('id')}: ${item.id}`, item.endAt ? ` · ${new Date(item.endAt).toLocaleString()}` : '',
                isAttempt && scoreLabel(item, t) ? h('div', null, scoreLabel(item, t)) : null)),
            h('span', { className: 'pg-badge' }, stateLabel(item.scoringState?.state || item.status, t)))) : h('li', { className: 'pg-note' }, t('empty'))) : null,
          data.hasMore ? h('p', { className: 'pg-note' }, t('more')) : null,
          data.metrics?.length ? h(React.Fragment, null,
            h('p', { className: 'pg-note' }, t('metricTitle')),
            h('dl', { className: 'pg-metrics' }, data.metrics.map((item) => h('div', { key: item.label, className: 'pg-metric' },
              h('dt', null, Object.hasOwn(locales.en.metrics, item.label) ? t(`metrics.${item.label}`) : item.label),
              h('dd', null, String(item.score))))),
            h('p', { className: 'pg-note' }, t('metricHint'))) : null,
          data.violations?.length ? h('ul', { className: 'pg-error' }, data.violations.slice(0, 5).map((item, index) => h('li', { key: index }, item.message || item.rule))) : null,
          // The checked bundle: a material check carries its summary, a failed confirmation the one it checked.
          bundleSummaryLine(data.bundleSummary || data.diagnosis?.bundle || data.workflow?.prepared?.bundleSummary)
            ? h('p', { className: 'pg-note pg-bundle-summary' }, bundleSummaryLine(data.bundleSummary || data.diagnosis?.bundle || data.workflow?.prepared?.bundleSummary)) : null,
          typeof data.bundleWarning === 'string' ? h('p', { className: 'pg-note pg-bundle-warning', role: 'status' }, h('span', { className: 'pg-badge', 'data-tone': 'warning' }, '评测包未改动'), ' ', data.bundleWarning) : null,
          isAttempt && (data.attemptId ?? data.id) ? h('p', { className: 'pg-note' }, `${t('nextAttempt')} ${data.attemptId ?? data.id}`) : null) : null,
        phase === 'result' && text ? h('details', { className: 'pg-raw', open: !data }, h('summary', null, t('raw')), h('pre', null, text)) : null,
        phase === 'result' ? h('footer', null, t('snapshot')) : h('p', { className: 'pg-note', role: 'status' }, t('snapshot')));
    }

    function StartTaskButton({ id, title, mode = 'participate', sessionId, requestTask, disabled = false }) {
      return h('button', { className: 'pg-button', disabled, onClick: () => requestTask({ id: String(id), title: title || String(id), mode, sessionId }) },
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
      const actionLabel = request.mode === 'author' ? '创建出题任务' : '创建参赛任务';
      // DSH keeps `phase` at 'pending' after a terminal list failure and reports it through `state`.
      const listError = workspaces.state === 'error' ? `无法读取 DSH 工作区列表${workspaces.error?.message ? `：${workspaces.error.message}` : ''}。请重启 DSH 后重试。` : '';
      const loading = workspaces.phase !== 'ready' && !listError;
      const hint = listError || (loading ? '正在读取 DSH 工作区列表…' : workspaces.items.length ? '选择已有工作区，或添加一个专用目录。' : '还没有工作区，请先添加。');
      const confirm = async () => {
        if (!workspace || workspaces.phase !== 'ready' || busy || adding) return;
        setBusy(true); setError('');
        let created;
        try { const result = await run(request.sessionId, { action: 'start', challenge_id: request.id, mode: request.mode, workspace_id: workspace.workspaceId });
          if (result.ok && result.sessionId) created = result.sessionId;
          else setError(result.error?.message || '任务创建失败');
        } catch (failure) { setError(failure.message); }
        if (!created) { setBusy(false); return; }
        // Closing unmounts the dialog, so no state is set afterwards. The task already exists and
        // stays reachable from the task list if navigation fails.
        closeTaskStart();
        Promise.resolve(openTask(created)).catch((failure) => console.warn('Playground: failed to open the new task conversation', failure));
      };
      return h(Modal, { open: true, headless: true, backdropBlur: false, className: 'pg-task-modal', title: actionLabel,
        onClose: () => { if (!busy && !adding) closeTaskStart(); } },
      h('style', null, taskModalCss),
      h('header', { className: 'pg-task-header' },
        h('h2', null, actionLabel),
        h('p', { className: 'pg-task-subtitle' }, '选择任务文件的存放工作区'),
        h('button', { type: 'button', className: 'pg-task-close', 'aria-label': '取消创建任务', disabled: busy || adding, onClick: closeTaskStart },
          h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 6 12 12M18 6 6 18' })))),
      h('div', { className: 'pg-task-body', 'aria-busy': busy || adding || loading },
        h('section', { className: 'pg-task-summary', 'aria-label': '目标赛题' },
          h('div', { className: 'pg-task-summary-top' },
            h('h3', { className: 'pg-task-title', title: request.title }, request.title),
            h('span', { className: 'pg-task-mode' }, request.mode === 'author' ? '出题' : '参赛')),
          h('p', { className: 'pg-task-id' }, request.id)),
        h('div', { className: 'pg-task-field' },
          h('label', { htmlFor: 'pg-task-workspace' }, '目标工作区'),
          h('div', { className: 'pg-task-select-wrap' },
            h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M3 7.5h6l2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18' })),
            h('select', { id: 'pg-task-workspace', className: 'pg-task-select', 'aria-invalid': !!error,
              'aria-describedby': `${workspace ? 'pg-task-path' : 'pg-task-hint'}${error ? ' pg-task-error' : ''}`, 'data-empty': !workspace, 'data-modal-autofocus': true,
              value: workspace ? selectedId : '', disabled: workspaces.phase !== 'ready' || busy || adding,
              onChange: (event) => { setSelectedId(event.target.value); setError(''); } },
              h('option', { value: '' }, '请选择工作区'),
              workspaces.items.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title || '未命名工作区'))),
            h('svg', { className: 'pg-task-chevron', viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'm6 9 6 6 6-6' }))),
          workspace ? h('p', { id: 'pg-task-path', className: 'pg-task-path' }, workspace.path)
            : h('p', { id: 'pg-task-hint', className: listError ? 'pg-task-error' : 'pg-task-hint', role: listError ? 'alert' : loading ? 'status' : undefined }, hint),
          error ? h('p', { id: 'pg-task-error', className: 'pg-task-error', role: 'alert' }, error) : null,
          h('button', { type: 'button', className: 'pg-task-add', disabled: busy || adding, onClick: async () => {
            setAdding(true); setError('');
            try { const created = await addTaskWorkspace(); if (created) setSelectedId(created.workspaceId); }
            catch (failure) { setError(failure.message); } finally { setAdding(false); }
          } }, h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M12 5v14M5 12h14' })), adding ? '正在选择目录…' : '添加工作区…'))),
      h('footer', { className: 'pg-task-footer' },
        h('p', null, '将在所选目录创建独立对话并读写任务文件。'),
        h('div', { className: 'pg-task-actions' },
          h('button', { type: 'button', className: 'pg-task-button', disabled: busy || adding, onClick: closeTaskStart }, '取消'),
          h('button', { type: 'button', className: 'pg-task-button pg-task-create', 'data-busy': busy, disabled: !workspace || workspaces.phase !== 'ready' || busy || adding, onClick: confirm },
            busy ? h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d: 'M21 12a9 9 0 1 1-9-9' })) : null,
            busy ? '正在创建…' : actionLabel))));
    }

    function commandFact(value) {
      return typeof value === 'string' ? value.slice(0, 300) : typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
    }

    // Gateway codes come from the DSH API gateway; a business throw reaches the Client as gateway/internal.
    function queryFailure(error) {
      const code = typeof error?.code === 'string' ? error.code : '';
      if (code === 'transport') return '无法连接 DSH 服务，请检查连接后重试。';
      if (code === 'remote-access/denied') return '当前连接没有读取 Playground 数据的权限。';
      if (code === 'gateway/internal') {
        const detail = safeMessage(error.message);
        return `Playground 平台请求失败${detail ? `：${detail}` : ''}。请稍后重试。`;
      }
      if (/^gateway\/(invocation|definition|service|method)-unavailable$/.test(code)) {
        return 'Playground 查询服务未加载。请重启 DSH；若仍失败，当前 DSH 版本可能不支持插件查询通道。';
      }
      return `Playground 查询失败${code ? `（${code}）` : ''}，请重试。`;
    }

    // Error text may come from the platform, the CLI or an older plugin version. Show it only when it
    // cannot carry credentials or local paths; callers fall back to a generic next step otherwise.
    function safeMessage(value) {
      if (typeof value !== 'string' || !value.trim()) return undefined;
      const text = value.trim().slice(0, 300);
      // A drive letter is one letter on its own, so a URL scheme such as `https://` is not one.
      return /bearer|authorization|token|password|secret|api[_-]?key|cookie|(?<![a-z])[a-z]:[\\/]|(?<![\w.-])\/(home|users|tmp)\//i.test(text) ? undefined : text;
    }

    // A failed confirmation's message that the Host marks `error.cleaned` is plugin text plus reasons the Host
    // already cleaned (lib/workflow.js cleanDetail, the one definition of clean). It can be longer than
    // safeMessage allows, name a field such as "token", hold a link or a bundle path such as
    // `skills/users/data.csv`, so it is shown whole, up to 2000 characters. Every other message keeps the
    // strict safeMessage check.
    function diagnosedMessage(result) {
      if (result?.error?.cleaned !== true || typeof result.error.message !== 'string' || !result.error.message.trim()) return undefined;
      return result.error.message.trim().slice(0, 2000);
    }

    // uiWorkspace.archiveSession throws WorkspaceArchiveError carrying the host rpcError (read from the error, not
    // its class: bundles do not share classes). `workspace/session-active` covers any running work in the
    // conversation (turns, subagents, background jobs, schedules), not only a visible running turn. Errors without
    // an rpcError, such as unarchiveSession's "workspace session unarchive failed: <code>: <message>", get only
    // the generic message.
    async function changeArchive(uiWorkspace, method, sessionId) {
      const verb = method === 'archiveSession' ? '归档' : '取消归档';
      if (typeof uiWorkspace?.[method] !== 'function') return { ok: false, message: `当前 DSH 版本不支持${verb}对话。` };
      try {
        await uiWorkspace[method](sessionId);
        return { ok: true };
      } catch (failure) {
        const rpcError = failure?.rpcError;
        if (rpcError?.code === 'workspace/session-active') return { ok: false, message: '对话还有运行中的工作（回复、子代理、后台作业或定时任务），停止后再归档。' };
        const detail = typeof rpcError?.message === 'string' ? safeMessage(rpcError.message) : undefined;
        return { ok: false, message: detail ? `${verb}未完成：${detail}。请重试。` : `${verb}未完成，请重试。` };
      }
    }

    function PlaygroundCommandCard({ node, sessionId, openTask, openWorkbench }) {
      let result;
      let input;
      try { result = JSON.parse(node.outcome?.text || '{}'); } catch { result = undefined; }
      try { input = JSON.parse(node.args || '{}'); } catch { input = null; }
      // Handlers report some failures as plain text rather than a JSON result.
      const plainText = result === undefined ? node.outcome?.text : undefined;
      result = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
      input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      const workflow = result.playgroundWorkflow;
      const auth = result.playgroundAuth;
      const catalog = result.playgroundCatalog;
      // Older plugin versions logged automatic auth/catalog queries from the `playground` command into
      // whichever conversation was open. Nothing writes them now, so hide them, including failed, interrupted
      // and unparseable leftovers (recognised by action when there is no payload); stored history is untouched.
      // `playground-auth-login` also carries `playgroundAuth` but is a real user login and stays visible.
      const legacyQuery = 'playgroundAuth' in result || 'playgroundCatalog' in result || input.action === 'auth' || input.action === 'catalog';
      if (node.name === 'playground' && !workflow && legacyQuery) return null;
      const challenges = Array.isArray(catalog?.challenges?.items) ? catalog.challenges.items.filter((item) => item && typeof item === 'object') : [];
      const action = auth ? 'auth' : catalog ? 'catalog' : input.action || workflow?.kind;
      const label = node.name === 'playground-auth-login' ? 'Playground 登录'
        : node.name === 'playground-confirm' ? '确认提交' : action === 'results' ? '查询评测结果' : workflow?.kind === 'receipt' ? '提交回执'
        : ({ auth: '登录状态检测', catalog: '赛题目录查询', start: '创建任务对话', task: '任务上下文', context: '任务上下文',
          mode: '切换工作模式', check: '检查提交材料', prepared: '检查提交材料', results: '查询评测结果', cancel: '取消提交准备', clear: '取消提交准备' })[action] || 'Playground 命令';
      const failed = node.outcome?.kind === 'error' || result.ok === false || Boolean(result.error);
      const available = Object.keys(result).length > 0;
      const status = !node.outcome ? '执行中 / 尚未完成' : failed ? '未完成' : !available ? '结果不可用'
        : workflow?.kind === 'prepared' ? '等待确认' : workflow?.kind === 'clear' ? '已取消或失效' : auth ? (auth.authenticated ? '已登录' : '未登录') : '已完成';
      // Historical payloads can contain CLI output and credentials. Only project safe business facts.
      const details = {
        操作: label, 状态: status,
        ...(catalog ? { 比赛数量: commandFact(catalog.competitions?.total) ?? catalog.competitions?.items?.length ?? 0,
          赛题数量: commandFact(catalog.challenges?.total) ?? challenges.length,
          当前页赛题: challenges.slice(0, 12).map((item) => commandFact(item.titleZh || item.title || item.id)).filter((title) => title !== undefined) } : {}),
        ...(workflow?.task ? { 赛题: commandFact(workflow.task.title) } : {}),
        ...(workflow?.mode ? { 工作模式: workflow.mode === 'author' ? '出题' : '参赛' } : {}),
        ...(workflow?.prepared ? { 赛题: commandFact(workflow.prepared.challenge?.title), 材料数量: commandFact(workflow.prepared.files?.length), 提交状态: '等待用户确认' } : {}),
        ...(workflow?.receipt || action === 'results' ? { 提交编号: commandFact(workflow?.receipt?.attemptId ?? result.attemptId ?? result.id),
          评测状态: commandFact(workflow?.receipt?.scoringState?.state || result.scoringState?.state || result.status),
          平台返回分数: commandFact(workflow?.receipt?.scoringState?.displayScore ?? result.scoringState?.displayScore ?? result.score) } : {}),
        ...(workflow?.prepared && bundleSummaryLine(workflow.prepared.bundleSummary) ? { 评测包: bundleSummaryLine(workflow.prepared.bundleSummary) } : {}),
        ...(result.diagnosis && typeof result.diagnosis === 'object' ? {
          失败环节: ({ worker_upload: '评测 Worker 接收评测包', attempt_create: '创建提交记录', local_check: 'CLI 本地检查' })[result.diagnosis.stage] || '未知',
          ...(commandFact(result.diagnosis.httpStatus) !== undefined ? { HTTP状态: commandFact(result.diagnosis.httpStatus) } : {}),
          ...(Array.isArray(result.diagnosis.details) ? { 平台给出的原因: result.diagnosis.details.slice(0, 6).map(commandFact).filter((item) => item !== undefined) } : {}),
          ...(bundleSummaryLine(result.diagnosis.bundle) ? { 评测包: bundleSummaryLine(result.diagnosis.bundle) } : {}),
        } : {}),
      };
      const summary = failed ? ({ authentication_required: '请先在工作台登录 Playground，再重试此操作。',
        confirmation_required: '提交尚未获得有效确认，请在工作台重新检查材料并确认。',
        materials_changed: '材料已改变，请在工作台重新检查后再提交。',
        identity_changed: '检查材料后登录身份已变化或无法核对，请在工作台确认登录身份并重新检查材料。' })[result.error?.code]
          || diagnosedMessage(result) || safeMessage(result.error?.message ?? plainText) || '操作未完成或已中断。请检查工作台中的状态后重试。'
        : !node.outcome ? '此记录尚无完成结果；若任务已停止，请回到工作台核对状态。'
        : auth ? (auth.authenticated ? 'Playground 身份已确认。' : '尚未登录；公开赛题仍可浏览。')
        : catalog ? `共 ${details.比赛数量} 个比赛、${details.赛题数量} 道赛题。`
        : workflow?.prepared ? '材料已检查，等待用户在工作台确认提交。'
        : details.提交编号 !== undefined ? `提交 #${details.提交编号} · ${details.评测状态 || '评测状态待查询'}`
        : typeof result.sessionId === 'string' ? '已创建独立任务对话。' : commandFact(workflow?.task?.title) || '可展开查看已保存的操作摘要；未提供的详情不可用。';
      return h('section', { className: 'pg-card' }, h('style', null, css),
        h('div', { className: 'pg-head' }, h('strong', null, label), h('span', { className: 'pg-badge', 'data-tone': failed ? 'error' : !node.outcome || auth?.authenticated === false ? 'warning' : 'neutral' }, status)),
        h('p', { className: failed ? 'pg-error' : 'pg-note', role: failed ? 'alert' : 'status' }, summary),
        h('details', { className: 'pg-raw' }, h('summary', null, '查看操作详情'), h('pre', null, JSON.stringify(details, null, 2))),
        workflow?.kind === 'prepared' && !failed ? h('button', { className: 'pg-button', onClick: () => openWorkbench(sessionId) }, '前往工作台确认提交') : null,
        typeof result.sessionId === 'string' ? h('button', { className: 'pg-button', onClick: () => openTask(result.sessionId) }, '打开任务对话') : null);
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands', 'remote.credentials', 'connection', 'uiWorkspace', 'workspaces', 'layout', 'sessions'],
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
          // DSH's own archive, the one its sidebar uses. Running work is refused by the host, never stopped
          // from here. Both resolve to { ok } and report failures as a short message instead of throwing.
          archiveTask: (sessionId) => changeArchive(ctx.uiWorkspace, 'archiveSession', sessionId),
          unarchiveTask: (sessionId) => changeArchive(ctx.uiWorkspace, 'unarchiveSession', sessionId),
          openChat: () => ctx.layout.selectPanel(null),
          openWorkbench: async (sessionId) => {
            await ctx.uiWorkspace.openSession(sessionId);
            ctx.layout.selectPanel('playground');
          },
          refreshProjections: (sessionId) => ctx.sessions.refreshProjections(sessionId),
          query: async (input, signal) => {
            const result = await ctx.connection.rpc.call('/api', 'playgroundQueries/query', { args: { input } }, signal)
              .catch(() => ({ ok: false, error: { code: 'transport' } }));
            if (result.ok) return result.value;
            throw new Error(queryFailure(result.error));
          },
          run: async (sessionId, input, confirm = false) => {
            const result = await ctx.remote.commands.execute(sessionId, confirm ? `/playground-confirm ${input}` : `/playground ${JSON.stringify(input)}`, []);
            if (!result.ok) throw new Error(result.error.message);
            if (!result.value) throw new Error('Playground 命令未注册，请重启 DSH 加载插件。');
            const text = result.value.result.text;
            if (!text?.startsWith('{')) throw new Error(text || 'Playground 未返回操作结果。');
            return JSON.parse(text);
          },
          // Session-free: the password goes to the DSH credential store, never into the call or a conversation.
          // It is only needed for this one CLI login, so it is removed from the store afterwards, whatever the outcome.
          login: async (email, password) => {
            try {
              await ctx.remote.credentials.set('PLAYGROUND_PASSWORD', password);
              const result = await ctx.connection.rpc.call('/api', 'playgroundQueries/login', { args: { input: { email } } })
                .catch(() => ({ ok: false, error: { code: 'transport' } }));
              if (!result.ok) throw new Error(queryFailure(result.error));
              if (result.value?.ok === false) throw new Error(safeMessage(result.value.error?.message) || 'Playground 登录失败，请重试。');
              return result.value;
            } finally {
              await Promise.resolve().then(() => ctx.remote.credentials.unset?.('PLAYGROUND_PASSWORD')).catch(() => {});
            }
          },
          // The API token goes only to the DSH credential store, never into an RPC, a command or a conversation.
          // The Host reads it from there per operation, for its own requests and for the CLI it starts.
          saveToken: async (value) => {
            const token = typeof value === 'string' ? value.trim() : '';
            if (!token) throw new Error('请先粘贴 API 令牌。');
            if (/\s/.test(token)) throw new Error('令牌中不能有空格或换行，请从网站重新复制。');
            try { await ctx.remote.credentials.set('PLAYGROUND_TOKEN', token); }
            catch { throw new Error('无法把令牌保存到 DSH 凭据存储，请重试。'); }
          },
          // Clears only the DSH copy; the CLI credentials file is never modified.
          clearToken: async () => {
            try { await ctx.remote.credentials.unset('PLAYGROUND_TOKEN'); }
            catch { throw new Error('无法清除 DSH 凭据存储中的令牌，请重试。'); }
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
          for (const key of ['playground', 'playground-confirm', 'playground-auth-login']) {
            yield ctx.slots.register({ name: 'conversation.chat.commandview', key, inject: () => actions }, PlaygroundCommandCard);
          }
        });
      },
    };
  },
});
