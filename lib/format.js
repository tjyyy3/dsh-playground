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
  const lines = [];
  lines.push(
    `Found **${result.total}** challenge(s) · page ${result.page}/${result.pages} · showing ${result.items.length}`,
  );
  if (result.items.length === 0) {
    lines.push('', 'No challenge matched these filters.');
    return lines.join('\n');
  }
  lines.push('', ...challengeTable(result), '');
  if (result.hasMore) {
    lines.push(`More pages are available: call again with \`page\` ${result.page + 1} (or a larger \`per_page\`).`);
  }
  lines.push('Use `playground_get_challenge` with an id to read the problem statement and resources.');
  return lines.join('\n');
}

function challengeTable(result) {
  const start = (result.page - 1) * result.perPage;
  return [
    '| # | id | title | discipline | difficulty | attempts |',
    '|---:|---|---|---|---:|---:|',
    ...result.items.map((item, index) => {
      const title = item.titleZh && item.titleZh !== item.title ? `${item.title} / ${item.titleZh}` : item.title;
      return `| ${start + index + 1} | \`${escapeCell(item.id)}\` | ${escapeCell(title)} | ${escapeCell(item.discipline ?? '—')} | ${item.difficulty ?? '—'} | ${item.attempts ?? '—'} |`;
    }),
  ];
}

const ORDER_TEXT = { official: 'in official order', attempts: 'sorted by attempts, most first', newest: 'newest first' };

/** One page of a built-in contest, period, or group read through the workbench catalog. */
export function formatContestList(result) {
  const order = ORDER_TEXT[result.order];
  const lines = [`Found **${result.total}** challenge(s) ${order} · page ${result.page}/${result.pages} · showing ${result.items.length} · per_page ${result.perPage}`];
  if (result.competition) {
    lines.push('', `Contest \`${result.competition.id}\` ${escapeCell(result.competition.nameZh)} · ${escapeCell(result.competition.status)}`, ...periodLines(result.competition, ''));
  }
  if (result.period) lines.push('', `Selected period \`${result.period.slug}\` · ${periodCounts(result.period)}`);
  if (result.missing) {
    lines.push('', `${result.missing} challenge(s) of this selection could not be read and are left out, so this page is incomplete and later pages may shift. Read again from page 1 with the same arguments before you say that the list is complete.`);
  }
  if (result.items.length === 0) {
    lines.push('', result.total > 0 ? `Page ${result.page} is past the last page, ${result.pages}.`
      : result.filtered ? 'No challenge in this selection matched the search or filters.' : 'No challenge is open for this selection.');
    return lines.join('\n');
  }
  lines.push('', ...challengeTable(result), '');
  if (result.hasMore) {
    lines.push(`This page is part of the list. To list the rest, call again with the same arguments, \`page\` ${result.page + 1}, and the same \`per_page\` ${result.perPage}.`);
    if (result.pageSignature) lines.push(`Pass \`page_signature\` \`${result.pageSignature}\` on that call.`);
  } else if (result.page === 1 && !result.missing) {
    lines.push(`This page lists every matching challenge ${order}.`);
  }
  lines.push('Use `playground_get_challenge` with an id to read the problem statement and resources.');
  return lines.join('\n');
}

function periodCounts(period) {
  const total = `${period.count} in this period`;
  return period.groupedCount === undefined ? total : `${total}, ${period.groupedCount} of them in groups`;
}

// A contest's periods with their counts and official groups, as the controller copies them.
function periodLines(contest, indent) {
  const lines = [];
  for (const period of contest.periods ?? []) {
    lines.push(`${indent}- period \`${period.slug}\` ${escapeCell(period.labelZh)} · ${escapeCell(period.status)} · ${periodCounts(period)}`);
    for (const group of period.groups ?? []) {
      lines.push(`${indent}  - group \`${group.key}\`${group.labelZh ? ` ${escapeCell(group.labelZh)}` : ''} · ${group.count}`);
    }
  }
  if (contest.periodsStale) {
    lines.push(`${indent}  The official schedule of this contest could not be refreshed, so these periods and groups may be out of date.`);
  }
  return lines;
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

/** The workbench contest table, the `contests` view of playground_list_competitions. */
export function formatContests(result) {
  const lines = [`Found **${result.total}** contest(s) in the workbench table. Match the contest the user names to nameZh, then copy its id, a period slug, and a group key from this list into playground_list_challenges as competition, period, and group.`];
  if (result.seasonsUnavailable) {
    lines.push('The platform season list could not be read, so seasons that only the platform lists are missing from this table.');
  }
  lines.push('');
  for (const item of result.contests) {
    const copy = item.kind === 'season' ? `season=${item.season}` : item.id;
    lines.push(`- \`${copy}\` ${escapeCell(item.nameZh || item.name)} · ${escapeCell(item.status)}${item.timeText ? ` · ${escapeCell(item.timeText)}` : ''}`);
    lines.push(...periodLines(item, '  '));
  }
  lines.push('', 'A row shown as `season=<slug>` has no contest id. Pass its slug to playground_list_challenges as season. season does not select a period.');
  return lines.join('\n');
}

export function formatCompetition(result) {
  return [
    `# ${result.nameZh || result.name}`, '',
    `id: ${result.id} · season: ${result.slug} · status: ${result.status ?? 'unknown'}`,
    `Starts: ${shortTime(result.startAt)} · Ends: ${shortTime(result.endAt)}`,
    ...(result.completionThreshold !== undefined ? [`Completion threshold: ${result.completionThreshold}`] : []),
    '', '## Challenges',
    ...(result.challengeIds?.length ? result.challengeIds.map((id) => `- \`${id}\``) : ['No visible challenge ids were returned.']),
    '', `This is one hackathon season. Filter playground_list_challenges with season ${result.slug} only for this season. A period contest is listed by playground_list_competitions with view contests.`,
  ].join('\n');
}

export function formatMyAttempts(result) {
  return [
    `# My submissions · showing ${result.items.length}`, '',
    ...(result.items.length ? [
      '| id | challenge | status | score | scoring | submitted |',
      '|---:|---|---|---|---|---|',
      ...result.items.map((item) => `| ${item.id} | ${escapeCell(item.challengeTitle || item.challengeId)} | ${escapeCell(item.status)} | ${escapeCell(attemptScore(item))} | ${escapeCell(item.scoringState?.state ?? 'unknown')} | ${escapeCell(shortTime(item.createdAt))} |`),
    ] : [result.partial ? 'No matching submission could be verified.' : 'No personal submissions matched these filters.']),
    ...(result.partial ? ['Platform history was incomplete. Only verified submissions are shown.'] : []),
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
  if (attempt.bundleNotReceived === true) {
    lines.push('- **closed by the platform: bundle not received（未收到评测包）.** It is not scored or re-evaluated; only a new submission, confirmed by the user, helps.');
  }
  if (attempt.scoringQueue?.stage) {
    lines.push(`- queue stage: ${escapeCell(attempt.scoringQueue.stage)}${attempt.scoringQueue.workerReceivedAt ? ` · Worker received the bundle: ${shortTime(attempt.scoringQueue.workerReceivedAt)}` : ' · Worker receipt: not yet'}`);
  }
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

export function formatError(error) {
  const status = error.status !== undefined ? ` (HTTP ${error.status})` : '';
  const reason = error.reason ? `\nreason: \`${error.reason}\`` : '';
  return `Playground request failed${status}: ${error.message}\n\ncode: \`${error.code ?? 'request_failed'}\`${reason}`;
}
