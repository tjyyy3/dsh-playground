/** Markdown formatters for the model-facing tool content. */

function escapeCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function truncate(value, max) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n… (truncated, ${text.length - max} characters omitted)`;
}

function shortTime(value) {
  if (typeof value !== 'string' || value.length === 0) return '—';
  return value.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/\+00:00$/, ' UTC');
}

function attemptScore(item) {
  const state = item.scoringState;
  if (state?.scoreIsFinal === true) {
    if (state.displayScore !== undefined) return String(state.displayScore);
    if (item.score !== undefined) return `${item.score} (final)`;
  }
  if (item.score !== undefined && item.score !== 0) return `${item.score} (not final)`;
  return state?.state ? `pending (${state.state})` : 'not scored';
}

export function formatList(result) {
  const start = (result.page - 1) * result.perPage;
  const lines = [];
  lines.push(
    `Found **${result.total}** challenge(s) · page ${result.page}/${result.pages} · showing ${result.items.length}`,
  );
  if (result.items.length === 0) {
    lines.push('', 'No challenge matched these filters.');
    return lines.join('\n');
  }
  lines.push(
    '',
    '| # | id | title | discipline | difficulty | attempts |',
    '|---:|---|---|---|---:|---:|',
  );
  result.items.forEach((item, index) => {
    const title = item.titleZh && item.titleZh !== item.title ? `${item.title} / ${item.titleZh}` : item.title;
    lines.push(
      `| ${start + index + 1} | \`${escapeCell(item.id)}\` | ${escapeCell(title)} | ${escapeCell(item.discipline ?? '—')} | ${item.difficulty ?? '—'} | ${item.attempts ?? '—'} |`,
    );
  });
  lines.push('');
  if (result.hasMore) {
    lines.push(`More pages are available: call again with \`page\` ${result.page + 1} (or a larger \`per_page\`).`);
  }
  lines.push('Use `playground_get_challenge` with an id to read the problem statement and resources.');
  return lines.join('\n');
}

export function formatCompetitions(result) {
  if (!result.items.length) return 'No visible competitions matched these filters.';
  return [
    `Found **${result.total}** competition(s)`, '',
    '| id | competition | season | status | starts | ends |',
    '|---:|---|---|---|---|---|',
    ...result.items.map((item) => `| ${item.id} | ${escapeCell(item.nameZh || item.name)} | ${escapeCell(item.seasonLabel || item.slug)} | ${escapeCell(item.status)} | ${escapeCell(shortTime(item.startAt))} | ${escapeCell(shortTime(item.endAt))} |`),
    '', 'Ask me to read a competition and find its challenges.',
  ].join('\n');
}

export function formatCompetition(result) {
  return [
    `# ${result.nameZh || result.name}`, '',
    `id: ${result.id} · season: ${result.slug} · status: ${result.status ?? 'unknown'}`,
    `Starts: ${shortTime(result.startAt)} · Ends: ${shortTime(result.endAt)}`,
    ...(result.completionThreshold !== undefined ? [`Completion threshold: ${result.completionThreshold}`] : []),
    '', '## Challenges',
    ...(result.challengeIds?.length ? result.challengeIds.map((id) => `- \`${id}\``) : ['No visible challenge ids were returned.']),
    '', `Ask me to list challenges in season ${result.slug}, or read one by id.`,
  ].join('\n');
}

export function formatMyAttempts(result) {
  return [
    `# My submissions · showing ${result.items.length}`, '',
    ...(result.items.length ? [
      '| id | challenge | status | score | scoring | submitted |',
      '|---:|---|---|---|---|---|',
      ...result.items.map((item) => `| ${item.id} | ${escapeCell(item.challengeTitle || item.challengeId)} | ${escapeCell(item.status)} | ${escapeCell(attemptScore(item))} | ${escapeCell(item.scoringState?.state ?? 'unknown')} | ${escapeCell(shortTime(item.createdAt))} |`),
    ] : ['No personal submissions matched these filters.']),
    ...(result.nextCursor ? ['', `More results: repeat the same filters with cursor \`${result.nextCursor}\`.`] : []),
    '', 'Ask me to read a submission by id for its latest score and metrics.',
    'Different submission ids are distinct submissions. An upload retry keeps the same id; timestamps alone do not prove a retry.',
  ].join('\n');
}

