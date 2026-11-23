import { parse } from 'acorn';
import { BOHR_PERIOD_SLUG, BOHR_PRODUCT_ID, BOHR_PRODUCT_PAGE, GROUP_KEY, PKU_ID, PKU_UNIT_SLUG, SCIENTIFIC_FACILITIES_ID } from './competitions.js';
import { publicPageUrl } from './links.js';

function moduleUrl(html, pageUrl) {
  const tags = /<!--[\s\S]*?(?:-->|$)|<(script|style|title|textarea|template)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>[\s\S]*?(?:<\/\1\s*>|$)|<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  const attributes = /\s+([^\s=/"'<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/gy;
  let entry;
  for (const [, tag, attrs] of html.matchAll(tags)) {
    if (tag?.toLowerCase() !== 'script') continue;
    const values = new Map();
    let attributeEnd = 0;
    for (const [attribute, key, doubleQuoted, singleQuoted, bare] of attrs.matchAll(attributes)) {
      attributeEnd += attribute.length;
      const name = key.toLowerCase();
      if (name !== 'src' && name !== 'type') continue;
      if (values.has(name)) throw new Error('Ambiguous module attributes');
      values.set(name, (doubleQuoted ?? singleQuoted ?? bare ?? '').trim());
    }
    const remainder = attrs.slice(attributeEnd).trim();
    if (remainder && remainder !== '/') continue;
    const src = values.get('src');
    if (values.get('type')?.toLowerCase() !== 'module' || !src) continue;
    const url = URL.parse(src, pageUrl);
    if (!url || !/^https?:$/.test(url.protocol) || url.origin !== pageUrl.origin ||
        url.username || url.password || !/\.m?js$/i.test(url.pathname)) continue;
    if (entry) throw new Error('Multiple same-origin entry modules');
    url.hash = '';
    entry = url;
  }
  if (!entry) throw new Error('No same-origin entry module');
  return entry;
}

function identifier(node, name) {
  return node?.type === 'Identifier' && node.name === name;
}

function memberObject(node, name) {
  if (node?.type === 'MemberExpression' && !node.computed && !node.optional && identifier(node.property, name)) {
    return node.object;
  }
}

function callReceiver(node, name) {
  if (node?.type === 'CallExpression' && !node.optional && node.arguments.length === 1) {
    return memberObject(node.callee, name);
  }
}

function unfreeze(node) {
  return identifier(callReceiver(node, 'freeze'), 'Object') ? node.arguments[0] : node;
}

function firstArrowParameter(node) {
  if (node?.type === 'ArrowFunctionExpression' && !node.async && node.params[0]?.type === 'Identifier') {
    return node.params[0].name;
  }
}

function propertyName(node) {
  if (node?.type !== 'Property' || node.computed || node.method || node.kind !== 'init') return undefined;
  if (node.key.type === 'Identifier') return node.key.name;
  if (typeof node.key.value === 'string') return node.key.value;
}

function fieldsOf(node) {
  if (node?.type !== 'ObjectExpression') throw new Error('Expected a static record');
  const fields = new Map();
  for (const property of node.properties) {
    const key = propertyName(property);
    if (key === undefined || fields.has(key)) throw new Error('Ambiguous record property');
    fields.set(key, property.value);
  }
  return fields;
}

function arrayElements(node) {
  if (node?.type !== 'ArrayExpression') throw new Error('Expected a static array');
  return node.elements;
}

function bohrPeriodArray(initializer) {
  const map = unfreeze(initializer);
  const array = callReceiver(map, 'map');
  if (map === initializer || array?.type !== 'ArrayExpression') return undefined;

  const [project] = map.arguments;
  const period = firstArrowParameter(project);
  if (!period) return undefined;
  const record = unfreeze(project.body);
  if (record?.type !== 'ObjectExpression' || record.properties.length !== 2) return undefined;
  const [spread, ids] = record.properties;
  if (spread.type !== 'SpreadElement' || !identifier(spread.argument, period) ||
      propertyName(ids) !== 'challengeIds') return undefined;

  const filter = unfreeze(ids.value);
  const slotsMap = callReceiver(filter, 'filter');
  const slots = memberObject(callReceiver(slotsMap, 'map'), 'slots');
  if (!identifier(slots, period) || !identifier(filter.arguments[0], 'Boolean')) return undefined;
  const [selectId] = slotsMap.arguments;
  const slot = firstArrowParameter(selectId);
  if (slot && identifier(memberObject(selectId.body, 'challengeId'), slot)) return array;
}

function parseStaticBundle(bundle) {
  const bindings = new Map();
  for (const statement of parse(bundle, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const { id, init } of declaration.declarations) {
      if (id.type === 'Identifier') bindings.set(id.name, init);
    }
  }
  const resolve = (node) => unfreeze(node?.type === 'Identifier' ? bindings.get(node.name) : node);
  function literalValue(node) {
    const value = resolve(node);
    if (value?.type === 'Literal') return value.value;
  }
  function stringValue(node) {
    const value = literalValue(node);
    if (typeof value === 'string') return value;
  }
  function challengeId(node) {
    const id = stringValue(node);
    if (!id || id === '.' || id === '..' || /[\s/\\?#%\x00-\x1f\x7f]/u.test(id) || !id.isWellFormed()) {
      throw new Error('Invalid challenge ID');
    }
    return id;
  }
  return { initializers: [...bindings.values()], resolve, literalValue, stringValue, challengeId };
}

const zonedTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

// A period as the Host keeps it: frozen, with each id once in first-seen order in the period and in each group.
// One id can still sit in two groups.
function freezePeriod(period) {
  const unique = (ids) => Object.freeze([...new Set(ids)]);
  return Object.freeze({ ...period, challengeIds: unique(period.challengeIds),
    ...(period.groups && { groups: Object.freeze(period.groups.map((group) => Object.freeze({ ...group, challengeIds: unique(group.challengeIds) }))) }) });
}

// Groups are chosen by key on the wire, so a period keeps its groups only when every key is a distinct
// GROUP_KEY. Otherwise the period is listed ungrouped.
function periodGroups(groups) {
  const keys = groups.map((group) => group.key);
  const valid = groups.length && new Set(keys).size === keys.length && keys.every((key) => typeof key === 'string' && GROUP_KEY.test(key));
  return valid ? { groups } : {};
}

// Official group rows `{key, title: {zh}}` in their order. A row without a readable `title.zh` has no name. A
// grouping that cannot be read gives no rows, so it never fails the periods it would group.
function readGroupRows({ resolve, stringValue }, findRows) {
  try {
    return findRows().map((row) => {
      const fields = fieldsOf(resolve(row));
      const title = resolve(fields.get('title'));
      return { key: stringValue(fields.get('key')), labelZh: stringValue(title?.properties?.find((item) => propertyName(item) === 'zh')?.value)?.trim() };
    });
  } catch {
    return [];
  }
}

function groupChallenges(rows, challenges) {
  return rows.map(({ key, labelZh }) => ({ key, ...(labelZh && { labelZh }),
    challengeIds: challenges.filter((challenge) => challenge.group === key).map((challenge) => challenge.id) }));
}

function bohrProductPeriods({ initializers, resolve, literalValue, stringValue, challengeId }) {
  const arrays = initializers.map(bohrPeriodArray).filter(Boolean);
  if (arrays.length !== 1 || !arrays[0].elements.length) throw new Error('Expected one nonempty period table');

  function slotId(node) {
    const value = literalValue(node);
    if (!node || value === null || value === '') return undefined;
    return challengeId(node);
  }
  function slotIds(node) {
    const slots = resolve(node);
    if (slots?.type === 'ArrayExpression') {
      return slots.elements.map((slot) => slotId(fieldsOf(resolve(slot)).get('challengeId'))).filter(Boolean);
    }
    const source = callReceiver(slots, 'map');
    if (!source) throw new Error('Expected static slots');
    const [project] = slots.arguments;
    const id = firstArrowParameter(project);
    if (!id || !identifier(fieldsOf(unfreeze(project.body)).get('challengeId'), id)) {
      throw new Error('Unexpected slot projection');
    }
    return arrayElements(resolve(source)).map(slotId).filter(Boolean);
  }
  // The page text has one table per language, each holding `<copy>: {tracks: {<group key>: name}}`. The Chinese
  // names are the only such `tracks` whose names include Han characters; none or several leave groups unnamed.
  // A name that is not a nonempty string leaves only its own group unnamed. Each `copy` is looked up once.
  const trackNamesByCopy = new Map();
  function chineseTrackNames(copy) {
    if (!copy) return new Map();
    if (trackNamesByCopy.has(copy)) return trackNamesByCopy.get(copy);
    const tables = [];
    const visit = (node) => {
      const value = unfreeze(node);
      if (value?.type === 'ArrayExpression') value.elements.forEach(visit);
      if (value?.type !== 'ObjectExpression') return;
      for (const property of value.properties) {
        if (propertyName(property) === copy) {
          const tracks = resolve(resolve(property.value)?.properties?.find((item) => propertyName(item) === 'tracks')?.value);
          const names = tracks?.type === 'ObjectExpression' ? tracks.properties.map((item) => [propertyName(item), stringValue(item.value)?.trim()])
            .filter(([key, name]) => key !== undefined && name) : [];
          if (names.some(([, name]) => /\p{Script=Han}/u.test(name))) tables.push(new Map(names));
        }
        visit(property.value);
      }
    };
    initializers.forEach(visit);
    const names = tables.length === 1 ? tables[0] : new Map();
    trackNamesByCopy.set(copy, names);
    return names;
  }
  // The website's own grouping: its groups, then the shared bonus challenge as the group `bonus`.
  function officialGroups(groups, bonusId, copy) {
    const official = arrayElements(resolve(groups)).map((group) => {
      const groupFields = fieldsOf(resolve(group));
      return { key: stringValue(groupFields.get('key')), challengeIds: arrayElements(resolve(groupFields.get('challengeIds'))).map(challengeId) };
    });
    if (bonusId && literalValue(bonusId) !== null) official.push({ key: 'bonus', challengeIds: [challengeId(bonusId)] });
    const names = chineseTrackNames(copy);
    return official.map((group) => (names.has(group.key) ? { key: group.key, labelZh: names.get(group.key), challengeIds: group.challengeIds } : group));
  }

  const slugs = new Set();
  return Object.freeze(arrays[0].elements.map((node) => {
    const fields = fieldsOf(resolve(node));
    const slug = stringValue(fields.get('slug'));
    const labelZh = stringValue(fields.get('labelZh'));
    const startAt = stringValue(fields.get('startAt'));
    const endAt = stringValue(fields.get('endAt'));
    if (!BOHR_PERIOD_SLUG.test(slug) || slugs.has(slug) || !labelZh?.trim() ||
        !zonedTimestamp.test(startAt) || !zonedTimestamp.test(endAt) || !(Date.parse(startAt) < Date.parse(endAt))) {
      throw new Error('Invalid period metadata');
    }
    slugs.add(slug);
    const layout = stringValue(fields.get('layout'));
    let challengeIds;
    let groups = [];
    if (layout === 'trackGroups') {
      const slots = resolve(fields.get('slots'));
      const groupsNode = fields.get('groups');
      const bonus = fields.get('bonusId');
      const copy = stringValue(fields.get('copy'));
      if (slots?.type === 'ArrayExpression') {
        // Written-out slots decide the period's challenges. Its groups keep the website's order and only the ids
        // that the slots list; a grouping that cannot be read leaves the period ungrouped.
        challengeIds = slotIds(slots);
        try {
          groups = officialGroups(groupsNode, bonus, copy)
            .map((group) => ({ ...group, challengeIds: group.challengeIds.filter((id) => challengeIds.includes(id)) }));
        } catch {}
      } else {
        if (slots?.type !== 'CallExpression' || slots.optional || slots.callee.type !== 'Identifier' ||
            slots.arguments.length !== (bonus ? 2 : 1) || resolve(slots.arguments[0]) !== resolve(groupsNode) ||
            (bonus && literalValue(slots.arguments[1]) !== literalValue(bonus))) {
          throw new Error('Unexpected grouped slot projection');
        }
        groups = officialGroups(groupsNode, bonus, copy);
        challengeIds = groups.flatMap((group) => group.challengeIds);
      }
    } else if (layout === 'tracks' || layout === 'challenges') {
      challengeIds = slotIds(fields.get('slots'));
    } else {
      throw new Error('Unknown period layout');
    }
    return freezePeriod({ slug, labelZh, startAt, endAt, challengeIds, ...periodGroups(groups) });
  }));
}

function recordTable({ initializers, resolve }, keys) {
  const tables = initializers.map(unfreeze).filter((initializer) => initializer?.type === 'ArrayExpression' &&
    initializer.elements.some((element) => {
      const row = resolve(element);
      if (row?.type !== 'ObjectExpression') return false;
      const names = new Set(row.properties.map(propertyName));
      return keys.every((key) => names.has(key));
    }));
  if (tables.length !== 1) throw new Error('Expected one static record table');
  return tables[0].elements;
}

function scientificFacilitiesPeriods(bundle) {
  const { resolve, literalValue, stringValue, challengeId } = bundle;
  const periodRows = recordTable(bundle, ['key', 'name', 'openAt', 'endAt']);
  const questionRows = recordTable(bundle, ['code', 'period', 'direction', 'challengeId']);
  // The website lists its questions by research direction, in the order of its direction table. A period's
  // groups are the directions that hold its challenges.
  const directions = readGroupRows(bundle, () => recordTable(bundle, ['key', 'sources', 'title']));

  function optionalDate(node) {
    const date = literalValue(node);
    if (date === null) return undefined;
    if (typeof date !== 'string' || !(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || zonedTimestamp.test(date)) || !Number.isFinite(Date.parse(date))) {
      throw new Error('Invalid Scientific Facilities period date');
    }
    return date;
  }

  const periods = new Map();
  for (const row of periodRows) {
    const fields = fieldsOf(resolve(row));
    const key = stringValue(fields.get('key'));
    const slug = key?.slice(1);
    const labelZh = stringValue(fieldsOf(resolve(fields.get('name'))).get('zh'));
    if (!key?.startsWith('p') || !BOHR_PERIOD_SLUG.test(slug) || periods.has(key) || !labelZh?.trim()) {
      throw new Error('Invalid Scientific Facilities period metadata');
    }
    const startAt = optionalDate(fields.get('openAt'));
    const endAt = optionalDate(fields.get('endAt'));
    if (startAt && endAt && !(Date.parse(startAt) < Date.parse(endAt))) throw new Error('Invalid Scientific Facilities period range');
    periods.set(key, { slug, labelZh, ...(startAt && { startAt }), ...(endAt && { endAt }) });
  }

  const questions = [];
  for (const row of questionRows) {
    const fields = fieldsOf(resolve(row));
    const period = periods.get(stringValue(fields.get('period')));
    const direction = stringValue(fields.get('direction'));
    if (!period || !stringValue(fields.get('code'))?.trim() || direction === undefined) {
      throw new Error('Invalid Scientific Facilities question metadata');
    }
    const id = fields.get('challengeId');
    if (literalValue(id) !== null) questions.push({ period, group: direction, id: challengeId(id) });
  }

  return Object.freeze([...periods.values()].map((period) => {
    const listed = questions.filter((question) => question.period === period);
    const groups = groupChallenges(directions, listed).filter((group) => group.challengeIds.length);
    return freezePeriod({ ...period, challengeIds: listed.map((question) => question.id), ...periodGroups(groups) });
  }));
}

function pkuPeriods(bundle) {
  const { resolve, stringValue, challengeId } = bundle;
  const trackRows = recordTable(bundle, ['key', 'name', 'desc']);
  const unitRows = recordTable(bundle, ['id', 'track', 'name', 'startAt', 'endAt', 'challenges']);
  const nameZh = (node) => stringValue(fieldsOf(resolve(node)).get('zh'));
  const tracks = new Map();

  for (const row of trackRows) {
    const fields = fieldsOf(resolve(row));
    const key = stringValue(fields.get('key'));
    const labelZh = nameZh(fields.get('name'));
    if (!key?.trim() || tracks.has(key) || !labelZh?.trim()) throw new Error('Invalid PKU track metadata');
    tracks.set(key, labelZh);
  }

  const slugs = new Set();
  return Object.freeze(unitRows.map((row) => {
    const fields = fieldsOf(resolve(row));
    const slug = stringValue(fields.get('id'));
    const trackZh = tracks.get(stringValue(fields.get('track')));
    const roundZh = nameZh(fields.get('name'));
    const startAt = stringValue(fields.get('startAt'));
    const endAt = stringValue(fields.get('endAt'));
    if (!slug || !PKU_UNIT_SLUG.test(slug) || slugs.has(slug) || !trackZh || !roundZh?.trim() ||
        !zonedTimestamp.test(startAt) || !zonedTimestamp.test(endAt) || !(Date.parse(startAt) < Date.parse(endAt))) {
      throw new Error('Invalid PKU unit metadata');
    }
    slugs.add(slug);
    const challenges = arrayElements(resolve(fields.get('challenges'))).map((challenge) => {
      const challengeFields = fieldsOf(resolve(challenge));
      return { id: challengeId(challengeFields.get('id')), group: stringValue(challengeFields.get('group')) };
    });
    // A unit's own groups, each with its challenges whose `group` names it.
    const groups = groupChallenges(readGroupRows(bundle, () => arrayElements(resolve(fields.get('groups')))), challenges);
    return freezePeriod({ slug, labelZh: `${trackZh} · ${roundZh}`, startAt, endAt,
      challengeIds: challenges.map((challenge) => challenge.id), ...periodGroups(groups) });
  }));
}

export function createCompetitionSchedulesReader({ baseUrl, readText, timeoutMs = 5000 }) {
  const pageUrl = new URL(publicPageUrl(baseUrl, BOHR_PRODUCT_PAGE));
  const contests = [
    { id: BOHR_PRODUCT_ID, decode: bohrProductPeriods },
    { id: SCIENTIFIC_FACILITIES_ID, decode: scientificFacilitiesPeriods },
    { id: PKU_ID, decode: pkuPeriods },
  ];
  let entryUrl;
  let pending;

  function current() {
    return Object.fromEntries(contests.map(({ id, snapshot }) => {
      const periods = snapshot?.periods;
      return [id, snapshot && snapshot.url === entryUrl ? { periods } : { periods, stale: true }];
    }));
  }

  async function check() {
    try {
      const signal = AbortSignal.timeout(Math.min(Math.ceil(timeoutMs), 5000));
      const entry = moduleUrl(await readText(pageUrl, { signal }), pageUrl);
      signal.throwIfAborted();
      const changed = contests.filter(({ snapshot }) => snapshot?.url !== entry.href);
      if (changed.length) {
        const bundle = await readText(entry, { signal });
        signal.throwIfAborted();
        const source = parseStaticBundle(bundle);
        for (const contest of changed) {
          let periods;
          try {
            periods = contest.decode(source);
          } catch {
            continue;
          }
          contest.snapshot = { url: entry.href, periods };
        }
      }
      entryUrl = entry.href;
    } catch {
      entryUrl = undefined;
    }
    return current();
  }

  return {
    async read({ revalidate = true } = {}) {
      if (!revalidate && contests.some(({ snapshot }) => snapshot)) return current();
      pending ??= check().finally(() => { pending = undefined; });
      return pending;
    },
  };
}
