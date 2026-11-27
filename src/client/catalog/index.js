import { msg, currentLanguage } from '../shared/language.js';
import * as React from 'react';
import { h } from '../shared/react.js';
import { openWebButton, statusTone } from '../shared/display.js';
import { locales } from '../shared/locale.js';
import { ChallengeDetailDrawer, DispatchChallengeButton } from './detail.js';

// The competition selector. The Host returns built-in competitions (queried by `competition`) and API
// seasons the table lacks (queried by `season`); the select value says which. A bare value is a season slug.
const competitionGroups = () => [['live', msg('进行中', 'Live')], ['upcoming', msg('即将开始', 'Upcoming')], ['ended', msg('已结束', 'Ended')]];

const COMPETITION_TONES = { live: 'success', upcoming: 'warning' };

const competitionStatusText = (status) => (competitionGroups().find(([key]) => key === status) || [])[1] || '';

const competitionValue = (item) => (item.kind === 'season' ? `season:${item.season}` : `competition:${item.id}`);

function scheduleText(value) {
  if (!value || currentLanguage() === 'zh') return value;
  return value.replace('日期待定', 'Dates to be announced').replace(/^至 /, 'Until ').replace(/ 起/g, ' onward')
    .replaceAll('第一期', 'Period 1').replaceAll('第二期', 'Period 2').replaceAll('第三期', 'Period 3')
    .replaceAll('科学挑战', 'Science challenge').replaceAll('学术效率', 'Academic efficiency')
    .replaceAll('第一季', 'Season 1').replaceAll('第二季', 'Season 2').replace('每周计分轮，共 6 轮', '6 weekly scoring rounds');
}

const competitionName = (item) => item && (msg(item.nameZh || item.name, item.nameEn || item.name || item.nameZh) || item.id);
const periodName = (item) => item && (msg(item.labelZh, item.labelEn
  || (/^第[一二三四五六七八九十百\d]+期$/.test(item.labelZh) && /^\d+$/.test(item.slug) ? `Period ${item.slug}` : scheduleText(item.labelZh))) || item.slug);
const competitionLabel = (item) => [competitionName(item), competitionStatusText(item.status), scheduleText(item.dateText)].filter(Boolean).join(' · ');

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

// A period that the website groups carries its official groups `{ key, labelZh?, count }` in the website's
// order, and a competition the website groups without periods carries its own the same way. The group choice
// is '' (全部) or one key; choosing another competition or period returns to 全部.
const officialGroups = (source) => (Array.isArray(source?.groups)
  ? source.groups.filter((group) => typeof group?.key === 'string' && group.key && Number.isSafeInteger(group.count)) : []);

// `labelZh` is optional: when the Host could not read a group's name, the plugin's own name for the key is shown, else the key.
function groupLabel(group) {
  const language = currentLanguage();
  // Keep an unfamiliar official name intact when the platform supplies only Chinese.
  if (language === 'en') {
    if (group.labelEn) return group.labelEn;
    if (Object.hasOwn(locales.en.groupNames, group.labelZh)) return locales.en.groupNames[group.labelZh];
    const round = /^第\s*(\d+)\s*轮$/.exec(group.labelZh);
    if (round) return `Round ${round[1]}`;
  }
  const fallback = locales[language].challengeGroups;
  return group.labelZh || (Object.hasOwn(fallback, group.key) ? fallback[group.key] : group.key);
}

// The competition, period and group a list was read for; its cards show only under the same choice.
const listSelection = ({ season, period, group }) => JSON.stringify([season, period, group]);

// Catalog filters. 来源 and 排序 are the list API's own values. 学科 lists the top disciplines the Host
// sends (`disciplineFacets`) and 其他, which opens a free-text field for one exact discipline key: the API
// matches `disc` exactly and cannot ask for "none of the top ones". The API has no open-status filter, so
// 只看开放 hides the loaded cards that are not open and reads nothing.
const CATALOG_PER_PAGE = 20;

const OTHER_DISCIPLINE = '__other__';

