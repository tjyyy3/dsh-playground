
const locales = {
  zh: {
    tools: {
      playground_list_challenges: '赛题搜索', playground_get_challenge: '赛题详情',
      playground_list_attempts: '赛题提交', playground_get_attempt: '评测结果',
      playground_submit_attempt: '提交与评测', playground_list_competitions: '比赛与赛季',
      playground_get_competition: '比赛详情', playground_list_my_attempts: '我的提交',
      playground_start_task: '新建任务对话', playground_bind_task: '绑定当前对话', playground_check_materials: '提交前检查', playground_task: '任务状态',
      playground_open_controller: '打开工作区主控',
      playground_submit: '提交到 Playground',
    },
    preparing: '正在准备参数…', running: '正在查询…', uploading: '正在提交评测包…', approving: '正在提交…', failed: '操作未完成', loaded: '查询完成',
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
    challengeGroups: { bonus: '附加题' },
  },
  en: {
    tools: {
      playground_list_challenges: 'Challenge search', playground_get_challenge: 'Challenge details',
      playground_list_attempts: 'Challenge submissions', playground_get_attempt: 'Evaluation results',
      playground_submit_attempt: 'Submit for evaluation', playground_list_competitions: 'Competitions',
      playground_get_competition: 'Competition details', playground_list_my_attempts: 'My submissions',
      playground_start_task: 'New task conversation', playground_bind_task: 'Bind this conversation', playground_check_materials: 'Submission checks', playground_task: 'Task status',
      playground_open_controller: 'Open workspace controller',
      playground_submit: 'Submit to Playground',
    },
    preparing: 'Preparing arguments…', running: 'Querying…', uploading: 'Submitting bundle…', approving: 'Submitting…', failed: 'Operation incomplete', loaded: 'Query complete',
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
    challengeGroups: { bonus: 'Bonus' },
  },
};

function stateLabel(state, t) {
  return Object.hasOwn(locales.en.states, state) ? t(`states.${state}`) : state || t('unknown');
}

// Chinese lookup for workbench text that stays Chinese regardless of the host language, such as
// the task list row, which sits among hard-coded Chinese labels. The workbench does receive `t`.
const zhText = (key) => key.split('.').reduce((value, part) => value?.[part], locales.zh) ?? key;

export { locales, stateLabel, zhText };

