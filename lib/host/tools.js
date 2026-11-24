import { isAbsolute } from 'node:path';
import { ATTEMPT_SORTS, CHALLENGE_PAGE_SIZE_MAX, COMPETITION_STATUSES, DECLARABLE_OUTCOMES } from '../api.js';
import { createCatalog, readCompetitionTable } from '../catalog.js';
import { COMPETITION_IDS, findCompetition, GROUPED_COMPETITION_IDS } from '../competitions.js';
import { formatAttempt, formatAttemptList, formatChallenge, formatCompetition, formatCompetitions, formatContestList, formatContests, formatList, formatMyAttempts } from '../format.js';
import { errorValue, presentationMeta, renderResult, renderText, taskStatus, toToolValue } from './views.js';
import { fail } from '../workflow-result.js';

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    titleZh: { type: 'string' },
    discipline: { type: 'string' },
    difficulty: { type: 'number' },
    attempts: { type: 'integer' },
    origin: { type: 'string' },
    status: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    hasContent: { type: 'boolean' },
  },
  required: ['id', 'title'],
};

const RESOURCE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    kind: { type: 'string' },
    description: { type: 'string' },
    role: { type: 'string' },
    source: { type: 'string' },
  },
};

const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    status: { type: 'integer' },
    reason: { type: 'string' },
  },
  required: ['code', 'message'],
};

const SCORING_STATE_SCHEMA = {
  type: 'object',
  properties: {
    state: { type: 'string' },
    scoreIsFinal: { type: 'boolean' },
    displayScore: { type: 'number' },
    provisionalScore: { type: 'number' },
    actionNeeded: { type: 'boolean' },
    workerStatus: { type: 'string' },
    zeroReason: { type: 'string' },
    overrideInEffect: { type: 'boolean' },
  },
};

const ATTEMPT_PROPERTIES = {
  id: { type: 'integer' },
  challengeId: { type: 'string' },
  challengeTitle: { type: 'string' },
  authorId: { type: 'string' },
  authorName: { type: 'string' },
  type: { type: 'string' },
  method: { type: 'string' },
  detail: { type: 'string' },
  status: { type: 'string' },
  outcome: { type: 'string' },
  score: { type: 'number' },
  bundleStatus: { type: 'string' },
  modelTag: { type: 'string' },
  harness: { type: 'string' },
  createdAt: { type: 'string' },
  updatedAt: { type: 'string' },
  traceCount: { type: 'integer' },
  scoringState: SCORING_STATE_SCHEMA,
};

const VIOLATION_SCHEMA = {
  type: 'object',
  properties: {
    rule: { type: 'string' },
    message: { type: 'string' },
    fix: { type: 'string' },
    docs: { type: 'string' },
  },
};

// One official group of a contest or of one of its periods, with the number of challenges it holds.
const CONTEST_GROUP_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    labelZh: { type: 'string' },
    count: { type: 'integer' },
  },
  required: ['key', 'count'],
};

// One period of the workbench contest table: its counts at the time of the read and its official groups.
const CONTEST_PERIOD_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    labelZh: { type: 'string' },
    status: { type: 'string' },
    count: { type: 'integer' },
    groupedCount: { type: 'integer' },
    groups: {
      type: 'array',
      items: CONTEST_GROUP_SCHEMA,
    },
  },
  required: ['slug', 'count'],
};

const CONTEST_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string' },
    season: { type: 'string' },
    name: { type: 'string' },
    nameZh: { type: 'string' },
    status: { type: 'string' },
    startAt: { type: 'string' },
    endAt: { type: 'string' },
    timeText: { type: 'string' },
    periodsStale: { type: 'boolean' },
    periods: { type: 'array', items: CONTEST_PERIOD_SCHEMA },
    groups: { type: 'array', items: CONTEST_GROUP_SCHEMA },
    groupsStale: { type: 'boolean' },
  },
};