export function formatChallenge(detail, { maxContentChars = 12000 } = {}) {
  const lines = [];
  lines.push(`# ${detail.title}${detail.titleZh && detail.titleZh !== detail.title ? ` / ${detail.titleZh}` : ''}`);
  lines.push('');
  const facts = [
    `id: \`${detail.id}\``,
    detail.origin ? `origin: ${detail.origin}` : '',
    detail.discipline ? `discipline: ${detail.discipline}` : '',
    detail.difficulty !== undefined ? `difficulty: ${detail.difficulty}` : '',
    detail.attempts !== undefined ? `attempts: ${detail.attempts}` : '',
    detail.status ? `status: ${detail.status}` : '',
    detail.reviewStatus ? `review: ${detail.reviewStatus}` : '',
  ].filter(Boolean);
  lines.push(facts.join(' · '));

  if (detail.resources.length > 0) {
    lines.push('', '## Resources');
    for (const resource of detail.resources) {
      const label = [resource.kind, resource.name].filter(Boolean).join(' · ');
      lines.push(`- ${label || 'resource'}${resource.role ? ` (${resource.role})` : ''}${resource.description ? ` — ${resource.description}` : ''}${resource.source ? ` [source: ${resource.source}]` : ''}`);
    }
  }

  lines.push('', '## Problem statement');
  if (detail.contentGated) {
    lines.push('> This problem statement is login-gated. Configure a Playground token to read it.');
  } else if (detail.content.trim().length === 0) {
    lines.push('> This challenge has no stored problem text.');
  } else {
    lines.push(truncate(detail.content, maxContentChars));
  }
  return lines.join('\n');
}

export function formatAttemptList(result) {
  const header = result.challengeId
    ? `Submissions for \`${result.challengeId}\``
    : 'Submissions';
  const lines = [
    `${header} · **${result.total}** total${result.totalNonDraft !== undefined ? ` (${result.totalNonDraft} non-draft)` : ''} · showing ${result.items.length}`,
  ];
  if (result.items.length === 0) {
    lines.push('', 'No submission matched these filters.');
    return lines.join('\n');
  }
  lines.push(
    '',
    '| # | id | author | status | score | scoring | bundle | submitted |',
    '|---:|---:|---|---|---:|---|---|---|',
  );
  result.items.forEach((item, index) => {
    const author = item.authorName ?? item.authorId ?? '—';
    lines.push(
      `| ${(result.page - 1) * result.limit + index + 1} | ${item.id} | ${escapeCell(author)} | ${escapeCell(item.status ?? '—')} | ${escapeCell(attemptScore(item))} | ${escapeCell(item.scoringState?.state ?? '—')} | ${escapeCell(item.bundleStatus ?? '—')} | ${escapeCell(shortTime(item.createdAt))} |`,
    );
  });
  lines.push('');
  lines.push('Use `playground_get_attempt` with an id to read one submission\'s score, scoring state, and scorecard.');
  return lines.join('\n');
}

export function formatAttempt(attempt) {
  const lines = [`# Submission ${attempt.id}`];
  lines.push('');
  lines.push([
    attempt.challengeId ? `challenge: \`${attempt.challengeId}\`` : '',
    attempt.authorName ? `author: ${attempt.authorName}` : attempt.authorId ? `author: \`${attempt.authorId}\`` : '',
    attempt.type ? `type: ${attempt.type}` : '',
  ].filter(Boolean).join(' · '));
  lines.push('');
  lines.push([
    attempt.status ? `status: **${attempt.status}**` : '',
    `score: ${attemptScore(attempt)}`,
    attempt.outcome ? `outcome: ${attempt.outcome}` : '',
    attempt.bundleStatus ? `bundle: ${attempt.bundleStatus}` : '',
  ].filter(Boolean).join(' · '));
  const meta = [
    attempt.modelTag ? `model: ${attempt.modelTag}` : '',
    attempt.harness ? `harness: ${attempt.harness}` : '',
    attempt.traceCount !== undefined ? `trace steps: ${attempt.traceCount}` : '',
    attempt.createdAt ? `submitted: ${shortTime(attempt.createdAt)}` : '',
  ].filter(Boolean);
  if (meta.length > 0) lines.push('', meta.join(' · '));
  if (attempt.detail) lines.push('', `> ${truncate(attempt.detail, 600)}`);

  lines.push('', '## Scoring');
  const state = attempt.scoringState;
  if (state === undefined) {
    lines.push('- state: unknown (the platform returned no scoring state)');
  } else {
    lines.push(`- state: **${state.state ?? 'unknown'}**`);
    lines.push(`- final score: ${state.scoreIsFinal === true ? String(state.displayScore ?? attempt.score ?? '—') : 'not final yet'}`);
    if (state.provisionalScore !== undefined) lines.push(`- provisional score: ${state.provisionalScore}`);
    lines.push(`- action needed: ${state.actionNeeded === true ? 'yes' : state.actionNeeded === false ? 'no' : 'unknown'}`);
    if (state.workerStatus) lines.push(`- worker status: ${state.workerStatus}`);
    if (state.zeroReason) lines.push(`- zero reason: ${state.zeroReason}`);
  }

  if (attempt.scorecard) {
    lines.push('', '## Scorecard', '```json', attempt.scorecard, '```');
    if (attempt.scorecardTruncated) lines.push('> Scorecard truncated; read the full record on the platform.');
  }
  lines.push('', 'A queued state does not confirm that a worker is running. Bundle acceptance and upload metrics do not establish a final scientific score.');
  return lines.join('\n');
}

