import { languagePreference, msg, usePluginLanguage } from '../shared/language.js';
import { CodexChats } from '../controller/codex-chats.js';
import * as React from 'react';
import { locales, stateLabel, zhText } from '../shared/locale.js';
import { h } from '../shared/react.js';
import { css } from '../shared/styles.js';
import { statusTone } from '../shared/display.js';
import { StartTaskButton } from '../tasks/start.js';
import { bundleSummaryLine, scoreLabel, submissionCountsLine } from '../tasks/attempts.js';

const challengeCardCss = `
  .pg-card.pg-tool-challenge { padding:0; border-color:var(--pg-control-line); background:var(--pg-control); overflow:hidden; }
  .pg-tool-challenge-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; padding:12px 16px; border-bottom:1px solid #1C2129; background:#0C0F13; }
  .pg-tool-challenge-id { color:var(--pg-label); font:11px/1.55 var(--pg-font-mono); letter-spacing:.06em; overflow-wrap:anywhere; }
  .pg-tool-challenge-meta [data-tone=open] { border-color:#2E3A1E; }
  .pg-tool-challenge-body { display:grid; gap:var(--pg-s16); padding:var(--pg-s16); }
  .pg-tool-challenge-body h3 { font-size:19px; letter-spacing:-.01em; }
  .pg-tool-challenge-facts,.pg-tool-challenge-actions { display:flex; flex-wrap:wrap; align-items:center; gap:var(--pg-s8); }
  .pg-tool-challenge-facts { color:var(--pg-muted); font-size:13px; }
  .pg-tool-challenge-actions .pg-primary { display:inline-flex; align-items:center; gap:var(--pg-s8); }
  .pg-tool-challenge .pg-raw { margin:0; }
  .pg-tool-challenge .pg-raw > summary { display:inline-flex; align-items:center; margin-bottom:var(--pg-s4); }
  .pg-tool-challenge footer { margin:0; color:var(--pg-label); font:10.5px/1.55 var(--pg-font-mono); }
`;

function challengeToolCard(data, text, t, sessionId, requestTask) {
  const title = msg(data.titleZh || data.title, data.title || data.titleZh) || data.id;
  const facts = [data.origin && t(`origins.${data.origin}`), data.discipline && t(`disciplines.${data.discipline}`)].filter(Boolean);
  return h('section', { className: 'pg-card pg-tool-challenge', 'aria-label': t('tools.playground_get_challenge') },
    h('style', null, css + challengeCardCss),
    h('div', { className: 'pg-tool-challenge-meta' },
      h('span', { className: 'pg-tool-challenge-id' }, 'CHALLENGE · ', data.id),
      data.status ? h('span', { className: 'pg-badge', 'data-tone': statusTone(data.status) }, stateLabel(data.status, t)) : null),
    h('div', { className: 'pg-tool-challenge-body' },
      h('h3', null, title),
      facts.length ? h('div', { className: 'pg-tool-challenge-facts' }, facts.join(' · ')) : null,
      requestTask ? h('div', { className: 'pg-tool-challenge-actions' },
        h(StartTaskButton, { id: data.id, title: data.title || data.titleZh, sessionId, requestTask, primary: true })) : null,
      text || (data.content && !data.contentGated) ? h('details', { className: 'pg-raw' },
        h('summary', { className: 'pg-button' }, data.contentGated ? t('raw') : msg('查看题面', 'View challenge statement')),
        h('pre', null, text || data.content)) : null,
      h('footer', null, t('snapshot'))));
}