const originOptions = () => [['', msg('全部来源', 'All sources')], ['community', msg('社区', 'Community')], ['benchmark', msg('基准', 'Benchmark')], ['hackathon', msg('黑客松', 'Hackathon')], ['arena', msg('竞技场', 'Arena')]];

const sortOptions = () => [['newest', msg('最新', 'Newest')], ['attempts', msg('提交最多', 'Most submissions')]];

// The catalog query of one filter set; defaults (all origins, all disciplines, newest, page 1) are left out.
function catalogInput(filters, page = 1) {
  return { action: 'catalog', search: filters.search.trim(), ...competitionFilter(filters.season),
    ...(filters.period ? { period: filters.period } : {}), ...(filters.group ? { group: filters.group } : {}),
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
  pageSignature: page?.pageSignature,
  missing: Number.isSafeInteger(page?.missing) && page.missing > 0 ? page.missing : 0 });

function CatalogPanel({ query, handoff, onWebBase }) {
  const catalogNotice = handoff?.catalogNotice;
  const target = catalogNotice?.target;
  const noticeTitle = catalogNotice && msg(catalogNotice.titleZh || catalogNotice.title, catalogNotice.title || catalogNotice.titleZh);
  const noticeCompetition = target?.competition ? `competition:${target.competition}` : target?.season ? `season:${target.season}` : '';
  const [gatedIds] = React.useState(() => new Set(target?.gatedChallengeId ? [target.gatedChallengeId] : []));
  const [search, setSearch] = React.useState('');
  const [season, setSeason] = React.useState(noticeCompetition);
  // The chosen period of a competition with periods; '' is 全部期 and the value for every other choice.
  const [period, setPeriod] = React.useState(target?.period ?? '');
  // The chosen official group of that period; '' is 全部 and the value whenever the period has no groups.
  const [group, setGroup] = React.useState(target?.group ?? '');
  const [origin, setOrigin] = React.useState('');
  // The 学科 select: '' (all), a top discipline key, or OTHER_DISCIPLINE with the key typed in `otherDiscipline`.
  const [disciplineChoice, setDisciplineChoice] = React.useState('');
  const [otherDiscipline, setOtherDiscipline] = React.useState('');
  const [appliedOther, setAppliedOther] = React.useState(null);
  const [sort, setSort] = React.useState('newest');
  const [openOnly, setOpenOnly] = React.useState(false);
  const [competitionTable, setCompetitionTable] = React.useState(null);
  // The shown list: the cards of every page read so far for one query (`input`), the last page's facts,
  // and the competition, period and group it was read for (`selection`); the grid stays hidden while they
  // differ from the controls.
  const [list, setList] = React.useState(null);
  // The first available 学科 choices, replaced by an explicit refresh that returns new choices.
  const [facets, setFacets] = React.useState(null);
  // '' when idle, 'load' for a first page, 'more' for an appended page.
  const [busy, setBusy] = React.useState('');
  // The failed read: { kind: 'load', filters } or { kind: 'more' }. Its text is fixed; causes are not shown.
  const [failure, setFailure] = React.useState(null);
  const [status, setStatus] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  // Only the newest read may update the panel. An in-flight first read can be kept for its metadata alone.
  // Its focus targets come from callback refs: the heading, the count line, 加载更多 and each card's 查看详情 by id.
  // `refocus` holds the ids a last 加载更多 added while it had focus; the effect below moves focus once they render.
  const [latest] = React.useState(() => ({ controller: null, metadataOnly: false, facets: null, heading: null, count: null, more: null, details: new Map(), refocus: null }));
  // The catalog card whose detail drawer is open; the drawer reads the full detail itself.
  const [detail, setDetail] = React.useState(null);
  // null waits for an applied Other key; '' is a query for all disciplines.
  const discipline = disciplineChoice === OTHER_DISCIPLINE ? appliedOther : disciplineChoice;
  const otherPending = discipline === null;
  const filters = { search, season, period, group, origin, sort, discipline };
  const waitForDiscipline = () => {
    const controller = latest.controller;
    if (controller && competitionTable === null) {
      latest.metadataOnly = true;
    } else {
      latest.controller = null;
      controller?.abort();
    }
    latest.refocus = null;
    setList(null); setBusy(''); setFailure(null); setNotice(null);
    setStatus(['输入学科后按回车筛选', 'Enter a discipline and press Enter to filter']);
  };
  const handleReadFailure = (kind, requestedFilters, error, refresh = false) => {
    if (requestedFilters.period && error?.reason === 'period_not_available') {
      setPeriod(''); setGroup('');
      return readFirstPage({ ...requestedFilters, period: '', group: '' }, { refresh, notice: ['之前选择的分期已不在列表中，已改为显示全部期。', 'The selected period is no longer listed. Showing all periods.'] });
    }
    // The fresh official schedule cannot give this group now; the reason does not say why.
    if (requestedFilters.group && error?.reason === 'group_not_available') {
      setGroup('');
      // A competition the website groups without periods has no 本期 to fall back to, only its own list.
      return readFirstPage({ ...requestedFilters, group: '' }, { refresh,
        notice: requestedFilters.period
          ? ['之前选择的分类现在不可用，已改为显示本期全部赛题。', 'The selected group is unavailable. Showing all challenges in this period.']
          : ['之前选择的分类现在不可用，已改为显示全部赛题。', 'The selected group is unavailable. Showing all challenges.'] });
    }
    if (kind === 'more' && error?.code === 'catalog_changed') {
      setFailure({ kind: 'changed', message: error.message });
      setStatus(['赛题列表已变化，请从第一页重新读取。', 'The challenge list has changed. Reload from the first page.']);
      return;
    }
    const firstPage = kind === 'load';
    setFailure(firstPage ? { kind, filters: requestedFilters, refresh } : { kind });
    setStatus(firstPage ? ['赛题目录读取失败。', 'Could not load the challenge catalog.'] : ['加载更多赛题失败。', 'Could not load more challenges.']);
  };
  // Read page 1 for an accepted filter set. A fallback reuses the filters of the request that triggered it.
  const readFirstPage = async (next, { refresh = false, notice: nextNotice = null } = {}) => {
    latest.controller?.abort();
    const controller = new AbortController();
    latest.controller = controller;
    latest.metadataOnly = false;
    setBusy('load'); setFailure(null); setNotice(nextNotice); setStatus(['正在读取比赛和赛题…', 'Loading competitions and challenges…']);
    try {
      const input = catalogInput(next);
      const result = await query(refresh ? { ...input, refresh: true } : input, controller.signal);
      if (latest.controller !== controller) return;
      if (result?.ok === false) {
        if (!latest.metadataOnly) return handleReadFailure('load', next, result.error, refresh);
        return;
      }
      const table = Array.isArray(result?.competitionTable) ? result.competitionTable : undefined;
      setCompetitionTable(table ?? []);
      const received = refresh || !latest.facets ? catalogFacets(result?.disciplineFacets) : undefined;
      if (received) { latest.facets = received; setFacets(received); }
      if (typeof result?.webBase === 'string') onWebBase?.(result.webBase);
      if (latest.metadataOnly) return;

      const facts = pageFacts(result?.challenges);
      // Keep the filters with the results so 重试 can repeat the same query.
      setList({ selection: listSelection(next), filters: next, input, page: 1, items: uniqueCards(result?.challenges?.items), ...facts });
      // A chosen competition the new table no longer lists: go back to 全部比赛 and read once more.
      if (next.season && table && !table.some((item) => item && typeof item === 'object' && competitionValue(item) === next.season)) {
        setSeason(''); setPeriod(''); setGroup('');
        return readFirstPage({ ...next, season: '', period: '', group: '' }, { notice: ['之前选择的比赛已不在列表中，已改为显示全部比赛。', 'The selected competition is no longer listed. Showing all competitions.'] });
      }
      setStatus(facts.missing ? [`赛题目录已更新，有 ${facts.missing} 道赛题读取失败。`, `Catalog updated. Challenges that failed to load: ${facts.missing}.`] : ['赛题目录已更新。', 'Challenge catalog updated.']);
    } catch {
      if (latest.controller === controller && !latest.metadataOnly) handleReadFailure('load', next, undefined, refresh);
    } finally {
      if (latest.controller === controller) { latest.controller = null; latest.metadataOnly = false; setBusy(''); }
    }
  };
  const load = (changes = {}, { discipline: nextDiscipline = discipline, ...options } = {}) => {
    // Only applying or selecting a discipline can leave the waiting state. A retry may carry older filters.
    if (nextDiscipline === null) return;
    return readFirstPage({ ...filters, discipline: nextDiscipline, ...changes }, options);
  };
  // 加载更多 is offered only while the shown list is the one the controls describe: not after a failed
  // page-1 read (the old list stays under the new controls), not while the controls hold edits not
  // read yet (typed search, another filter) and not while 其他 waits for a key, whose query would
  // otherwise equal 全部学科's. Otherwise it would append the old query's next page.
  const canLoadMore = Boolean(list?.hasMore) && list.selection === listSelection(filters) && (!failure || failure.kind === 'more') && !otherPending
    && JSON.stringify(list.input) === JSON.stringify(catalogInput(filters));
  // The next page of the shown list's own query, appended without repeats.
  const loadMore = async () => {
    const shown = list;
    if (!canLoadMore || latest.controller) return;
    const controller = new AbortController();
    latest.controller = controller;
    setBusy('more'); setFailure(null); setStatus(['正在加载更多赛题…', 'Loading more challenges…']);
    try {
      const page = shown.page + 1;
      const result = await query({ ...shown.input, page, ...(shown.pageSignature ? { page_signature: shown.pageSignature } : {}) }, controller.signal);
      if (latest.controller !== controller) return;
      if (result?.ok === false) return handleReadFailure('more', shown.filters, result.error);
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
      setStatus(added.length ? [`已加载 ${added.length} 道赛题。`, `Challenges loaded: ${added.length}.`] : ['没有更多赛题。', 'No more challenges.']);
    } catch {
      if (latest.controller === controller) handleReadFailure('more', shown.filters);
    } finally {
      if (latest.controller === controller) { latest.controller = null; setBusy(''); }
    }
  };
  // A failed append is retried as long as the controls still describe the shown list; after edits since,
  // 重试 reads page 1 of the controls.
  const retry = () => (failure?.kind === 'more' ? (canLoadMore ? loadMore() : load()) : load(failure?.filters, { refresh: failure?.refresh }));
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
  const competitions = (competitionTable ?? []).filter((item) => item && typeof item === 'object');
  const selectedCompetition = season ? competitions.find((item) => competitionValue(item) === season) : undefined;
  const periods = competitionPeriods(selectedCompetition);
  const selectedPeriod = period ? periods.find((item) => item.slug === period) : undefined;
  // The chosen period's groups, else the competition's own; a competition with periods groups inside a period.
  const groups = officialGroups(selectedPeriod ?? (periods.length ? undefined : selectedCompetition));
  // Choosing a group reads page 1 of it with the other controls; choosing the current one again reads nothing.
  const chooseGroup = (key) => {
    if (key === group) return;
    setGroup(key);
    load({ group: key });
  };
  // Challenges show only for the selection they were read for, never under another competition's, period's or group's controls.
  const shownList = list && list.selection === listSelection(filters) ? list : null;
  const loaded = shownList ? shownList.items : [];
  const catalogHandoff = catalogNotice ? { state: handoff.state, gatedIds, start: (challenge) => {
    if (gatedIds.has(challenge.id)) return;
    // Keep the notice for deduplication within its competition. The Host verifies exact membership.
    const fromNoticeCompetition = noticeCompetition && shownList?.filters.season === noticeCompetition
      && loaded.some((item) => String(item.id) === challenge.id);
    handoff.start(challenge, fromNoticeCompetition ? catalogNotice : undefined);
  } } : handoff;
  const challenges = openOnly ? loaded.filter((item) => item.status === 'open') : loaded;
  const total = shownList?.total;
  // Fixed ids of the shown list that the Host could not read; the info row says the list is incomplete.
  const missing = shownList?.missing || 0;
  // Under 只看开放 the grid shows fewer cards than are loaded, so the line counts loaded, then open ones.
  const countLine = shownList ? [total !== undefined ? msg(`共 ${total} 道`, `${total} total`) : '',
    openOnly ? msg(`已加载 ${loaded.length} 道`, `${loaded.length} loaded`) : total !== undefined && loaded.length < total ? msg(`已显示 ${loaded.length} 道`, `${loaded.length} shown`) : '',
    openOnly ? msg(`其中开放 ${challenges.length} 道（只看开放仅筛选已加载的赛题）`, `${challenges.length} open (among loaded challenges)`) : ''].filter(Boolean).join(' · ') : '';
  // The info row describes the chosen period when there is one, else the whole competition.
  const infoStatus = selectedPeriod ? selectedPeriod.status : selectedCompetition?.status;
  const schedule = selectedPeriod || selectedCompetition;
  const time = scheduleText(schedule?.timeText || schedule?.dateText) || msg('日期待定', 'Dates to be announced');
  const infoTime = selectedPeriod ? msg(`${periodName(selectedPeriod)} 时间：${time}`, `${periodName(selectedPeriod)} dates: ${time}`)
    : msg(`时间：${time}`, `Dates: ${time}`);
  const infoName = [competitionName(selectedCompetition), periodName(selectedPeriod)].filter(Boolean).join(' · ');
  const failureText = failure?.kind === 'changed' ? msg(failure.message,
    (failure.message || '').replace('赛题列表已变化。', 'The challenge list has changed. ').replace(/有 (\d+) 道赛题读取失败，列表不完整。/, 'Failed to load $1 challenges. ').replace('请从第一页重新读取。', 'Reload from the first page.'))
    : failure?.kind === 'more' ? msg('加载更多赛题失败，已加载的赛题仍保留。', 'Could not load more challenges. Previously loaded challenges are still shown.')
    : failure ? (loaded.length ? msg('赛题目录读取失败，下面仍是上一次读取的赛题。', 'Could not refresh the catalog. Showing the previously loaded challenges.') : msg('赛题目录读取失败。', 'Could not load the challenge catalog.')) : '';
  const disciplineOptions = facets?.top || [];
  const activeDisciplineMissing = disciplineChoice && disciplineChoice !== OTHER_DISCIPLINE && !disciplineOptions.includes(disciplineChoice);
  const applyOther = () => {
    const key = otherDiscipline.trim();
    if (!key) return;
    setAppliedOther(key);
    load({}, { discipline: key });
  };
  return h('section', { className: 'pg-guide pg-catalog', 'aria-label': msg('Playground 赛题目录', 'Playground challenge catalog'), 'aria-busy': Boolean(busy) },
    h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status && msg(...status)),
    h('div', { className: 'pg-head' }, h('h2', { className: 'pg-brand', tabIndex: -1, ref: (node) => { latest.heading = node; } }, msg('选择比赛或赛题', 'Choose a competition or challenge')),
      h('button', { className: 'pg-button', disabled: busy === 'load' || otherPending, onClick: () => load({}, { refresh: true }) }, busy === 'load' ? msg('正在刷新…', 'Refreshing…') : msg('刷新目录', 'Refresh catalog'))),
    catalogNotice ? h('p', { className: 'pg-note' },
      msg(`来自「${noticeTitle}」的提醒。请选择具体赛题，再确认工作区和主控。`, `You opened the catalog from “${noticeTitle}”. Choose a challenge, then confirm its workspace and controller.`),
      catalogNotice.webUrl ? h('a', { href: catalogNotice.webUrl, target: '_blank', rel: 'noopener noreferrer', style: { marginInlineStart: 8 } }, msg('查看比赛', 'View competition')) : null) : null,
    h('div', { className: 'pg-search' },
      h('input', { className: 'pg-input', 'aria-label': msg('搜索 Playground 赛题', 'Search Playground challenges'), placeholder: msg('按题目名称、方向或关键词搜索', 'Search by title, discipline, or keyword'), value: search, onChange: (event) => setSearch(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') load(); } }),
      h('select', { className: 'pg-input', 'aria-label': msg('选择比赛', 'Choose a competition'), value: season, onChange: (event) => {
        const value = event.target.value;
        const nextPeriod = startingPeriod(competitions.find((item) => competitionValue(item) === value));
        setSeason(value); setPeriod(nextPeriod); setGroup(''); load({ season: value, period: nextPeriod, group: '' });
      } },
        h('option', { value: '' }, msg('全部比赛', 'All competitions')),
        // The Host sends the list ordered live, upcoming, ended; each status becomes one group.
        competitionGroups().map(([group, label]) => {
          const members = competitions.filter((item) => item.status === group);
          return members.length ? h('optgroup', { key: group, label }, members.map((item) => h('option', { key: competitionValue(item), value: competitionValue(item) }, competitionLabel(item)))) : null;
        }))),
    // Each change reads page 1 again, combined with the competition and the search box; 只看开放 reads nothing.
    h('div', { className: 'pg-catalog-filters', role: 'group', 'aria-label': msg('筛选赛题', 'Filter challenges') },
      h('label', { className: 'pg-filter' }, h('span', null, msg('来源', 'Source')),
        h('select', { className: 'pg-input', 'aria-label': msg('按来源筛选', 'Filter by source'), value: origin, onChange: (event) => { setOrigin(event.target.value); load({ origin: event.target.value }); } },
          originOptions().map(([value, label]) => h('option', { key: value || 'all', value }, label)))),
      h('label', { className: 'pg-filter' }, h('span', null, msg('学科', 'Discipline')),
        h('select', { className: 'pg-input', 'aria-label': msg('按学科筛选', 'Filter by discipline'), value: disciplineChoice, onChange: (event) => {
          const value = event.target.value;
          setDisciplineChoice(value);
          const nextDiscipline = value === OTHER_DISCIPLINE ? appliedOther : value;
          if (nextDiscipline === null) waitForDiscipline();
          else load({}, { discipline: nextDiscipline });
        } },
          h('option', { value: '' }, msg('全部学科', 'All disciplines')),
          disciplineOptions.map((key) => h('option', { key, value: key }, key)),
          activeDisciplineMissing ? h('option', { value: disciplineChoice }, disciplineChoice) : null,
          h('option', { value: OTHER_DISCIPLINE }, msg('其他（输入学科）', 'Other (enter a discipline)')))),
      disciplineChoice === OTHER_DISCIPLINE ? h('div', { className: 'pg-filter pg-filter-other' },
        h('label', { htmlFor: 'pg-other-discipline' }, msg('其他学科（英文学科名，精确匹配）', 'Other discipline (exact English name)')),
        h('div', { className: 'pg-filter-row' },
          h('input', { id: 'pg-other-discipline', className: 'pg-input', value: otherDiscipline, maxLength: 100, placeholder: msg('例如 science，按回车筛选', 'For example, science. Press Enter to filter.'),
            ...(facets?.otherKeys?.length ? { list: 'pg-other-discipline-keys' } : {}),
            onChange: (event) => {
              const value = event.target.value;
              setOtherDiscipline(value);
              if (appliedOther !== null && value.trim() !== appliedOther) {
                setAppliedOther(null);
                waitForDiscipline();
              }
            }, onKeyDown: (event) => { if (event.key === 'Enter') applyOther(); } }),
          h('button', { type: 'button', className: 'pg-button', onClick: applyOther }, msg('筛选', 'Apply filter'))),
        facets?.otherKeys?.length ? h('datalist', { id: 'pg-other-discipline-keys' }, facets.otherKeys.map((key) => h('option', { key, value: key }))) : null) : null,
      h('label', { className: 'pg-filter' }, h('span', null, msg('排序', 'Sort')),
        h('select', { className: 'pg-input', 'aria-label': msg('排序方式', 'Sort order'), value: sort, onChange: (event) => { setSort(event.target.value); load({ sort: event.target.value }); } },
          sortOptions().map(([value, label]) => h('option', { key: value, value }, label)))),
      h('label', { className: 'pg-filter-check' },
        h('input', { type: 'checkbox', checked: openOnly, onChange: (event) => setOpenOnly(event.target.checked) }), msg('只看开放', 'Open only'),
        h('span', { className: 'pg-note' }, msg('（仅筛选已加载的赛题）', '(loaded challenges only)')))),
    selectedCompetition ? h('div', { className: 'pg-competition-info', role: 'group', 'aria-label': msg('比赛信息', 'Competition details') },
      // Changing the period reads page 1 again with the other controls.
      periods.length ? h('label', { className: 'pg-filter' }, h('span', null, msg('分期', 'Period')),
        h('select', { className: 'pg-input', 'aria-label': msg('选择分期', 'Choose a period'), value: period, onChange: (event) => {
          setPeriod(event.target.value); setGroup(''); load({ period: event.target.value, group: '' });
        } },
          h('option', { value: '' }, msg('全部期', 'All periods')),
          periods.map((item) => h('option', { key: item.slug, value: item.slug },
            [periodName(item), competitionStatusText(item.status), scheduleText(item.timeText || item.dateText)].filter(Boolean).join(' · '))))) : null,
      h('p', { className: 'pg-note' }, h('span', { className: 'pg-badge', 'data-tone': COMPETITION_TONES[infoStatus] }, competitionStatusText(infoStatus)),
        ` ${infoTime}`,
        !selectedPeriod && selectedCompetition.rounds ? msg(` · 轮次：${selectedCompetition.rounds}`, ` · Rounds: ${scheduleText(selectedCompetition.rounds)}`) : ''),
      openWebButton(selectedPeriod ? selectedPeriod.webUrl : selectedCompetition.webUrl, infoName),
      selectedCompetition.periodsStale ? h('p', { className: 'pg-note', role: 'status' }, msg('赛程暂未同步，当前显示已有分期。', 'The schedule is out of date. Showing available periods.')) : null,
      selectedCompetition.groupsStale ? h('p', { className: 'pg-note', role: 'status' }, msg('官方分类暂未同步，当前显示已有分类。', 'The official groups could not be refreshed. Showing the available groups.')) : null,
      // Some fixed ids could not be read: the list is short by that many. 重试 reads page 1 of the shown
      // list's own query, not edits made to the controls since; while a failed read shows its own 重试, this
      // one is left out.
      missing ? h('p', { className: 'pg-note pg-catalog-missing' }, msg(`有 ${missing} 道赛题读取失败，列表不完整。`, `The list is incomplete. Challenges that failed to load: ${missing}.`)) : null,
      missing && !failure ? h('button', { type: 'button', className: 'pg-button', disabled: Boolean(busy) || otherPending, onClick: () => load(shownList.filters) }, msg('重试', 'Retry')) : null) : null,
    // Wraps onto further lines in a narrow column, so every group stays reachable.
    groups.length ? h('div', { className: 'pg-catalog-groups', role: 'group', 'aria-label': msg('按分类筛选', 'Filter by group') },
      h('span', { className: 'pg-catalog-groups-label', 'aria-hidden': true }, msg('分类', 'Group')),
      h('button', { type: 'button', className: 'pg-group-chip', 'aria-pressed': !group, onClick: () => chooseGroup('') }, msg('全部', 'All')),
      groups.map((item) => {
        const label = groupLabel(item);
        return h('button', { key: item.key, type: 'button', className: 'pg-group-chip', 'aria-pressed': group === item.key,
          'aria-label': msg(`${label} ${item.count} 道`, `${label}, ${item.count} ${item.count === 1 ? 'challenge' : 'challenges'}`), onClick: () => chooseGroup(item.key) },
        label, h('span', { className: 'pg-group-count' }, item.count));
      })) : null,
    notice ? h('p', { className: 'pg-note' }, msg(...notice)) : null,
    failure ? h('div', { className: 'pg-catalog-failure' }, h('p', { className: 'pg-error', role: 'alert' }, failureText),
      h('button', { type: 'button', className: 'pg-button', disabled: Boolean(busy) || otherPending, onClick: retry }, failure.kind === 'changed' ? msg('从第一页重新读取', 'Reload from the first page') : msg('重试', 'Retry'))) : null,
    busy === 'load' && competitionTable === null ? h('p', { className: 'pg-note', role: 'status' }, msg('正在读取比赛和赛题…', 'Loading competitions and challenges…')) : null,
    busy === 'load' && competitionTable !== null && !shownList ? h('p', { className: 'pg-note' }, msg('正在读取所选比赛的赛题…', 'Loading challenges for this competition…')) : null,
    shownList && !loaded.length ? h('p', { className: 'pg-note' }, msg('没有找到匹配赛题。换一个关键词或筛选条件试试。', 'No matching challenges. Try another keyword or filter.')) : null,
    shownList && loaded.length && !challenges.length ? h('p', { className: 'pg-note' }, `${msg('已加载的赛题中没有开放的题。', 'No open challenges among those loaded. ')}${canLoadMore ? msg('可以点“加载更多”继续查找。', 'Select “Load more” to keep looking.') : ''}`) : null,
    otherPending ? h('p', { className: 'pg-note pg-catalog-hint' }, msg('输入学科后按回车筛选', 'Enter a discipline and press Enter to filter')) : null,
    countLine ? h('p', { className: 'pg-note pg-catalog-count', tabIndex: -1, ref: (node) => { latest.count = node; } }, countLine) : null,
    h('div', { className: 'pg-challenge-grid' }, challenges.map((item) => h('article', { className: 'pg-card pg-challenge', key: item.id,
      onClick: (event) => { if (!event.target.closest('button, a[href]') && !window.getSelection?.()?.toString()) setDetail(item); } },
      h('div', { className: 'pg-head' }, h('h3', null, msg(item.titleZh || item.title, item.title || item.titleZh) || item.id), item.status ? h('span', { className: 'pg-badge', 'data-tone': statusTone(item.status) }, locales[currentLanguage()].states[item.status] || item.status) : null),
      h('p', { className: 'pg-note pg-path' }, [item.discipline, item.origin, item.difficulty !== undefined ? msg(`难度 ${item.difficulty}`, `Difficulty ${item.difficulty}`) : null].filter(Boolean).join(' · ') || msg('Playground 赛题', 'Playground challenge')),
      h('p', { className: 'pg-note' }, msg(`题目编号：${item.id}${item.attempts !== undefined ? ` · 已有 ${item.attempts} 次提交` : ''}`, `Challenge ID: ${item.id}${item.attempts !== undefined ? ` · Submissions: ${item.attempts}` : ''}`)),
      h('div', { className: 'pg-actions' },
        handoff ? h(DispatchChallengeButton, { challenge: item, handoff: catalogHandoff }) : null,
        h('button', { type: 'button', className: 'pg-button pg-challenge-detail', 'aria-haspopup': 'dialog', 'aria-label': msg(`查看详情：${msg(item.titleZh || item.title, item.title || item.titleZh) || item.id}`, `View details: ${msg(item.titleZh || item.title, item.title || item.titleZh) || item.id}`), onClick: () => setDetail(item),
          ref: (node) => { if (node) latest.details.set(String(item.id), node); else latest.details.delete(String(item.id)); } }, msg('查看详情', 'View details')),
        openWebButton(item.webUrl, msg(item.titleZh || item.title, item.title || item.titleZh) || item.id))
    ))),
    // aria-disabled, not disabled, while a read runs: a disabled button would drop keyboard focus. loadMore
    // itself ignores a press while any read is running.
    canLoadMore ? h('button', { type: 'button', className: 'pg-button pg-load-more', 'aria-disabled': busy ? true : undefined, 'aria-busy': busy === 'more', onClick: loadMore,
      ref: (node) => { latest.more = node; } }, busy === 'more' ? msg('正在加载…', 'Loading…') : msg('加载更多', 'Load more')) : null,
    // Keyed by challenge, so opening another card (or reopening this one) mounts a fresh drawer that reads again.
    detail ? h(ChallengeDetailDrawer, { key: String(detail.id), challenge: detail, query, handoff: catalogHandoff, close: () => setDetail(null),
      focusFallback: () => [latest.details.get(String(detail.id)), latest.heading] }) : null);
}

export { CatalogPanel };