const LIST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    total: { type: 'integer' },
    page: { type: 'integer' },
    perPage: { type: 'integer' },
    pages: { type: 'integer' },
    hasMore: { type: 'boolean' },
    items: { type: 'array', items: CARD_SCHEMA },
    missing: { type: 'integer' },
    pageSignature: { type: 'string' },
    order: { type: 'string', enum: ['official', 'attempts', 'newest'] },
    filtered: { type: 'boolean' },
    competition: CONTEST_SCHEMA,
    period: {
      type: 'object',
      properties: { slug: { type: 'string' }, count: { type: 'integer' }, groupedCount: { type: 'integer' } },
      required: ['slug', 'count'],
    },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const DETAIL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    ...CARD_SCHEMA.properties,
    content: { type: 'string' },
    contentGated: { type: 'boolean' },
    maxContentChars: { type: 'integer' },
    resources: { type: 'array', items: RESOURCE_SCHEMA },
    reviewStatus: { type: 'string' },
    submittedBy: { type: 'string' },
    armiId: { type: 'string' },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const LIST_ATTEMPTS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    challengeId: { type: 'string' },
    total: { type: 'integer' },
    totalNonDraft: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
    sort: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: ATTEMPT_PROPERTIES } },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const GET_ATTEMPT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    ...ATTEMPT_PROPERTIES,
    scorecard: { type: 'string' },
    scorecardTruncated: { type: 'boolean' },
    error: ERROR_SCHEMA,
  },
  required: ['ok'],
};

const COMPETITION_PROPERTIES = {
  id: { type: 'integer' },
  slug: { type: 'string' },
  name: { type: 'string' },
  nameZh: { type: 'string' },
  seasonLabel: { type: 'string' },
  status: { type: 'string' },
  startAt: { type: 'string' },
  endAt: { type: 'string' },
  visibility: { type: 'string' },
  completionThreshold: { type: 'number' },
  challengeIds: { type: 'array', items: { type: 'string' } },
};

const COMPETITION_VIEWS = ['seasons', 'contests'];

function createCompetitionListTool(client) {
  return {
    name: 'playground_list_competitions',
    description: 'List Playground competitions. The default view, seasons, lists the platform hackathon seasons with numeric id, slug, lifecycle status, deadlines, completion threshold, and challenge ids. Read one season with playground_get_competition, and filter seasons with status. view contests lists the contest table the Playground workbench shows instead. Use view contests first when the user names a built-in contest or a period, such as 玻尔AI产品周赛第四期. Match the name to nameZh, then copy the contest id, a period slug, and a group key into playground_list_challenges as competition, period, and group. Do not invent them. A contest with periods lists them in official order, each with slug, labelZh, status, and count, the number of challenges open in that period. A period the official schedule groups also has groupedCount, the number of distinct challenges in its groups, and its groups in official order, each with key, labelZh when known, and count. count can be greater than groupedCount when some challenges belong to no official group. One challenge can belong to several groups, so the group counts can add up to more than groupedCount. Report count and groupedCount, and do not present the sum of the group counts as the whole period. A contest without periods can carry its own official groups instead, each with key, labelZh when known, and count: 追光者计划·招募赛 by the 岗位 it recruits for, 科学骑士大师赛 by scoring round, and Paper2Arm 黑客松 · 第二季 by hackathon track. Copy such a group key into playground_list_challenges as group with competition and no period. These groups are read from the platform on each table read, so groupsStale on a contest means its groups could not be refreshed and may be out of date or incomplete. A period of 大科学装置专项赛 or 科学骑士大师赛 · 北大专区 counts 0 until its official start. A row with kind season has no contest id. Pass its season to playground_list_challenges as season. season does not select a period. status applies to the seasons view only. This tool only reads. It does not open a conversation, delegate work, or submit.',
    parameters: { type: 'object', properties: {
      status: { type: 'string', enum: COMPETITION_STATUSES, description: 'Optional lifecycle filter of the seasons view.' },
      view: { type: 'string', enum: COMPETITION_VIEWS, description: 'seasons, the default, lists platform hackathon seasons by numeric id. contests lists the workbench contest table with the contest ids, periods, and official groups that playground_list_challenges accepts, including the groups of a contest that has no periods.' },
    } },
    output: {
      schema: { type: 'object', properties: {
        ok: { type: 'boolean' }, baseUrl: { type: 'string' }, total: { type: 'integer' },
        items: { type: 'array', items: { type: 'object', properties: COMPETITION_PROPERTIES } },
        view: { type: 'string', enum: COMPETITION_VIEWS },
        contests: { type: 'array', items: CONTEST_SCHEMA },
        seasonsUnavailable: { type: 'boolean' },
        error: ERROR_SCHEMA,
      }, required: ['ok'] },
      render: (_args, value) => renderResult(value, (result) => (result.contests ? formatContests(result) : formatCompetitions(result))),
    },
    async execute(args, exec) {
      try {
        if (args.view === undefined || args.view === 'seasons') {
          return toToolValue({ ok: true, baseUrl: client.baseUrl, ...await client.listCompetitions(args, { signal: exec.signal }) });
        }
        if (args.view !== 'contests') return toToolValue(fail(`unsupported view "${args.view}". Use seasons or contests.`));
        if (args.status !== undefined) return toToolValue(fail('status filters the seasons view only. The contests view lists every contest with its status.'));
        const table = await readCompetitionTable(client, exec);
        return toToolValue({ ok: true, baseUrl: client.baseUrl, view: 'contests', total: table.items.length, contests: table.items,
          ...(table.seasonsUnavailable ? { seasonsUnavailable: true } : {}) });
      } catch (error) { return errorValue(error); }
    },
  };
}

