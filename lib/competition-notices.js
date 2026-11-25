import { COMPETITIONS, PUBLISHED_SCHEDULE_IDS } from './competitions.js';
import { challengeWebBase, publicPageUrl } from './links.js';

// Each successful source has an independent baseline, including when its list is empty.
// Failed sources are omitted. Every item has a stable key, belongs to a source, and carries
// title/titleZh plus any published summary/summaryZh, reward/rewardZh, resources/resourcesZh,
// startAt, endAt and webUrl. The scope is the public site, never an account credential.
const text = (value) => typeof value === 'string' ? value.trim() || undefined : undefined;
const joined = (list, name) => Array.isArray(list)
  ? list.map((entry) => text(entry?.[name])).filter(Boolean).join(' · ') || undefined : undefined;
const key = (...parts) => JSON.stringify(parts);
const seasonKey = (slug) => key('season', slug);

export async function readCompetitionNotices(client, { signal } = {}) {
  signal?.throwIfAborted();
  const [seasons, hub, schedules] = await Promise.allSettled([
    client.noticeSeasons({ signal }), client.noticeHub({ signal }),
    client.getCompetitionSchedules({ revalidate: true, includeOverview: true }),
  ]);
  signal?.throwIfAborted();
  const scope = challengeWebBase(client.baseUrl);
  const sources = ['catalog'];
  const items = [];
  const hubRows = hub.status === 'fulfilled' ? hub.value : [];
  const hubs = new Map(hubRows.map((row) => [row.slug, row]));
  function seasonItem(season, source) {
    const details = hubs.get(season.slug);
    const catalog = COMPETITIONS.find((entry) => entry.select?.season === season.slug || entry.id === season.slug);
    const webUrl = details?.hasPage ? publicPageUrl(scope, 'competition/' + season.slug) :
      catalog ? publicPageUrl(scope, catalog.pagePath) : publicPageUrl(scope, 'challenges', { origin: 'hackathon', season: season.slug });
    const titleZh = [text(season.nameZh) || text(season.nameEn) || season.slug, text(season.seasonLabelZh)].filter(Boolean).join(' · ');
    const title = [text(season.nameEn) || text(season.nameZh) || season.slug, text(season.seasonLabelEn)].filter(Boolean).join(' · ');
    return { source, key: catalog ? key(catalog.id) : seasonKey(season.slug), titleZh, title, webUrl,
      officialStatus: text(season.status), startAt: text(season.startAt), endAt: text(season.endAt), summaryZh: text(details?.hub?.description?.zh),
      summary: text(details?.hub?.description?.en), rewardZh: joined(season.rules?.awards, 'zh'), reward: joined(season.rules?.awards, 'en') };
  }
  for (const contest of COMPETITIONS.filter((entry) => !entry.select?.season)) {
    items.push({ source: 'catalog', key: key(contest.id), titleZh: contest.nameZh,
      title: contest.nameEn, startAt: contest.startAt, endAt: contest.endAt,
      webUrl: publicPageUrl(scope, contest.pagePath) });
  }
  if (seasons.status === 'fulfilled') {
    sources.push('seasons');
    for (const season of seasons.value) {
      const item = seasonItem(season, 'seasons');
      items.push(item);
      for (const round of season.rounds ?? []) {
        items.push({ source: 'seasons', key: key('season', season.slug, round.seq), parentKey: item.key,
          titleZh: item.titleZh + ' · 第 ' + round.seq + ' 轮', title: item.title + ' · Round ' + round.seq,
          summaryZh: item.summaryZh, summary: item.summary,
          rewardZh: item.rewardZh && '全赛奖项：' + item.rewardZh, reward: item.reward && 'Season awards: ' + item.reward,
          officialStatus: text(round.status), startAt: text(round.startAt), endAt: text(round.endAt), webUrl: item.webUrl });
      }
    }
  }
  if (hub.status === 'fulfilled') {
    sources.push('hub');
    items.push(...hubRows.map((row) => seasonItem(row, 'hub')));
  }
  const overview = schedules.status === 'fulfilled' && schedules.value?.overview;
  if (Array.isArray(overview)) {
    sources.push('overview');
    const knownIds = new Set(COMPETITIONS.map(({ id }) => id));
    const knownUrls = new Set(COMPETITIONS.map(({ pagePath }) => publicPageUrl(scope, pagePath)));
    for (const { id, pagePath, ...card } of overview) {
      const webUrl = publicPageUrl(scope, pagePath);
      if (knownIds.has(id) || knownUrls.has(webUrl)) continue;
      // A hosted contest keeps the same identity whether its card is static or comes from the API.
      const [section, slug] = pagePath.split('/');
      items.push({ ...card, source: 'overview', key: section === 'competition' ? seasonKey(slug) : key(id), webUrl });
    }
  }
  for (const id of PUBLISHED_SCHEDULE_IDS) {
    const schedule = schedules.status === 'fulfilled' && schedules.value?.[id];
    if (!Array.isArray(schedule?.periods) || schedule.stale) continue;
    const contest = COMPETITIONS.find((entry) => entry.id === id);
    sources.push(id);
    for (const period of schedule.periods) {
      const en = period.labelEn || (/^\d+$/.test(period.slug) ? 'Period ' + period.slug : period.labelZh);
      const groupNames = (field) => (period.groups ?? []).map((group) => group[field] || group.labelZh || group.key).join(' · ');
      const summaryZh = groupNames('labelZh');
      const summary = groupNames('labelEn');
      items.push({ source: id, key: key(id, period.slug), parentKey: key(id), titleZh: contest.nameZh + ' · ' + period.labelZh,
        title: (contest.nameEn || contest.nameZh) + ' · ' + en, startAt: period.startAt, endAt: period.endAt,
        summaryZh: summaryZh && '本期赛题分组：' + summaryZh, summary: summary && 'Challenge groups: ' + summary,
        webUrl: publicPageUrl(scope, contest.periodPagePath?.(period.slug) || contest.pagePath,
          contest.periodPagePath ? undefined : { period: period.slug }), ...period.notice });
    }
  }
  return { ok: true, scope, sources, items };
}