function formatViolations(violations) {
  if (!Array.isArray(violations) || violations.length === 0) return [];
  const lines = ['', `## Bundle violations (${violations.length})`];
  for (const violation of violations) {
    const rule = violation.rule ? `\`${violation.rule}\`: ` : '';
    lines.push(`- ${rule}${violation.message ?? 'no message'}`);
    if (violation.fix) lines.push(`  - fix: ${truncate(violation.fix, 400)}`);
    if (violation.docs) lines.push(`  - docs: ${violation.docs}`);
  }
  return lines;
}

// The checked bundle's summary (lib/bundle.js summarizeZip) as a few Markdown lines; names are ZIP entry names.
function formatBundleSummary(summary) {
  if (!summary || typeof summary !== 'object' || !Number.isFinite(summary.files)) return '';
  const named = (items) => (Array.isArray(items) ? items : []).map((item) => `${escapeCell(item?.name ?? '')} (${item?.bytes} bytes)`).join(', ');
  return [
    '', `评测包摘要（只读 ZIP 目录）：${summary.files} 个文件，共 ${summary.totalBytes} bytes${summary.complete === false ? '；ZIP 目录未能读完' : ''}`,
    `- 最大的文件：${named(summary.largest) || '—'}`,
    `- 按扩展名不是已知 UTF-8 文本的文件（${summary.nonTextCount} 个）：${named(summary.nonText) || '—'}`,
    `- 符号链接（${summary.symlinkCount} 个）：${(Array.isArray(summary.symlinks) ? summary.symlinks : []).map(escapeCell).join(', ') || '—'}`,
  ].join('\n');
}

export function formatSubmission(result) {
  if (result.status === 'awaiting_confirmation') {
    const prepared = result.workflow.prepared;
    return `# 提交前检查：${prepared.challenge.title}\n\n目标赛题：\`${prepared.challenge.id}\`\n平台：${prepared.baseUrl}\n工作区：${prepared.cwd}\n\n${prepared.files.map((file) => `- ${file.kind}: ${file.path} (${file.bytes} bytes, SHA-256 ${file.sha256})`).join('\n')}\n${formatBundleSummary(result.bundleSummary ?? prepared.bundleSummary)}\n\n${result.note}`;
  }
  if (result.ok !== true) {
    const lines = [`## Submission failed${result.stage ? ` (${result.stage})` : ''}`];
    lines.push('');
    lines.push(formatError(result.error ?? { code: 'request_failed', message: 'unknown error' }));
    if (result.attemptId !== undefined) {
      lines.push('', `Submission id: ${result.attemptId}. Re-run with \`attempt_id\` ${result.attemptId} to retry only the failed stage.`);
    }
    lines.push(...formatViolations(result.violations));
    return lines.join('\n');
  }

  const lines = [result.created === false
    ? `## Submission ${result.attemptId} reused`
    : `## Submission ${result.attemptId} created`];
  lines.push('');
  lines.push([
    result.challengeId ? `challenge: \`${result.challengeId}\`` : '',
    result.status ? `status: **${result.status}**` : '',
    result.bundleStatus ? `bundle: ${result.bundleStatus}` : '',
    `score: ${attemptScore(result)}`,
  ].filter(Boolean).join(' · '));
  if (result.note) lines.push('', result.note);
  lines.push(...formatViolations(result.violations));
  if (result.attemptId !== undefined) {
    lines.push('', `Next: \`playground_get_attempt\` with id ${result.attemptId} to read scoring status and results.`);
  }
  return lines.join('\n');
}

export function formatError(error) {
  const status = error.status !== undefined ? ` (HTTP ${error.status})` : '';
  return `Playground request failed${status}: ${error.message}\n\ncode: \`${error.code ?? 'request_failed'}\``;
}