function createCompetitionDetailTool(client) {
  return {
    name: 'playground_get_competition',
    description: 'Read one platform hackathon season by the numeric id from the default seasons view of playground_list_competitions. It returns status, dates, completion threshold, and challenge ids. A contest id from view contests is not a numeric id. List that contest with playground_list_challenges and its competition, period, and group. Use this season slug as the season filter of playground_list_challenges only for this hackathon season, never to select a period.',
    parameters: { type: 'object', properties: {
      competition_id: { type: 'integer', description: 'Numeric id from the default seasons view of playground_list_competitions. A contest id from view contests is not accepted.' },
    }, required: ['competition_id'] },
    output: {
      schema: { type: 'object', properties: {
        ok: { type: 'boolean' }, baseUrl: { type: 'string' }, ...COMPETITION_PROPERTIES, error: ERROR_SCHEMA,
      }, required: ['ok'] },
      render: (_args, value) => renderResult(value, formatCompetition),
    },
    async execute(args, exec) {
      try {
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...await client.getCompetition(args.competition_id, { signal: exec.signal }) });
      } catch (error) { return errorValue(error); }
    },
  };
}

function createMyAttemptsTool(client, overview) {
  return {
    name: 'playground_list_my_attempts',
    description: 'List only the authenticated Playground user\'s own submissions across challenges, newest first. Use this for "my submissions" rather than a public challenge submission list. Requires a Playground token. Cursor pagination must keep the same challenge_id and status filters. Read one submission with playground_get_attempt for full metrics.',
    parameters: { type: 'object', properties: {
      challenge_id: { type: 'string', description: 'Optional exact challenge id filter.' },
      status: { type: 'string', description: 'Optional exact submission status filter, for example submitted.' },
      limit: { type: 'integer', description: 'Rows to return, 1-100; defaults to 20.' },
      cursor: { type: 'string', description: 'Opaque nextCursor from a previous page; preserve the same filters.' },
    } },
    output: {
      schema: { type: 'object', properties: {
        ok: { type: 'boolean' }, baseUrl: { type: 'string' }, limit: { type: 'integer' },
        nextCursor: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        items: { type: 'array', items: { type: 'object', properties: ATTEMPT_PROPERTIES } },
        error: ERROR_SCHEMA,
      }, required: ['ok'] },
      render: (_args, value) => renderResult(value, formatMyAttempts),
    },
    async execute(args, exec) {
      try {
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...await overview.history({
          challengeId: args.challenge_id, status: args.status, limit: args.limit ?? 20, cursor: args.cursor,
        }, { signal: exec.signal }) });
      } catch (error) { return errorValue(error); }
    },
  };
}

