import { findCompetition, GROUP_KEY } from './competitions.js';

/**
 * The official groups of a competition the Playground groups without periods.
 *
 * All three groupings are read from the platform, so their members and counts follow it instead of this
 * plugin's release, and `refresh` picks up an official membership change:
 *   `tagRoles`      追光者计划·招募赛's 岗位 chips. The contest's own challenges are read by its tag, then
 *                   grouped by the job tag each one also carries (the key and order come from the
 *                   competition's `groupTags`). Matching inside the contest's own challenges is what keeps a
 *                   challenge outside the contest out of a group when it carries the same job tag. A
 *                   challenge of the contest with no known job tag joins no group and stays in 全部.
 *                   Every job the website shows is listed, including one the contest has no challenge for:
 *                   the chips follow the official job list, and such a job counts 0 and lists nothing.
 *   `seasonRounds`  科学骑士大师赛's scoring rounds (`GET /api/hackathon/seasons/by-slug/<slug>/rounds`),
 *                   each with its own challenge ids, in the order the endpoint returns them (the order of
 *                   their time windows) and with each round's own official challenge order. The season
 *                   gains a round every week, so nothing here assumes how many there are.
 *   `seasonTracks`  Paper2Arm 第二季's hackathon tracks, grouped from the season list's own `hackathon.track`.
 *                   The tracks are shown in the official order the competition names in `groupOrder`; a
 *                   track the platform adds later follows them in list order.
 * Neither a round nor a track filter exists on `GET /api/challenges` (checked 2026-11-24), so every group
 * here is read by the challenge ids it holds, which is also what gives each group its count.
 *
 * A grouping is read at most once per GROUPS_TTL_MS and shared by every caller; `refresh` reads again. The
 * platform reads are anonymous (lib/api.js), so one cached grouping is the public one and never one
 * account's view of it. The read never rejects and never carries a caller's signal, so one cancelled catalog
 * read cannot cancel it for the others; the API client's own timeout bounds it.
 *
 * A failed read, an incompletely paged one included, keeps the last grouping and marks it `stale`, so the
 * group row and a chosen group survive a short outage instead of being replaced by a shorter grouping that
 * would miscount. The grouping stays `stale` until a read succeeds again, the cached answers of that TTL
 * included. A failure with nothing to fall back on gives no groups, also `stale`: the competition is then
 * listed ungrouped, and a group argument fails without the reason that says the official grouping dropped it.
 */
const GROUPS_TTL_MS = 60 * 1000;

// Groups are chosen by key on the wire, so a grouping counts only when every key is a distinct GROUP_KEY.
// Otherwise the competition is listed ungrouped, the same rule a period's groups follow.
function validGroups(groups) {
  const keys = groups.map((group) => group.key);
  const valid = groups.length && new Set(keys).size === keys.length
    && keys.every((key) => typeof key === 'string' && GROUP_KEY.test(key));
  return valid ? Object.freeze(groups.map((group) => Object.freeze({ ...group, select: Object.freeze({ ...group.select }) }))) : [];
}

// `count` is the number of ids the group will list, not the platform's own count for it: a group lists what
// its ids name.
function idGroup(key, labelZh, ids) {
  const challengeIds = Object.freeze([...new Set(ids)]);
  return { key, ...(labelZh ? { labelZh } : {}), count: challengeIds.length, select: { challengeIds } };
}

// The job groups of a contest the website selects by one tag, in the order its own chips use. A job the
// contest has no challenge for stays in the row with a count of 0, the way the website lists its jobs.
function tagRoleGroups({ rows }, competition) {
  const keyByTag = new Map(Object.entries(competition.groupTags).map(([key, tag]) => [tag, key]));
  const ids = new Map(Object.keys(competition.groupTags).map((key) => [key, []]));
  for (const row of rows) {
    for (const tag of row.tags) {
      const key = keyByTag.get(tag);
      if (key) ids.get(key).push(row.id);
    }
  }
  return validGroups([...ids].map(([key, list]) => idGroup(key, competition.groupTags[key].replace(/^岗位·/, ''), list)));
}

// A scoring round of a season, named the way the platform's own leaderboard names it. A round without
// challenges is left out: it has nothing to list.
function seasonRoundGroups({ rounds }) {
  return validGroups(rounds.map((round) => idGroup(`r${round.seq}`, `第 ${round.seq} 轮`, round.challengeIds))
    .filter((group) => group.count > 0));
}

// The hackathon tracks of a season, keyed by the platform's own track key and named with its Chinese track
// name. The competition's `groupOrder` is the order the website shows its tracks in; a track outside that
// list follows in the order the season list first shows it.
function seasonTrackGroups({ rows }, competition) {
  const names = new Map();
  const ids = new Map();
  for (const row of rows) {
    if (!ids.has(row.track)) ids.set(row.track, []);
    ids.get(row.track).push(row.id);
    if (row.trackZh && !names.has(row.track)) names.set(row.track, row.trackZh);
  }
  const official = competition.groupOrder ?? [];
  const rank = (track) => (official.includes(track) ? official.indexOf(track) : official.length);
  const ordered = [...ids.keys()].map((track, index) => ({ track, rank: rank(track), index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  return validGroups(ordered.map(({ track }) => idGroup(track, names.get(track), ids.get(track))));
}

const SOURCES = {
  tagRoles: { read: (client, competition) => client.listTaggedChallengeTags(competition.select.tag), decode: tagRoleGroups },
  seasonRounds: { read: (client, competition) => client.getSeasonRounds(competition.select.season), decode: seasonRoundGroups },
  seasonTracks: { read: (client, competition) => client.listSeasonTracks(competition.select.season), decode: seasonTrackGroups },
};

export function createChallengeGroupsReader({ client, ttlMs = GROUPS_TTL_MS }) {
  // competition id -> { groups, at, stale? }, the last grouping read from the platform. `stale` stays on the
  // entry after a failed read, so every answer from it says so until a read succeeds.
  const cache = new Map();
  const reading = new Map();

  function readSource(id, competition, source) {
    const running = reading.get(id);
    if (running) return running;
    const pending = Promise.resolve()
      // Decoding sits inside the read, so an answer the grouping cannot be built from takes the same
      // fallback as an answer that never arrived.
      .then(async () => source.decode(await source.read(client, competition), competition))
      .then((groups) => {
        cache.set(id, { groups, at: Date.now() });
        return { groups };
      }, () => {
        const cached = cache.get(id);
        // The entry keeps its read time, so the next read retries on the same TTL instead of at once.
        if (cached) cache.set(id, { ...cached, stale: true });
        return { groups: cached?.groups ?? [], stale: true };
      })
      .finally(() => { reading.delete(id); });
    reading.set(id, pending);
    return pending;
  }

  return {
    /**
     * `{ groups, stale? }` for a competition the website groups without periods, or undefined for every
     * other competition. Each group is `{ key, labelZh?, count, select }`, where `select` carries the
     * challenge ids of the group and `count` is how many it holds.
     */
    async read(competitionId, { refresh = false } = {}) {
      const competition = findCompetition(competitionId);
      if (!competition || competition.periods) return undefined;
      const source = SOURCES[competition.groupSource];
      if (!source) return undefined;
      const cached = cache.get(competitionId);
      if (cached && !refresh && Date.now() - cached.at < ttlMs) {
        return cached.stale ? { groups: cached.groups, stale: true } : { groups: cached.groups };
      }
      return readSource(competitionId, competition, source);
    },
  };
}
