import * as React from 'react';
import { h } from '../shared/react.js';
import { openWebButton, statusTone } from '../shared/display.js';
import { locales } from '../shared/locale.js';
import { ChallengeDetailDrawer, DispatchChallengeButton } from './detail.js';

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

function CatalogPanel({ query, handoff, onWebBase }) {
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
  return h('section', { className: 'pg-guide pg-catalog', 'aria-label': 'Playground 赛题目录', 'aria-busy': Boolean(busy) },
    h('p', { className: 'pg-sr-only', role: 'status', 'aria-live': 'polite' }, status),
    h('div', { className: 'pg-head' }, h('h2', { className: 'pg-brand', tabIndex: -1, ref: (node) => { latest.heading = node; } }, '选择比赛或赛题'),
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
    busy === 'load' && !catalog ? h('p', { className: 'pg-note', role: 'status' }, '正在读取比赛和赛题…') : null,
    busy === 'load' && catalog && !shownList ? h('p', { className: 'pg-note' }, '正在读取所选比赛的赛题…') : null,
    shownList && !loaded.length ? h('p', { className: 'pg-note' }, '没有找到匹配赛题。换一个关键词或筛选条件试试。') : null,
    shownList && loaded.length && !challenges.length ? h('p', { className: 'pg-note' }, `已加载的赛题中没有开放的题。${canLoadMore ? '可以点“加载更多”继续查找。' : ''}`) : null,
    otherPending ? h('p', { className: 'pg-note pg-catalog-hint' }, '输入学科后按回车筛选') : null,
    countLine ? h('p', { className: 'pg-note pg-catalog-count', tabIndex: -1, ref: (node) => { latest.count = node; } }, countLine) : null,
    h('div', { className: 'pg-challenge-grid' }, challenges.map((item) => h('article', { className: 'pg-card pg-challenge', key: item.id,
      onClick: (event) => { if (!event.target.closest('button, a[href]') && !window.getSelection?.()?.toString()) setDetail(item); } },
      h('div', { className: 'pg-head' }, h('h3', null, item.titleZh || item.title || item.id), item.status ? h('span', { className: 'pg-badge', 'data-tone': statusTone(item.status) }, locales.zh.states[item.status] || item.status) : null),
      h('p', { className: 'pg-note pg-path' }, [item.discipline, item.origin, item.difficulty !== undefined ? `难度 ${item.difficulty}` : null].filter(Boolean).join(' · ') || 'Playground 赛题'),
      h('p', { className: 'pg-note' }, `题目编号：${item.id}${item.attempts !== undefined ? ` · 已有 ${item.attempts} 次提交` : ''}`),
      h('div', { className: 'pg-actions' },
        handoff ? h(DispatchChallengeButton, { challenge: item, handoff }) : null,
        h('button', { type: 'button', className: 'pg-button pg-challenge-detail', 'aria-haspopup': 'dialog', 'aria-label': `查看详情：${item.titleZh || item.title || item.id}`, onClick: () => setDetail(item),
          ref: (node) => { if (node) latest.details.set(String(item.id), node); else latest.details.delete(String(item.id)); } }, '查看详情'),
        openWebButton(item.webUrl, item.titleZh || item.title || item.id))
    ))),
    // aria-disabled, not disabled, while a read runs: a disabled button would drop keyboard focus. loadMore
    // itself ignores a press while any read is running.
    canLoadMore ? h('button', { type: 'button', className: 'pg-button pg-load-more', 'aria-disabled': busy ? true : undefined, 'aria-busy': busy === 'more', onClick: loadMore,
      ref: (node) => { latest.more = node; } }, busy === 'more' ? '正在加载…' : '加载更多') : null,
    // Keyed by challenge, so opening another card (or reopening this one) mounts a fresh drawer that reads again.
    detail ? h(ChallengeDetailDrawer, { key: String(detail.id), challenge: detail, query, handoff, close: () => setDetail(null),
      focusFallback: () => [latest.details.get(String(detail.id)), latest.heading] }) : null);
}

export { CatalogPanel };