// The argument rules of a built-in contest read, each failing with its own reason. The catalog refuses these
// combinations too, but with the workbench's Chinese selector messages and no reason. It keeps the period and
// group checks that need the official schedule.
function contestArgumentFailure(args) {
  const competition = findCompetition(args.competition);
  const copy = 'Copy competition, period, and group from playground_list_competitions with view contests.';
  if (args.competition !== undefined && !competition) {
    return fail(`Unknown competition "${args.competition}". ${copy}`, 'invalid_argument', 'unknown_competition');
  }
  if (args.period !== undefined && !competition) return fail(`period requires competition. ${copy}`, 'invalid_argument', 'period_needs_competition');
  if (args.period !== undefined && !competition.periods) {
    return fail(`Competition ${competition.id} has no periods. List it with competition only.`, 'invalid_argument', 'competition_has_no_periods');
  }
  if (args.group !== undefined && args.period === undefined && !GROUPED_COMPETITION_IDS.includes(competition?.id)) {
    return fail(competition && !competition.periods
      ? `Competition ${competition.id} has no official groups. List it with competition only.`
      : `group requires period. ${copy}`, 'invalid_argument', competition && !competition.periods ? 'competition_has_no_groups' : 'group_needs_period');
  }
  const perPage = args.per_page;
  if (perPage !== undefined && !(Number.isInteger(perPage) && perPage >= 1 && perPage <= CHALLENGE_PAGE_SIZE_MAX)) {
    return fail(`per_page must be an integer from 1 to ${CHALLENGE_PAGE_SIZE_MAX}.`);
  }
  return undefined;
}

// The order a contest page is in. A period, a group, or fixed challenge ids keep the official order unless sorted
// by attempts. A contest read by tag or season is the platform list, newest first.
function contestOrder(args) {
  if (args.sort === 'attempts') return 'attempts';
  const { select } = findCompetition(args.competition);
  return select.tag || select.season ? 'newest' : 'official';
}