function PlaygroundToolCard({ phase, block, toolName, t: hostText, sessionId, requestTask, openTask, openControllerChat, openWorkbench, codexChats }) {
  const language = usePluginLanguage();
  const t = languagePreference() ? zhText : hostText || zhText;
  const external = phase === 'result' && block.meta?.codexChats;
  if (external && external.sessionId === sessionId) return h(CodexChats, { key: `${sessionId}:${block.id || ''}`, initial: external, workspaceId: external.workspaceId, sessionId, query: codexChats });
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
  if (toolName === 'playground_get_challenge' && data?.ok && !failed && data.id !== undefined) {
    return challengeToolCard(data, text, t, sessionId, requestTask);
  }
  const receiptLine = approvedSubmit && receiptId !== undefined
    ? `${t('progress.attempt')} #${receiptId} · ${receiptState ? stateLabel(receiptState, t) : t('awaitingScore')}` : '';
  return h('section', { className: 'pg-card', 'aria-label': t(`tools.${toolName}`) },
    h('style', null, css),
    h('div', { className: 'pg-head' },
      h('h3', null, data?.title || t(`tools.${toolName}`)),
    h('span', { className: 'pg-badge', 'data-tone': failed ? 'error' : data?.scoringState?.scoreIsFinal ? 'scored' : phase === 'start' ? 'running' : statusTone(state) },
        failed ? t('failed') : phase === 'preparing' ? t('preparing') : phase === 'start' ? t(approvedSubmit ? 'approving' : toolName === 'playground_submit_attempt' ? 'uploading' : 'running') : state ? stateLabel(state, t) : t('loaded'))),
    failed ? h('p', { className: 'pg-error', role: 'alert' }, data?.error?.message || block.error?.message || text || t('failed')) : null,
    receiptLine ? h('p', { className: 'pg-note pg-receipt', role: 'status' }, receiptLine) : null,
    phase === 'result' && data?.ok && requestTask && toolName === 'playground_list_challenges' ? h('div', { className: 'pg-actions' },
      ...(data.items || [data]).map((item) => h(StartTaskButton, { key: item.id, id: item.id, title: item.title, sessionId, requestTask }))) : null,
    data?.sessionId && (toolName === 'playground_open_controller' ? openControllerChat : openTask)
      ? h('button', { className: 'pg-button', onClick: () => toolName === 'playground_open_controller'
        ? openControllerChat(data.sessionId, data.workspaceId || '') : openTask(data.sessionId) },
        toolName === 'playground_open_controller' ? msg('打开主控对话', 'Open controller chat') : msg('打开任务对话', 'Open task chat')) : null,
    data?.status === 'awaiting_confirmation' && openWorkbench ? h('button', { className: 'pg-button', onClick: () => openWorkbench(sessionId) }, msg('打开工作台', 'Open workbench')) : null,
    data ? h(React.Fragment, null,
      h('div', { className: 'pg-facts' },
        data.attemptId !== undefined || data.id !== undefined ? h('span', null, `${t(isAttempt ? 'submissionId' : 'id')}: ${data.attemptId ?? data.id}`) : null,
        data.challengeId ? h('span', null, `${t('challenge')}: ${data.challengeId}`) : null,
        data.bundleStatus ? h('span', null, `${t('bundle')}: ${stateLabel(data.bundleStatus, t)}`) : null,
        data.traceCount !== undefined ? h('span', null, `${t('trace')}: ${data.traceCount}`) : null,
        data.endAt ? h('span', null, `${t('deadline')}: ${new Date(data.endAt).toLocaleString(language)}`) : null,
        data.challengeCount !== undefined ? h('span', null, `${t('challengeCount')}: ${data.challengeCount}`) : null,
        data.completionThreshold !== undefined ? h('span', null, `${t('threshold')}: ${data.completionThreshold}`) : null,
        data.total !== undefined ? h('span', null, `${t('total')}: ${data.total}`) : null),
      isAttempt && !data.items && data.ok && scoreLabel(data, t) ? h('div', { className: 'pg-score' }, scoreLabel(data, t)) : null,
      data.items ? h('ul', { className: 'pg-list' }, data.items.length ? data.items.map((item) => h('li', { key: item.id, className: 'pg-row' },
        h('div', { className: 'pg-row-main' }, item.title || String(item.id),
          h('div', { className: 'pg-row-sub' }, `${t('id')}: ${item.id}`, item.endAt ? ` · ${new Date(item.endAt).toLocaleString(language)}` : '',
            isAttempt && scoreLabel(item, t) ? h('div', null, scoreLabel(item, t)) : null)),
        h('span', { className: 'pg-badge', 'data-tone': item.scoringState?.scoreIsFinal ? 'scored' : statusTone(item.scoringState?.state || item.status) },
          stateLabel(item.scoringState?.state || item.status, t)))) : h('li', { className: 'pg-note' }, t('empty'))) : null,
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
      typeof data.bundleWarning === 'string' ? h('p', { className: 'pg-note pg-bundle-warning', role: 'status' }, h('span', { className: 'pg-badge', 'data-tone': 'warning' }, msg('评测包未改动', 'Bundle unchanged')), ' ', data.bundleWarning) : null,
      submissionCountsLine(data.submissionCounts) ? h('p', { className: 'pg-note pg-submission-counts' }, submissionCountsLine(data.submissionCounts)) : null,
      isAttempt && (data.attemptId ?? data.id) ? h('p', { className: 'pg-note' }, `${t('nextAttempt')} ${data.attemptId ?? data.id}`) : null) : null,
    phase === 'result' && text ? h('details', { className: 'pg-raw', open: !data }, h('summary', null, t('raw')), h('pre', null, text)) : null,
    phase === 'result' ? h('footer', null, t('snapshot')) : h('p', { className: 'pg-note', role: 'status' }, t('snapshot')));
}

export { PlaygroundToolCard };

