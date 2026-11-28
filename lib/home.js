import { createPlaygroundClient } from './api.js';
import { disciplineFacets, projectCompetitionTable } from './catalog.js';
import { COMPETITIONS, competitionStatus } from './competitions.js';

function homeCompetitions(baseUrl, seasons, hub, schedules, now) {
  const publicSeasons = seasons?.items.filter((item) => (!item.visibility || item.visibility === 'public') && !['draft', 'archived'].includes(item.status)) ?? [];
  const publicHub = hub?.filter((item) => item.visibility === 'public' && item.hub?.listed !== false) ?? [];
  const seasonsBySlug = new Map(publicSeasons.map((item) => [item.slug, item]));
  const hubBySlug = new Map(publicHub.map((item) => [item.slug, item]));
  const builtIn = new Map(COMPETITIONS.map((item) => [item.id, item]));
  if (!publicSeasons.length && !publicHub.length && !schedules) return undefined;
  return projectCompetitionTable(baseUrl, { seasons: publicSeasons, now, publishedSchedules: schedules }).flatMap((item) => {
    const definition = builtIn.get(item.id);
    const season = seasonsBySlug.get(item.season);
    const hubRow = [item.season, item.id, definition?.pagePath?.split('/').at(-1)].map((slug) => hubBySlug.get(slug)).find(Boolean);
    const published = definition && schedules?.[definition.id];
    const freshSchedule = published?.periods?.length && !published.stale;
    // Keep only entries with a public source this round and a selection the catalog already supports.
    if (!season && !hubRow && !freshSchedule) return [];
    const startAt = hubRow?.startAt ?? item.startAt;
    const endAt = hubRow?.endAt ?? item.endAt;
    const byDate = competitionStatus({ startAt, endAt }, now);
    const status = hubRow
      ? hubRow.status === 'ended' || byDate === 'ended' ? 'ended'
        : hubRow.status === 'active' && !startAt ? 'live' : byDate
      : item.status;
    if (status !== 'live' && status !== 'upcoming') return [];
    if (hubRow && ['draft', 'archived'].includes(hubRow.status)) return [];
    const count = hubRow?.attachedChallengeCount ?? season?.challengeIds?.length ?? definition?.select?.challengeIds?.length;
    return [{ ...item, status, startAt, endAt, count }];
  }).sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live'));
}

export function createHomeReader() {
  // The homepage is a public view. It has no token resolver and shares the default public endpoint
  // and the process-level API override used by the offline environment.
  let client;
  return async function readHome({ signal } = {}) {
    signal?.throwIfAborted();
    client ??= createPlaygroundClient({ baseUrl: process.env.PLAYGROUND_API_BASE || undefined });
    const publicRead = { token: '', signal };
    const [facets, knights, discussions, challenges, feed, hub, seasons, schedules] = (await Promise.allSettled([
      client.getChallengeFacets(publicRead), client.getPublicParticipation(publicRead), client.getPublicDiscussionCount(publicRead),
      client.listChallenges({ perPage: 6, sort: 'newest' }, publicRead), client.getPublicFeed(publicRead),
      client.noticeHub(publicRead), client.listCompetitions({}, publicRead), client.getCompetitionSchedules({ revalidate: true }),
    ])).map((result) => result.value);
    signal?.throwIfAborted();
    return {
      ok: true,
      stats: { challenges: facets?.total, attempts: facets?.attempts,
        disciplines: facets ? disciplineFacets(facets).top.length : undefined, discussions, knights },
      competitions: homeCompetitions(client.baseUrl, seasons, hub, schedules, Date.now()),
      challenges: challenges?.items.slice(0, 6).map(({ id, title, titleZh, attempts }) => ({ id, title, titleZh, attempts })),
      feed,
    };
  };
}