function createListTool(client) {
  const { catalog } = createCatalog({ client });
  return {
    name: 'playground_list_challenges',
    description: 'List Playground challenges. Without competition, period, and group, this searches the platform challenge list with search, discipline, origin, season, sort, and paging. season filters a hackathon season. It does not select a period of 玻尔AI产品周赛 or any other period contest. When the user names a built-in contest or a period, call playground_list_competitions with view contests first and copy competition, period, and group from that result. Do not invent them. With competition, this lists that contest through the workbench catalog. period narrows it to one period, and group to one official group of that period, including pages after the first. A contest without periods can carry its own official groups, and group then selects one of them without period. With the default sort, a period, a group, or a contest with fixed challenges keeps the official order. sort attempts orders the rows by attempts instead. A contest read by tag or season follows the platform list, newest first. order in the result says which order a page is in. The first page includes the contest with each period\'s count, groupedCount, and groups, or with the contest\'s own groups when it has no periods. A contest group carries key, labelZh when known, and count, the number of challenges in that group. Every page of a period includes period, with that period\'s count and groupedCount. count can be greater than groupedCount when some challenges belong to no official group. One challenge can belong to several groups, so do not present the sum of the group counts as the whole period. When hasMore is true the page is part of the list. Report the tracks and counts before treating the titles as the whole set. To list every matching challenge, repeat the same arguments and the same per_page with the next page until hasMore is false. On each next page of a fixed-id list pass pageSignature from the preceding result as page_signature. If catalog_changed is returned, discard the earlier pages and restart at page 1 without page_signature. missing counts challenges that could not be read. When missing is present the list is incomplete, so read again from page 1 before saying that the list is complete. An argument error carries a reason, such as unknown_competition, period_needs_competition, competition_has_no_periods, group_needs_period, or competition_has_no_groups for a contest that has neither periods nor official groups. A period the fresh official schedule cannot provide fails with reason period_not_available. A group the fresh official schedule cannot provide right now fails with reason group_not_available. That reason means the fresh schedule cannot provide this classification at this moment. A stale or bundled schedule fails without that reason. A contest whose own groups could not be refreshed carries groupsStale, and a group of it fails without a reason, because the grouping that is missing may still contain that group; read again before deciding the group is gone. The failure is an error, not an empty list. per_page is 1 to 50. This tool itself does not recommend challenges. This tool only reads. It does not open a conversation, delegate work, or submit.',
    parameters: {
      type: 'object',
      properties: {
        competition: {
          type: 'string',
          enum: COMPETITION_IDS,
          description: 'Built-in contest id copied from playground_list_competitions with view contests. Omit it for a platform search.',
        },
        period: {
          type: 'string',
          description: 'Period slug copied from that contest\'s periods. Requires competition. Omit it to list every period of the contest.',
        },
        group: {
          type: 'string',
          description: 'Group key copied from the chosen period\'s groups, or from the contest\'s own groups when the contest has no periods. A contest with periods requires period. Omit it to list the whole period or contest.',
        },
        search: {
          type: 'string',
          description: 'Free-text search over English and Chinese challenge titles.',
        },
        discipline: {
          type: 'string',
          description: 'Discipline key filter (for example hep, cond-mat). Discover keys from the returned rows.',
        },
        origin: {
          type: 'string',
          enum: ['community', 'hackathon', 'benchmark', 'arena'],
          description: 'Challenge origin filter.',
        },
        season: {
          type: 'string',
          description: 'Hackathon season slug, from the seasons view of playground_list_competitions or a contests view row shown as season=<slug>. It does not select a period.',
        },
        sort: {
          type: 'string',
          enum: ['newest', 'attempts'],
          description: 'Sort order. Defaults to newest.',
        },
        page: {
          type: 'integer',
          description: '1-based page number. Defaults to 1.',
        },
        page_signature: { type: 'string', description: 'Copy pageSignature from the preceding fixed-id page when continuing. Omit on a new read.' },
        per_page: {
          type: 'integer',
          description: 'Rows per page, 1-50. Defaults to 10 for a platform search and 12 for a contest, period, or group. Keep it the same on every page of one list.',
        },
      },
    },
    output: {
      schema: LIST_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, (result) => (result.order ? formatContestList(result) : formatList(result))),
    },
    async execute(args, exec) {
      try {
        if (args.competition === undefined && args.period === undefined && args.group === undefined) {
          const result = await client.listChallenges({
            search: args.search,
            discipline: args.discipline,
            origin: args.origin,
            season: args.season,
            sort: args.sort,
            page: args.page,
            perPage: args.per_page,
          }, { signal: exec.signal });
          return toToolValue({ ok: true, baseUrl: client.baseUrl, ...result });
        }
        const failure = contestArgumentFailure(args);
        if (failure) return toToolValue(failure);
        const result = await catalog({
          competition: args.competition,
          period: args.period,
          group: args.group,
          search: args.search,
          discipline: args.discipline,
          origin: args.origin,
          sort: args.sort,
          page: args.page,
          per_page: args.per_page,
          page_signature: args.page_signature,
        }, exec);
        if (result.ok === false) return toToolValue(result);
        const competition = result.competitionTable?.find((item) => item.id === args.competition);
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...result.challenges,
          order: contestOrder(args),
          ...(cleanString(args.search) || args.discipline || args.origin ? { filtered: true } : {}),
          ...(competition ? { competition } : {}),
          ...(result.periodCounts ? { period: { slug: args.period, ...result.periodCounts } } : {}) });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'List Playground challenges',
      kind: 'read',
      ...(args?.search ? { rawInput: args.search } : {}),
    }),
  };
}

function createDetailTool(client) {
  return {
    name: 'playground_get_challenge',
    description: 'Read one challenge from the Playground platform by id: title, metadata, bundled resources, and the full markdown problem statement (bounded by max_content_chars). Use playground_list_challenges first to obtain an id.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Exact challenge id returned by playground_list_challenges.',
        },
        max_content_chars: {
          type: 'integer',
          description: 'Maximum problem-statement characters to return, 1000-50000. Defaults to 12000.',
        },
      },
      required: ['id'],
    },
    output: {
      schema: DETAIL_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, (detail) => formatChallenge(
        { ...detail, resources: detail.resources ?? [] },
        { maxContentChars: detail.maxContentChars },
      )),
    },
    async execute(args, exec) {
      try {
        const requested = Number(args.max_content_chars);
        const maxContentChars = Number.isFinite(requested)
          ? Math.max(1000, Math.min(50000, Math.floor(requested)))
          : 12000;
        const detail = await client.getChallenge(args.id, { signal: exec.signal });
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...detail, maxContentChars });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Read Playground challenge',
      kind: 'read',
      ...(args?.id ? { rawInput: args.id } : {}),
    }),
  };
}

function createListAttemptsTool(client) {
  return {
    name: 'playground_list_attempts',
    description: 'List submissions for one Playground challenge, best score first by default. Returns submission ids, authors, status, score, scoring state, and bundle status. Public submissions are visible without a token; live competitions may hide other contestants\' submissions. Use playground_get_attempt with an id to read one submission\'s full result.',
    parameters: {
      type: 'object',
      properties: {
        challenge_id: {
          type: 'string',
          description: 'Challenge id from playground_list_challenges.',
        },
        page: {
          type: 'integer',
          description: '1-based page number. Defaults to 1.',
        },
        limit: {
          type: 'integer',
          description: 'Rows per page, 1-100. Defaults to 20.',
        },
        sort: {
          type: 'string',
          enum: ATTEMPT_SORTS,
          description: 'score is best-first, newest is latest first. Defaults to score.',
        },
        outcome: {
          type: 'string',
          enum: DECLARABLE_OUTCOMES,
          description: 'Only submissions that declared this outcome.',
        },
      },
      required: ['challenge_id'],
    },
    output: {
      schema: LIST_ATTEMPTS_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, formatAttemptList),
    },
    async execute(args, exec) {
      try {
        const challengeId = cleanString(args.challenge_id);
        const result = await client.listAttempts(challengeId, {
          page: args.page,
          limit: args.limit,
          sort: args.sort,
          outcome: args.outcome,
        }, { signal: exec.signal });
        return toToolValue({ ok: true, baseUrl: client.baseUrl, challengeId, ...result });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'List Playground submissions',
      kind: 'read',
      ...(args?.challenge_id ? { rawInput: args.challenge_id } : {}),
    }),
  };
}

function createGetAttemptTool(client) {
  return {
    name: 'playground_get_attempt',
    description: 'Read one Playground submission by id: status, score and whether it is final, scoring state (queued, evaluating, final, failed, and so on), bundle status, and the ARM scorecard when present. Use playground_list_attempts to obtain an id, or track an ID returned by an official submission tool.',
    parameters: {
      type: 'object',
      properties: {
        attempt_id: {
          type: 'integer',
          description: 'Numeric submission id.',
        },
      },
      required: ['attempt_id'],
    },
    output: {
      schema: GET_ATTEMPT_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult(value, formatAttempt),
    },
    async execute(args, exec) {
      try {
        const attempt = await client.getAttempt(args.attempt_id, { signal: exec.signal });
        return toToolValue({ ok: true, baseUrl: client.baseUrl, ...attempt });
      } catch (error) {
        return errorValue(error);
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Read Playground submission',
      kind: 'read',
      ...(args?.attempt_id ? { rawInput: `#${args.attempt_id}` } : {}),
    }),
  };
}

/**
 * Mount the tools in the scope that loaded this plugin.
 * @param ctx Cordis context carrying the `tools` registry.
 * @param config Optional patch config: { baseUrl?, token?, timeoutMs? }.
 */
export function registerReadOnlyTools(ctx, client, overview) {
  [
    createListTool(client), createDetailTool(client), createListAttemptsTool(client),
    createGetAttemptTool(client),
    createCompetitionListTool(client), createCompetitionDetailTool(client), createMyAttemptsTool(client, overview),
  ].forEach((tool) => {
    tool.output.presentationMeta = presentationMeta;
    ctx.tools.register(tool);
  });
}

export function registerTaskTools(scope, workflow, controller) {
    const output = { schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      render: (_args, value) => renderText(JSON.stringify(value, null, 2)), presentationMeta };
    scope.tools.register({ name: 'playground_open_controller', description: 'Find the Playground controller for an existing registered DSH workspace and return a button to open its native conversation. Call only when the user asks to open, create, or initialize a workspace controller. Use the absolute directory they named, or the current conversation’s workspace if they asked from it. Set create_if_missing only when they explicitly request creation or initialization. Creation and initialization send one message asking the DSH model to acknowledge its role. Reopening a started controller sends no prompt. If ordinary open reports a missing or uninitialized controller, direct the user to Playground Workbench.',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Absolute path of the registered workspace.' }, create_if_missing: { type: 'boolean' } }, required: ['cwd'] }, output,
      execute: async (args, exec) => {
        const cwd = cleanString(args.cwd);
        const workspace = cwd && isAbsolute(cwd) ? await scope.workspaceRegistry.resolveByPath(cwd).catch(() => undefined) : undefined;
        if (!workspace) return { ok: false, error: { code: 'workspace_missing', message: '请指定一个已添加的 DSH 工作区，或在 Playground 工作台中选择。' } };
        const result = await controller.open({ workspaceId: workspace.id, createIfMissing: args.create_if_missing === true }, exec.signal);
        return result.kind === 'opened' ? { ok: true, sessionId: result.sessionId, workspaceId: workspace.id, created: result.created }
          : { ok: false, error: { code: result.code, message: result.reason }, sessionIds: result.sessionIds };
      } });
    scope.tools.register({ name: 'playground_set_controller', description: 'Only on the user’s explicit request, make THIS conversation the Playground workspace controller. Preserves the conversation and reuses an existing controller. An empty conversation receives one initialization message. Takes no directory.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
      execute: async (_args, exec) => {
        const result = await controller.promote({ sessionId: exec.agent.id }, exec.signal);
        return result.kind === 'opened' ? { ok: true, sessionId: result.sessionId, created: false }
          : { ok: false, error: { code: result.code, message: result.reason }, sessionIds: result.sessionIds };
      } });
    scope.tools.register({ name: 'playground_controller_tasks', description: 'Read the current controller conversation’s direct delegated tasks and observed results. When noticeIsHistorical is true, terminalText and noticeStopReason describe a historical notice and do not prove the current run has ended.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
      execute: async (_args, exec) => {
        const marker = scope.sessionProjections.stateOf(exec.agent.session, 'playgroundController')?.marker;
        if (!marker || marker.sessionId !== exec.agent.id) return { ok: false, error: { code: 'not_controller', message: '当前对话不是工作区主控。' } };
        const result = await controller.tasks({ workspaceId: marker.workspaceId, sessionId: exec.agent.id }, exec.signal);
        return { ok: result.kind === 'ready', ...result };
      } });
    scope.tools.register({ name: 'playground_controller_link_task', description: 'Record an explicit challenge association for an existing direct child of THIS workspace controller after an accepted delegation. Copy challenge_id from the challenge handoff or the selected challenge, and child_id from the delegation result. Uses the current Client API base URL. Never infer a challenge from labels, creation times or the latest handoff. Reads the platform challenge for its canonical id and title. Preserves the first association. Correct it ONLY on the user\'s explicit request, supplying supersedes with the exact currently stored challenge id; a mismatched predecessor is refused. Creates no session, sends no prompt and writes nothing to the platform.',
      parameters: { type: 'object', properties: { child_id: { type: 'string' }, challenge_id: { type: 'string' }, supersedes: { type: 'string', description: 'Current stored challenge id, only for an explicitly user-requested correction.' } }, required: ['child_id', 'challenge_id'], additionalProperties: false },
      output: { ...output, presentationMeta: (_args, value) => value.ok ? { playgroundControllerAssociation: value.association } : {} },
      execute: (args, exec) => controller.linkTask(args, exec).then((result) => result.kind === 'associated'
        ? { ok: true, association: result.association } : { ok: false, error: { code: result.code, message: result.reason } }).catch(errorValue) });
    scope.tools.register({ name: 'playground_start_task', description: 'Create a NEW native DSH task conversation for an explicitly selected Playground challenge. If this conversation already has a Playground task, continue working here and use playground_task to read its context, receipts or results. Only create another task when the user explicitly requests a new task. From a conversation without a Playground task, when the user explicitly asks to work on, solve or submit a specific Playground challenge in this conversation, call playground_bind_task to bind this conversation instead of creating a new one; before preparing materials for submission in this conversation, bind it: the Playground task list, submission requests and result tracking use task conversations. Reading, browsing, explaining or comparing challenges needs neither tool. Call this tool only when the user explicitly asks for a new or separate task conversation. Use the directory the user names; if they name none, the current conversation\'s workspace is acceptable because the user started the request here. Requires an absolute cwd that is an existing registered DSH workspace; there is no implicit default. Does not create or register directories and does not submit platform changes.',
      parameters: { type: 'object', properties: { challenge_id: { type: 'string' }, cwd: { type: 'string', description: 'Required absolute path of a registered DSH workspace: the directory the user named, otherwise the current conversation\'s workspace.' }, mode: { type: 'string', enum: ['participate', 'author'] } }, required: ['challenge_id', 'cwd'] }, output,
      execute: (args, exec) => workflow.start(args, exec).then(toToolValue).catch(errorValue) });
    scope.tools.register({ name: 'playground_bind_task', description: 'Bind the CURRENT conversation to an explicitly selected Playground challenge, so this conversation becomes its task conversation: it then appears in the Playground task list, and result queries work here. Call it only when the user explicitly asks to work on, solve or submit a specific challenge in this conversation; reading, browsing, explaining or comparing challenges must not bind. A binding cannot be undone, so never call this tool without such a request. Creates no conversation, sends no prompt and writes nothing to the platform, so it needs no confirmation. The workspace is always this conversation\'s own working directory, which must be a registered DSH workspace; the tool takes no directory. If this conversation already has a Playground task, binding the same challenge again changes nothing (receipts and submissions stay), and a different challenge is refused: continue the existing task, or use playground_start_task only when the user explicitly asks for a new task. A conversation without a task keeps its receipts for the bound challenge; if they belong to another challenge, binding is refused. If binding is refused because this conversation has no registered workspace, explain that to the user and wait; do not create a task conversation on your own. After binding, read the statement with playground_get_challenge.',
      parameters: { type: 'object', properties: { challenge_id: { type: 'string' }, mode: { type: 'string', enum: ['participate', 'author'], description: 'Working mode; defaults to participate.' } }, required: ['challenge_id'] }, output,
      execute: (args, exec) => workflow.bind(args, exec).then(toToolValue).catch(errorValue) });
    scope.tools.register({ name: 'playground_task', description: 'Read this task, its current submission policy and results. On an explicit user submission request, the Agent chooses official CLI or API steps from the current challenge requirements. The plugin has no upload tool. Before execution announce submitPolicy.announcement; quota-sensitive workbench requests wait for a verified workbench reply. For a submission requested in the conversation, an explicit additional user answer in that conversation also counts. Model assertions and automatic approval results are not verified user consent. Action materials records only known authorized material paths, without reading content. Action track immediately records a real official attempt ID, including after upload failure, after checking challenge and signed-in or confirmed Agent-account ownership; repeated IDs are idempotent. Action progress reports not_created or unknown without an ID, or updates reported upload progress for a verified attempt_id without duplicating its association. Unknown outcomes must be reconciled using existing attempts before creating another. Mode is not an account role.',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'mode', 'results', 'track', 'materials', 'progress'] }, mode: { type: 'string', enum: ['participate', 'author'] }, attempt_id: { type: 'integer', description: 'For track: the real attempt ID returned by the official CLI or API, including when an upload later fails.' }, outputs_path: { type: 'string' }, bundle_path: { type: 'string' }, trace_path: { type: 'string' }, manifest_path: { type: 'string' }, material_request_id: { type: 'string' }, submission_state: { type: 'string', enum: ['not_created', 'created', 'uploaded', 'upload_failed', 'unknown'] }, message: { type: 'string', description: 'Short actual failure or progress, without credentials or material content.' }, http_status: { type: 'integer' } }, required: ['action'] }, output,
      execute: async (args, exec) => {
        if (args.action === 'status') {
          // #63: the ask-first policy for a new submission now, so a terminal submit needs no material check first.
          const live = await workflow.taskPolicy(exec).catch((error) => { if (exec.signal?.aborted || error?.code === 'cancelled') throw error; return undefined; });
          return toToolValue(taskStatus(scope.sessionProjections.stateOf(exec.agent.session, 'playgroundTask'), live));
        }
        if (args.action === 'results') return workflow.results({}, exec).then(toToolValue).catch(errorValue);
        if (args.action === 'track') return workflow.track(args, exec).then(toToolValue).catch(errorValue);
        if (args.action === 'materials') return workflow.setMaterials(args, exec).then(toToolValue).catch(errorValue);
        if (args.action === 'progress') return workflow.reportSubmission(args, exec).then(toToolValue).catch(errorValue);
        const result = await workflow.command({ agent: exec.agent, signal: exec.signal, rawInput: JSON.stringify(args) });
        return JSON.parse(result.text);
      } });
}
